import { randomBytes } from "node:crypto";
export const firstId = "000000000000000000000001";
export const secondId = "000000000000000000000002";
export const checkoutToken = () => randomBytes(32).toString("base64url");
export const future = () => new Date(Date.now() + 600000).toISOString();
export function memoryStorage() {
  const data = new Map();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}
export function browser(t, storage = memoryStorage()) {
  const target = { sessionStorage: storage, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(target, "localStorage", { get() { throw new Error("localStorage must never be accessed"); } });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network call"); });
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: target, configurable: true, writable: true });
  t.after(() => original ? Object.defineProperty(globalThis, "window", original) : delete globalThis.window);
  return target;
}
export function reply(data, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }
export function api(t, work) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    const call = { path: new URL(url).pathname, method: options.method || "GET", headers: new Headers(options.headers), options,
      body: options.body ? JSON.parse(options.body) : undefined };
    calls.push(call);
    return work(call);
  });
  return calls;
}
export function booking(id = firstId, status = "PENDING") {
  return { _id: id, status, guestName: "Fixture guest", guestEmail: "guest@example.test", totalAmount: 100,
    event: { title: "Fixture show", slug: "fixture-show" }, items: [{ quantity: 1, tierName: "General" }],
    tickets: status === "CONFIRMED" ? [{ _id: "000000000000000000000003", status: "UNUSED", tierName: "General", qrDataUrl: "data:image/png;base64,aGVsbG8=" }] : [] };
}
export function ticketResult(id = firstId) {
  return { ...booking(id, "CONFIRMED"), ticketAccessToken: checkoutToken(), ticketAccessExpiresAt: future() };
}
