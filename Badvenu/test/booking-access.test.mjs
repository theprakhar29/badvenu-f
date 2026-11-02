import test from "node:test";
import assert from "node:assert/strict";
import { browser, memoryStorage, firstId, secondId, checkoutToken, future } from "./helpers/booking-fixtures.mjs";
import { saveBookingAccess, readBookingAccess, clearBookingAccess, ensureBookingStorage,
  setPaymentAttempt, hasPaymentAttempt, clearPaymentAttempt, bookingId, bookingErrorMessage, takeEmailTicketFragment } from "../src/lib/booking-access.js";
import { apiFetch } from "../src/lib/api.js";

function rejectsSafely(action, code) {
  assert.throws(action, (error) => error.code === code && !Object.hasOwn(error, "cause"));
}

test("checkout/ticket records are isolated by booking and purpose in sessionStorage", (t) => {
  const target = browser(t), checkout = checkoutToken(), ticket = checkoutToken(), other = checkoutToken();
  saveBookingAccess(firstId, "checkout", checkout, future());
  saveBookingAccess(firstId, "ticket", ticket, future());
  saveBookingAccess(secondId, "checkout", other, future());
  assert.equal(readBookingAccess(firstId, "checkout") === checkout, true);
  assert.equal(readBookingAccess(firstId, "ticket") === ticket, true);
  assert.equal(readBookingAccess(secondId, "checkout") === other, true);
  assert.equal(readBookingAccess(secondId, "ticket"), null);
  clearBookingAccess(firstId, "ticket");
  assert.equal(readBookingAccess(firstId, "ticket"), null);
  assert.equal(readBookingAccess(firstId, "checkout") === checkout, true);
  assert.equal(target.sessionStorage.data.size, 2);
});

test("same-tab refresh retains scoped tokens without a module memory cache", (t) => {
  const target = browser(t), token = checkoutToken();
  saveBookingAccess(firstId, "checkout", token, future());
  globalThis.window = { sessionStorage: target.sessionStorage };
  assert.equal(readBookingAccess(firstId, "checkout") === token, true);
  target.sessionStorage.data.clear();
  assert.equal(readBookingAccess(firstId, "checkout"), null);
});

test("expiry removes only the expired grant, including the exact expiry boundary", (t) => {
  browser(t);
  const expiresAt = future(), ticket = checkoutToken();
  saveBookingAccess(firstId, "checkout", checkoutToken(), expiresAt);
  saveBookingAccess(firstId, "ticket", ticket, new Date(Date.parse(expiresAt) + 60000).toISOString());
  t.mock.method(Date, "now", () => Date.parse(expiresAt));
  assert.equal(readBookingAccess(firstId, "checkout"), null);
  assert.equal(readBookingAccess(firstId, "ticket") === ticket, true);
});

for (const malformed of ["not-json", "{}", '{"token":"bad","expiresAt":"invalid"}', '"pending"']) {
  test("malformed storage records fail closed and are removed", (t) => {
    const target = browser(t);
    target.sessionStorage.setItem(`badvenu.booking-access.v1:${firstId}:checkout`, malformed);
    assert.equal(readBookingAccess(firstId, "checkout"), null);
    assert.equal(target.sessionStorage.data.size, 0);
  });
}

for (const token of [undefined, null, {}, "invalid", "A".repeat(42) + "B"]) {
  test("malformed token cannot be stored", (t) => {
    const target = browser(t);
    rejectsSafely(() => saveBookingAccess(firstId, "checkout", token, future()), "BOOKING_CONTRACT_ERROR");
    assert.equal(target.sessionStorage.data.size, 0);
  });
}

test("invalid booking IDs and storage purposes cannot address arbitrary keys", (t) => {
  const target = browser(t);
  for (const value of [null, [], "../other", `${firstId}?access=ignored`]) rejectsSafely(() => bookingId(value), "RECOVERY_REQUIRED");
  rejectsSafely(() => saveBookingAccess(firstId, "other", checkoutToken(), future()), "BOOKING_CONTRACT_ERROR");
  assert.equal(target.sessionStorage.data.size, 0);
});

