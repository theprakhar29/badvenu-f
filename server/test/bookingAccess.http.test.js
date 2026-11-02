import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import { request as httpRequest } from "node:http";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Event from "../src/models/Event.js";
import { makeCreateBooking, makeGetBooking } from "../src/controllers/booking.controller.js";
import publicRouter, { createPublicRouter } from "../src/routes/public.routes.js";
import { requireBookingAccess } from "../src/middleware/bookingAccess.js";
import { getVerifiedCustomerId } from "../src/middleware/customerAuth.js";
import { createPendingBookingWithAccess } from "../src/utils/createPendingBookingWithAccess.js";
import { createBookingAccessGrant, matchesBookingAccessToken } from "../src/utils/bookingAccess.js";
import { reserveInventory } from "../src/utils/inventory.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { logger } from "../src/utils/logger.js";
import { CUSTOMER_SESSION_COOKIE } from "../src/utils/token.js";

const customerId = "000000000000000000000002";
const otherId = "000000000000000000000003";

async function harness(t) {
  const state = {
    bookings: new Map(), grants: [], tickets: [], customers: new Map(),
    reserved: 0, ticketLookups: 0, fail: null, logs: [], sessions: [],
  };
  const event = new Event({
    _id: "000000000000000000000004", organizer: otherId, title: "Test show",
    slug: "test-show", status: "PUBLISHED",
    pricingTiers: [{ _id: "000000000000000000000005", name: "General", price: 100, totalQty: 20 }],
  });
  const tierId = event.pricingTiers[0]._id;
  const EventModel = {
    findOne(_query, projection) {
      if (!projection) return Promise.resolve(event);
      return { session(session) {
        state.sessions.push(session);
        return Promise.resolve({ pricingTiers: [{
          ...event.pricingTiers[0].toObject(), reservedQty: state.reserved,
        }] });
      } };
    },
    async updateOne(query, update, { session }) {
      state.sessions.push(session);
      if (state.fail === "inventory") throw new Error("Synthetic inventory failure");
      if (query.pricingTiers.$elemMatch.reservedQty !== state.reserved) return { modifiedCount: 0 };
      state.reserved += update.$inc["pricingTiers.$.reservedQty"];
      return { modifiedCount: 1 };
    },
  };
  class BookingModel {
    constructor(data) {
      Object.assign(this, data);
      this._id = new mongoose.Types.ObjectId();
      this.accessVersion = 0;
    }
    async save({ session }) {
      state.sessions.push(session);
      if (state.fail === "booking") throw new Error("Synthetic booking failure");
      state.bookings.set(String(this._id), this);
    }
    async populate() {
      this.event = event;
      return this;
    }
    static findById(id) {
      if (state.fail === "read") throw new Error("Synthetic database details must stay private");
      return { select: async () => state.bookings.get(String(id)) ?? null };
    }
  }
  const GrantModel = {
    async create(grants, { session }) {
      state.sessions.push(session);
      if (state.fail === "grant") throw new Error("Synthetic grant failure");
      state.grants.push(...grants.map((grant) => ({ ...grant, _id: new mongoose.Types.ObjectId() })));
    },
    findOne(query) {
      if (state.fail === "grant-read") throw new Error(query.tokenHash);
      return { select: async () => state.grants.find((grant) =>
      String(grant.booking) === String(query.booking) && grant.purpose === query.purpose
      && grant.tokenHash === query.tokenHash) ?? null }; },
  };
  const CustomerModel = {
    findById(id) { return { select: async () => state.customers.get(String(id)) ?? null }; },
  };
  const TicketModel = {
    find(query) {
      state.ticketLookups += 1;
      return { select(fields) {
        assert.equal(fields.includes("booking"), true);
        assert.equal(fields.includes("qrToken"), false);
        return { sort: async () => state.tickets.filter((ticket) => String(ticket.booking) === String(query.booking)) };
      } };
    },
  };
  // An ephemeral test key, never a configured credential; never logged or persisted.
  const testKey = randomBytes(32);
  const verifySession = (token) => jwt.verify(token, testKey);
  const transaction = async (work) => {
    const snapshot = { bookings: new Map(state.bookings), grants: [...state.grants], reserved: state.reserved };
    const session = {};
    try {
      const result = await work(session);
      if (state.fail === "commit") throw new Error("Synthetic commit failure");
      return result;
    } catch (err) {
      Object.assign(state, snapshot);
      throw err;
    }
  };
  const bookingReadAccess = requireBookingAccess({
    purpose: "READ", denialStatus: 403, BookingModel, GrantModel, CustomerModel, verifySession,
  });
  const persist = (data) => createPendingBookingWithAccess(data, {
    BookingModel, GrantModel, transaction,
    reserve: (id, items, options) => reserveInventory(id, items, { ...options, EventModel }),
  });
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/public", createPublicRouter({
    createBookingHandler: makeCreateBooking({
      EventModel, releaseExpired: async () => {}, persist,
      resolveCustomerId: (req) => getVerifiedCustomerId(req, { CustomerModel, verifySession }),
    }),
    getBookingHandler: makeGetBooking({ TicketModel }), bookingReadAccess,
  }));
  app.use(errorHandler);
  const log = t.mock.method(logger, "booking", (...args) => state.logs.push(args));
  const errors = t.mock.method(console, "error", (...args) => state.logs.push(args));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    log.mock.restore(); errors.mock.restore();
  });
  async function request(path, { method = "GET", body, headers = {} } = {}) {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = httpRequest({
        hostname: "127.0.0.1", port: server.address().port, path, method,
        headers: { ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}), ...headers },
      }, (res) => {
        let content = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { content += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(content) }));
      });
      req.on("error", reject);
      req.end(payload);
    });
  }
  async function create(extra = {}, headers = {}) {
    return request("/api/public/events/test-show/bookings", {
      method: "POST", headers, body: {
        guestName: "Guest fixture", guestEmail: "guest@example.test",
        items: [{ pricingTierId: String(tierId), quantity: 1 }], ...extra,
      },
    });
  }
  function cookie(id = customerId, role = "customer") {
    return { Cookie: `${CUSTOMER_SESSION_COOKIE}=${jwt.sign({ customerId: id, role }, testKey, { expiresIn: "5m" })}` };
  }
  function headers(token) { return { "x-booking-access-token": token }; }
  function confirm(id) {
    const booking = state.bookings.get(String(id));
    booking.status = "CONFIRMED";
    state.tickets.push({
      _id: new mongoose.Types.ObjectId(), booking: booking._id, tierName: "General",
      status: "UNUSED", qrDataUrl: "data:image/png;base64,fixture", qrToken: "synthetic-scan-value",
    });
    return booking;
  }
  return { state, request, create, cookie, headers, confirm };
}

