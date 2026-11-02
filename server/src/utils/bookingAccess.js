import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const BOOKING_ACCESS_HEADER = "x-booking-access-token";
export const CHECKOUT_TTL_MS = 15 * 60 * 1000;
export const ACCESS_PURPOSE = Object.freeze({ CHECKOUT: "CHECKOUT", TICKET: "TICKET" });

// Canonical base64url encoding of exactly 32 bytes (including canonical final bits).
export function isBookingAccessToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)
    && Buffer.from(token, "base64url").toString("base64url") === token;
}

export function hashBookingAccessToken(token) {
  if (!isBookingAccessToken(token)) throw new TypeError("Invalid booking access token.");
  return createHash("sha256").update(token).digest("hex");
}

export function matchesBookingAccessToken(token, tokenHash) {
  if (!isBookingAccessToken(token) || typeof tokenHash !== "string"
    || !/^[a-f0-9]{64}$/.test(tokenHash)) return false;
  return timingSafeEqual(
    Buffer.from(hashBookingAccessToken(token), "hex"), Buffer.from(tokenHash, "hex")
  );
}

function milliseconds(value) {
  return value == null ? NaN : new Date(value).getTime();
}

export function bookingAccessVersion(booking) {
  // Legacy bookings never gain access merely by having an ID; they still need a grant
  // issued after verified recovery, or an already linked, verified customer session.
  return booking.accessVersion === undefined ? 0 : booking.accessVersion;
}

export function isBookingPurposeAllowed(booking, purpose, now = new Date()) {
  const time = milliseconds(now);
  if (!Number.isFinite(time)) return false;
  if (purpose === ACCESS_PURPOSE.CHECKOUT) {
    return booking.status === "PENDING" && milliseconds(booking.holdExpiresAt) > time;
  }
  return purpose === ACCESS_PURPOSE.TICKET && booking.status === "CONFIRMED";
}

// Trusted server callers only: creation for checkout, confirmed fulfillment or
// verified recovery for ticket access. Never issue from a booking ID alone.
// Persist ONLY grant, and return/deliver token once. No DB writes happen here.
export function createBookingAccessGrant({ booking, purpose, expiresAt, source, now = new Date() }) {
  if (!booking?._id || !isBookingPurposeAllowed(booking, purpose, now)) {
    throw new TypeError("Booking is not eligible for this access purpose.");
  }
  const version = bookingAccessVersion(booking);
  if (!Number.isSafeInteger(version) || version < 0) throw new TypeError("Invalid access version.");
  const time = milliseconds(now);
  let expiry = milliseconds(expiresAt);
  if (purpose === ACCESS_PURPOSE.CHECKOUT) {
    expiry = Math.min(time + CHECKOUT_TTL_MS, milliseconds(booking.holdExpiresAt),
      expiresAt === undefined ? Infinity : expiry);
  }
  // TICKET deliberately requires an explicit server-selected expiry (event end +
  // recovery window in the integration phase); never silently creates eternal access.
  if (!Number.isFinite(expiry) || expiry <= time) throw new TypeError("A future expiry is required.");
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    grant: {
      booking: booking._id,
      purpose,
      tokenHash: hashBookingAccessToken(token),
      accessVersion: version,
      expiresAt: new Date(expiry),
      revokedAt: null,
      ...(source ? { source } : {}),
    },
  };
}

export function isBookingAccessGrantValid({ booking, grant, token, purpose, now = new Date() }) {
  if (!booking || !grant || !isBookingPurposeAllowed(booking, purpose, now)) return false;
  const version = bookingAccessVersion(booking);
  return Number.isSafeInteger(version) && version >= 0
    && String(grant.booking) === String(booking._id)
    && grant.purpose === purpose && grant.accessVersion === version
    && grant.revokedAt == null && milliseconds(grant.expiresAt) > milliseconds(now)
    && matchesBookingAccessToken(token, grant.tokenHash);
}
// Narrow exception for exchanging checkout authority AFTER confirmation. This is
// never used to authorize ticket reads or further payment mutations.
export function isCheckoutHandoffGrantValid({ booking, grant, token, now = new Date() }) {
  if (booking?.status !== "CONFIRMED") return false;
  return isBookingAccessGrantValid({
    booking: { _id: booking._id, accessVersion: booking.accessVersion,
      status: "PENDING", holdExpiresAt: grant?.expiresAt },
    grant, token, purpose: ACCESS_PURPOSE.CHECKOUT, now,
  });
}
