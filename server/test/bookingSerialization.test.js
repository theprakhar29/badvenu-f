import test from "node:test";
import assert from "node:assert/strict";
import Booking from "../src/models/Booking.js";
import BookingAccessGrant from "../src/models/BookingAccessGrant.js";
import {
  createBookingAccessGrant, isBookingAccessGrantValid,
} from "../src/utils/bookingAccess.js";
import {
  bookingResponse, checkoutBookingResponse, confirmedBookingResponse, ticketResponse,
} from "../src/utils/bookingResponse.js";

const now = new Date("2026-10-27T00:00:00Z");
const bookingData = {
  _id: "000000000000000000000001", event: "000000000000000000000002",
  status: "PENDING", guestName: "Serialization fixture", totalAmount: 1,
  holdExpiresAt: new Date(+now + 60000), accessVersion: 3, items: [],
};
const serializers = {
  "JSON.stringify": (doc) => JSON.parse(JSON.stringify(doc)),
  toJSON: (doc) => doc.toJSON(),
  toObject: (doc) => doc.toObject(),
};

for (const hydrated of [false, true]) {
  const kind = hydrated ? "hydrated" : "new";
  for (const [name, serialize] of Object.entries(serializers)) {
    test(`${kind} grant ${name} exposes metadata only, leaving internal verification intact`, () => {
      const issued = createBookingAccessGrant({ booking: bookingData, purpose: "CHECKOUT", now });
      const data = { ...issued.grant, __v: 2 };
      const doc = hydrated ? BookingAccessGrant.hydrate(data) : new BookingAccessGrant(data);
      const result = serialize(doc);
      for (const field of ["tokenHash", "accessVersion", "revokedAt", "booking", "__v"]) {
        assert.equal(Object.hasOwn(result, field), false, `${field} must be redacted`);
      }
      assert.equal(result.purpose, "CHECKOUT");
      assert.ok(result.expiresAt);
      assert.equal(JSON.stringify(result).includes(issued.grant.tokenHash), false);
      assert.equal(isBookingAccessGrantValid({
        booking: bookingData, grant: doc, token: issued.token, purpose: "CHECKOUT", now,
      }), true);
    });

    test(`${kind} booking ${name} hides version without changing stored authorization state`, () => {
      const doc = hydrated ? Booking.hydrate(bookingData) : new Booking(bookingData);
      const result = serialize(doc);
      assert.equal(Object.hasOwn(result, "accessVersion"), false);
      assert.equal(doc.accessVersion, 3);
      assert.equal(result.guestName, bookingData.guestName);
      assert.equal(result.status, "PENDING");
    });
  }
}

test("explicit hash/version selection remains available to authorization queries", () => {
  assert.equal(BookingAccessGrant.schema.path("tokenHash").options.select, false);
  assert.equal(Booking.schema.path("accessVersion").options.select, false);
  const grantQuery = BookingAccessGrant.findOne({ booking: bookingData._id }).select("+tokenHash");
  const bookingQuery = Booking.findById(bookingData._id).select("+accessVersion");
  assert.equal(grantQuery.projection()["+tokenHash"], 1);
  assert.equal(bookingQuery.projection()["+accessVersion"], 1);
});

test("default version on a newly created booking is hidden in the existing raw response shape", () => {
  const data = { ...bookingData };
  delete data.accessVersion;
  const doc = new Booking(data);
  assert.equal(doc.accessVersion, 0);
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(doc)), "accessVersion"), false);
  assert.equal(Object.hasOwn({ ...doc.toObject(), tickets: [] }, "accessVersion"), false);
});

test("nested direct JSON responses redact grant and booking security metadata", () => {
  const issued = createBookingAccessGrant({ booking: bookingData, purpose: "CHECKOUT", now });
  const result = JSON.parse(JSON.stringify({
    booking: Booking.hydrate(bookingData), grant: BookingAccessGrant.hydrate(issued.grant),
  }));
  assert.equal(Object.hasOwn(result.booking, "accessVersion"), false);
  assert.equal(Object.hasOwn(result.grant, "tokenHash"), false);
  assert.equal(Object.hasOwn(result.grant, "accessVersion"), false);
});

test("all explicit response allowlists exclude injected security fields", () => {
  const internal = {
    tokenHash: "synthetic-hash", accessVersion: 7, qrToken: "synthetic-scan-value",
    payment: { signature: "synthetic-signature" }, signature: "synthetic-signature",
  };
  const booking = { ...bookingData, ...internal, status: "CONFIRMED" };
  const ticket = { ...internal, booking: booking._id, status: "UNUSED", tierName: "General" };
  for (const response of [
    bookingResponse(booking), checkoutBookingResponse(booking),
    confirmedBookingResponse(booking, [ticket]), ticketResponse(ticket),
  ]) {
    const serialized = JSON.stringify(response);
    for (const field of ["tokenHash", "accessVersion", "qrToken", "payment", "signature"]) {
      assert.equal(serialized.includes(`"${field}"`), false, `${field} must be excluded`);
    }
  }
});