function assertDenied(result) {
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: {
    code: "BOOKING_ACCESS_DENIED", message: "Booking not found or access unavailable.",
  } });
  assert.equal(result.headers["cache-control"], "no-store");
}

test("HTTP guest creation persists only a hash and returns a token once", async (t) => {
  const h = await harness(t);
  const created = await h.create();
  assert.equal(created.status, 201);
  assert.equal(typeof created.body.checkoutAccessToken, "string");
  assert.equal(Buffer.from(created.body.checkoutAccessToken, "base64url").length, 32);
  assert.equal(h.state.grants.length, 1);
  assert.equal(matchesBookingAccessToken(created.body.checkoutAccessToken, h.state.grants[0].tokenHash), true);
  assert.equal(Object.hasOwn(h.state.grants[0], "token"), false);
  assert.equal(Object.hasOwn(h.state.bookings.get(created.body._id), "checkoutAccessToken"), false);
  for (const field of ["tokenHash", "accessVersion", "payment", "deliveryLog", "formResponses", "customer"]) {
    assert.equal(Object.hasOwn(created.body, field), false);
  }
  const read = await h.request(`/api/public/bookings/${created.body._id}`, { headers: h.headers(created.body.checkoutAccessToken) });
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.tickets, []);
  assert.equal(Object.hasOwn(read.body, "checkoutAccessToken"), false);
  assert.equal(read.headers["cache-control"], "no-store");
  assert.equal(read.headers["referrer-policy"], "no-referrer");
  assert.equal(h.state.ticketLookups, 0);
  assert.equal(h.state.reserved, 1);
  assert.equal(h.state.sessions.every((session) => session === h.state.sessions[0]), true);
  const logs = JSON.stringify(h.state.logs);
  assert.equal(logs.includes(created.body.checkoutAccessToken), false);
  assert.equal(logs.includes(h.state.grants[0].tokenHash), false);
  assert.equal(logs.includes("guest@example.test"), false);
});

