import test from "node:test";
import assert from "node:assert/strict";
import { browser, api, reply, firstId, secondId, checkoutToken, future, booking, ticketResult } from "./helpers/booking-fixtures.mjs";
import { saveBookingAccess, readBookingAccess, setPaymentAttempt, hasPaymentAttempt } from "../src/lib/booking-access.js";
import { apiFetch } from "../src/lib/api.js";
import { createBooking, getBooking, loadPaymentBooking, loadConfirmedBooking, createPaymentOrder,
  confirmBooking, exchangeTicketAccess, downloadTicket } from "../src/services/booking.service.js";
const denied = () => reply({ error: { code: "BOOKING_ACCESS_DENIED", message: "redacted" } }, 403);
const unsigned = () => reply({ error: { code: "UNAUTHENTICATED" } }, 401);
const notConfirmed = () => reply({ error: { code: "NOT_CONFIRMED" } }, 409);
function checkout(t, id = firstId) {
  browser(t); const token = checkoutToken(); saveBookingAccess(id, "checkout", token, future()); return token;
}
function imageBrowser(t) {
  const events = { texts: [], images: [], links: [], revoked: [], canvases: 0 };
  const context = { fillRect() {}, fillText(value) { events.texts.push(value); }, drawImage(image) { events.images.push(image.src); } };
  const document = { body: { appendChild(link) { events.links.push(link); } }, createElement(tag) {
    if (tag === "canvas") { events.canvases += 1; return { getContext: () => context, toBlob: (callback) => callback(new Blob(["png"], { type: "image/png" })) }; }
    return { click() { events.clicked = true; }, remove() { events.removed = true; } };
  } };
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document"), originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  Object.defineProperty(globalThis, "Image", { value: class {
    set src(value) { this.value = value; queueMicrotask(() => this.onload()); }
    get src() { return this.value; }
  }, configurable: true });
  t.mock.method(URL, "createObjectURL", () => "blob:fixture");
  t.mock.method(URL, "revokeObjectURL", (value) => events.revoked.push(value));
  t.after(() => {
    originalDocument ? Object.defineProperty(globalThis, "document", originalDocument) : delete globalThis.document;
    originalImage ? Object.defineProperty(globalThis, "Image", originalImage) : delete globalThis.Image;
  });
  return events;
}

test("creation retains checkout access before resolving, strips bearer fields, and uses an explicit request", async (t) => {
  browser(t); const token = checkoutToken();
  const calls = api(t, () => reply({ ...booking(), checkoutAccessToken: token, checkoutAccessExpiresAt: future() }, 201));
  const result = await createBooking("fixture-show", { guestName: "Guest", guestEmail: "guest@example.test",
    items: [{ pricingTierId: secondId, quantity: 1, accessToken: token }], accessToken: token, totalAmount: 0 });
  assert.equal(readBookingAccess(firstId, "checkout") === token, true);
  assert.equal(Object.hasOwn(result, "checkoutAccessToken"), false);
  assert.equal(JSON.stringify(calls[0].body).includes(token), false);
  assert.equal(Object.hasOwn(calls[0].body, "totalAmount"), false);
  assert.equal(calls[0].headers.has("x-booking-access-token"), false);
});

test("storage preflight failure prevents reservation creation", async (t) => {
  browser(t, { setItem() { throw new Error("blocked"); }, removeItem() {} });
  const calls = api(t, () => reply({}));
  await assert.rejects(createBooking("show", {}), (error) => error.code === "ACCESS_STORAGE_UNAVAILABLE");
  assert.equal(calls.length, 0);
});

test("malformed creation/handoff contracts fail closed instead of inventing legacy fields", async (t) => {
  browser(t);
  api(t, () => reply({ id: firstId, status: "PENDING" }, 201));
  await assert.rejects(createBooking("show", {}), (error) => error.code === "BOOKING_CONTRACT_ERROR");
  saveBookingAccess(firstId, "checkout", checkoutToken(), future());
  api(t, () => reply(booking(firstId, "CONFIRMED")));
  await assert.rejects(exchangeTicketAccess(firstId), (error) => error.code === "BOOKING_CONTRACT_ERROR");
  assert.equal(readBookingAccess(firstId, "ticket"), null);
});

