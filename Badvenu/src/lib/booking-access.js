const PREFIX = "badvenu.booking-access.v1";
const TOKEN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

const MESSAGES = {
  BOOKING_CREATION_UNCERTAIN: "The booking request could not be confirmed. Check your bookings or contact support before making another reservation.",
  CHECKOUT_UNAVAILABLE: "Unable to open secure checkout. Check your booking status before trying again.",
  RECOVERY_REQUIRED: "Booking access is missing or expired. Sign in with your booking email to view your bookings, or contact support. Guest link recovery is not available yet.",
  ACCESS_STORAGE_UNAVAILABLE: "This tab cannot retain booking access. Enable session storage before continuing, or sign in to view your bookings. Do not submit another payment.",
  BOOKING_CONTRACT_ERROR: "Booking access could not be verified. Stop here and contact support; do not submit another payment.",
  VERIFICATION_PENDING: "Payment confirmation is pending. Check the status again; do not pay again.",
  NOT_CONFIRMED: "This booking is not confirmed yet. Return to payment or check the payment status again.",
  ORDER_NOT_PAYABLE: "This payment order cannot accept another payment. Check confirmation status; do not pay again.",
  ORDER_PENDING_RECONCILIATION: "The payment order needs verification. Check the status or contact support; do not pay again.",
  PAYMENT_RECONCILIATION_REQUIRED: "This payment needs support review. Do not pay again.",
  PAYMENT_NOT_VERIFIED: "Payment capture has not been verified yet. Check confirmation status; do not pay again.",
  PAYMENT_VERIFICATION_FAILED: "Payment confirmation could not be verified. Check its status or contact support; do not pay again.",
  PAYMENT_NOT_CONFIGURED: "Online payments are temporarily unavailable.",
  PAYMENT_UNAVAILABLE: "Payment processing is temporarily unavailable. Check its status before trying again.",
  CSRF_REJECTED: "This request could not be authorized. Open the booking on the configured Badvenu website and try again.",
  HANDOFF_LIMIT: "Too many access exchanges. Sign in to view your bookings or contact support.",
  TICKET_ACCESS_EXPIRED: "Ticket access has expired. Sign in to view your bookings or contact support.",
  DOWNLOAD_FAILED: "Unable to download this ticket. Refresh your authorized booking and try again.",
  EMAIL_LINK_INVALID: "This secure email link is invalid or has already been used. Request account recovery to continue.",
};

export class BookingAccessError extends Error {
  constructor(code) {
    super(MESSAGES[code] || "Unable to complete this booking request. Please try again.");
    this.name = "BookingAccessError";
    this.code = Object.hasOwn(MESSAGES, code) ? code : "REQUEST_FAILED";
  }
}

export function bookingErrorMessage(error) {
  return MESSAGES[error?.code] || "Unable to complete this booking request. Please try again.";
}

export function bookingId(value) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) throw new BookingAccessError("RECOVERY_REQUIRED");
  return value.toLowerCase();
}

function storage() {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) return window.sessionStorage;
  } catch { /* fail closed without exposing browser exception details */ }
  throw new BookingAccessError("ACCESS_STORAGE_UNAVAILABLE");
}

function key(id, kind) {
  if (!["checkout", "ticket", "payment-attempt"].includes(kind)) throw new BookingAccessError("BOOKING_CONTRACT_ERROR");
  return `${PREFIX}:${bookingId(id)}:${kind}`;
}

export function ensureBookingStorage() {
  const target = storage();
  const probe = `${PREFIX}:probe`;
  try { target.setItem(probe, "1"); target.removeItem(probe); } catch {
    throw new BookingAccessError("ACCESS_STORAGE_UNAVAILABLE");
  }
}

export function saveBookingAccess(id, kind, token, expiresAt) {
  const name = key(id, kind);
  if (!["checkout", "ticket"].includes(kind) || typeof token !== "string" || !TOKEN.test(token)
    || typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
    throw new BookingAccessError("BOOKING_CONTRACT_ERROR");
  }
  try { storage().setItem(name, JSON.stringify({ token, expiresAt })); } catch (error) {
    if (error instanceof BookingAccessError) throw error;
    throw new BookingAccessError("ACCESS_STORAGE_UNAVAILABLE");
  }
}

export function clearBookingAccess(id, kind) {
  try { storage().removeItem(key(id, kind)); } catch {
    throw new BookingAccessError("ACCESS_STORAGE_UNAVAILABLE");
  }
}

export function readBookingAccess(id, kind) {
  const name = key(id, kind);
  let raw;
  try { raw = storage().getItem(name); } catch { throw new BookingAccessError("ACCESS_STORAGE_UNAVAILABLE"); }
  if (!raw) return null;
  let record;
  try { record = JSON.parse(raw); } catch { /* remove malformed entries */ }
  if (typeof record?.token !== "string" || !TOKEN.test(record.token)
    || typeof record.expiresAt !== "string" || !Number.isFinite(Date.parse(record.expiresAt))
    || Date.parse(record.expiresAt) <= Date.now()) {
    clearBookingAccess(id, kind);
    return null;
  }
  return record.token;
}

// Consume synchronously before any effect/network request. The fragment is never
// sent to the server, and this function removes it before returning the bearer.
export function takeEmailTicketFragment(id) {
  bookingId(id);
  if (typeof window === "undefined") return null;
  const raw = window.location?.hash || "";
  if (!raw.startsWith("#")) return null;
  let token;
  try { token = new URLSearchParams(raw.slice(1)).get("ticket_access"); } catch { token = null; }
  try { window.history?.replaceState?.(null, "", `${window.location.pathname}${window.location.search}`); } catch { /* URL cleanup is best effort; reject token if unsupported */ }
  if (!token || !TOKEN.test(token)) throw new BookingAccessError("EMAIL_LINK_INVALID");
  return token;
}

// Only a nonsensitive uncertainty marker; never save provider IDs/signatures/QRs.
// It intentionally survives reload and is not automatically expired into "pay again".
export function setPaymentAttempt(id) {
  try { storage().setItem(key(id, "payment-attempt"), "pending"); } catch {
    throw new BookingAccessError("ACCESS_STORAGE_UNAVAILABLE");
  }
}
export function hasPaymentAttempt(id) {
  try { return storage().getItem(key(id, "payment-attempt")) === "pending"; } catch {
    throw new BookingAccessError("ACCESS_STORAGE_UNAVAILABLE");
  }
}
export function clearPaymentAttempt(id) { clearBookingAccess(id, "payment-attempt"); }
