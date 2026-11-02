import test from "node:test";
import assert from "node:assert/strict";
import { paymentHarness } from "./helpers/paymentHarness.js";
import { createBookingAccessGrant } from "../src/utils/bookingAccess.js";
import Customer from "../src/models/Customer.js";

const path = (book, operation) => `/api/public/bookings/${book.id}/${operation}`;
async function prepare(t) {
  const h = await paymentHarness(t), book = h.seed();
  assert.equal((await h.request(path(book, "payment-order"), { token: book.token })).status, 200);
  return { h, book, capture: h.capture(book.id) };
}
function unchanged(h, book) {
  assert.equal(h.state.books.get(book.id).status, "PENDING");
  assert.equal(h.state.tickets.size, 0);
  assert.equal(h.state.events.get(h.id(20)).pricingTiers[0].soldQty, 0);
  assert.equal(h.state.notices, 0);
}
function completedOnce(h, book) {
  assert.equal(h.state.books.get(book.id).status, "CONFIRMED");
  assert.equal(h.state.tickets.size, 2);
  const tier = h.state.events.get(h.id(20)).pricingTiers[0];
  assert.equal(tier.reservedQty, 0); assert.equal(tier.soldQty, 2);
  assert.equal([...h.state.books.values()].filter((book) => book.status === "CONFIRMED").reduce((total, book) => total + book.totalAmount, 0), 200);
  assert.equal(h.state.notices, 1);
}
function safeResponse(response) {
  const json = JSON.stringify(response);
  for (const key of ["payment", "signature", "tokenHash", "qrToken", "accessVersion", "paymentRevision", "ticketDelivery", "orderClaim", "authorizationUse"]) {
    assert.equal(json.includes(`"${key}"`), false, `${key} must not be returned`);
  }
}

test("HTTP payment mutations and exchange reject missing and cross-booking tokens", async (t) => {
  const h = await paymentHarness(t), first = h.seed(), second = h.seed(2);
  for (const operation of ["payment-order", "confirm", "ticket-access"]) {
    assert.equal((await h.request(path(first, operation))).status, 403);
    assert.equal((await h.request(path(first, operation), { token: second.token })).status, 403);
    assert.equal((await h.request(path(first, operation), { body: { accessToken: first.token, customerId: h.id(50), status: "paid" } })).status, 403);
    assert.equal((await h.request(`${path(first, operation)}?accessToken=${first.token}`)).status, 403);
  }
  assert.equal(h.state.creates, 0); unchanged(h, first);
});

for (const mode of ["expired", "revoked", "wrong-version", "malformed"]) {
  test(`HTTP ${mode} checkout grants cannot create orders or confirm`, async (t) => {
    const h = await paymentHarness(t), book = h.seed();
    if (mode === "expired") h.state.grants.get(book.grantId).expiresAt = new Date(0);
    if (mode === "revoked") h.state.grants.get(book.grantId).revokedAt = h.state.now;
    if (mode === "wrong-version") h.state.books.get(book.id).accessVersion += 1;
    const token = mode === "malformed" ? "invalid" : book.token;
    for (const operation of ["payment-order", "confirm", "ticket-access"]) {
      assert.equal((await h.request(path(book, operation), { token })).status, 403);
    }
    assert.equal(h.state.creates, 0); unchanged(h, book);
  });
}

test("HTTP invalid signature does not fail a booking or release its inventory", async (t) => {
  const { h, book, capture } = await prepare(t);
  const response = await h.request(path(book, "confirm"), { token: book.token, body: { ...capture.details, razorpay_signature: "invalid" } });
  assert.equal(response.status, 402); unchanged(h, book);
  assert.equal(h.state.events.get(h.id(20)).pricingTiers[0].reservedQty, 2);
  assert.equal((await h.webhook(capture.payment)).status, 200);
  completedOnce(h, book);
});

test("HTTP production mock creation and confirmation are rejected", async (t) => {
  const h = await paymentHarness(t), book = h.seed();
  h.state.mock = true; h.state.production = true;
  assert.equal((await h.request(path(book, "payment-order"), { token: book.token })).status, 503);
  h.state.books.get(book.id).payment = { provider: "mock", status: "created", orderState: "READY" };
  assert.equal((await h.request(path(book, "confirm"), { token: book.token, body: { status: "paid", amount: 0 } })).status, 503);
  unchanged(h, book);
});

test("HTTP explicitly enabled development mock flow still confirms once and hands off", async (t) => {
  const h = await paymentHarness(t), book = h.seed(); h.state.mock = true;
  assert.equal((await h.request(path(book, "payment-order"), { token: book.token })).body.mock, true);
  const confirmed = await h.request(path(book, "confirm"), { token: book.token });
  assert.equal(confirmed.status, 200); assert.equal(typeof confirmed.body.ticketAccessToken, "string");
  safeResponse(confirmed.body); completedOnce(h, book);
  assert.equal((await h.request(path(book, "confirm"), { token: book.token })).status, 200);
  completedOnce(h, book);
});

