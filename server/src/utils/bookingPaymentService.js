import { randomUUID } from "node:crypto";
import Booking from "../models/Booking.js";
import BookingAccessGrant from "../models/BookingAccessGrant.js";
import Customer from "../models/Customer.js";
import Event from "../models/Event.js";
import Ticket from "../models/Ticket.js";
import { ACCESS_PURPOSE, bookingAccessVersion, createBookingAccessGrant,
  hashBookingAccessToken, isBookingAccessToken, isBookingAccessGrantValid,
  isCheckoutHandoffGrantValid } from "./bookingAccess.js";
import { bookingResponse, confirmedBookingResponse } from "./bookingResponse.js";
import { releaseInventory } from "./inventory.js";
import { finalizeConfirmedBooking, dispatchTicketDelivery } from "./finalizeBooking.js";
import { PaymentError, denyPaymentAccess, expectedPaymentAmount,
  validateProviderOrder, validateCapturedPayment } from "./paymentValidation.js";
import { isRazorpayConfigured, isMockPaymentAllowed, createRazorpayOrder,
  fetchRazorpayOrder, fetchRazorpayPayment, getRazorpayPublicKeyId, verifyPaymentSignature } from "./payment.js";

const defaultGateway = {
  configured: isRazorpayConfigured, mockAllowed: isMockPaymentAllowed,
  createOrder: createRazorpayOrder, fetchOrder: fetchRazorpayOrder,
  fetchPayment: fetchRazorpayPayment, keyId: getRazorpayPublicKeyId,
  verifySignature: verifyPaymentSignature,
};
const conflict = (code, message) => new PaymentError(code, 409, message);

