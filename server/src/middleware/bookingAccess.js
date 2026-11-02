import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import BookingAccessGrant from "../models/BookingAccessGrant.js";
import Customer from "../models/Customer.js";
import { verifyToken, CUSTOMER_SESSION_COOKIE } from "../utils/token.js";
import {
  ACCESS_PURPOSE, BOOKING_ACCESS_HEADER, hashBookingAccessToken,
  isBookingAccessToken, isBookingAccessGrantValid, isBookingPurposeAllowed, isCheckoutHandoffGrantValid,
} from "../utils/bookingAccess.js";

// READ chooses the grant purpose from stored booking state, never from client input.
// Revoke a grant by setting revokedAt; revoke all by atomically incrementing
// Booking.accessVersion. A missing legacy version means 0, NOT permission.
export function requireBookingAccess({
  purpose, denialStatus = 404, BookingModel = Booking, GrantModel = BookingAccessGrant,
  CustomerModel = Customer, verifySession = verifyToken, clock = () => new Date(),
}) {
  if (!["READ", "HANDOFF", "EMAIL_EXCHANGE"].includes(purpose) && !Object.values(ACCESS_PURPOSE).includes(purpose)) throw new TypeError("Invalid access purpose.");

  return async function bookingAccess(req, res, next) {
    // Same response for absent, malformed, unauthorized and unknown booking IDs.
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    const deny = () => res.status(denialStatus).json({
      error: { code: denialStatus === 403 ? "BOOKING_ACCESS_DENIED" : "NOT_FOUND", message: "Booking not found or access unavailable." },
    });
    try {
      if (!mongoose.isObjectIdOrHexString(req.params?.id)) return deny();
      const booking = await BookingModel.findById(req.params.id).select("+accessVersion");
      const now = clock();
      if (!booking) return deny();
      const accessPurpose = purpose === "READ"
        ? (booking.status === "CONFIRMED" ? ACCESS_PURPOSE.TICKET : ACCESS_PURPOSE.CHECKOUT)
        : (purpose === "HANDOFF" ? ACCESS_PURPOSE.CHECKOUT : purpose === "EMAIL_EXCHANGE" ? ACCESS_PURPOSE.TICKET : purpose);
      const handoff = purpose === "HANDOFF" && booking.status === "CONFIRMED";
      if (purpose !== "READ" && !handoff && !isBookingPurposeAllowed(booking, accessPurpose, now)) return deny();

      // Prefer an independently valid header grant over incidental cookies. Guest
      // authorization must not silently become cookie authorization (or vice versa).
      const token = req.headers?.[BOOKING_ACCESS_HEADER];
      if (isBookingAccessToken(token)) {
        const grant = await GrantModel.findOne({
          booking: booking._id, purpose: accessPurpose, tokenHash: hashBookingAccessToken(token),
        }).select("+tokenHash +source +consumedAt");
        const valid = handoff ? isCheckoutHandoffGrantValid({ booking, grant, token, now })
          : isBookingAccessGrantValid({ booking, grant, token, purpose: accessPurpose, now });
        // An emailed bearer is intentionally exchange-only and one-time; it
        // cannot be replayed as a generic ticket reader or a payment grant.
        const sourceAllowed = purpose !== "READ" || accessPurpose !== ACCESS_PURPOSE.TICKET
          || grant?.source == null || ["BROWSER", "RECOVERY"].includes(grant.source);
        const emailExchange = purpose !== "EMAIL_EXCHANGE" || grant?.source === "EMAIL";
        if (valid && sourceAllowed && emailExchange) {
          req.booking = booking;
          req.bookingAccess = { purpose: accessPurpose, method: "grant", grantId: grant._id };
          return next();
        }
      }

      // Authenticate independently; never trust body/query/customer IDs or req.customer.
      if (purpose === "EMAIL_EXCHANGE") return deny();
      const session = req.cookies?.[CUSTOMER_SESSION_COOKIE];
      let identity;
      if (typeof session === "string") {
        try { identity = verifySession(session); } catch { /* A guest grant may still authorize. */ }
      }
      if (identity?.role === "customer" && mongoose.isObjectIdOrHexString(identity.customerId)
        && booking.customer && String(booking.customer) === identity.customerId) {
        const customer = await CustomerModel.findById(identity.customerId).select("emailVerified");
        if (customer?.emailVerified === true) {
          req.booking = booking;
          req.bookingAccess = { purpose: accessPurpose, method: "customer", customerId: identity.customerId };
          return next();
        }
      }

      return deny();
    } catch (err) {
      // Database errors may embed query hashes or document values. Do not forward
      // those to the application's generic logger for the public read endpoint.
      if (["READ", "HANDOFF", ACCESS_PURPOSE.CHECKOUT].includes(purpose) && denialStatus === 403) {
        return next(Object.assign(new Error("Unable to load booking."), {
          status: 503, code: "BOOKING_READ_FAILED",
        }));
      }
      return next(err);
    }
  };
}
