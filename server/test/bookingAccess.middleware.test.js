import test from "node:test";
import assert from "node:assert/strict";
import { requireBookingAccess } from "../src/middleware/bookingAccess.js";
import { createBookingAccessGrant, BOOKING_ACCESS_HEADER } from "../src/utils/bookingAccess.js";
import { CUSTOMER_SESSION_COOKIE } from "../src/utils/token.js";

const now = new Date("2026-10-26T00:00:00Z");
const id = "000000000000000000000001";
const customerId = "000000000000000000000002";
const booking = { _id: id, status: "PENDING", accessVersion: 0, holdExpiresAt: new Date(+now + 100000) };
const issued = createBookingAccessGrant({ booking, purpose: "CHECKOUT", now });

// Repository seams keep these tests offline: no app startup, .env, JWT keys or DB.
async function run(options = {}) {
  const req = { params: { id }, headers: {}, cookies: {}, ...options.req };
  const calls = [];
  const selected = (name, result) => ({ select(fields) { calls.push([name, fields]); return Promise.resolve(result); } });
  const middleware = requireBookingAccess({
    purpose: options.purpose || "CHECKOUT",
    BookingModel: { findById(value) {
      calls.push(["booking", value]);
      if (options.dbError) throw options.dbError;
      return selected("booking-select", options.booking === undefined ? booking : options.booking);
    } },
    GrantModel: { findOne(query) { calls.push(["grant", query]); return selected("grant-select", options.grant ?? null); } },
    CustomerModel: { findById(value) { calls.push(["customer", value]); return selected("customer-select", options.customer ?? null); } },
    verifySession(value) {
      calls.push(["verify", value]);
      if (options.invalidSession) throw new Error("Invalid session");
      return options.identity;
    },
    clock: () => now,
  });
  const res = {
    headers: {}, statusCode: 200,
    set(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  let nextCalls = 0;
  let error;
  await middleware(req, res, (err) => { nextCalls += 1; error = err; });
  return { req, res, calls, nextCalls, error };
}
const tokenRequest = { headers: { [BOOKING_ACCESS_HEADER]: issued.token } };
const customerRequest = { cookies: { [CUSTOMER_SESSION_COOKIE]: "synthetic-session" } };
const identity = { role: "customer", customerId };

test("valid header grant authorizes and passes loaded booking without bearer material", async () => {
  const result = await run({ req: tokenRequest, grant: { ...issued.grant, _id: "grant-id" } });
  assert.equal(result.nextCalls, 1);
  assert.equal(result.error, undefined);
  assert.equal(result.req.booking, booking);
  assert.deepEqual(result.req.bookingAccess, { purpose: "CHECKOUT", method: "grant", grantId: "grant-id" });
  assert.deepEqual(result.calls.find(([name]) => name === "grant")[1], {
    booking: id, purpose: "CHECKOUT", tokenHash: issued.grant.tokenHash,
  });
  assert.equal(result.res.headers["Cache-Control"], "no-store");
  assert.equal(result.res.headers["Referrer-Policy"], "no-referrer");
});

test("EMAIL-source ticket grants are selected explicitly and cannot become generic ticket readers", async () => {
  const confirmed = { _id: id, status: "CONFIRMED", accessVersion: 0 };
  const ticket = createBookingAccessGrant({ booking: confirmed, purpose: "TICKET", source: "EMAIL", now, expiresAt: new Date(+now + 100000) });
  const result = await run({ purpose: "READ", booking: confirmed,
    req: { headers: { [BOOKING_ACCESS_HEADER]: ticket.token } }, grant: { ...ticket.grant, _id: "email-grant" } });
  assert.equal(result.nextCalls, 0);
  assert.equal(result.res.statusCode, 404);
  assert.match(result.calls.find(([name]) => name === "grant-select")[1], /\+source/);
});

test("unknown, invalid, tokenless and wrong-token bookings have identical denial responses", async () => {
  const responses = [];
  for (const options of [
    {}, { booking: null }, { req: { params: { id: "invalid" } } },
    { req: tokenRequest }, { req: { headers: { [BOOKING_ACCESS_HEADER]: "bad-token" } } },
  ]) {
    const result = await run(options);
    assert.equal(result.res.statusCode, 404);
    assert.equal(result.nextCalls, 0);
    assert.equal(result.req.booking, undefined);
    assert.equal(result.res.headers["Cache-Control"], "no-store");
    responses.push(result.res.body);
  }
  for (const response of responses) assert.deepEqual(response, responses[0]);
});

test("body, query and fabricated req.customer never authorize", async () => {
  const result = await run({ req: {
    body: { customerId, token: issued.token }, query: { token: issued.token, customerId },
    customer: { customerId },
  }, booking: { ...booking, customer: customerId }, customer: { emailVerified: true } });
  assert.equal(result.res.statusCode, 404);
  assert.equal(result.calls.some(([name]) => name === "customer"), false);
});

test("verified signed customer identity authorizes only its database-linked booking", async () => {
  const result = await run({ req: customerRequest, identity,
    booking: { ...booking, customer: customerId }, customer: { emailVerified: true } });
  assert.equal(result.nextCalls, 1);
  assert.equal(result.req.bookingAccess.method, "customer");
  assert.equal(result.calls.some(([name]) => name === "grant"), false);
});

for (const [name, overrides] of [
  ["unverified account", { customer: { emailVerified: false } }],
  ["deleted account", { customer: null }],
  ["unlinked legacy booking", { booking }],
  ["other customer", { identity: { ...identity, customerId: "000000000000000000000003" } }],
  ["wrong role", { identity: { ...identity, role: "organizer" } }],
  ["invalid identity ID", { identity: { ...identity, customerId: "bad-id" } }],
  ["invalid session", { invalidSession: true }],
]) {
  test(`customer denied for ${name}`, async () => {
    const result = await run({ req: customerRequest, identity,
      booking: { ...booking, customer: customerId }, customer: { emailVerified: true }, ...overrides });
    assert.equal(result.res.statusCode, 404);
    assert.equal(result.nextCalls, 0);
  });
}

test("an invalid customer session does not prevent valid independent guest access", async () => {
  const result = await run({ req: { ...tokenRequest, ...customerRequest }, invalidSession: true, grant: issued.grant });
  assert.equal(result.nextCalls, 1);
  assert.equal(result.req.bookingAccess.method, "grant");
});

for (const [name, grant] of [
  ["revoked", { ...issued.grant, revokedAt: now }],
  ["expired", { ...issued.grant, expiresAt: now }],
  ["other booking", { ...issued.grant, booking: customerId }],
  ["wrong purpose", { ...issued.grant, purpose: "TICKET" }],
  ["old version", { ...issued.grant, accessVersion: 1 }],
  ["wrong hash", { ...issued.grant, tokenHash: "a".repeat(64) }],
]) {
  test(`middleware rejects ${name} grant even if repository returns it`, async () => {
    const result = await run({ req: tokenRequest, grant });
    assert.equal(result.res.statusCode, 404);
    assert.equal(result.nextCalls, 0);
  });
}

test("legacy tokenless access fails; verified linked owners retain access", async () => {
  const legacy = { ...booking, status: "CONFIRMED", customer: customerId };
  delete legacy.accessVersion;
  assert.equal((await run({ booking: legacy, purpose: "TICKET" })).res.statusCode, 404);
  const result = await run({ booking: legacy, purpose: "TICKET", req: customerRequest,
    identity, customer: { emailVerified: true } });
  assert.equal(result.nextCalls, 1);
});

test("ticket middleware accepts a confirmed grant and checkout cannot use it", async () => {
  const confirmed = { ...booking, status: "CONFIRMED" };
  const ticket = createBookingAccessGrant({ booking: confirmed, purpose: "TICKET", now, expiresAt: new Date(+now + 100000) });
  const req = { headers: { [BOOKING_ACCESS_HEADER]: ticket.token } };
  const result = await run({ booking: confirmed, purpose: "TICKET", req, grant: ticket.grant });
  assert.equal(result.nextCalls, 1);
  assert.equal((await run({ req, grant: ticket.grant })).res.statusCode, 404);
});

test("customer authorization cannot bypass reservation expiry or booking state", async () => {
  for (const state of [{ status: "CONFIRMED" }, { status: "FAILED" }, { holdExpiresAt: now }]) {
    const result = await run({ req: customerRequest, identity, customer: { emailVerified: true },
      booking: { ...booking, customer: customerId, ...state } });
    assert.equal(result.res.statusCode, 404);
  }
});

test("database failures go to Express error handling and never authorize", async () => {
  const dbError = new Error("Synthetic repository failure");
  const result = await run({ dbError });
  assert.equal(result.error, dbError);
  assert.equal(result.req.booking, undefined);
});

test("middleware requires an explicit supported purpose", () => {
  assert.throws(() => requireBookingAccess({ purpose: "ANY" }), TypeError);
});
