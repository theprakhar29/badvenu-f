import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { paymentHarness } from "./helpers/paymentHarness.js";
import { createBookingAccessGrant } from "../src/utils/bookingAccess.js";

const path = (id, suffix = "email-ticket-access") => `/api/public/bookings/${id}/${suffix}`;
function confirm(h, book) { const row = h.state.books.get(book.id); row.status = "CONFIRMED"; row.holdExpiresAt = undefined; row.accessVersion = 0; return row; }
function emailGrant(h, book, extra = {}) {
  const booking = confirm(h, book), issued = createBookingAccessGrant({ booking, purpose: "TICKET", source: "EMAIL", now: h.state.now, expiresAt: new Date(+h.state.now + 60000), ...extra });
  h.state.grants.set(String(new mongoose.Types.ObjectId()), { ...issued.grant, _id: new mongoose.Types.ObjectId() }); return issued;
}

test("mocked mounted email exchange is one-time, safe, and header protected", async (t) => {
  const h = await paymentHarness(t), book = h.seed(), issued = emailGrant(h, book);
  const [first, second] = await Promise.all([h.request(path(book.id), { token: issued.token }), h.request(path(book.id), { token: issued.token })]);
  assert.equal([first.status, second.status].filter((status) => status === 200).length, 1);
  const success = first.status === 200 ? first : second;
  assert.equal(success.body.status, "CONFIRMED");
  assert.equal(JSON.stringify(success.body).includes(issued.token), false);
  for (const key of ["tokenHash", "accessVersion", "payment", "consumedAt", "source"]) assert.equal(JSON.stringify(success.body).includes(key), false);
});

test("mocked mounted email exchange denies cross-booking, generic reads, and payment mutation", async (t) => {
  const h = await paymentHarness(t), first = h.seed(1), second = h.seed(2), issued = emailGrant(h, first);
  assert.equal((await h.request(path(second.id), { token: issued.token })).status, 403);
  assert.equal((await h.request(`/api/public/bookings/${first.id}`, { method: "GET", token: issued.token })).status, 403);
  assert.equal((await h.request(path(first.id, "payment-order"), { token: issued.token })).status, 403);
});

test("mocked mounted recovery endpoints are generic and consume an OTP once", async (t) => {
  const h = await paymentHarness(t), book = h.seed(); confirm(h, book);
  const unknown = await h.request("/api/public/booking-recovery/request", { body: { bookingId: h.id(9), email: "guest@example.test" } });
  const requested = await h.request("/api/public/booking-recovery/request", { body: { bookingId: book.id, email: "guest@example.test" } });
  assert.deepEqual(unknown.body, requested.body); assert.equal(requested.status, 202);
  const result = await h.request("/api/public/booking-recovery/verify", { body: { bookingId: book.id, email: "guest@example.test", code: h.state.lastOtp } });
  assert.equal(result.status, 200); assert.equal(result.body.bookingId, book.id);
  assert.equal((await h.request("/api/public/booking-recovery/verify", { body: { bookingId: book.id, email: "guest@example.test", code: h.state.lastOtp } })).status, 400);
});