for (const mode of ["missing", "wrong", "malformed", "revoked", "expired", "version", "cross-booking"]) {
  test(`HTTP rejects ${mode} checkout access before ticket lookup`, async (t) => {
    const h = await harness(t);
    const first = (await h.create()).body;
    let token = first.checkoutAccessToken;
    if (mode === "missing") token = undefined;
    if (mode === "malformed") token = "invalid";
    if (mode === "wrong") token = randomBytes(32).toString("base64url");
    if (mode === "revoked") h.state.grants[0].revokedAt = new Date();
    if (mode === "expired") h.state.grants[0].expiresAt = new Date(0);
    if (mode === "version") h.state.bookings.get(first._id).accessVersion += 1;
    if (mode === "cross-booking") token = (await h.create()).body.checkoutAccessToken;
    const result = await h.request(`/api/public/bookings/${first._id}`, { headers: token ? h.headers(token) : {} });
    assertDenied(result);
    assert.equal(h.state.ticketLookups, 0);
  });
}

test("HTTP missing, unknown and malformed booking IDs produce the same denial", async (t) => {
  const h = await harness(t);
  const first = (await h.create()).body;
  for (const id of [first._id, otherId, "invalid-id"]) {
    assertDenied(await h.request(`/api/public/bookings/${id}`));
    assertDenied(await h.request(`/api/public/bookings/${id}`, { headers: h.headers(randomBytes(32).toString("base64url")) }));
  }
});

test("HTTP never accepts access tokens from query strings or GET request bodies", async (t) => {
  const h = await harness(t);
  const first = (await h.create()).body;
  assertDenied(await h.request(`/api/public/bookings/${first._id}?accessToken=${first.checkoutAccessToken}`));
  assertDenied(await h.request(`/api/public/bookings/${first._id}`, { body: { accessToken: first.checkoutAccessToken } }));
});

test("HTTP checkout grants cannot read confirmed tickets; independent ticket grants can", async (t) => {
  const h = await harness(t);
  const first = (await h.create()).body;
  const booking = h.confirm(first._id);
  assertDenied(await h.request(`/api/public/bookings/${first._id}`, { headers: h.headers(first.checkoutAccessToken) }));
  assert.equal(h.state.ticketLookups, 0);
  const issued = createBookingAccessGrant({ booking, purpose: "TICKET", expiresAt: new Date(Date.now() + 60000) });
  h.state.grants.push(issued.grant);
  const read = await h.request(`/api/public/bookings/${first._id}`, { headers: h.headers(issued.token) });
  assert.equal(read.status, 200);
  assert.equal(read.body.tickets.length, 1);
  assert.equal(read.body.tickets[0].qrDataUrl, "data:image/png;base64,fixture");
  assert.equal(Object.hasOwn(read.body.tickets[0], "qrToken"), false);
  assert.equal(Object.hasOwn(read.body, "payment"), false);
  assert.equal(Object.hasOwn(read.body, "accessVersion"), false);
  assert.equal(Object.hasOwn(read.body, "checkoutAccessToken"), false);
});

test("HTTP verified customer session links creation and authorizes its booking", async (t) => {
  const h = await harness(t);
  h.state.customers.set(customerId, { emailVerified: true });
  const created = await h.create({ customer: otherId, customerId: otherId }, h.cookie());
  assert.equal(created.status, 201);
  assert.equal(h.state.bookings.get(created.body._id).customer, customerId);
  h.confirm(created.body._id);
  const read = await h.request(`/api/public/bookings/${created.body._id}`, { headers: h.cookie() });
  assert.equal(read.status, 200);
  assert.equal(read.body.tickets.length, 1);
});

for (const mode of ["other-owner", "unverified", "deleted", "wrong-role", "invalid-cookie", "email-only"]) {
  test(`HTTP denies customer access for ${mode}`, async (t) => {
    const h = await harness(t);
    h.state.customers.set(customerId, { emailVerified: true });
    h.state.customers.set(otherId, { emailVerified: true });
    const created = (await h.create({}, h.cookie())).body;
    h.confirm(created._id);
    let headers = h.cookie();
    if (mode === "other-owner") headers = h.cookie(otherId);
    if (mode === "unverified") h.state.customers.set(customerId, { emailVerified: false });
    if (mode === "deleted") h.state.customers.delete(customerId);
    if (mode === "wrong-role") headers = h.cookie(customerId, "organizer");
    if (mode === "invalid-cookie") headers = { Cookie: `${CUSTOMER_SESSION_COOKIE}=invalid` };
    if (mode === "email-only") headers = {};
    assertDenied(await h.request(`/api/public/bookings/${created._id}?customerId=${customerId}&email=guest%40example.test`, { headers }));
    assert.equal(h.state.ticketLookups, 0);
  });
}