test("HTTP reuses validated orders and concurrent creation has one provider side effect", async (t) => {
  const h = await paymentHarness(t), book = h.seed();
  const responses = await Promise.all(Array.from({ length: 8 }, () => h.request(path(book, "payment-order"), { token: book.token })));
  assert.equal(responses.some((response) => response.status === 200), true);
  assert.equal(responses.every((response) => [200, 409].includes(response.status)), true);
  assert.equal(h.state.creates, 1);
  const again = await h.request(path(book, "payment-order"), { token: book.token });
  assert.equal(again.status, 200);
  assert.equal(again.body.orderId, h.state.books.get(book.id).payment.orderId);
  assert.equal(h.state.creates, 1);
});

test("HTTP ambiguous order creation fails closed and never creates a replacement automatically", async (t) => {
  const h = await paymentHarness(t), book = h.seed(); h.state.failCreate = true;
  assert.equal((await h.request(path(book, "payment-order"), { token: book.token })).status, 503);
  assert.equal(h.state.books.get(book.id).payment.orderState, "UNCERTAIN");
  h.state.failCreate = false;
  assert.equal((await h.request(path(book, "payment-order"), { token: book.token })).status, 409);
  assert.equal(h.state.creates, 1); unchanged(h, book);
});

for (const [mode, order, payment] of [
  ["wrong amount", null, { amount: 1 }], ["wrong currency", null, { currency: "USD" }],
  ["wrong payment order", null, { order_id: "order_other" }], ["wrong receipt", { receipt: "another-booking" }, null],
  ["wrong booking note", { notes: { bookingId: "another-booking" } }, null],
  ["authorized but uncaptured", null, { status: "authorized", captured: false }],
  ["refunded", null, { amount_refunded: 1 }], ["unpaid order", { status: "attempted", amount_paid: 0, amount_due: 20000 }, null],
]) {
  test(`HTTP rejects ${mode} from provider data despite a valid browser signature`, async (t) => {
    const { h, book, capture } = await prepare(t);
    h.state.orderOverride = order; h.state.paymentOverride = payment;
    const response = await h.request(path(book, "confirm"), { token: book.token, body: capture.details });
    assert.equal(response.status, 409); unchanged(h, book);
  });
}

test("HTTP browser-first completion and duplicate webhook issue tickets and send notification once", async (t) => {
  const { h, book, capture } = await prepare(t);
  const confirmed = await h.request(path(book, "confirm"), { token: book.token, body: capture.details });
  assert.equal(confirmed.status, 200); safeResponse(confirmed.body);
  assert.equal((await h.webhook(capture.payment)).status, 200);
  assert.equal((await h.webhook(capture.payment)).status, 200);
  const retry = await h.request(path(book, "confirm"), { token: book.token, body: capture.details });
  assert.equal(retry.status, 200); safeResponse(retry.body);
  assert.equal(confirmed.body.ticketAccessToken !== retry.body.ticketAccessToken, true);
  completedOnce(h, book);
});

test("HTTP webhook-first confirmation exchanges checkout authority and supports reload/lost-response retries", async (t) => {
  const { h, book, capture } = await prepare(t);
  const webhook = await h.webhook(capture.payment);
  assert.equal(webhook.status, 200); assert.equal(Object.hasOwn(webhook.body, "ticketAccessToken"), false);
  assert.equal((await h.request(`/api/public/bookings/${book.id}`, { method: "GET", token: book.token })).status, 403);
  const first = await h.request(path(book, "ticket-access"), { token: book.token });
  const second = await h.request(path(book, "ticket-access"), { token: book.token });
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  assert.equal(first.body.ticketAccessToken !== second.body.ticketAccessToken, true);
  safeResponse(first.body); safeResponse(second.body);
  for (const token of [first.body.ticketAccessToken, second.body.ticketAccessToken]) {
    const read = await h.request(`/api/public/bookings/${book.id}`, { method: "GET", token });
    assert.equal(read.status, 200); assert.equal(read.body.tickets.length, 2); safeResponse(read.body);
    for (const operation of ["payment-order", "confirm", "ticket-access"]) {
      assert.equal((await h.request(path(book, operation), { token })).status, 403);
    }
  }
  completedOnce(h, book);
});