test("blocked sessionStorage never falls back to localStorage or leaks browser error details", (t) => {
  const token = checkoutToken();
  browser(t, { setItem() { throw new Error(token); }, getItem() { throw new Error(token); }, removeItem() {} });
  rejectsSafely(ensureBookingStorage, "ACCESS_STORAGE_UNAVAILABLE");
  rejectsSafely(() => readBookingAccess(firstId, "checkout"), "ACCESS_STORAGE_UNAVAILABLE");
  try { ensureBookingStorage(); } catch (error) { assert.equal(error.message.includes(token), false); }
});

test("payment uncertainty is booking-scoped and stores no provider data", (t) => {
  const target = browser(t);
  setPaymentAttempt(firstId);
  assert.equal(hasPaymentAttempt(firstId), true); assert.equal(hasPaymentAttempt(secondId), false);
  assert.deepEqual([...target.sessionStorage.data.values()], ["pending"]);
  clearPaymentAttempt(firstId);
  assert.equal(hasPaymentAttempt(firstId), false);
});

test("SSR import and reads do not create a cross-user memory token store", (t) => {
  browser(t); delete globalThis.window;
  rejectsSafely(() => readBookingAccess(firstId, "checkout"), "ACCESS_STORAGE_UNAVAILABLE");
});

test("API preserves caller headers/customer credentials and defaults to no-store/no-referrer", async (t) => {
  browser(t);
  let options;
  t.mock.method(globalThis, "fetch", async (_url, value) => { options = value; return { ok: true, status: 200, json: async () => ({ ok: true }) }; });
  await apiFetch("/api/customer-auth/me", { headers: new Headers({ "X-Custom": "retained", "Content-Type": "custom/type" }) });
  assert.equal(options.credentials, "include"); assert.equal(options.headers.get("X-Custom"), "retained");
  assert.equal(options.headers.get("Content-Type"), "custom/type");
  assert.equal(options.headers.has("x-booking-access-token"), false);
  assert.equal(options.cache, "no-store"); assert.equal(options.referrerPolicy, "no-referrer");
});

test("API error messages/codes never copy sensitive response or network payloads", async (t) => {
  browser(t); const token = checkoutToken();
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 403, json: async () => ({ error: { code: token, message: token } }) }));
  await assert.rejects(apiFetch("/api/public/events"), (error) => error.status === 403 && !JSON.stringify(error).includes(token) && !error.message.includes(token));
  t.mock.method(globalThis, "fetch", async () => { throw new Error(token); });
  await assert.rejects(apiFetch("/api/public/events"), (error) => error.code === "NETWORK_ERROR" && !error.message.includes(token) && !error.cause);
  assert.equal(bookingErrorMessage({ message: token }).includes(token), false);
});
test("safe API errors preserve existing customer sign-in detection without echoing response text", async (t) => {
  browser(t);
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 401, json: async () => ({ error: { code: "UNAUTHENTICATED", message: "not echoed" } }) }));
  await assert.rejects(apiFetch("/api/customer-auth/me"), (error) => error.status === 401
    && /401|authentication required/i.test(error.message) && !error.message.includes("not echoed"));
});

test("email fragment is synchronously removed and never stored", (t) => {
  const target = browser(t), token = checkoutToken();
  target.location = { hash: `#ticket_access=${token}`, pathname: `/booking-confirmation/${firstId}`, search: "" };
  let replacement;
  target.history = { replaceState: (_state, _title, value) => { replacement = value; target.location.hash = ""; } };
  assert.equal(takeEmailTicketFragment(firstId), token);
  assert.equal(replacement, `/booking-confirmation/${firstId}`);
  assert.equal([...target.sessionStorage.data.values()].some((value) => value.includes(token)), false);
  assert.equal(takeEmailTicketFragment(firstId), null);
});
