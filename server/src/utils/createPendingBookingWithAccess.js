import Booking from "../models/Booking.js";
import BookingAccessGrant from "../models/BookingAccessGrant.js";
import { reserveInventory } from "./inventory.js";
import { ACCESS_PURPOSE, createBookingAccessGrant } from "./bookingAccess.js";

// A replica set/sharded cluster is required. Never fall back to partial writes.
// Mongoose may retry this callback; only the committed attempt's token is returned.
export function createPendingBookingWithAccess(data, {
  BookingModel = Booking, GrantModel = BookingAccessGrant, reserve = reserveInventory,
  transaction = (work) => BookingModel.db.transaction(work), clock = () => new Date(),
} = {}) {
  return transaction(async (session) => {
    const booking = new BookingModel(data);
    const { token, grant } = createBookingAccessGrant({
      booking, purpose: ACCESS_PURPOSE.CHECKOUT, now: clock(),
    });
    await reserve(booking.event, booking.items, { session });
    await booking.save({ session });
    await GrantModel.create([grant], { session });
    return { booking, checkoutAccessToken: token, checkoutAccessExpiresAt: grant.expiresAt };
  });
}
