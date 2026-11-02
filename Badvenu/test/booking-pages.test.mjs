import test from "node:test";
import assert from "node:assert/strict";
import { browser, api, reply, firstId, secondId, checkoutToken, future, booking, ticketResult } from "./helpers/booking-fixtures.mjs";
import { pageHarness } from "./helpers/page-harness.mjs";
import { saveBookingAccess, readBookingAccess, setPaymentAttempt, hasPaymentAttempt } from "../src/lib/booking-access.js";
const paymentPage = "src/app/booking/[id]/payment/page.jsx";
const confirmationPage = "src/app/booking-confirmation/[id]/page.jsx";
function denied() { return reply({ error: { code: "BOOKING_ACCESS_DENIED" } }, 403); }
function unsigned() { return reply({ error: { code: "UNAUTHENTICATED" } }, 401); }
function prepare(t) { const target = browser(t), token = checkoutToken(); saveBookingAccess(firstId, "checkout", token, future()); return { target, token }; }
function button(page, label) { return page.find((node) => node.type === "button" && page.text(node).includes(label)); }

test("booking page stores access before navigating and guards duplicate form submissions", async (t) => {
  browser(t); const token = checkoutToken();
  const calls = api(t, () => reply({ ...booking(), checkoutAccessToken: token, checkoutAccessExpiresAt: future() }, 201));
  const page = await pageHarness(t, "src/app/events/[slug]/book/page.jsx", { params: { slug: "fixture-show" } });
  button(page, "+").props.onClick();
  page.find((node) => node.type === "input" && node.props.name === "name").props.onChange({ target: { name: "name", value: "Fixture guest" } });
  page.find((node) => node.type === "input" && node.props.name === "email").props.onChange({ target: { name: "email", value: "guest@example.test" } });
  await page.flush();
  const submit = page.find((node) => node.type === "form").props.onSubmit;
  await Promise.all([submit({ preventDefault() {} }), submit({ preventDefault() {} })]);
  await page.flush();
  assert.equal(calls.length, 1); assert.equal(page.navigation.length, 1);
  assert.equal(page.navigation[0].checkoutStored, true);
  assert.equal(page.navigation[0].target, `/booking/${firstId}/payment`);
  assert.equal(page.logs.length, 0);
});

test("mock payment stores ticket access before confirmation navigation without loading Razorpay", async (t) => {
  prepare(t); const result = ticketResult();
  const calls = api(t, (call) => reply(call.path.endsWith("/confirm") ? result : call.path.endsWith("/payment-order") ? { mock: true } : booking()));
  const page = await pageHarness(t, paymentPage);
  const pay = button(page, "Pay ₹");
  await Promise.all([pay.props.onClick(), pay.props.onClick()]); await page.flush();
  assert.equal(calls.filter((call) => call.path.endsWith("/payment-order")).length, 1);
  assert.equal(calls.filter((call) => call.path.endsWith("/confirm")).length, 1);
  assert.equal(page.navigation.at(-1).ticketStored, true);
  assert.equal(readBookingAccess(firstId, "ticket") === result.ticketAccessToken, true);
  assert.equal(hasPaymentAttempt(firstId), false); assert.equal(page.logs.length, 0);
});

test("Razorpay receives server order details and callback confirmation uses checkout authority only", async (t) => {
  const { target, token } = prepare(t), result = ticketResult();
  const instances = [];
  target.Razorpay = class { constructor(options) { this.options = options; instances.push(this); } on() {} open() { this.opened = true; } };
  const calls = api(t, (call) => reply(call.path.endsWith("/confirm") ? result : call.path.endsWith("/payment-order")
    ? { mock: false, keyId: "rzp_test_fixture", orderId: "order_fixture", amount: 10000, currency: "INR" } : booking()));
  const page = await pageHarness(t, paymentPage);
  await button(page, "Pay ₹").props.onClick(); await page.flush();
  assert.equal(instances.length, 1); assert.equal(instances[0].options.order_id, "order_fixture");
  assert.equal(instances[0].options.amount, 10000); assert.equal(instances[0].opened, true);
  await instances[0].options.handler({ razorpay_order_id: "order_fixture", razorpay_payment_id: "pay_fixture", razorpay_signature: "synthetic" });
  await page.flush();
  const confirm = calls.find((call) => call.path.endsWith("/confirm"));
  assert.equal(confirm.headers.get("x-booking-access-token") === token, true);
  assert.equal(confirm.body.razorpay_signature, "synthetic");
  assert.equal(page.navigation.at(-1).ticketStored, true); assert.equal(page.logs.length, 0);
  assert.equal([...target.sessionStorage.data.values()].some((value) => value.includes("synthetic")), false);
});

