import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as bookingService from "../../src/services/booking.service.js";
import * as access from "../../src/lib/booking-access.js";
import { firstId, secondId } from "./booking-fixtures.mjs";
const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const compiled = new Map();

// Executes the actual Next-compiled JSX and event/effect callbacks with controlled
// hook and browser adapters. This is not a full browser/hydration/E2E replacement.
export async function pageHarness(t, relative, { params = { id: firstId }, event } = {}) {
  const slots = [], effects = [], navigation = [], logs = [];
  let cursor = 0, dirty = true, active = true, tree;
  const equal = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next) => { if (active) { slots[index].value = typeof next === "function" ? next(slots[index].value) : next; dirty = true; } }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useCallback(callback, dependencies) {
      const index = cursor++;
      if (!slots[index] || !equal(slots[index].dependencies, dependencies)) slots[index] = { callback, dependencies };
      return slots[index].callback;
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      if (!slots[index] || !equal(slots[index].dependencies, dependencies)) {
        const previous = slots[index]; slots[index] = { dependencies };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
  };
  const router = { push: (target) => navigation.push({ target, checkoutStored: !!access.readBookingAccess(firstId, "checkout") }),
    replace: (target) => navigation.push({ target, ticketStored: !!access.readBookingAccess(firstId, "ticket") }) };
  const create = (type, props) => ({ type, props: props || {} });
  const file = new URL(`../../${relative}`, import.meta.url);
  if (!compiled.has(relative)) compiled.set(relative, transformSync(readFileSync(file, "utf8"), {
    filename: file.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  }).code);
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, window: globalThis.window, document: globalThis.document,
    setTimeout, clearTimeout, Promise, console: Object.fromEntries(["log", "warn", "error"].map((key) => [key, (...args) => logs.push(args)])),
    require(name) {
      if (name === "react") return { ...react, default: react, __esModule: true };
      if (name === "react/jsx-runtime") return { jsx: create, jsxs: create, Fragment: "Fragment" };
      if (name === "next/navigation") return { useParams: () => params, useRouter: () => router };
      if (name.includes("booking.service")) return bookingService;
      if (name.includes("booking-access")) return access;
      if (name.includes("event.service")) return { getPublishedEventBySlug: async () => event || {
        _id: secondId, title: "Fixture show", slug: "fixture-show", pricingTiers: [{ _id: secondId, name: "General", price: 100, totalQty: 10 }],
      } };
      if (name.endsWith(".css")) return {};
      throw new Error("Unexpected test dependency");
    },
  };
  vm.runInNewContext(compiled.get(relative), sandbox, { filename: relative });
  const Component = module.exports.default;
  function render() {
    cursor = 0; dirty = false; tree = Component();
    while (effects.length) effects.shift()();
  }
  async function flush() {
    for (let i = 0; i < 30; i++) {
      if (dirty) render();
      await new Promise((resolve) => setImmediate(resolve));
      if (!dirty) { await new Promise((resolve) => setImmediate(resolve)); if (!dirty) return; }
    }
    throw new Error("Component did not settle");
  }
  function nodes(node) {
    if (node == null || typeof node === "boolean") return [];
    if (Array.isArray(node)) return node.flatMap((value) => nodes(value));
    if (typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  }
  function text(node) {
    if (node == null || typeof node === "boolean") return "";
    if (Array.isArray(node)) return node.map((value) => text(value)).join(" ");
    return typeof node === "object" ? text(node.props?.children) : String(node);
  }
  function dispose() { active = false; for (const slot of slots) slot?.cleanup?.(); }
  t.after(dispose);
  await flush();
  return { flush, navigation, logs, nodes: () => nodes(tree), text: (node = tree) => text(node), router, dispose,
    find: (predicate) => nodes(tree).find(predicate), params,
    setParams(next) { Object.assign(params, next); dirty = true; },
  };
}
