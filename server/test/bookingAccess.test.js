import test from "node:test";
import assert from "node:assert/strict";
import Booking from "../src/models/Booking.js";
import BookingAccessGrant from "../src/models/BookingAccessGrant.js";
import {
  ACCESS_PURPOSE, CHECKOUT_TTL_MS, createBookingAccessGrant,
  hashBookingAccessToken, matchesBookingAccessToken, isBookingAccessToken,
  isBookingAccessGrantValid,
} from "../src/utils/bookingAccess.js";

const now = new Date("2026-10-26T00:00:00Z");
const later = (ms) => new Date(now.getTime() + ms);
const booking = {
  _id: "000000000000000000000001", status: "PENDING",
  holdExpiresAt: later(60 * 60 * 1000), accessVersion: 0,
};
function checkout(overrides = {}) {
  return createBookingAccessGrant({ booking, purpose: ACCESS_PURPOSE.CHECKOUT, now, ...overrides });
}
function valid(issued, overrides = {}) {
  return isBookingAccessGrantValid({
    booking, ...issued, purpose: ACCESS_PURPOSE.CHECKOUT, now, ...overrides,
  });
}

test("tokens contain 32 random bytes; persisted grants contain only SHA-256 hashes", () => {
  const first = checkout();
  const second = checkout();
  assert.equal(Buffer.from(first.token, "base64url").length, 32);
  assert.equal(first.token.length, 43);
  assert.notEqual(first.token, second.token);
  assert.match(first.grant.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(first.grant.tokenHash, hashBookingAccessToken(first.token));
  assert.equal(JSON.stringify(first.grant).includes(first.token), false);
  assert.equal(valid(first), true);
  assert.equal(matchesBookingAccessToken(second.token, first.grant.tokenHash), false);
});

test("checkout expiry is bounded by the hold, 15 minutes, and an earlier requested expiry", () => {
  assert.equal(+checkout().grant.expiresAt, +later(CHECKOUT_TTL_MS));
  assert.equal(+checkout({ booking: { ...booking, holdExpiresAt: later(1000) } }).grant.expiresAt, +later(1000));
  assert.equal(+checkout({ expiresAt: later(500) }).grant.expiresAt, +later(500));
});

for (const token of [undefined, null, [], {}, "", "a".repeat(42), "a".repeat(44), "!".repeat(43), "A".repeat(42) + "B"]) {
  test(`malformed token is rejected (${JSON.stringify(token)})`, () => {
    assert.equal(isBookingAccessToken(token), false);
    assert.equal(matchesBookingAccessToken(token, "a".repeat(64)), false);
    assert.throws(() => hashBookingAccessToken(token), TypeError);
  });
}

test("malformed stored hashes fail closed without timingSafeEqual length errors", () => {
  const { token } = checkout();
  for (const hash of [null, {}, "", "a".repeat(63), "z".repeat(64)]) {
    assert.equal(matchesBookingAccessToken(token, hash), false);
  }
});

for (const [name, overrides] of [
  ["expired", { grant: { expiresAt: now } }],
  ["revoked", { grant: { revokedAt: now } }],
  ["other booking", { grant: { booking: "000000000000000000000002" } }],
  ["other purpose", { grant: { purpose: ACCESS_PURPOSE.TICKET } }],
  ["old version", { grant: { accessVersion: 1 } }],
  ["missing expiry", { grant: { expiresAt: undefined } }],
  ["invalid expiry", { grant: { expiresAt: "invalid" } }],
  ["expired hold", { booking: { ...booking, holdExpiresAt: now } }],
  ["confirmed checkout", { booking: { ...booking, status: "CONFIRMED" } }],
  ["cancelled", { booking: { ...booking, status: "CANCELLED" } }],
  ["invalid version", { booking: { ...booking, accessVersion: -1 } }],
]) {
  test(`access denied for ${name}`, () => {
    const issued = checkout();
    assert.equal(valid(issued, {
      ...overrides,
      grant: { ...issued.grant, ...overrides.grant },
    }), false);
  });
}

test("ticket access is separate, requires confirmation and explicit future expiry", () => {
  const confirmed = { ...booking, status: "CONFIRMED" };
  const args = { booking: confirmed, purpose: ACCESS_PURPOSE.TICKET, now };
  assert.throws(() => createBookingAccessGrant(args), TypeError);
  for (const expiresAt of [now, later(-1), null, "invalid"]) {
    assert.throws(() => createBookingAccessGrant({ ...args, expiresAt }), TypeError);
  }
  const issued = createBookingAccessGrant({ ...args, expiresAt: later(24 * 60 * 60 * 1000) });
  assert.equal(isBookingAccessGrantValid({ ...args, ...issued }), true);
  assert.equal(valid(issued), false);
  assert.throws(() => checkout({ purpose: ACCESS_PURPOSE.TICKET, expiresAt: later(1000) }), TypeError);
});

test("issuance rejects invalid purposes, expired holds and invalid versions", () => {
  for (const overrides of [
    { purpose: "READ" }, { expiresAt: now }, { expiresAt: null },
    { booking: { ...booking, holdExpiresAt: now } },
    { booking: { ...booking, accessVersion: 0.5 } },
    { booking: { ...booking, status: "FAILED" } },
  ]) assert.throws(() => checkout(overrides), TypeError);
});

test("legacy bookings require a newly issued grant; incrementing the version revokes it", () => {
  const legacy = { ...booking };
  delete legacy.accessVersion;
  assert.equal(isBookingAccessGrantValid({ booking: legacy, purpose: "CHECKOUT", now }), false);
  const issued = checkout({ booking: legacy });
  assert.equal(issued.grant.accessVersion, 0);
  assert.equal(valid(issued, { booking: legacy }), true);
  assert.equal(valid(issued, { booking: { ...legacy, accessVersion: 1 } }), false);
});

test("schemas validate hash, purpose, expiry and version without connecting to MongoDB", () => {
  const issued = checkout();
  const doc = new BookingAccessGrant(issued.grant);
  assert.equal(doc.validateSync(), undefined);
  assert.equal(BookingAccessGrant.schema.path("tokenHash").options.select, false);
  assert.equal(Booking.schema.path("accessVersion").options.select, false);
  assert.equal(BookingAccessGrant.schema.path("token"), undefined);
  assert.equal(BookingAccessGrant.schema.path("tokenHash").options.unique, true);
  for (const override of [
    { tokenHash: "invalid" }, { purpose: "READ" }, { expiresAt: undefined },
    { accessVersion: -1 }, { accessVersion: 0.5 },
  ]) assert.ok(new BookingAccessGrant({ ...issued.grant, ...override }).validateSync());
});