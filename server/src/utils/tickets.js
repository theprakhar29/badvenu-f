import crypto from "node:crypto";
import QRCode from "qrcode";
import Ticket from "../models/Ticket.js";

function generateToken() {
  // 192 bits of randomness, URL-safe — unguessable, and this token IS the
  // ticket's identity (scanning will look it up directly, no separate secret).
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Issues one Ticket document per purchased unit (a booking for 2x General +
 * 1x VIP produces 3 separate scannable tickets, not one ticket for "3").
 * Each gets its own unique QR token and a pre-rendered QR image, styled
 * with the Marquee palette rather than a bare default QR.
 */
export async function issueTicketsForBooking(booking) {
  const tickets = [];

  for (const item of booking.items) {
    for (let i = 0; i < item.quantity; i++) {
      const qrToken = generateToken();
      const qrDataUrl = await QRCode.toDataURL(qrToken, {
        color: { dark: "#0F1B33", light: "#F7F4EC" }, // navy-950 on paper
        margin: 1,
        width: 320,
      });

      const ticket = await Ticket.create({
        booking: booking._id,
        event: booking.event,
        pricingTierId: item.pricingTierId,
        tierName: item.tierName,
        qrToken,
        qrDataUrl,
        status: "UNUSED",
      });

      tickets.push(ticket);
    }
  }

  return tickets;
}
