import Booking from "../models/Booking.js";
import { releaseInventory } from "../utils/inventory.js";
import { finalizeConfirmedBooking, failBooking } from "../utils/finalizeBooking.js";
import {
  isRazorpayConfigured,
  createRazorpayOrder,
  verifyWebhookSignature,
} from "../utils/payment.js";
import { logger } from "../utils/logger.js";

// POST /api/public/bookings/:id/payment-order — creates a Razorpay order for
// a pending booking. The client uses the returned order to open Razorpay
// Checkout. If no gateway is configured at all (env vars unset), falls back
// to a "mock" response so local dev keeps working without real keys.
export async function createPaymentOrder(req, res, next) {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Booking not found." } });
    }
    if (booking.status !== "PENDING") {
      return res.status(409).json({
        error: { code: "INVALID_STATE", message: `This booking is already ${booking.status.toLowerCase()}.` },
      });
    }
    if (booking.holdExpiresAt && booking.holdExpiresAt < new Date()) {
      await releaseInventory(booking);
      booking.status = "EXPIRED";
      await booking.save();
      logger.booking(`Hold expired before payment order — booking ${booking._id}`);
      return res.status(409).json({
        error: { code: "HOLD_EXPIRED", message: "Your reservation expired. Please book again." },
      });
    }

    if (!isRazorpayConfigured()) {
      logger.payment(`No gateway configured — mock mode for booking ${booking._id}`);
      return res.json({ mock: true });
    }

    const order = await createRazorpayOrder(booking);

    booking.payment = { provider: "razorpay", orderId: order.id, status: "created" };
    await booking.save();

    logger.payment(`Razorpay order created — booking ${booking._id}, order ${order.id}, ₹${booking.totalAmount}`);

    res.json({
      mock: false,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // publishable ID — safe to send to the client
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      guestPhone: booking.guestPhone,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/public/payments/webhook — Razorpay calls this server-to-server.
// This is the *reliable* confirmation path: even if the guest's browser
// closes right after paying (before the client-side /confirm call fires),
// this webhook still lands and finalizes the booking. Requires the raw
// request body for signature verification — see app.js for the special
// routing needed to get that instead of the parsed JSON body.
export async function razorpayWebhook(req, res, next) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.body; // Buffer — this route is mounted with express.raw()

    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.payment("Webhook rejected — signature verification failed");
      return res.status(400).json({ error: { code: "INVALID_SIGNATURE", message: "Signature verification failed." } });
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    logger.payment(`Webhook received: ${event.event}`);

    if (event.event === "payment.captured") {
      const orderId = event.payload?.payment?.entity?.order_id;
      const paymentId = event.payload?.payment?.entity?.id;

      const booking = await Booking.findOne({ "payment.orderId": orderId });

      // Idempotent: if the client-side /confirm call already finalized this
      // booking, do nothing — a webhook can legitimately arrive twice.
      if (booking && booking.status === "PENDING") {
        booking.payment.paymentId = paymentId;
        booking.payment.status = "paid";
        await finalizeConfirmedBooking(booking);
        logger.payment(`Webhook finalized booking ${booking._id} (client never confirmed it itself)`);
      } else if (booking) {
        logger.payment(`Webhook payment.captured ignored — booking ${booking._id} already ${booking.status}`);
      }
    }

    if (event.event === "payment.failed") {
      const orderId = event.payload?.payment?.entity?.order_id;
      const reason = event.payload?.payment?.entity?.error_description || "Your payment was declined.";

      const booking = await Booking.findOne({ "payment.orderId": orderId });

      // Same idempotency guard — only act if this booking is still waiting.
      if (booking && booking.status === "PENDING") {
        booking.payment.status = "failed";
        await failBooking(booking, reason);
        logger.payment(`Webhook marked booking ${booking._id} FAILED — ${reason}`);
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}
