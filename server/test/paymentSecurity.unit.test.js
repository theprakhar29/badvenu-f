import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import Booking from "../src/models/Booking.js";
import { verifyPaymentSignature, verifyWebhookSignature, isMockPaymentAllowed } from "../src/utils/payment.js";
import { createBookingAccessGrant, isCheckoutHandoffGrantValid } from "../src/utils/bookingAccess.js";

// Only ephemeral test material; no environment credentials or files are loaded.
test("actual payment signature utility validates HMAC and rejects malformed/tampered inputs", () => {
  const secret = randomBytes(32), orderId = "order_fixture", paymentId = "pay_fixture";
  const signature = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature }, { secret }), true);
  for (const supplied of [undefined, [], "", "invalid", signature.slice(1), "z".repeat(64)]) {
    assert.equal(verifyPaymentSignature({ orderId, paymentId, signature: supplied }, { secret }), false);
  }
  assert.equal(verifyPaymentSignature({ orderId: "order_other", paymentId, signature }, { secret }), false);
  assert.equal(verifyPaymentSignature({ orderId, paymentId: "pay_other", signature }, { secret }), false);
});

test("actual webhook utility verifies exact raw bytes and rejects missing/malformed signatures", () => {
  const secret = randomBytes(32), raw = Buffer.from('{"event":"payment.captured"}');
  const signature = createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifyWebhookSignature(raw, signature, { secret }), true);
  assert.equal(verifyWebhookSignature(Buffer.concat([raw, Buffer.from(" ")]), signature, { secret }), false);
  assert.equal(verifyWebhookSignature(raw, "invalid", { secret }), false);
  assert.equal(verifyWebhookSignature(raw, undefined, { secret }), false);
  assert.equal(verifyWebhookSignature(raw.toString(), signature, { secret }), false);
});

test("mock payment gate remains explicit and production always rejects", () => {
  for (const enabled of ["true", "false", undefined]) {
    assert.equal(isMockPaymentAllowed({ environment: "production", enabled }), false);
  }
  assert.equal(isMockPaymentAllowed({ environment: "development", enabled: "true" }), true);
  assert.equal(isMockPaymentAllowed({ environment: "development", enabled: "false" }), false);
});

test("handoff validates original checkout expiry and rejects ticket grants", () => {
  const now = new Date("2026-10-27T00:00:00Z");
  const booking = { _id: "000000000000000000000001", status: "PENDING", accessVersion: 0, holdExpiresAt: new Date(+now + 60000) };
  const issued = createBookingAccessGrant({ booking, purpose: "CHECKOUT", now });
  const confirmed = { ...booking, status: "CONFIRMED" };
  assert.equal(isCheckoutHandoffGrantValid({ booking: confirmed, ...issued, now }), true);
  assert.equal(isCheckoutHandoffGrantValid({ booking: confirmed, ...issued, now: issued.grant.expiresAt }), false);
  const ticket = createBookingAccessGrant({ booking: confirmed, purpose: "TICKET", now, expiresAt: new Date(+now + 60000) });
  assert.equal(isCheckoutHandoffGrantValid({ booking: confirmed, ...ticket, now }), false);
});

test("ordinary booking serialization hides payment/security internals without mutating verification state", () => {
  const booking = new Booking({ event: "000000000000000000000001", guestName: "Fixture", totalAmount: 1,
    payment: { signature: "synthetic-signature", orderClaim: "synthetic-claim" }, paymentRevision: 4, ticketDelivery: { state: "CLAIMED" } });
  for (const result of [booking.toJSON(), booking.toObject(), JSON.parse(JSON.stringify(booking))]) {
    assert.equal(Object.hasOwn(result, "paymentRevision"), false);
    assert.equal(Object.hasOwn(result, "ticketDelivery"), false);
    assert.equal(Object.hasOwn(result.payment, "signature"), false);
    assert.equal(Object.hasOwn(result.payment, "orderClaim"), false);
  }
  assert.equal(booking.payment.signature === "synthetic-signature", true);
  assert.equal(booking.paymentRevision, 4);
});