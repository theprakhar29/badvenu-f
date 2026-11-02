// Exact Origin validation protects cookie-authorized mutations. CORS alone is
// not CSRF protection. Missing/null/unlisted origins fail closed for cookies.
export function requirePaymentCsrf({
  origins = () => (process.env.CLIENT_ORIGIN || "http://localhost:3000").split(",").map((value) => value.trim()).filter(Boolean),
} = {}) {
  return function paymentCsrf(req, res, next) {
    if (req.bookingAccess?.method === "grant") return next();
    const origin = req.headers.origin;
    let canonical = false;
    try { canonical = typeof origin === "string" && new URL(origin).origin === origin; } catch { /* deny */ }
    if (req.bookingAccess?.method !== "customer" || !canonical || !origins().includes(origin)) {
      return res.status(403).json({ error: { code: "CSRF_REJECTED", message: "Request origin is not allowed." } });
    }
    return next();
  };
}