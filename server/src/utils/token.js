import jwt from "jsonwebtoken";

export function signOrganizerToken(organizer) {
  return jwt.sign(
    { organizerId: organizer._id.toString(), email: organizer.email, name: organizer.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function signScannerToken(scannerLink) {
  return jwt.sign(
    { scannerLinkId: scannerLink._id.toString(), eventId: scannerLink.event.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "12h" } // just a session-length cap — real revocation is enforced via DB, not this expiry
  );
}

export const SESSION_COOKIE = "organizer_session";

export const SCANNER_SESSION_COOKIE = "scanner_session";

// sameSite: "none" is required whenever the frontend and backend are on
// different domains (e.g. a Vercel frontend + a Render backend) — this is
// a genuinely cross-site request from the browser's point of view, and
// "lax" (the safer default) blocks cookies on cross-site fetch/XHR calls
// entirely. Browsers require secure: true whenever sameSite is "none", so
// the two are tied together below, not independently configurable — if
// you're running this in production without HTTPS on both sides
// (shouldn't happen, but just in case), login will silently stop
// persisting rather than erroring loudly, so keep both HTTPS.
const isProd = process.env.NODE_ENV === "production";

export const scannerCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
  maxAge: 12 * 60 * 60 * 1000, // 12 hours
};

export const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};