test("same-tab reload with an uncertain payment shows check status and never opens checkout", async (t) => {
  prepare(t); setPaymentAttempt(firstId);
  const calls = api(t, () => reply(booking()));
  const page = await pageHarness(t, paymentPage);
  assert.equal(button(page, "Pay ₹"), undefined);
  assert.equal(!!button(page, "Check payment status"), true);
  await button(page, "Check payment status").props.onClick(); await page.flush();
  assert.equal(calls.some((call) => call.path.endsWith("/payment-order") || call.path.endsWith("/confirm")), false);
  assert.equal(hasPaymentAttempt(firstId), true);
});

test("webhook-first payment-page reload exchanges access and redirects with ticket token retained", async (t) => {
  prepare(t); const result = ticketResult();
  const calls = api(t, (call) => call.path.endsWith("/ticket-access") ? reply(result) : denied());
  const page = await pageHarness(t, paymentPage);
  assert.equal(page.navigation.at(-1).ticketStored, true);
  assert.equal(page.navigation.at(-1).target, `/booking-confirmation/${firstId}`);
  assert.equal(calls.some((call) => call.path.endsWith("/payment-order")), false);
});

test("missing guest access renders recovery guidance and offers no pay/download action", async (t) => {
  browser(t); const calls = api(t, unsigned);
  const pay = await pageHarness(t, paymentPage);
  assert.equal(pay.text().includes("Booking access required"), true); assert.equal(button(pay, "Pay ₹"), undefined);
  pay.dispose();
  const confirmation = await pageHarness(t, confirmationPage);
  assert.equal(confirmation.text().includes("Booking access required"), true);
  assert.equal(button(confirmation, "Download"), undefined);
  assert.equal(calls.every((call) => call.path === "/api/customer-auth/me"), true);
});

test("confirmation page never labels pending bookings confirmed or exposes a QR", async (t) => {
  prepare(t); api(t, () => reply({ error: { code: "NOT_CONFIRMED" } }, 409));
  const page = await pageHarness(t, confirmationPage);
  assert.equal(page.text().includes("Booking is not confirmed"), true);
  assert.equal(page.nodes().some((node) => node.type === "img"), false);
  assert.equal(button(page, "Download"), undefined);
});

test("confirmation render uses ticket authority and disables voided ticket downloads", async (t) => {
  browser(t); const token = checkoutToken(); saveBookingAccess(firstId, "ticket", token, future());
  const data = booking(firstId, "CONFIRMED"); data.tickets.push({ _id: secondId, status: "VOID", tierName: "Void" });
  const calls = api(t, () => reply(data));
  const page = await pageHarness(t, confirmationPage);
  assert.equal(page.text().includes("Booking Confirmed!"), true);
  assert.equal(calls[0].headers.get("x-booking-access-token") === token, true);
  assert.equal(page.nodes().filter((node) => node.type === "img").length, 1);
  const downloads = page.nodes().filter((node) => node.type === "button" && page.text(node).includes("Download"));
  assert.equal(downloads[0].props.disabled, false); assert.equal(downloads[1].props.disabled, true);
  assert.equal(page.find((node) => node.type === "meta").props.content, "no-referrer");
  assert.equal(page.logs.length, 0);
});

