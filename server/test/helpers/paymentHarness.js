import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomBytes } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Booking from "../../src/models/Booking.js";
import Grant from "../../src/models/BookingAccessGrant.js";
import RecoveryOtp from "../../src/models/BookingRecoveryOtp.js";
import Event from "../../src/models/Event.js";
import Customer from "../../src/models/Customer.js";
import { createBookingAccessGrant } from "../../src/utils/bookingAccess.js";
import { makeBookingPaymentService } from "../../src/utils/bookingPaymentService.js";
import { dispatchTicketDelivery, finalizeConfirmedBooking } from "../../src/utils/finalizeBooking.js";
import { makePaymentHandlers } from "../../src/controllers/payment.controller.js";
import { makeGetBooking } from "../../src/controllers/booking.controller.js";
import { createPublicRouter } from "../../src/routes/public.routes.js";
import { requireBookingAccess } from "../../src/middleware/bookingAccess.js";
import { requirePaymentCsrf } from "../../src/middleware/paymentCsrf.js";
import { isMockPaymentAllowed, verifyPaymentSignature, verifyWebhookSignature } from "../../src/utils/payment.js";
import { CUSTOMER_SESSION_COOKIE } from "../../src/utils/token.js";
import { makeEmailTicketAccessHandler } from "../../src/controllers/booking-email-access.controller.js";
import { makeBookingRecoveryHandlers } from "../../src/controllers/booking-recovery.controller.js";

const id = (n) => String(n).padStart(24, "0");
function clone(value) {
  if (value?.toObject) return clone(value.toObject({ transform: false }));
  if (value instanceof Date) return new Date(value);
  if (value instanceof mongoose.Types.ObjectId) return new mongoose.Types.ObjectId(String(value));
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
}
function at(value, path) { return path.split(".").reduce((v, key) => v?.[key], value); }
function put(value, path, next) {
  const keys = path.split("."); const last = keys.pop();
  let parent = value;
  for (const key of keys) parent = parent[key] ??= {};
  parent[last] = clone(next);
}
function matches(row, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = at(row, key);
    if (expected?.$elemMatch) return actual?.some((item) => matches(item, expected.$elemMatch));
    if (expected && typeof expected === "object" && !(expected instanceof Date) && !(expected instanceof mongoose.Types.ObjectId)) {
      if ("$gt" in expected) return actual > expected.$gt;
      if ("$gte" in expected) return actual >= expected.$gte;
      if ("$lte" in expected) return actual <= expected.$lte;
    }
    if (expected === null) return actual == null;
    return String(actual) === String(expected);
  });
}
function update(row, change) {
  for (const [path, value] of Object.entries(change.$set || {})) put(row, path, value);
  for (const [path, value] of Object.entries(change.$inc || {})) put(row, path, (at(row, path) || 0) + value);
  for (const [path, value] of Object.entries(change.$push || {})) put(row, path, [...(at(row, path) || []), ...(value.$each || [value])]);
}
function query(execute) {
  return { select() { return this; }, sort() { return this; }, session(value) { this.sessionValue = value; return this; },
    then(resolve, reject) { return Promise.resolve().then(() => execute(this.sessionValue)).then(resolve, reject); },
    catch(reject) { return this.then(undefined, reject); } };
}