for (const mode of ["expired", "revoked", "wrong-version"]) {
  test(`HTTP confirmed exchange cannot revive ${mode} checkout authority`, async (t) => {
    const { h, book, capture } = await prepare(t); await h.webhook(capture.payment);
    if (mode === "expired") h.state.now = new Date(+h.state.now + 600001);
    if (mode === "revoked") h.state.grants.get(book.grantId).revokedAt = h.state.now;
    if (mode === "wrong-version") h.state.books.get(book.id).accessVersion += 1;
    const count = h.state.grants.size;
    assert.equal((await h.request(path(book, "ticket-access"), { token: book.token })).status, 403);
    assert.equal((await h.request(path(book, "confirm"), { token: book.token })).status, 403);
    assert.equal(h.state.grants.size, count); completedOnce(h, book);
  });
}

test("HTTP exchange rejects pending and legacy bare-ID bookings without exposing tickets", async (t) => {
  const h = await paymentHarness(t), book = h.seed();
  assert.equal((await h.request(path(book, "ticket-access"), { token: book.token })).status, 409);
  h.state.books.get(book.id).status = "CONFIRMED";
  delete h.state.books.get(book.id).accessVersion; h.state.grants.clear();
  assert.equal((await h.request(path(book, "ticket-access"))).status, 403);
  assert.equal((await h.request(path(book, "confirm"), { body: { razorpay_payment_id: "pay_fixture" } })).status, 403);
});

test("HTTP concurrent browser callbacks and webhooks produce one inventory/revenue/ticket transition", async (t) => {
  const { h, book, capture } = await prepare(t);
  const responses = await Promise.all([
    ...Array.from({ length: 6 }, () => h.request(path(book, "confirm"), { token: book.token, body: capture.details })),
    ...Array.from({ length: 6 }, () => h.webhook(capture.payment)),
  ]);
  assert.equal(responses.every((response) => response.status === 200), true);
  completedOnce(h, book);
});

test("HTTP retrying an aborted finalization transaction cannot duplicate tickets or sends", async (t) => {
  const { h, book, capture } = await prepare(t); h.state.retryFinalize = true;
  assert.equal((await h.request(path(book, "confirm"), { token: book.token, body: capture.details })).status, 200);
  assert.equal(h.state.retried, true); completedOnce(h, book);
});

test("HTTP partial fulfillment failure rolls back and a legitimate retry succeeds", async (t) => {
  const { h, book, capture } = await prepare(t); h.state.failFinalize = true;
  assert.equal((await h.request(path(book, "confirm"), { token: book.token, body: capture.details })).status, 503);
  unchanged(h, book); assert.equal(h.state.events.get(h.id(20)).pricingTiers[0].reservedQty, 2);
  h.state.failFinalize = false;
  assert.equal((await h.request(path(book, "confirm"), { token: book.token, body: capture.details })).status, 200);
  completedOnce(h, book);
});

for (const mode of ["grant-revocation", "bulk-revocation"]) {
  test(`HTTP rechecks ${mode} after provider lookup before confirming`, async (t) => {
    const { h, book, capture } = await prepare(t);
    h.state.beforeFetch = async () => {
      if (mode === "grant-revocation") h.state.grants.get(book.grantId).revokedAt = h.state.now;
      else h.state.books.get(book.id).accessVersion += 1;
    };
    assert.equal((await h.request(path(book, "confirm"), { token: book.token, body: capture.details })).status, 403);
    unchanged(h, book);
  });
}

test("HTTP cookie-authorized payments require trusted Origin while valid guest grants remain independent", async (t) => {
  const h = await paymentHarness(t), headers = h.cookie(), book = h.seed(1, h.id(50));
  for (const Origin of [undefined, "null", "https://evil.example.test", "https://frontend.example.test/extra"]) {
    assert.equal((await h.request(path(book, "payment-order"), { headers: { ...headers, ...(Origin ? { Origin } : {}) } })).status, 403);
  }
  assert.equal(h.state.creates, 0);
  assert.equal((await h.request(path(book, "payment-order"), { token: book.token, headers: { ...headers, Origin: "https://evil.example.test" } })).status, 200);
  const captured = h.capture(book.id);
  assert.equal((await h.request(path(book, "confirm"), { headers: { ...headers, Origin: "https://frontend.example.test" }, body: captured.details })).status, 200);
  completedOnce(h, book);
});

test("HTTP forged customer ID/email cannot authorize cookie mutations", async (t) => {
  const h = await paymentHarness(t), headers = h.cookie(), book = h.seed();
  assert.equal((await h.request(path(book, "payment-order"), { headers: { ...headers, Origin: "https://frontend.example.test" },
    body: { customerId: h.id(50), email: "guest@example.test" } })).status, 403);
  assert.equal(h.state.creates, 0);
});

