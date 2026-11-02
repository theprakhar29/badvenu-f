import test from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import Ticket from "../src/models/Ticket.js";
import Customer from "../src/models/Customer.js";
import { requireBookingAccess } from "../src/middleware/bookingAccess.js";
import { makeGetBooking } from "../src/controllers/booking.controller.js";
import { createBookingAccessGrant } from "../src/utils/bookingAccess.js";
import { CUSTOMER_SESSION_COOKIE } from "../src/utils/token.js";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import Booking from "../src/models/Booking.js";
import BookingAccessGrant from "../src/models/BookingAccessGrant.js";
import Event from "../src/models/Event.js";
import { createPendingBookingWithAccess } from "../src/utils/createPendingBookingWithAccess.js";
import { matchesBookingAccessToken } from "../src/utils/bookingAccess.js";
import { reserveInventory } from "../src/utils/inventory.js";

test("MongoDB transaction commits and rolls back inventory, bookings and hashed grants together", async (t) => {
  // No environment files, connection credentials, configured app DB or remote host.
  // Each run uses a fresh isolated DB on a credential-free local test replica set.
  const dbName = `badvenu_phase2a_test_${randomBytes(8).toString("hex")}`;
  const connection = mongoose.createConnection(`mongodb://127.0.0.1:27017/${dbName}`, {
    serverSelectionTimeoutMS: 750, connectTimeoutMS: 750,
  });
  try {
    await connection.asPromise();
  } catch {
    await connection.close().catch(() => {});
    t.skip("No credential-free local MongoDB available; real persistence/transaction verification not run.");
    return;
  }
  let wrote = false;
  t.after(async () => {
    try {
      if (wrote) {
        assert.match(dbName, /^badvenu_phase2a_test_[a-f0-9]{16}$/);
        assert.equal(connection.name, dbName);
        await connection.dropDatabase();
      }
    } finally {
      await connection.close();
    }
  });
  const hello = await connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid") {
    t.skip("Local MongoDB is standalone; transactions require a replica set or sharded cluster.");
    return;
  }
  wrote = true;
  const EventModel = connection.model("Event", Event.schema);
  const BookingModel = connection.model("Booking", Booking.schema);
  const GrantModel = connection.model("BookingAccessGrant", BookingAccessGrant.schema);
  await Promise.all([EventModel.init(), BookingModel.init(), GrantModel.init()]);
  const event = await EventModel.create({
    organizer: new mongoose.Types.ObjectId(), title: "Isolated test show", slug: "isolated-test",
    status: "PUBLISHED", pricingTiers: [{ name: "General", price: 100, totalQty: 10 }],
  });
  const data = {
    event: event._id, guestName: "Integration fixture", guestEmail: "guest@example.test",
    items: [{ pricingTierId: event.pricingTiers[0]._id, tierName: "General", quantity: 1, unitPrice: 100 }],
    totalAmount: 100, status: "PENDING", holdExpiresAt: new Date(Date.now() + 600000),
  };
  const options = {
    BookingModel, GrantModel,
    reserve: (id, items, options) => reserveInventory(id, items, { ...options, EventModel }),
  };
  const result = await createPendingBookingWithAccess(data, options);
  assert.equal(await BookingModel.countDocuments(), 1);
  assert.equal(await GrantModel.countDocuments(), 1);
  const hidden = await GrantModel.findOne({ booking: result.booking._id });
  assert.equal(hidden.tokenHash, undefined);
  const selected = await GrantModel.findOne({ booking: result.booking._id }).select("+tokenHash");
  assert.equal(matchesBookingAccessToken(result.checkoutAccessToken, selected.tokenHash), true);
  assert.equal(Object.hasOwn(selected.toJSON(), "tokenHash"), false);
  const raw = await GrantModel.collection.findOne({ booking: result.booking._id });
  assert.equal(Object.hasOwn(raw, "token"), false);
  assert.equal(Object.hasOwn(raw, "checkoutAccessToken"), false);
  assert.equal((await EventModel.findById(event._id)).pricingTiers[0].reservedQty, 1);

  // Fail after all three writes, proving transaction abort also removes a grant
  // already inserted before the simulated failure (not just a pre-insert failure).
  const failingGrantModel = { async create(...args) {
    await GrantModel.create(...args);
    throw new Error("Synthetic post-insert failure");
  } };
  await assert.rejects(createPendingBookingWithAccess(data, { ...options, GrantModel: failingGrantModel }));
  assert.equal(await BookingModel.countDocuments(), 1);
  assert.equal(await GrantModel.countDocuments(), 1);
  assert.equal((await EventModel.findById(event._id)).pricingTiers[0].reservedQty, 1);
});
test("MongoDB-backed HTTP reads enforce persisted grants, revocation, ownership and legacy denial", async (t) => {
  const dbName = `badvenu_phase2a_test_${randomBytes(8).toString("hex")}`;
  const connection = mongoose.createConnection(`mongodb://127.0.0.1:27017/${dbName}`, {
    serverSelectionTimeoutMS: 750, connectTimeoutMS: 750,
  });
  try { await connection.asPromise(); } catch {
    await connection.close().catch(() => {});
    t.skip("No credential-free local MongoDB available; database-backed HTTP verification not run.");
    return;
  }
  let server;
  t.after(async () => {
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      assert.match(dbName, /^badvenu_phase2a_test_[a-f0-9]{16}$/);
      assert.equal(connection.name, dbName);
      await connection.dropDatabase();
    } finally { await connection.close(); }
  });
  const EventModel = connection.model("Event", Event.schema);
  const BookingModel = connection.model("Booking", Booking.schema);
  const GrantModel = connection.model("BookingAccessGrant", BookingAccessGrant.schema);
  const TicketModel = connection.model("Ticket", Ticket.schema);
  const CustomerModel = connection.model("Customer", Customer.schema);
  await Promise.all([EventModel.init(), BookingModel.init(), GrantModel.init(), TicketModel.init(), CustomerModel.init()]);
  const event = await EventModel.create({
    organizer: new mongoose.Types.ObjectId(), title: "Isolated HTTP show", slug: "isolated-http",
    status: "PUBLISHED", pricingTiers: [{ name: "General", price: 100, totalQty: 10 }],
  });
  const booking = await BookingModel.create({
    event: event._id, guestName: "Database fixture", guestEmail: "guest@example.test",
    items: [{ pricingTierId: event.pricingTiers[0]._id, tierName: "General", quantity: 1, unitPrice: 100 }],
    totalAmount: 100, status: "PENDING", holdExpiresAt: new Date(Date.now() + 600000),
  });
  const checkout = createBookingAccessGrant({ booking, purpose: "CHECKOUT" });
  await GrantModel.create(checkout.grant);
  const rawGrant = await GrantModel.collection.findOne({ booking: booking._id });
  assert.equal(Object.hasOwn(rawGrant, "token"), false);
  assert.equal(Object.hasOwn(rawGrant, "checkoutAccessToken"), false);
  assert.equal(matchesBookingAccessToken(checkout.token, rawGrant.tokenHash), true);
  assert.equal((await GrantModel.findById(rawGrant._id)).tokenHash, undefined);
  const explicitlySelected = await GrantModel.findById(rawGrant._id).select("+tokenHash");
  assert.equal(matchesBookingAccessToken(checkout.token, explicitlySelected.tokenHash), true);
  assert.equal(Object.hasOwn(explicitlySelected.toJSON(), "tokenHash"), false);
  assert.equal((await BookingModel.findById(booking._id)).accessVersion, undefined);
  assert.equal((await BookingModel.findById(booking._id).select("+accessVersion")).accessVersion, 0);

  const testKey = randomBytes(32);
  const app = express();
  app.use(cookieParser());
  app.get("/api/public/bookings/:id", requireBookingAccess({
    purpose: "READ", denialStatus: 403, BookingModel, GrantModel, CustomerModel,
    verifySession: (value) => jwt.verify(value, testKey),
  }), makeGetBooking({ TicketModel }));
  app.use((_err, _req, res, _next) => res.status(500).json({ error: "Test request failed" }));
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  async function read(token, cookie) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/bookings/${booking._id}`, {
      headers: { ...(token ? { "x-booking-access-token": token } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    });
    return { status: response.status, body: await response.json() };
  }
  assert.equal((await read()).status, 403);
  const pending = await read(checkout.token);
  assert.equal(pending.status, 200);
  assert.equal(pending.body.event.title, event.title);
  assert.equal(Object.hasOwn(pending.body, "checkoutAccessToken"), false);
  await GrantModel.updateOne({ _id: rawGrant._id }, { $set: { revokedAt: new Date() } });
  assert.equal((await read(checkout.token)).status, 403);
  await GrantModel.updateOne({ _id: rawGrant._id }, { $set: { revokedAt: null, expiresAt: new Date(0) } });
  assert.equal((await read(checkout.token)).status, 403);
  await GrantModel.updateOne({ _id: rawGrant._id }, { $set: { expiresAt: checkout.grant.expiresAt } });
  await BookingModel.updateOne({ _id: booking._id }, { $inc: { accessVersion: 1 } });
  assert.equal((await read(checkout.token)).status, 403);
  await BookingModel.updateOne({ _id: booking._id }, { $set: { accessVersion: 0, status: "CONFIRMED" } });
  assert.equal((await read(checkout.token)).status, 403);
  const confirmed = await BookingModel.findById(booking._id).select("+accessVersion");
  const ticketGrant = createBookingAccessGrant({ booking: confirmed, purpose: "TICKET", expiresAt: new Date(Date.now() + 600000) });
  await GrantModel.create(ticketGrant.grant);
  await TicketModel.create({
    booking: booking._id, event: event._id, pricingTierId: event.pricingTiers[0]._id,
    tierName: "General", qrToken: "isolated-test-scan-value", qrDataUrl: "data:image/png;base64,fixture",
  });
  const ticketRead = await read(ticketGrant.token);
  assert.equal(ticketRead.status, 200);
  assert.equal(ticketRead.body.tickets.length, 1);
  assert.equal(Object.hasOwn(ticketRead.body.tickets[0], "qrToken"), false);
  assert.equal(Object.hasOwn(ticketRead.body, "accessVersion"), false);
  const customer = await CustomerModel.create({ name: "Verified fixture", email: "verified@example.test", emailVerified: true });
  await BookingModel.updateOne({ _id: booking._id }, { $set: { customer: customer._id }, $unset: { accessVersion: 1 } });
  await GrantModel.deleteMany({ booking: booking._id });
  const session = jwt.sign({ role: "customer", customerId: String(customer._id) }, testKey, { expiresIn: "5m" });
  assert.equal((await read()).status, 403);
  assert.equal((await read(null, `${CUSTOMER_SESSION_COOKIE}=${session}`)).status, 200);
  await CustomerModel.updateOne({ _id: customer._id }, { $set: { emailVerified: false } });
  assert.equal((await read(null, `${CUSTOMER_SESSION_COOKIE}=${session}`)).status, 403);
});