export async function paymentHarness(t) {
  const tx = new AsyncLocalStorage();
  const now = new Date("2026-10-27T00:00:00Z");
  const state = { now, books: new Map(), grants: new Map(), otps: new Map(), events: new Map(), customers: new Map(), tickets: new Map(),
    orders: new Map(), payments: new Map(), creates: 0, notices: 0, mock: false, production: false,
    orderOverride: null, paymentOverride: null, beforeFetch: null, failCreate: false, retryFinalize: false, retried: false };
  const event = new Event({ _id: id(20), organizer: id(90), title: "Payment fixture", slug: "payment-fixture", status: "PUBLISHED",
    startAt: new Date(+now + 86400000), endAt: new Date(+now + 2 * 86400000),
    pricingTiers: [{ _id: id(21), name: "General", price: 100, totalQty: 20, reservedQty: 0, soldQty: 0 }] });
  state.events.set(id(20), clone(event));
  const key = randomBytes(32), webhookKey = randomBytes(32), sessionKey = randomBytes(32);
  const verifySession = (value) => jwt.verify(value, sessionKey);
  const assertSession = (session) => { if (session) assert.equal(session, tx.getStore()); };
  function hydrateBook(row) {
    if (!row) return null;
    const doc = Booking.hydrate(clone(row));
    doc.save = async ({ session } = {}) => {
      assertSession(session);
      for (const other of state.books.values()) {
        if (String(other._id) !== String(doc._id) && ((doc.payment?.orderId && other.payment?.orderId === doc.payment.orderId)
          || (doc.payment?.paymentId && other.payment?.paymentId === doc.payment.paymentId))) throw new Error("Duplicate payment association");
      }
      // Mongoose saves changed paths, not a replacement snapshot. Preserve a
      // notification claim made after this transaction's document was loaded.
      const current = state.books.get(String(doc._id)) || {};
      const raw = clone(doc);
      for (const path of doc.directModifiedPaths()) put(current, path, at(raw, path));
      state.books.set(String(doc._id), current);
      for (const path of doc.modifiedPaths()) doc.unmarkModified(path);
      return doc;
    };
    doc.populate = async () => { doc.event = Event.hydrate(clone(state.events.get(String(doc.event)))); return doc; };
    return doc;
  }
  function repo(table, hydrate = (value) => clone(value)) {
    const rows = () => [...state[table].values()];
    return {
      findById(value) { return query(() => hydrate(state[table].get(String(value)))); },
      findOne(filter) { return query(() => { const row = rows().find((row) => matches(row, filter)); return row ? hydrate(row) : null; }); },
      find(filter) { return query(() => rows().filter((row) => matches(row, filter)).map(hydrate)); },
      async create(data, { session } = {}) {
        assertSession(session);
        const array = Array.isArray(data);
        const result = (array ? data : [data]).map((row) => {
          const stored = { ...clone(row), _id: row._id || new mongoose.Types.ObjectId() };
          state[table].set(String(stored._id), stored); return hydrate(stored);
        });
        return array ? result : result[0];
      },
      async updateOne(filter, change, { session } = {}) {
        assertSession(session);
        const row = rows().find((row) => matches(row, filter));
        if (!row) return { modifiedCount: 0 };
        update(row, change); return { modifiedCount: 1 };
      },
      findOneAndUpdate(filter, change, options = {}) {
        return query(() => {
          let row = rows().find((row) => matches(row, filter));
          if (!row && options.upsert) {
            row = { ...clone(change.$setOnInsert || {}), _id: new mongoose.Types.ObjectId() };
            state[table].set(String(row._id), row);
          }
          if (!row) return null;
          update(row, change); return hydrate(row);
        });
      },
      findOneAndDelete(filter, _options = {}) { return query(() => { const row = rows().find((item) => matches(item, filter)); if (!row) return null; state[table].delete(String(row._id)); return hydrate(row); }); },
      async deleteOne(filter) { const row = rows().find((item) => matches(item, filter)); if (row) state[table].delete(String(row._id)); return { deletedCount: row ? 1 : 0 }; },
    };
  }
  const BookingModel = repo("books", hydrateBook);
  const GrantModel = repo("grants", (row) => row ? Grant.hydrate(clone(row)) : null);
  const OtpModel = repo("otps", (row) => row ? RecoveryOtp.hydrate(clone(row)) : null);
  const CustomerModel = repo("customers", (row) => row ? Customer.hydrate(clone(row)) : null);
  const TicketModel = repo("tickets");
  const EventModel = repo("events", (row) => row ? Event.hydrate(clone(row)) : null);
  EventModel.updateOne = async (filter, change, { session } = {}) => {
    assertSession(session);
    const row = state.events.get(String(filter._id));
    const tier = row?.pricingTiers.find((item) => matches(item, filter.pricingTiers.$elemMatch));
    if (!tier) return { modifiedCount: 0 };
    for (const [path, amount] of Object.entries(change.$inc)) tier[path.split(".").at(-1)] += amount;
    return { modifiedCount: 1 };
  };
  let queue = Promise.resolve();
  const transaction = (work) => {
    const run = queue.then(async () => {
      for (;;) {
        const snapshot = Object.fromEntries(["books", "grants", "otps", "events", "customers", "tickets"].map((table) => [table,
          new Map([...state[table]].map(([key, row]) => [key, clone(row)]))]));
        try {
          const result = await tx.run({}, () => work(tx.getStore()));
          if (state.retryFinalize && !state.retried && [...state.books.values()].some((book) => book.status === "CONFIRMED")
            && ![...snapshot.books.values()].some((book) => book.status === "CONFIRMED")) {
            state.retried = true; Object.assign(state, snapshot); continue;
          }
          return result;
        } catch (err) { Object.assign(state, snapshot); throw err; }
      }
    });
    queue = run.catch(() => {}); return run;
  };
  const gateway = {
    configured: () => !state.mock,
    mockAllowed: () => isMockPaymentAllowed({ environment: state.production ? "production" : "development", enabled: "true" }),
    keyId: () => "rzp_test_fixture",
    verifySignature: (args) => verifyPaymentSignature(args, { secret: key }),
    async createOrder(book) {
      assert.equal(tx.getStore(), undefined);
      state.creates += 1;
      if (state.failCreate) throw new Error("Uncertain provider result");
      const order = { id: `order_fixture_${state.creates}`, receipt: String(book._id), notes: { bookingId: String(book._id) },
        amount: book.totalAmount * 100, currency: "INR", status: "created", amount_paid: 0, amount_due: book.totalAmount * 100 };
      state.orders.set(order.id, order);
      if (state.afterCreate) await state.afterCreate();
      return clone(order);
    },
    async fetchOrder(value) {
      assert.equal(tx.getStore(), undefined);
      if (state.beforeFetch) { const action = state.beforeFetch; state.beforeFetch = null; await action(); }
      return { ...clone(state.orders.get(value)), ...state.orderOverride };
    },
    async fetchPayment(value) { assert.equal(tx.getStore(), undefined); return { ...clone(state.payments.get(value)), ...state.paymentOverride }; },
  };
  const service = makeBookingPaymentService({ BookingModel, GrantModel, CustomerModel, EventModel, TicketModel, gateway,
    transaction, clock: () => state.now, finalize: async (...args) => {
      const result = await finalizeConfirmedBooking(...args);
      if (state.failFinalize) throw new Error("Synthetic fulfillment failure");
      return result;
    },
    notify: (value) => dispatchTicketDelivery(value, { BookingModel, TicketModel, deliver: async () => {
      assert.equal(tx.getStore(), undefined); state.notices += 1;
      if (state.failNotice) throw new Error("Synthetic uncertain delivery");
      return [{ channel: "EMAIL", purpose: "TICKET_DELIVERY", to: "guest@example.test", status: "SENT" }];
    } }),
  });
  function seed(number = 1, owner) {
    const book = new Booking({ _id: id(number), event: id(20), customer: owner, guestName: "Fixture guest", guestEmail: "guest@example.test",
      items: [{ pricingTierId: id(21), tierName: "General", quantity: 2, unitPrice: 100 }], totalAmount: 200,
      status: "PENDING", holdExpiresAt: new Date(+state.now + 600000) });
    state.books.set(id(number), clone(book));
    state.events.get(id(20)).pricingTiers[0].reservedQty += 2;
    const issued = createBookingAccessGrant({ booking: book, purpose: "CHECKOUT", now: state.now });
    const grant = { ...issued.grant, _id: new mongoose.Types.ObjectId(), handoffCount: 0 };
    state.grants.set(String(grant._id), grant);
    return { id: id(number), token: issued.token, grantId: String(grant._id), credential: { method: "grant", token: issued.token } };
  }
  function capture(bookId) {
    const book = state.books.get(bookId), order = state.orders.get(book.payment.orderId);
    Object.assign(order, { status: "paid", amount_paid: order.amount, amount_due: 0 });
    const payment = { id: `pay_fixture_${state.payments.size + 1}`, order_id: order.id, amount: order.amount,
      currency: "INR", status: "captured", captured: true, amount_refunded: 0 };
    state.payments.set(payment.id, payment);
    return { payment, details: { razorpay_order_id: order.id, razorpay_payment_id: payment.id,
      razorpay_signature: createHmac("sha256", key).update(`${order.id}|${payment.id}`).digest("hex") } };
  }
  const handlers = makePaymentHandlers({ service, verifyWebhook: (raw, signature) => verifyWebhookSignature(raw, signature, { secret: webhookKey }) });
  const emailExchangeHandler = makeEmailTicketAccessHandler({ BookingModel, GrantModel, TicketModel, transaction, clock: () => state.now });
  const otpKey = randomBytes(32);
  const recoveryHandlers = makeBookingRecoveryHandlers({ BookingModel, GrantModel, OtpModel, transaction, sendOtp: async ({ code }) => { state.lastOtp = code; }, hashOtp: (email, code) => createHmac("sha256", otpKey).update(`${email}:${code}`).digest("hex") });
  const access = (purpose) => requireBookingAccess({ purpose, denialStatus: 403, BookingModel, GrantModel, CustomerModel, verifySession, clock: () => state.now });
  const app = express();
  app.post("/api/public/payments/webhook", express.raw({ type: "application/json" }), handlers.razorpayWebhook);
  app.use(express.json()); app.use(cookieParser());
  app.use("/api/public", createPublicRouter({ bookingReadAccess: access("READ"), checkoutPaymentAccess: access("CHECKOUT"),
    handoffAccess: access("HANDOFF"), emailAccess: access("EMAIL_EXCHANGE"), paymentHandlers: handlers, getBookingHandler: makeGetBooking({ TicketModel }), emailExchangeHandler,
    recoveryRequestHandler: recoveryHandlers.requestBookingRecovery, recoveryVerifyHandler: recoveryHandlers.verifyBookingRecovery,
    paymentCsrf: requirePaymentCsrf({ origins: () => ["https://frontend.example.test"] }),
  }));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: { code: err.code, message: err.message } }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  async function request(path, { token, method = "POST", body = {}, headers = {}, raw } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { "Content-Type": "application/json", ...(token ? { "x-booking-access-token": token } : {}), ...headers },
      ...(method === "GET" ? {} : { body: raw ?? JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  function webhook(entity, { valid = true, type = "payment.captured" } = {}) {
    const raw = JSON.stringify({ event: type, payload: { payment: { entity } } });
    const signature = valid ? createHmac("sha256", webhookKey).update(raw).digest("hex") : "invalid";
    return request("/api/public/payments/webhook", { raw, headers: { "x-razorpay-signature": signature } });
  }
  function cookie(owner = id(50)) {
    state.customers.set(owner, { _id: owner, name: "Customer fixture", email: "verified@example.test", emailVerified: true });
    return { Cookie: `${CUSTOMER_SESSION_COOKIE}=${jwt.sign({ role: "customer", customerId: owner }, sessionKey, { expiresIn: "5m" })}` };
  }
  return { state, service, seed, capture, request, webhook, cookie, id, models: { BookingModel, GrantModel, OtpModel, EventModel, TicketModel } };
}
