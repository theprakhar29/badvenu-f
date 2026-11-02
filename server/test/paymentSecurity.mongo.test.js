import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import Booking from "../src/models/Booking.js";
import BookingAccessGrant from "../src/models/BookingAccessGrant.js";
import Event from "../src/models/Event.js";
import Ticket from "../src/models/Ticket.js";
import Customer from "../src/models/Customer.js";
import { createPendingBookingWithAccess } from "../src/utils/createPendingBookingWithAccess.js";
import { reserveInventory } from "../src/utils/inventory.js";
import { makeBookingPaymentService } from "../src/utils/bookingPaymentService.js";
import { dispatchTicketDelivery } from "../src/utils/finalizeBooking.js";

test("MongoDB replica-set payment concurrency commits one booking, ticket set, inventory sale and notification", async (t) => {
  const dbName = `badvenu_phase2b_test_${randomBytes(8).toString("hex")}`;
  const connection = mongoose.createConnection(`mongodb://127.0.0.1:27017/${dbName}`, {
    serverSelectionTimeoutMS: 750, connectTimeoutMS: 750,
  });
  try { await connection.asPromise(); } catch {
    await connection.close().catch(() => {});
    t.skip("No credential-free local MongoDB available for real transactional concurrency tests."); return;
  }
  let wrote = false;
  t.after(async () => {
    try {
      if (wrote) {
        assert.match(dbName, /^badvenu_phase2b_test_[a-f0-9]{16}$/);
        assert.equal(connection.name, dbName);
        await connection.dropDatabase();
      }
    } finally { await connection.close(); }
  });
  const hello = await connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid") {
    t.skip("Local MongoDB is standalone; real payment transaction/concurrency guarantees remain unverified."); return;
  }
  wrote = true;
  const BookingModel = connection.model("Booking", Booking.schema), GrantModel = connection.model("BookingAccessGrant", BookingAccessGrant.schema);
  const EventModel = connection.model("Event", Event.schema), TicketModel = connection.model("Ticket", Ticket.schema);
  const CustomerModel = connection.model("Customer", Customer.schema);
  await Promise.all([BookingModel.init(), GrantModel.init(), EventModel.init(), TicketModel.init(), CustomerModel.init()]);
  const event = await EventModel.create({ organizer: new mongoose.Types.ObjectId(), title: "Isolated payment test", slug: "isolated-payment",
    startAt: new Date(Date.now() + 86400000), pricingTiers: [{ name: "General", price: 100, totalQty: 10 }] });
  const initial = await createPendingBookingWithAccess({ event: event._id, guestName: "Payment fixture", guestEmail: "fixture@example.test",
    items: [{ pricingTierId: event.pricingTiers[0]._id, tierName: "General", quantity: 2, unitPrice: 100 }], totalAmount: 200,
    status: "PENDING", holdExpiresAt: new Date(Date.now() + 600000),
  }, { BookingModel, GrantModel, reserve: (id, items, options) => reserveInventory(id, items, { ...options, EventModel }) });
  let order, payment, creates = 0, notices = 0;
  const gateway = { configured: () => true, mockAllowed: () => false, keyId: () => "rzp_test_fixture", verifySignature: () => true,
    createOrder: async (book) => {
      creates += 1;
      order = { id: "order_isolated", receipt: String(book._id), notes: { bookingId: String(book._id) }, amount: 20000,
        currency: "INR", status: "created", amount_paid: 0, amount_due: 20000 };
      return order;
    }, fetchOrder: async () => order, fetchPayment: async () => payment,
  };
  const options = { BookingModel, GrantModel, CustomerModel, EventModel, TicketModel, gateway,
    notify: (id) => dispatchTicketDelivery(id, { BookingModel, TicketModel, deliver: async () => { notices += 1; return []; } }),
  };
  const first = makeBookingPaymentService(options), second = makeBookingPaymentService(options);
  const bookingId = initial.booking._id, credential = { method: "grant", token: initial.checkoutAccessToken };
  await Promise.allSettled([first.createOrder({ bookingId, credential }), second.createOrder({ bookingId, credential })]);
  assert.equal(creates, 1);
  Object.assign(order, { status: "paid", amount_paid: 20000, amount_due: 0 });
  payment = { id: "pay_isolated", order_id: order.id, amount: 20000, currency: "INR", status: "captured", captured: true, amount_refunded: 0 };
  const details = { razorpay_order_id: order.id, razorpay_payment_id: payment.id, razorpay_signature: "synthetic" };
  await Promise.all([
    first.confirm({ bookingId, credential, details }), second.confirm({ bookingId, credential, details }),
    first.capturedWebhook(payment), second.capturedWebhook(payment),
  ]);
  assert.equal(await TicketModel.countDocuments({ booking: bookingId }), 2);
  assert.equal(await BookingModel.countDocuments({ status: "CONFIRMED" }), 1);
  const stats = await BookingModel.aggregate([{ $match: { status: "CONFIRMED" } }, { $group: { _id: null, revenue: { $sum: "$totalAmount" } } }]);
  assert.equal(stats[0].revenue, 200);
  const updatedEvent = await EventModel.findById(event._id);
  assert.equal(updatedEvent.pricingTiers[0].reservedQty, 0); assert.equal(updatedEvent.pricingTiers[0].soldQty, 2);
  assert.equal(notices, 1);
});
test("MongoDB notification claim is atomic across concurrent post-commit dispatchers", async (t) => {
  const dbName = `badvenu_phase2b_test_${randomBytes(8).toString("hex")}`;
  const connection = mongoose.createConnection(`mongodb://127.0.0.1:27017/${dbName}`, {
    serverSelectionTimeoutMS: 750, connectTimeoutMS: 750,
  });
  try { await connection.asPromise(); } catch {
    await connection.close().catch(() => {});
    t.skip("No credential-free local MongoDB available for atomic notification claim verification."); return;
  }
  t.after(async () => {
    try {
      assert.match(dbName, /^badvenu_phase2b_test_[a-f0-9]{16}$/);
      assert.equal(connection.name, dbName);
      await connection.dropDatabase();
    } finally { await connection.close(); }
  });
  const BookingModel = connection.model("Booking", Booking.schema), TicketModel = connection.model("Ticket", Ticket.schema);
  await Promise.all([BookingModel.init(), TicketModel.init()]);
  const booking = await BookingModel.create({ event: new mongoose.Types.ObjectId(), guestName: "Notification fixture",
    guestEmail: "fixture@example.test", totalAmount: 100, status: "CONFIRMED", ticketDelivery: { state: "PENDING" } });
  await TicketModel.create({ booking: booking._id, event: booking.event, pricingTierId: new mongoose.Types.ObjectId(),
    tierName: "General", qrToken: "isolated-notification-fixture", qrDataUrl: "data:image/png;base64,fixture" });
  let attempts = 0;
  const options = { BookingModel, TicketModel, deliver: async () => {
    attempts += 1; await new Promise((resolve) => setImmediate(resolve));
    return [{ channel: "EMAIL", purpose: "TICKET_DELIVERY", to: "fixture@example.test", status: "SENT" }];
  } };
  await Promise.all(Array.from({ length: 10 }, () => dispatchTicketDelivery(booking._id, options)));
  await dispatchTicketDelivery(booking._id, options);
  assert.equal(attempts, 1);
  const result = await BookingModel.findById(booking._id).select("+ticketDelivery");
  assert.equal(result.ticketDelivery.state, "SENT");
  assert.equal(result.deliveryLog.length, 1);
});