test("route changes cannot send the old booking token or display its tickets", async (t) => {
  browser(t); const token = checkoutToken(); saveBookingAccess(firstId, "ticket", token, future());
  const calls = api(t, (call) => call.path.includes(firstId) ? reply(booking(firstId, "CONFIRMED")) : unsigned());
  const page = await pageHarness(t, confirmationPage);
  page.setParams({ id: secondId }); await page.flush();
  assert.equal(page.nodes().some((node) => node.type === "img"), false);
  assert.equal(calls.filter((call) => !call.path.includes(firstId)).every((call) => !call.headers.has("x-booking-access-token")), true);
});
test("Razorpay script failures expose no payload and retry loading without confirmation", async (t) => {
  prepare(t);
  let scripts = 0, removed = 0;
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = { querySelector: () => null, createElement() {
    const listeners = new Map();
    return { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name) => listeners.delete(name),
      remove() { removed += 1; }, fire() { listeners.get("error")?.(); } };
  }, body: { appendChild(script) {
    scripts += 1; assert.equal(script.referrerPolicy, "no-referrer"); queueMicrotask(() => script.fire());
  } } };
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  t.after(() => original ? Object.defineProperty(globalThis, "document", original) : delete globalThis.document);
  const calls = api(t, (call) => reply(call.path.endsWith("/payment-order")
    ? { mock: false, keyId: "rzp_test_fixture", orderId: "order_fixture", amount: 10000, currency: "INR" } : booking()));
  const page = await pageHarness(t, paymentPage);
  await button(page, "Pay ₹").props.onClick(); await page.flush();
  assert.equal(hasPaymentAttempt(firstId), false);
  await button(page, "Pay ₹").props.onClick(); await page.flush();
  assert.equal(scripts, 2); assert.equal(removed, 2);
  assert.equal(calls.some((call) => call.path.endsWith("/confirm")), false);
  assert.equal(page.logs.length, 0);
});

test("known failed/dismissed checkout can retry the same order without logging provider errors", async (t) => {
  const { target } = prepare(t), instances = [], sensitive = checkoutToken();
  target.Razorpay = class {
    constructor(options) { this.options = options; instances.push(this); }
    on(_name, callback) { this.failed = callback; }
    open() {}
  };
  const calls = api(t, (call) => reply(call.path.endsWith("/payment-order")
    ? { mock: false, keyId: "rzp_test_fixture", orderId: "order_fixture", amount: 10000, currency: "INR" } : booking()));
  const page = await pageHarness(t, paymentPage);
  await button(page, "Pay ₹").props.onClick(); await page.flush();
  instances[0].failed({ error: { description: sensitive } }); await page.flush();
  assert.equal(page.text().includes(sensitive), false);
  instances[0].options.modal.ondismiss(); await page.flush();
  assert.equal(hasPaymentAttempt(firstId), false);
  await button(page, "Pay ₹").props.onClick(); await page.flush();
  assert.equal(instances.length, 2);
  assert.equal(instances[0].options.order_id, instances[1].options.order_id);
  assert.equal(calls.some((call) => call.path.endsWith("/confirm")), false);
  assert.equal(page.logs.length, 0);
});

test("paid-order race switches to status-only handoff without opening another checkout", async (t) => {
  prepare(t); let captured = false; const result = ticketResult();
  const calls = api(t, (call) => {
    if (call.path.endsWith("/payment-order")) { captured = true; return reply({ error: { code: "ORDER_NOT_PAYABLE" } }, 409); }
    if (call.path.endsWith("/ticket-access")) return reply(result);
    return captured ? denied() : reply(booking());
  });
  const page = await pageHarness(t, paymentPage);
  await button(page, "Pay ₹").props.onClick(); await page.flush();
  assert.equal(button(page, "Pay ₹"), undefined); assert.equal(hasPaymentAttempt(firstId), true);
  await button(page, "Check payment status").props.onClick(); await page.flush();
  assert.equal(page.navigation.at(-1).ticketStored, true);
  assert.equal(calls.filter((call) => call.path.endsWith("/payment-order")).length, 1);
});