test("pending reads and payment mutations use only the same booking's checkout token", async (t) => {
  const token = checkout(t); saveBookingAccess(firstId, "ticket", checkoutToken(), future());
  const result = ticketResult();
  const calls = api(t, (call) => reply(call.path.endsWith("/confirm") ? result : call.method === "GET" ? booking() : { mock: true }));
  await getBooking(firstId); await createPaymentOrder(firstId); await confirmBooking(firstId, { accessToken: result.ticketAccessToken });
  assert.equal(calls.length, 3);
  assert.equal(calls.every((call) => call.headers.get("x-booking-access-token") === token), true);
  assert.equal(JSON.stringify(calls[2].body).includes(result.ticketAccessToken), false);
  assert.equal(readBookingAccess(firstId, "ticket") === result.ticketAccessToken, true);
});

test("ticket-only access cannot be used for payment mutations", async (t) => {
  browser(t); saveBookingAccess(firstId, "ticket", checkoutToken(), future());
  const calls = api(t, unsigned);
  await assert.rejects(createPaymentOrder(firstId), (error) => error.code === "RECOVERY_REQUIRED");
  await assert.rejects(confirmBooking(firstId), (error) => error.code === "RECOVERY_REQUIRED");
  assert.equal(calls.every((call) => call.path === "/api/customer-auth/me" && !call.headers.has("x-booking-access-token")), true);
});

test("unrelated bookings and unrelated APIs never inherit stored tokens", async (t) => {
  checkout(t);
  const calls = api(t, (call) => call.path === "/api/customer-auth/me" ? unsigned() : reply([]));
  await assert.rejects(getBooking(secondId), (error) => error.code === "RECOVERY_REQUIRED");
  await apiFetch("/api/public/events");
  assert.equal(calls.every((call) => !call.headers.has("x-booking-access-token")), true);
  assert.equal(calls.some((call) => call.path.includes(`/bookings/${secondId}`)), false);
});

test("missing and locally expired access has no bare-ID guest fallback", async (t) => {
  checkout(t); const expiredNow = Date.now() + 700000; t.mock.method(Date, "now", () => expiredNow);
  const calls = api(t, unsigned);
  await assert.rejects(loadPaymentBooking(firstId), (error) => error.code === "RECOVERY_REQUIRED");
  await assert.rejects(loadConfirmedBooking(firstId), (error) => error.code === "RECOVERY_REQUIRED");
  assert.equal(calls.every((call) => call.path === "/api/customer-auth/me"), true);
});

test("webhook-first completion exchanges checkout authority and same-tab reload uses ticket authority", async (t) => {
  const checkoutValue = checkout(t), result = ticketResult();
  const calls = api(t, (call) => {
    if (call.path.endsWith("/ticket-access")) return reply(result);
    return call.headers.get("x-booking-access-token") === result.ticketAccessToken ? reply(booking(firstId, "CONFIRMED")) : denied();
  });
  const first = await loadPaymentBooking(firstId);
  assert.equal(first.status, "CONFIRMED");
  assert.equal(calls[0].headers.get("x-booking-access-token") === checkoutValue, true);
  assert.equal(calls[1].path.endsWith("/ticket-access"), true);
  assert.equal(readBookingAccess(firstId, "ticket") === result.ticketAccessToken, true);
  assert.equal(Object.hasOwn(first, "ticketAccessToken"), false);
  const reloaded = await loadConfirmedBooking(firstId);
  assert.equal(reloaded.status, "CONFIRMED");
  assert.equal(calls.at(-1).headers.get("x-booking-access-token") === result.ticketAccessToken, true);
});

test("confirmation with only checkout authority exchanges before requesting QR data", async (t) => {
  const token = checkout(t), result = ticketResult();
  const calls = api(t, () => reply(result));
  await loadConfirmedBooking(firstId);
  assert.equal(calls.length, 1); assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].path.endsWith("/ticket-access"), true);
  assert.equal(calls[0].headers.get("x-booking-access-token") === token, true);
});

