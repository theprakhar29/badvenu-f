import Razorpay from "razorpay";
import crypto from "node:crypto";

/**
 * ============================================================================
 *  RAZORPAY INTEGRATION — WHERE TO SWAP IN REAL KEYS
 * ============================================================================
 *  This file is the ONLY place that talks to Razorpay. All three values it
 *  needs come from environment variables (server/.env) — never hardcoded:
 *
 *    RAZORPAY_KEY_ID         — currently "asdfghjkl" (placeholder)
 *    RAZORPAY_KEY_SECRET     — currently "asdfghjkl" (placeholder)
 *    RAZORPAY_WEBHOOK_SECRET — currently "asdfghjkl" (placeholder)
 *
 *  To go live: replace those three values in server/.env with the real ones
 *  from your Razorpay Dashboard:
 *    - KEY_ID / KEY_SECRET  → Settings → API Keys (generate Test or Live keys)
 *    - WEBHOOK_SECRET       → Settings → Webhooks → (create one pointing at
 *      POST /api/public/payments/webhook on your deployed server) → the
 *      secret you set when creating that webhook
 *
 *  Nothing else in the codebase needs to change — no code in this file,
 *  this controller, or the client references a key directly.
 * ============================================================================
 */

let razorpayInstance = null;

export function isRazorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getRazorpayClient() {
  if (!isRazorpayConfigured()) {
    const err = new Error(
      "Payment gateway isn't configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env."
    );
    err.status = 500;
    err.code = "PAYMENT_NOT_CONFIGURED";
    throw err;
  }
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
}

/** Creates a Razorpay order for a booking. Amount is in paise (₹1 = 100). */
export async function createRazorpayOrder(booking) {
  const client = getRazorpayClient();
  try {
    return await client.orders.create({
      amount: Math.round(booking.totalAmount * 100),
      currency: "INR",
      receipt: booking._id.toString(),
      notes: { bookingId: booking._id.toString() },
    });
  } catch (err) {
    // Razorpay's SDK throws its own error shape (err.error.description) on
    // API failures (bad key, auth failure, etc). Normalize it so the rest
    // of the app doesn't need to know Razorpay's error format.
    const message = err?.error?.description || err?.message || "Payment gateway rejected the request.";
    const wrapped = new Error(`Payment gateway error: ${message}`);
    wrapped.status = 502;
    wrapped.code = "PAYMENT_GATEWAY_ERROR";
    throw wrapped;
  }
}

/**
 * Verifies a client-reported payment is genuine. This is THE critical
 * security check in the whole payment flow — without it, anyone could call
 * /confirm with a fake payment ID and get free tickets. Razorpay's
 * documented scheme: HMAC-SHA256 of "order_id|payment_id" using the key
 * secret must equal the signature Razorpay's Checkout returned.
 */
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}

/** Verifies an incoming webhook actually came from Razorpay (not a spoofed request). */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET || !signatureHeader) return false;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return expected === signatureHeader;
}
