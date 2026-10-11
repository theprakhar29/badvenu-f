import Event from "../models/Event.js";
import Booking from "../models/Booking.js";
import Ticket from "../models/Ticket.js";
import { bookingInputSchema } from "../utils/validation.js";
import { reserveInventory, releaseInventory, releaseExpiredHolds, holdExpiryDate } from "../utils/inventory.js";
import { finalizeConfirmedBooking, failBooking } from "../utils/finalizeBooking.js";
import { isRazorpayConfigured, verifyPaymentSignature } from "../utils/payment.js";
import { logger } from "../utils/logger.js";

// POST /api/public/events/:slug/bookings — create a PENDING booking and
// atomically reserve inventory. This is the "add to cart + checkout" step,
// collapsed into one call to match the PRD's single-step checkout flow.
export async function createBooking(req, res, next) {
  try {
    const event = await Event.findOne({ slug: req.params.slug, status: "PUBLISHED" });
    if (!event) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Show not found." } });
    }

    // Release any stale holds first, so availability checks below are accurate.
    await releaseExpiredHolds(event._id);

    const parsed = bookingInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message },
      });
    }
    const data = parsed.data;

    // Resolve requested tiers against the event's actual pricing tiers —
    // never trust client-supplied prices.
    const items = [];
    let totalAmount = 0;
    for (const reqItem of data.items) {
      const tier = event.pricingTiers.id(reqItem.pricingTierId);
      if (!tier) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "One of the selected ticket types no longer exists." },
        });
      }
      items.push({
        pricingTierId: tier._id,
        tierName: tier.name,
        quantity: reqItem.quantity,
        unitPrice: tier.price,
      });
      totalAmount += tier.price * reqItem.quantity;
    }

    // Enforce required custom form fields server-side (never trust the client here either).
    for (const field of event.formFields) {
      if (field.enabled && field.required) {
        const resp = data.formResponses.find((r) => r.fieldKey === field.key);
        if (!resp || !resp.value?.trim()) {
          const label = field.key === "CUSTOM_QUESTION" ? field.label || "This question" : field.label;
          return res.status(400).json({
            error: { code: "VALIDATION_ERROR", message: `"${label}" is required.` },
          });
        }
      }
    }

    // Atomically reserve stock. Throws (409) if anything's oversold, and
    // rolls back any tiers it already reserved in this same request.
    await reserveInventory(event._id, items);

    const booking = await Booking.create({
      event: event._id,
      guestName: data.guestName,
      guestEmail: data.guestEmail || undefined,
      guestPhone: data.guestPhone || undefined,
      items,
      formResponses: data.formResponses,
      totalAmount,
      status: "PENDING",
      holdExpiresAt: holdExpiryDate(),
    });

    res.status(201).json(booking);
    logger.booking(
      `Reserved: ${items.length} item(s), ₹${totalAmount} for "${event.title}" — booking ${booking._id} (${data.guestName})`
    );
  } catch (err) {
    next(err);
  }
}

// POST /api/public/bookings/:id/confirm — finalizes payment for a pending
// booking.
//
// Two modes, chosen automatically based on whether Razorpay keys are set:
//   - Configured (including with the "asdfghjkl" placeholder): requires and
//     verifies a real Razorpay payment signature. This is the security-
//     critical step — without it, anyone could call this endpoint with a
//     made-up payment ID and get free tickets.
//   - Not configured at all (env vars empty): falls back to the old mock
//     behavior, so local dev keeps working without needing real keys.
export async function confirmBooking(req, res, next) {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Booking not found." } });
    }

    if (booking.status !== "PENDING") {
      return res.status(409).json({
        error: {
          code: "INVALID_STATE",
          message: `This booking is already ${booking.status.toLowerCase()}.`,
        },
      });
    }

    if (booking.holdExpiresAt && booking.holdExpiresAt < new Date()) {
      await releaseInventory(booking);
      booking.status = "EXPIRED";
      await booking.save();
      logger.booking(`Hold expired before payment — booking ${booking._id}, inventory released`);
      return res.status(409).json({
        error: { code: "HOLD_EXPIRED", message: "Your reservation expired. Please book again." },
      });
    }

    if (isRazorpayConfigured()) {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Missing payment confirmation details." },
        });
      }

      if (!booking.payment?.orderId || booking.payment.orderId !== razorpay_order_id) {
        return res.status(400).json({
          error: { code: "ORDER_MISMATCH", message: "This payment doesn't match this booking." },
        });
      }

      const valid = verifyPaymentSignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      });

      if (!valid) {
        booking.payment.status = "failed";
        await failBooking(booking, "We couldn't verify your payment.");
        logger.payment(`Signature verification FAILED — booking ${booking._id}, order ${razorpay_order_id}`);
        return res.status(402).json({
          error: { code: "PAYMENT_VERIFICATION_FAILED", message: "We couldn't verify this payment. Please try again." },
        });
      }

      booking.payment.paymentId = razorpay_payment_id;
      booking.payment.signature = razorpay_signature;
      booking.payment.status = "paid";
    }
    // else: no gateway configured at all — fall through and confirm directly (mock mode).

    const tickets = await finalizeConfirmedBooking(booking);
    logger.payment(`Confirmed — booking ${booking._id}, ${tickets.length} ticket(s) issued, ₹${booking.totalAmount}`);

    res.json({ ...booking.toObject(), tickets });
  } catch (err) {
    next(err);
  }
}

// GET /api/public/bookings/:id — fetch a booking for a confirmation page.
// No auth: guests never create an account, so the booking ID itself (an
// unguessable Mongo ObjectId) is the access token, same pattern most
// checkout confirmation pages use.
export async function getBooking(req, res, next) {
  try {
    const booking = await Booking.findById(req.params.id).populate(
      "event",
      "title slug startAt venueName city"
    );
    if (!booking) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Booking not found." } });
    }
    const tickets = await Ticket.find({ booking: booking._id }).sort({ createdAt: 1 });
    res.json({ ...booking.toObject(), tickets });
  } catch (err) {
    next(err);
  }
}