test("strict-mode/concurrent handoff callers share one exchange rather than consuming duplicate grants", async (t) => {
  checkout(t); const result = ticketResult();
  const calls = api(t, async () => { await new Promise((resolve) => setImmediate(resolve)); return reply(result); });
  await Promise.all([loadConfirmedBooking(firstId), loadConfirmedBooking(firstId), exchangeTicketAccess(firstId)]);
  assert.equal(calls.length, 1);
});

test("lost confirmation response resolves through exchange without another order or payment", async (t) => {
  checkout(t); const result = ticketResult();
  const calls = api(t, (call) => { if (call.path.endsWith("/confirm")) throw new Error("lost response"); return reply(result); });
  const confirmed = await confirmBooking(firstId, { razorpay_order_id: "order_fixture", razorpay_payment_id: "pay_fixture", razorpay_signature: "synthetic" });
  assert.equal(confirmed.status, "CONFIRMED"); assert.equal(hasPaymentAttempt(firstId), false);
  assert.equal(readBookingAccess(firstId, "ticket") === result.ticketAccessToken, true);
  assert.deepEqual(calls.map((call) => call.path.split("/").at(-1)), ["confirm", "ticket-access"]);
});

test("unsettled/lost confirmation keeps reloads in check-only mode and cannot start another payment", async (t) => {
  checkout(t);
  const calls = api(t, (call) => {
    if (call.path.endsWith("/confirm")) throw new Error("lost request");
    if (call.path.endsWith("/ticket-access")) return notConfirmed();
    return reply(booking());
  });
  await assert.rejects(confirmBooking(firstId), (error) => error.code === "VERIFICATION_PENDING");
  assert.equal(hasPaymentAttempt(firstId), true);
  assert.equal((await loadPaymentBooking(firstId)).status, "PENDING");
  await assert.rejects(createPaymentOrder(firstId), (error) => error.code === "VERIFICATION_PENDING");
  assert.equal(calls.some((call) => call.path.endsWith("/payment-order")), false);
});

test("revoked/wrong checkout credentials cannot be upgraded into ticket access", async (t) => {
  checkout(t); const calls = api(t, denied);
  await assert.rejects(loadPaymentBooking(firstId), (error) => error.code === "RECOVERY_REQUIRED");
  assert.equal(readBookingAccess(firstId, "ticket"), null);
  assert.deepEqual(calls.map((call) => call.path.split("/").at(-1)), [firstId, "ticket-access"]);
});

test("verified customer cookie reads/mutations remain possible without guest tokens", async (t) => {
  browser(t); const result = ticketResult();
  const calls = api(t, (call) => {
    if (call.path === "/api/customer-auth/me") return reply({ customer: { id: secondId, emailVerified: true } });
    return reply(call.path.endsWith("/confirm") ? result : call.path.endsWith("/payment-order") ? { mock: true } : booking());
  });
  await loadPaymentBooking(firstId); await createPaymentOrder(firstId); await confirmBooking(firstId);
  assert.equal(calls.every((call) => call.options.credentials === "include" && !call.headers.has("x-booking-access-token")), true);
  assert.equal(readBookingAccess(firstId, "ticket") === result.ticketAccessToken, true);
});

test("customer profile verification is never treated as ownership of another booking", async (t) => {
  browser(t);
  api(t, (call) => call.path === "/api/customer-auth/me" ? reply({ customer: { emailVerified: true } }) : denied());
  await assert.rejects(loadConfirmedBooking(firstId), (error) => error.code === "RECOVERY_REQUIRED");
});

test("CSRF rejection is preserved and never retried as an authorization downgrade", async (t) => {
  checkout(t); const calls = api(t, () => reply({ error: { code: "CSRF_REJECTED" } }, 403));
  await assert.rejects(confirmBooking(firstId), (error) => error.code === "CSRF_REJECTED");
  assert.equal(calls.length, 1);
});