test("HTTP legacy bare IDs fail; verified linked owners retain ticket access", async (t) => {
  const h = await harness(t);
  h.state.customers.set(customerId, { emailVerified: true });
  const first = (await h.create({}, h.cookie())).body;
  const legacy = h.confirm(first._id);
  delete legacy.accessVersion;
  h.state.grants = [];
  assertDenied(await h.request(`/api/public/bookings/${first._id}`));
  assert.equal((await h.request(`/api/public/bookings/${first._id}`, { headers: h.cookie() })).status, 200);
  delete legacy.customer;
  assertDenied(await h.request(`/api/public/bookings/${first._id}`, { headers: h.cookie() }));
});

for (const fail of ["inventory", "booking", "grant", "commit"]) {
  test(`HTTP ${fail} failure rolls back inventory, booking and grant and returns no bearer`, async (t) => {
    const h = await harness(t);
    h.state.fail = fail;
    const response = await h.create();
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, "BOOKING_CREATE_FAILED");
    assert.equal(Object.hasOwn(response.body, "checkoutAccessToken"), false);
    assert.equal(h.state.bookings.size, 0);
    assert.equal(h.state.grants.length, 0);
    assert.equal(h.state.reserved, 0);
    assert.equal(JSON.stringify(h.state.logs).includes("Synthetic"), false);
  });
}

test("HTTP forged customer fields/email do not link unauthenticated guest bookings", async (t) => {
  const h = await harness(t);
  h.state.customers.set(customerId, { emailVerified: true, email: "guest@example.test" });
  const created = await h.create({ customer: customerId, customerId, accessVersion: 99, totalAmount: 0 });
  assert.equal(created.status, 201);
  const booking = h.state.bookings.get(created.body._id);
  assert.equal(booking.customer, undefined);
  assert.equal(booking.accessVersion, 0);
  assert.equal(booking.totalAmount, 100);
});

test("HTTP expired reservation cannot authorize pending reads", async (t) => {
  const h = await harness(t);
  const created = (await h.create()).body;
  h.state.bookings.get(created._id).holdExpiresAt = new Date(0);
  assertDenied(await h.request(`/api/public/bookings/${created._id}`, { headers: h.headers(created.checkoutAccessToken) }));
});

test("default public GET route includes authorization before its controller", () => {
  const route = publicRouter.stack.find((layer) => layer.route?.path === "/bookings/:id").route;
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle.name, "bookingAccess");
  assert.equal(route.stack[1].handle.name, "getBooking");
});
test("HTTP read failures never expose or log database details or query hashes", async (t) => {
  const h = await harness(t);
  const first = (await h.create()).body;
  for (const fail of ["read", "grant-read"]) {
    h.state.fail = fail;
    const response = await h.request(`/api/public/bookings/${first._id}`, { headers: h.headers(first.checkoutAccessToken) });
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, "BOOKING_READ_FAILED");
    assert.equal(JSON.stringify(response.body).includes(h.state.grants[0].tokenHash), false);
  }
  const messages = h.state.logs.flat().map((value) => value instanceof Error ? value.message : JSON.stringify(value)).join(" ");
  assert.equal(messages.includes(h.state.grants[0].tokenHash), false);
  assert.equal(messages.includes("Synthetic database"), false);
});

test("HTTP validation failures create no inventory, bookings or grants", async (t) => {
  const h = await harness(t);
  const response = await h.create({ items: [] });
  assert.equal(response.status, 400);
  assert.equal(h.state.reserved, 0);
  assert.equal(h.state.bookings.size, 0);
  assert.equal(h.state.grants.length, 0);
});

test("HTTP JSON parser errors cannot dump submitted booking/token payloads into logs", async (t) => {
  const h = await harness(t);
  const response = await h.request("/api/public/events/test-show/bookings", {
    method: "POST", body: "synthetic-sensitive-body",
  });
  assert.equal(response.status, 400);
  const logs = h.state.logs.flat().map((value) => value instanceof Error ? value.message : JSON.stringify(value)).join(" ");
  assert.equal(logs.includes("synthetic-sensitive-body"), false);
});
