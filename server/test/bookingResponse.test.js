import test from "node:test";
import assert from "node:assert/strict";
import Booking from "../src/models/Booking.js";
import {
  bookingResponse, checkoutBookingResponse, confirmedBookingResponse, ticketResponse,
} from "../src/utils/bookingResponse.js";

const id = "000000000000000000000001";
const booking = {
  _id: id, status: "CONFIRMED", guestName: "Guest", guestEmail: "guest@example.test",
  guestPhone: "1234567890", customer: "internal-customer", accessVersion: 3,
  payment: { signature: "internal-signature", orderId: "internal-order" },
  deliveryLog: [{ error: "internal-delivery-error" }], formResponses: [{ value: "private-answer" }],
  event: { _id: "000000000000000000000002", title: "Show", organizer: "private-organizer", private: true },
  items: [{ pricingTierId: "000000000000000000000003", tierName: "General", quantity: 1, unitPrice: 100, private: true }],
  totalAmount: 100, holdExpiresAt: new Date(), tokenHash: "internal-hash", token: "internal-token",
};
const ticket = {
  _id: "000000000000000000000004", booking: id, tierName: "General", status: "UNUSED",
  qrDataUrl: "data:image/png;base64,test", qrToken: "internal-qr-token", usedByOrganizer: "private-organizer",
};

test("booking allowlists exclude all internal and nested extra fields", () => {
  const result = bookingResponse(booking);
  assert.deepEqual(Object.keys(result).sort(), [
    "_id", "event", "guestName", "guestEmail", "items", "totalAmount", "status", "createdAt", "confirmedAt",
  ].sort());
  assert.deepEqual(Object.keys(result.event).sort(), ["_id", "title", "slug", "startAt", "venueName", "city"].sort());
  assert.deepEqual(Object.keys(result.items[0]).sort(), ["pricingTierId", "tierName", "quantity", "unitPrice"].sort());
  const serialized = JSON.stringify(result);
  for (const value of ["internal-", "private-", "private-answer", "qrDataUrl", "accessVersion", "guestPhone"]) {
    assert.equal(serialized.includes(value), false);
  }
  assert.equal(checkoutBookingResponse(booking).guestPhone, booking.guestPhone);
  assert.equal(checkoutBookingResponse(booking).holdExpiresAt, booking.holdExpiresAt);
});

test("only confirmed bookings include their own tickets, never raw scanner identities", () => {
  const result = confirmedBookingResponse(booking, [ticket, { ...ticket, booking: "other-booking" }]);
  assert.equal(result.tickets.length, 1);
  assert.equal(result.tickets[0].qrDataUrl, ticket.qrDataUrl);
  assert.equal("qrToken" in result.tickets[0], false);
  assert.equal("booking" in result.tickets[0], false);
  assert.equal("usedByOrganizer" in result.tickets[0], false);
  for (const status of ["PENDING", "FAILED", "EXPIRED", "CANCELLED"]) {
    assert.deepEqual(confirmedBookingResponse({ ...booking, status }, [ticket]).tickets, []);
  }
  assert.equal("qrDataUrl" in ticketResponse({ ...ticket, status: "VOID" }), false);
});

test("unpopulated, deleted and malformed event references do not leak objects", () => {
  assert.equal(bookingResponse({ ...booking, event: id }).event, id);
  assert.equal(bookingResponse({ ...booking, event: null }).event, null);
  assert.equal(bookingResponse({ ...booking, event: { private: "internal" } }).event, null);
});

test("response helpers also accept Mongoose documents", () => {
  const doc = new Booking({ ...booking, event: id, customer: undefined });
  const result = checkoutBookingResponse(doc);
  assert.equal(String(result.event), id);
  assert.equal(result.items[0].tierName, "General");
  assert.equal("payment" in result, false);
});