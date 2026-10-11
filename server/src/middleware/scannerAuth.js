import { verifyToken, SCANNER_SESSION_COOKIE } from "../utils/token.js";
import ScannerLink from "../models/ScannerLink.js";

/**
 * Guards scanner-only routes. Deliberately does NOT trust the JWT alone —
 * a JWT is stateless, so if we only checked its signature/expiry, an
 * organizer's "instant revoke" wouldn't actually be instant (the old token
 * would keep working until it expired, up to 12h later). Instead, every
 * single request re-reads the ScannerLink from the database and checks its
 * live status. That DB check *is* the kill switch.
 */
export async function requireScannerLink(req, res, next) {
  const token = req.cookies?.[SCANNER_SESSION_COOKIE];

  if (!token) {
    return res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "This scanner link isn't active. Ask the organizer to resend it.",
      },
    });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({
      error: { code: "INVALID_SESSION", message: "This scanner session has expired." },
    });
  }

  const link = await ScannerLink.findById(payload.scannerLinkId);

  if (!link || link.status !== "ACTIVE" || link.expiresAt < new Date()) {
    return res.status(403).json({
      error: {
        code: "LINK_REVOKED",
        message: "This scanner link has been deactivated by the organizer.",
      },
    });
  }

  link.lastSeenAt = new Date();
  await link.save();

  req.scannerLink = link;
  next();
}
