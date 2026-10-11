import { confirmInventory, releaseInventory } from "./inventory.js";
import { issueTicketsForBooking } from "./tickets.js";
import { deliverTickets, deliverFailureNotice } from "./notifications.js";

/**
 * Moves a PENDING booking to CONFIRMED: converts held inventory to sold,
 * issues QR tickets, and triggers delivery. Used from two places —
 * the client's /confirm call (fast path, right after Checkout succeeds) and
 * the Razorpay webhook (reliable path, in case the client never gets back
 * to /confirm — e.g. they close the tab immediately after paying). Kept in
 * one place so those two paths can't quietly diverge.
 */
export async function finalizeConfirmedBooking(booking) {
  await confirmInventory(booking);
  booking.status = "CONFIRMED";
  booking.confirmedAt = new Date();

  const tickets = await issueTicketsForBooking(booking);
  booking.deliveryLog = [...(booking.deliveryLog || []), ...(await deliverTickets(booking, tickets))];

  await booking.save();
  return tickets;
}

/**
 * Moves a PENDING booking to FAILED: releases its held inventory
 * immediately (rather than waiting up to 10 minutes for the hold to
 * expire on its own — no reason to keep a ticket locked once we already
 * know the payment didn't go through), and sends a failure notice.
 */
export async function failBooking(booking, reason) {
  await releaseInventory(booking);
  booking.status = "FAILED";
  booking.deliveryLog = [...(booking.deliveryLog || []), ...(await deliverFailureNotice(booking, reason))];
  await booking.save();
}