test("wrong-booking handoff response is rejected without storing its token", async (t) => {
  checkout(t); api(t, () => reply(ticketResult(secondId)));
  await assert.rejects(exchangeTicketAccess(firstId), (error) => error.code === "BOOKING_CONTRACT_ERROR");
  assert.equal(readBookingAccess(secondId, "ticket"), null); assert.equal(readBookingAccess(firstId, "ticket"), null);
});

test("expired ticket access cannot be rendered from a previously cached booking", async (t) => {
  browser(t); saveBookingAccess(firstId, "ticket", checkoutToken(), future());
  let revoked = false;
  const calls = api(t, () => revoked ? denied() : reply(booking(firstId, "CONFIRMED")));
  await loadConfirmedBooking(firstId); revoked = true;
  api(t, (call) => call.path === "/api/customer-auth/me" ? unsigned() : denied());
  await assert.rejects(loadConfirmedBooking(firstId), (error) => error.code === "RECOVERY_REQUIRED");
  assert.equal(calls.length, 1);
});

test("PNG download reauthorizes with ticket access and exports no bearer/provider material", async (t) => {
  browser(t); const token = checkoutToken(); saveBookingAccess(firstId, "ticket", token, future());
  const events = imageBrowser(t), calls = api(t, () => reply(booking(firstId, "CONFIRMED")));
  const ticketId = booking(firstId, "CONFIRMED").tickets[0]._id;
  await downloadTicket(firstId, ticketId, 0); await downloadTicket(firstId, ticketId, 0);
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.headers.get("x-booking-access-token") === token && call.method === "GET"), true);
  assert.equal(events.clicked, true); assert.equal(events.removed, true); assert.deepEqual(events.revoked, ["blob:fixture", "blob:fixture"]);
  assert.equal(events.links[0].download, "Badvenu-Ticket-1.png");
  assert.equal(events.links[0].referrerPolicy, "no-referrer"); assert.equal(events.texts.join(" ").includes(token), false);
});

for (const mode of ["unauthorized", "void", "wrong-ticket", "remote-QR", "canvas-failure"]) {
  test(`PNG download rejects ${mode} without exporting stale credentials`, async (t) => {
    browser(t); saveBookingAccess(firstId, "ticket", checkoutToken(), future());
    const events = imageBrowser(t), data = booking(firstId, "CONFIRMED");
    if (mode === "void") data.tickets[0].status = "VOID";
    if (mode === "remote-QR") data.tickets[0].qrDataUrl = "https://untrusted.example/qr";
    if (mode === "canvas-failure") document.createElement = () => ({ getContext: () => null });
    api(t, (call) => mode === "unauthorized" ? (call.path === "/api/customer-auth/me" ? unsigned() : denied()) : reply(data));
    await assert.rejects(downloadTicket(firstId, mode === "wrong-ticket" ? secondId : data.tickets[0]._id), (error) => ["DOWNLOAD_FAILED", "RECOVERY_REQUIRED"].includes(error.code));
    assert.equal(events.links.length, 0);
  });
}
test("successful but malformed creation JSON stops with a contract error", async (t) => {
  browser(t);
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, status: 201, json: async () => { throw new Error("invalid JSON"); } }));
  await assert.rejects(createBooking("show", {}), (error) => error.code === "BOOKING_CONTRACT_ERROR");
  assert.equal(readBookingAccess(firstId, "checkout"), null);
});

test("unexpected internal booking/ticket response fields are rejected, not rendered", async (t) => {
  checkout(t);
  api(t, () => reply({ ...booking(), payment: { signature: "synthetic" } }));
  await assert.rejects(loadPaymentBooking(firstId), (error) => error.code === "BOOKING_CONTRACT_ERROR");
  api(t, () => { const result = ticketResult(); result.tickets[0].qrToken = "synthetic"; return reply(result); });
  await assert.rejects(exchangeTicketAccess(firstId), (error) => error.code === "BOOKING_CONTRACT_ERROR");
  assert.equal(readBookingAccess(firstId, "ticket"), null);
});
