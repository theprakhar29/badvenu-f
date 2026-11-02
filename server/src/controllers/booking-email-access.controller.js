import Booking from "../models/Booking.js";
import BookingAccessGrant from "../models/BookingAccessGrant.js";
import Ticket from "../models/Ticket.js";
import { ACCESS_PURPOSE, BOOKING_ACCESS_HEADER, createBookingAccessGrant, hashBookingAccessToken, isBookingAccessGrantValid } from "../utils/bookingAccess.js";
import { bookingResponse, confirmedBookingResponse } from "../utils/bookingResponse.js";

export function makeEmailTicketAccessHandler({ BookingModel = Booking, GrantModel = BookingAccessGrant, TicketModel = Ticket, transaction = (work) => BookingModel.db.transaction(work), clock = () => new Date() } = {}) {
return async function exchangeEmailTicketAccess(req, res, next) {
  res.set("Cache-Control", "no-store"); res.set("Referrer-Policy", "no-referrer");
  try {
    const token = req.headers[BOOKING_ACCESS_HEADER], now = clock();
    const result = await transaction(async (session) => {
      const booking = await BookingModel.findById(req.params.id).select("+accessVersion").session(session);
      const grant = await GrantModel.findOne({ booking: booking?._id, purpose: ACCESS_PURPOSE.TICKET, source: "EMAIL", tokenHash: hashBookingAccessToken(token), consumedAt: null }).select("+tokenHash +consumedAt +source").session(session);
      if (!isBookingAccessGrantValid({ booking, grant, token, purpose: ACCESS_PURPOSE.TICKET, now })) throw Object.assign(new Error("Booking access unavailable."), { status: 403, code: "BOOKING_ACCESS_DENIED" });
      const consumed = await GrantModel.updateOne({ _id: grant._id, consumedAt: null, revokedAt: null, expiresAt: { $gt: now } }, { $set: { consumedAt: now } }, { session });
      if (consumed.modifiedCount !== 1) throw Object.assign(new Error("Booking access unavailable."), { status: 403, code: "BOOKING_ACCESS_DENIED" });
      const expiresAt = new Date(Math.min(+grant.expiresAt, +now + 7 * 86400000));
      const issued = createBookingAccessGrant({ booking, purpose: ACCESS_PURPOSE.TICKET, source: "BROWSER", expiresAt, now });
      await GrantModel.create([issued.grant], { session });
      const tickets = await TicketModel.find({ booking: booking._id }).select("booking tierName status usedAt qrDataUrl createdAt").session(session);
      return { ...confirmedBookingResponse(booking, tickets), ticketAccessToken: issued.token, ticketAccessExpiresAt: expiresAt };
    });
    res.json(result);
  } catch (err) { next(err.status ? err : Object.assign(new Error("Booking access unavailable."), { status: 403, code: "BOOKING_ACCESS_DENIED" })); }
}; }
export const exchangeEmailTicketAccess = makeEmailTicketAccessHandler();
