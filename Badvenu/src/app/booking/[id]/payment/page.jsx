"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import "./payment.css";

import {
  getBooking,
  createPaymentOrder,
  confirmBooking,
} from "../../../../services/booking.service";

export default function PaymentPage() {
  const { id } = useParams();
  const router = useRouter();

  const [booking, setBooking] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;

    loadBooking();
  }, [id]);

  async function loadBooking() {
    try {
      setLoading(true);
      setError("");

      console.log("📦 Loading booking:", id);

      const data = await getBooking(id);

      console.log("✅ Booking loaded:", data);

      setBooking(data);
    } catch (err) {
      console.error("❌ Failed to load booking:", err);

      setError(err.message || "Unable to load booking.");
    } finally {
      setLoading(false);
    }
  }

  async function startPayment() {
    try {
      setProcessing(true);
      setError("");

      console.log("💳 Creating payment order for:", id);

      const order = await createPaymentOrder(id);

      console.log("✅ Payment order:", order);

      setPaymentOrder(order);

      /*
       * MOCK MODE
       *
       * Backend returns:
       * { mock: true }
       *
       * No Razorpay checkout is required.
       */
      if (order.mock) {
        console.log("🧪 Mock payment mode");

        const result = await confirmBooking(id, {});

        console.log("✅ Mock payment confirmed:", result);

        router.push(`/booking-confirmation/${id}`);

        return;
      }

      /*
       * REAL RAZORPAY MODE
       */

      if (!order.keyId || !order.orderId) {
        throw new Error(
          "Payment gateway information is incomplete."
        );
      }

      await openRazorpay(order);
    } catch (err) {
      console.error("❌ Payment failed:", err);

      setError(
        err.message ||
          "Unable to start payment. Please try again."
      );

      setProcessing(false);
    }
  }

  async function openRazorpay(order) {
    /*
     * Load Razorpay Checkout script if it isn't already loaded.
     */
    if (!window.Razorpay) {
      await loadRazorpayScript();
    }

    if (!window.Razorpay) {
      throw new Error(
        "Unable to load Razorpay Checkout."
      );
    }

    const options = {
      key: order.keyId,

      amount: order.amount,

      currency: order.currency || "INR",

      name: "Badvenu",

      description:
        booking?.event?.title || "Event Tickets",

      order_id: order.orderId,

      prefill: {
        name: order.guestName || booking?.guestName || "",
        email: order.guestEmail || booking?.guestEmail || "",
        contact:
          order.guestPhone ||
          booking?.guestPhone ||
          "",
      },

      theme: {
        color: "#111827",
      },

      handler: async function (response) {
        try {
          console.log(
            "✅ Razorpay payment successful:",
            response
          );

          /*
           * Send Razorpay's verification details
           * to our backend.
           */
          const confirmation = await confirmBooking(
            id,
            {
              razorpay_order_id:
                response.razorpay_order_id,

              razorpay_payment_id:
                response.razorpay_payment_id,

              razorpay_signature:
                response.razorpay_signature,
            }
          );

          console.log(
            "🎟️ Booking confirmed:",
            confirmation
          );

          router.push(`/booking-confirmation/${id}`);
        } catch (err) {
          console.error(
            "❌ Payment verification failed:",
            err
          );

          setError(
            err.message ||
              "Payment was received but we couldn't confirm the booking. Please contact support."
          );

          setProcessing(false);
        }
      },

      modal: {
        ondismiss: function () {
          console.log(
            "ℹ️ Razorpay checkout closed."
          );

          setProcessing(false);
        },
      },
    };

    const razorpay = new window.Razorpay(options);

    razorpay.on(
      "payment.failed",
      function (response) {
        console.error(
          "❌ Razorpay payment failed:",
          response
        );

        setError(
          response?.error?.description ||
            "Payment failed. Please try again."
        );

        setProcessing(false);
      }
    );

    razorpay.open();
  }

  function loadRazorpayScript() {
    return new Promise((resolve, reject) => {
      const existingScript =
        document.querySelector(
          'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
        );

      if (existingScript) {
        existingScript.addEventListener(
          "load",
          resolve
        );

        if (window.Razorpay) {
          resolve();
        }

        return;
      }

      const script =
        document.createElement("script");

      script.src =
        "https://checkout.razorpay.com/v1/checkout.js";

      script.async = true;

      script.onload = () => {
        console.log(
          "✅ Razorpay Checkout loaded"
        );

        resolve();
      };

      script.onerror = () => {
        reject(
          new Error(
            "Failed to load Razorpay Checkout."
          )
        );
      };

      document.body.appendChild(script);
    });
  }

  if (loading) {
    return (
      <main className="payment-page">
        <div className="payment-card">
          <p>Loading your booking...</p>
        </div>
      </main>
    );
  }

  if (error && !booking) {
    return (
      <main className="payment-page">
        <div className="payment-card">
          <h1>Unable to load booking</h1>

          <p className="error">
            {error}
          </p>

          <button onClick={loadBooking}>
            Try Again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="payment-page">
      <div className="payment-card">
        <div className="payment-header">
          <p className="eyebrow">
            SECURE CHECKOUT
          </p>

          <h1>Complete your booking</h1>

          <p>
            Review your order and proceed to
            payment.
          </p>
        </div>

        {booking && (
          <div className="booking-summary">
            <div className="summary-row">
              <span>Event</span>

              <strong>
                {booking.event?.title ||
                  "Event"}
              </strong>
            </div>

            <div className="summary-row">
              <span>Guest</span>

              <strong>
                {booking.guestName}
              </strong>
            </div>

            <div className="summary-row">
              <span>Email</span>

              <strong>
                {booking.guestEmail}
              </strong>
            </div>

            <div className="summary-row">
              <span>Tickets</span>

              <strong>
                {booking.items?.reduce(
                  (total, item) =>
                    total + item.quantity,
                  0
                )}
              </strong>
            </div>

            <div className="summary-row total">
              <span>Total</span>

              <strong>
                ₹
                {Number(
                  booking.totalAmount || 0
                ).toLocaleString("en-IN")}
              </strong>
            </div>
          </div>
        )}

        {error && (
          <div className="payment-error">
            {error}
          </div>
        )}

        <button
          type="button"
          className="pay-button"
          onClick={startPayment}
          disabled={processing}
        >
          {processing
            ? "Processing..."
            : `Pay ₹${Number(
                booking?.totalAmount || 0
              ).toLocaleString("en-IN")}`}
        </button>

        <p className="secure-note">
          🔒 Your payment is processed securely.
        </p>
      </div>
    </main>
  );
}