test("HTTP webhook authentication is independent of booking tokens and precedes all provider processing", async (t) => {
  const { h, book, capture } = await prepare(t);
  h.state.beforeFetch = async () => { throw new Error("Should not run before webhook authentication"); };
  assert.equal((await h.webhook(capture.payment, { valid: false })).status, 400);
  assert.equal(typeof h.state.beforeFetch, "function"); unchanged(h, book);
  h.state.beforeFetch = null;
  assert.equal((await h.webhook(capture.payment)).status, 200); completedOnce(h, book);
});

test("HTTP failed payment attempts do not cancel a pending order or prevent later verified capture", async (t) => {
  const h = await paymentHarness(t), book = h.seed();
  await h.request(path(book, "payment-order"), { token: book.token });
  assert.equal((await h.webhook({ order_id: h.state.books.get(book.id).payment.orderId }, { type: "payment.failed" })).status, 200);
  unchanged(h, book);
  const captured = h.capture(book.id);
  assert.equal((await h.webhook(captured.payment)).status, 200); completedOnce(h, book);
});

test("HTTP late captured payments are flagged for reconciliation without issuing tickets", async (t) => {
  const { h, book, capture } = await prepare(t); h.state.now = new Date(+h.state.now + 600001);
  const response = await h.webhook(capture.payment);
  assert.equal(response.status, 200); assert.equal(response.body.reconciliationRequired, true);
  assert.equal(h.state.books.get(book.id).payment.reconciliationRequired, true);
  assert.equal(h.state.tickets.size, 0); assert.equal(h.state.notices, 0);
  assert.equal(h.state.events.get(h.id(20)).pricingTiers[0].soldQty, 0);
});

test("HTTP uncertain email delivery is never automatically sent twice by payment retries", async (t) => {
  const { h, book, capture } = await prepare(t); h.state.failNotice = true;
  assert.equal((await h.request(path(book, "confirm"), { token: book.token, body: capture.details })).status, 200);
  assert.equal(h.state.books.get(book.id).ticketDelivery.state, "FAILED");
  assert.equal((await h.webhook(capture.payment)).status, 200);
  assert.equal((await h.request(path(book, "ticket-access"), { token: book.token })).status, 200);
  completedOnce(h, book);
});

test("HTTP handoff retries are bounded without revoking successfully issued grants", async (t) => {
  const { h, book, capture } = await prepare(t); await h.webhook(capture.payment);
  h.state.grants.get(book.grantId).handoffCount = 20;
  assert.equal((await h.request(path(book, "ticket-access"), { token: book.token })).status, 429);
  completedOnce(h, book);
});

test("customer payment authorization metadata is not serializable", () => {
  const customer = new Customer({ name: "Fixture", email: "fixture@example.test", paymentAuthorizationUse: 9 });
  for (const value of [customer.toJSON(), customer.toObject(), JSON.parse(JSON.stringify(customer))]) {
    assert.equal(Object.hasOwn(value, "paymentAuthorizationUse"), false);
  }
});
test("HTTP revocation during provider creation preserves association without disclosing the order", async (t) => {
  const h = await paymentHarness(t), book = h.seed();
  h.state.afterCreate = async () => { h.state.grants.get(book.grantId).revokedAt = h.state.now; };
  const response = await h.request(path(book, "payment-order"), { token: book.token });
  assert.equal(response.status, 403);
  assert.equal(Object.hasOwn(response.body, "orderId"), false);
  assert.equal(h.state.creates, 1);
  assert.equal(h.state.orders.has(h.state.books.get(book.id).payment.orderId), true);
  unchanged(h, book);
});

test("HTTP customer verification is rechecked after provider verification", async (t) => {
  const h = await paymentHarness(t), headers = { ...h.cookie(), Origin: "https://frontend.example.test" }, book = h.seed(1, h.id(50));
  await h.request(path(book, "payment-order"), { headers });
  const captured = h.capture(book.id);
  h.state.beforeFetch = async () => { h.state.customers.get(h.id(50)).emailVerified = false; };
  assert.equal((await h.request(path(book, "confirm"), { headers, body: captured.details })).status, 403);
  unchanged(h, book);
});

test("HTTP late capture releases a pending expired hold once without revenue or ticket issuance", async (t) => {
  const { h, book, capture } = await prepare(t); h.state.now = new Date(+h.state.now + 600001);
  await h.webhook(capture.payment); await h.webhook(capture.payment);
  assert.equal(h.state.books.get(book.id).status, "EXPIRED");
  const tier = h.state.events.get(h.id(20)).pricingTiers[0];
  assert.equal(tier.reservedQty, 0); assert.equal(tier.soldQty, 0);
  assert.equal(h.state.tickets.size, 0); assert.equal(h.state.notices, 0);
});