export function makeBookingPaymentService({
  BookingModel = Booking, GrantModel = BookingAccessGrant, CustomerModel = Customer,
  EventModel = Event, TicketModel = Ticket, gateway = defaultGateway,
  transaction = (work) => BookingModel.db.transaction(work), clock = () => new Date(),
  finalize = finalizeConfirmedBooking,
  notify = (id) => dispatchTicketDelivery(id, { BookingModel, TicketModel, GrantModel }),
} = {}) {
  const load = (id, session) => BookingModel.findById(id)
    .select("+accessVersion +paymentRevision +ticketDelivery").session(session);

  async function authorize(booking, credential, session, { allowConfirmed = false, mint = false } = {}) {
    const now = clock();
    if (!booking || !credential) throw denyPaymentAccess();
    const confirmed = allowConfirmed && booking.status === "CONFIRMED";
    if (!confirmed && (booking.status !== "PENDING" || !(booking.holdExpiresAt > now))) throw denyPaymentAccess();
    if (credential.method === "customer" && String(booking.customer) === credential.customerId) {
      const customer = await CustomerModel.findById(credential.customerId).select("emailVerified").session(session);
      if (customer?.emailVerified !== true) throw denyPaymentAccess();
      const updated = await CustomerModel.updateOne({ _id: credential.customerId, emailVerified: true }, {
        $inc: { paymentAuthorizationUse: 1 },
      }, { session });
      if (updated.modifiedCount !== 1) throw denyPaymentAccess();
    } else if (credential.method === "grant" && isBookingAccessToken(credential.token)) {
      const grant = await GrantModel.findOne({ booking: booking._id, purpose: ACCESS_PURPOSE.CHECKOUT,
        tokenHash: hashBookingAccessToken(credential.token) }).select("+tokenHash +handoffCount").session(session);
      const valid = confirmed ? isCheckoutHandoffGrantValid({ booking, grant, token: credential.token, now })
        : isBookingAccessGrantValid({ booking, grant, token: credential.token, purpose: ACCESS_PURPOSE.CHECKOUT, now });
      if (!valid) throw denyPaymentAccess();
      if (mint && (grant.handoffCount || 0) >= 20) throw new PaymentError("HANDOFF_LIMIT", 429, "Too many access exchanges; use verified recovery.");
      // This real write fences concurrent revocation: a conflicting transaction
      // retries and sees current expiry/revocation/version before it can commit.
      const updated = await GrantModel.updateOne({ _id: grant._id, revokedAt: null,
        accessVersion: bookingAccessVersion(booking), expiresAt: { $gt: now } }, {
        $inc: { authorizationUse: 1, ...(mint ? { handoffCount: 1 } : {}) },
      }, { session });
      if (updated.modifiedCount !== 1) throw denyPaymentAccess();
    } else throw denyPaymentAccess();
    booking.paymentRevision = (booking.paymentRevision || 0) + 1;
  }

  function browserTransaction(id, credential, work, options) {
    return transaction(async (session) => {
      const booking = await load(id, session);
      await authorize(booking, credential, session, options);
      const result = await work(booking, session);
      // Forces a write conflict with payment completion, expiry and bulk revocation.
      await booking.save({ session });
      return result;
    });
  }

  async function exchange({ bookingId, credential }) {
    const response = await browserTransaction(bookingId, credential, async (booking, session) => {
      if (booking.status !== "CONFIRMED") throw conflict("NOT_CONFIRMED", "Tickets are not confirmed yet.");
      const now = clock();
      const event = await EventModel.findById(booking.event).select("title slug startAt endAt venueName city").session(session);
      const eventTime = new Date(event?.endAt || event?.startAt || NaN).getTime();
      const expiresAt = new Date(Number.isFinite(eventTime) ? eventTime + 7 * 86400000 : +now + 86400000);
      if (!(expiresAt > now)) throw new PaymentError("TICKET_ACCESS_EXPIRED", 410, "Ticket access has expired; use verified recovery.");
      const { token, grant } = createBookingAccessGrant({ booking, purpose: ACCESS_PURPOSE.TICKET, source: "BROWSER", expiresAt, now });
      await GrantModel.create([grant], { session });
      const tickets = await TicketModel.find({ booking: booking._id })
        .select("booking tierName status usedAt qrDataUrl createdAt").sort({ createdAt: 1 }).session(session);
      return { ...confirmedBookingResponse(booking, tickets), event: bookingResponse({ event }).event,
        ticketAccessToken: token, ticketAccessExpiresAt: expiresAt };
    }, { allowConfirmed: true, mint: true });
    await notify(bookingId).catch(() => {});
    return response;
  }

  async function createOrder({ bookingId, credential }) {
    const plan = await browserTransaction(bookingId, credential, async (booking) => {
      if (!gateway.configured()) {
        if (!gateway.mockAllowed()) throw new PaymentError("PAYMENT_NOT_CONFIGURED", 503, "Online payments are unavailable.");
        if (booking.payment?.orderId) throw conflict("PAYMENT_MODE_CONFLICT", "This booking has a gateway payment order.");
        booking.payment = { provider: "mock", status: "created", orderState: "READY" };
        return { mock: true };
      }
      if (booking.payment?.provider === "mock") throw conflict("PAYMENT_MODE_CONFLICT", "Payment mode has changed; use verified recovery.");
      if (booking.payment?.orderId) return { orderId: booking.payment.orderId };
      if (["CREATING", "UNCERTAIN"].includes(booking.payment?.orderState)) {
        throw conflict("ORDER_PENDING_RECONCILIATION", "Order creation is in progress or requires reconciliation.");
      }
      const claim = randomUUID();
      booking.payment = { provider: "razorpay", status: "created", orderState: "CREATING", orderClaim: claim,
        amount: expectedPaymentAmount(booking), currency: "INR" };
      return { claim };
    });
    if (plan.mock) return { mock: true };
    let order;
    if (plan.claim) {
      try {
        // Provider calls are outside retryable transactions, with fresh authority
        // checked immediately before the call. An ambiguous result is never retried.
        const snapshot = await browserTransaction(bookingId, credential, async (booking) => {
          if (booking.payment?.orderClaim !== plan.claim) throw conflict("ORDER_CONFLICT", "Payment order changed.");
          return booking;
        });
        order = await gateway.createOrder(snapshot);
        validateProviderOrder(snapshot, order, { checkout: true });
        await transaction(async (session) => {
          const booking = await load(bookingId, session);
          if (booking?.payment?.orderClaim !== plan.claim || booking.payment.orderState !== "CREATING") {
            throw conflict("ORDER_CONFLICT", "Payment order changed.");
          }
          // Binding a known provider result is internal reconciliation. Persist it
          // even if the caller was revoked during the network call; never disclose
          // it until the caller is freshly re-authorized below.
          booking.payment = { provider: "razorpay", orderId: order.id, status: "created", orderState: "READY",
            amount: expectedPaymentAmount(booking), currency: "INR" };
          booking.paymentRevision = (booking.paymentRevision || 0) + 1;
          await booking.save({ session });
        });
      } catch (err) {
        await BookingModel.updateOne({ _id: bookingId, "payment.orderClaim": plan.claim }, {
          $set: { "payment.orderState": "UNCERTAIN" },
        }).catch(() => {});
        throw err;
      }
    } else {
      order = await gateway.fetchOrder(plan.orderId);
    }
    return browserTransaction(bookingId, credential, async (booking) => {
      validateProviderOrder(booking, order, { checkout: true });
      return { mock: false, orderId: order.id, amount: order.amount, currency: order.currency,
        keyId: gateway.keyId(), guestName: booking.guestName, guestEmail: booking.guestEmail, guestPhone: booking.guestPhone };
    });
  }

  async function settle(bookingId, verified, credential) {
    return transaction(async (session) => {
      const booking = await load(bookingId, session);
      if (!booking) throw denyPaymentAccess();
      if (credential) await authorize(booking, credential, session, { allowConfirmed: true });
      if (verified.mock) {
        if (gateway.configured() || !gateway.mockAllowed() || booking.payment?.provider !== "mock") {
          throw new PaymentError("PAYMENT_NOT_CONFIGURED", 503, "Mock payment is unavailable.");
        }
      } else {
        validateCapturedPayment(booking, verified.order, verified.payment);
        if (booking.payment?.orderId !== verified.order.id || verified.payment.id !== verified.paymentId) {
          throw conflict("ORDER_MISMATCH", "Payment does not match the stored order.");
        }
      }
      if (booking.status === "CONFIRMED") {
        if (!verified.mock && booking.payment.paymentId !== verified.paymentId) throw conflict("PAYMENT_CONFLICT", "Booking has another completed payment.");
        if (credential) await booking.save({ session });
        return { confirmed: true };
      }
      if (booking.status !== "PENDING" || !(booking.holdExpiresAt > clock())) {
        if (verified.mock) throw denyPaymentAccess();
        const releaseHold = booking.status === "PENDING";
        if (releaseHold) booking.status = "EXPIRED";
        booking.payment.reconciliationRequired = true;
        booking.payment.paymentId = verified.paymentId;
        booking.payment.status = "paid";
        await booking.save({ session });
        if (releaseHold) await releaseInventory(booking, { session, EventModel });
        return { reconciliationRequired: true };
      }
      booking.payment = { provider: verified.mock ? "mock" : "razorpay", status: "paid",
        ...(verified.mock ? {} : { orderId: verified.order.id, paymentId: verified.paymentId,
          amount: verified.payment.amount, currency: verified.payment.currency, orderState: "READY" }) };
      await finalize(booking, { session, EventModel, TicketModel });
      return { confirmed: true };
    });
  }

  async function confirm({ bookingId, credential, details = {} }) {
    const snapshot = await browserTransaction(bookingId, credential, async (booking) => booking, { allowConfirmed: true });
    if (snapshot.status === "CONFIRMED") return exchange({ bookingId, credential });
    let verified;
    if (!gateway.configured()) {
      if (!gateway.mockAllowed() || snapshot.payment?.provider !== "mock" || snapshot.payment.orderState !== "READY") {
        throw new PaymentError("PAYMENT_NOT_CONFIGURED", 503, "Online payments are unavailable.");
      }
      verified = { mock: true };
    } else {
      const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = details;
      if (typeof orderId !== "string" || typeof paymentId !== "string" || typeof signature !== "string"
        || !snapshot.payment?.orderId || orderId !== snapshot.payment.orderId) {
        throw new PaymentError("PAYMENT_VERIFICATION_FAILED", 400, "Invalid payment confirmation details.");
      }
      if (!gateway.verifySignature({ orderId: snapshot.payment.orderId, paymentId, signature })) {
        throw new PaymentError("PAYMENT_VERIFICATION_FAILED", 402, "Payment signature could not be verified.");
      }
      const [order, payment] = await Promise.all([gateway.fetchOrder(orderId), gateway.fetchPayment(paymentId)]);
      if (payment?.id !== paymentId || order?.id !== orderId) throw conflict("ORDER_MISMATCH", "Payment identifier mismatch.");
      validateCapturedPayment(snapshot, order, payment);
      verified = { order, payment, paymentId };
    }
    const result = await settle(bookingId, verified, credential);
    if (result.reconciliationRequired) throw conflict("PAYMENT_RECONCILIATION_REQUIRED", "Payment requires reconciliation.");
    await notify(bookingId).catch(() => {});
    return exchange({ bookingId, credential });
  }

  async function capturedWebhook(entity) {
    if (typeof entity?.order_id !== "string" || typeof entity?.id !== "string") {
      throw new PaymentError("INVALID_WEBHOOK", 400, "Invalid payment event.");
    }
    const booking = await BookingModel.findOne({ "payment.orderId": entity.order_id });
    if (!booking) return { received: true, ignored: true };
    const [order, payment] = await Promise.all([gateway.fetchOrder(entity.order_id), gateway.fetchPayment(entity.id)]);
    if (order?.id !== entity.order_id || payment?.id !== entity.id) throw conflict("ORDER_MISMATCH", "Payment identifier mismatch.");
    validateCapturedPayment(booking, order, payment);
    const result = await settle(booking._id, { order, payment, paymentId: entity.id });
    if (result.confirmed) await notify(booking._id).catch(() => {});
    return { received: true, ...(result.reconciliationRequired ? { reconciliationRequired: true } : {}) };
  }

  return { createOrder, confirm, exchange, capturedWebhook };
}
