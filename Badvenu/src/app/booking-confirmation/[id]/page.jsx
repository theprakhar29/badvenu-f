"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { getBooking } from "../../../services/booking.service";
import "./confirmation.css";

export default function BookingConfirmationPage() {
  const { id } = useParams();
  const router = useRouter();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;

    loadBooking();
  }, [id]);

  async function loadBooking() {
    try {
      setLoading(true);
      setError("");

      console.log("🎟️ Loading confirmed booking:", id);

      const data = await getBooking(id);

      console.log("✅ Booking:", data);

      setBooking(data);
    } catch (err) {
      console.error(
        "❌ Failed to load booking:",
        err
      );

      setError(
        err.message ||
        "Unable to load your booking."
      );
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="confirmation-page">
        <div className="confirmation-card">
          <h1>Loading your ticket...</h1>
          <p>Please wait.</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="confirmation-page">
        <div className="confirmation-card">
          <h1>Unable to load booking</h1>

          <p className="error">
            {error}
          </p>

          <button
            type="button"
            onClick={() => router.push("/")}
          >
            Back to Home
          </button>
        </div>
      </main>
    );
  }

  if (!booking) {
    return (
      <main className="confirmation-page">
        <div className="confirmation-card">
          <h1>Booking not found</h1>

          <button
            type="button"
            onClick={() => router.push("/")}
          >
            Back to Home
          </button>
        </div>
      </main>
    );
  }


  async function downloadTicket(ticket, index) {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const width = 1000;
      const height = 650;

      canvas.width = width;
      canvas.height = height;

      // Background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      // Header
      ctx.fillStyle = "#0f1b33";
      ctx.fillRect(0, 0, width, 110);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 36px Arial";
      ctx.fillText("BADVENU", 50, 68);

      ctx.font = "20px Arial";
      ctx.fillText("Event Ticket", 760, 65);

      // Event information
      ctx.fillStyle = "#111827";
      ctx.font = "bold 32px Arial";

      const eventTitle =
        booking?.event?.title || "Badvenu Event";

      ctx.fillText(eventTitle, 50, 170);

      ctx.fillStyle = "#6b7280";
      ctx.font = "20px Arial";
      ctx.fillText(`Guest: ${booking?.guestName || "-"}`, 50, 220);
      ctx.fillText(`Email: ${booking?.guestEmail || "-"}`, 50, 260);
      ctx.fillText(`Ticket: ${ticket?.tierName || "General Admission"}`, 50, 300);

      // Ticket ID
      ctx.fillStyle = "#111827";
      ctx.font = "bold 18px Arial";
      ctx.fillText("Ticket ID", 50, 360);

      ctx.font = "16px monospace";
      ctx.fillText(
        ticket?._id || "N/A",
        50,
        390
      );

      // Booking ID
      ctx.font = "bold 18px Arial";
      ctx.fillText("Booking ID", 50, 440);

      ctx.font = "16px monospace";
      ctx.fillText(
        booking?._id || "N/A",
        50,
        470
      );

      // QR code
      if (ticket?.qrDataUrl) {
        const qrImage = new Image();

        await new Promise((resolve, reject) => {
          qrImage.onload = resolve;
          qrImage.onerror = reject;
          qrImage.src = ticket.qrDataUrl;
        });

        ctx.drawImage(qrImage, 700, 170, 230, 230);
      }

      // Footer
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(0, 570, width, 80);

      ctx.fillStyle = "#6b7280";
      ctx.font = "16px Arial";
      ctx.fillText(
        "Please present this QR code at the event entrance.",
        50,
        615
      );

      // Convert to downloadable PNG
      canvas.toBlob((blob) => {
        if (!blob) {
          throw new Error("Unable to generate ticket.");
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `Badvenu-Ticket-${index + 1}.png`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
      }, "image/png");
    } catch (error) {
      console.error("❌ Ticket download failed:", error);
      alert("Unable to download ticket. Please try again.");
    }
  }

  return (
    <main className="confirmation-page">
      <div className="confirmation-card">
        <div className="success-icon">
          ✓
        </div>

        <h1>Booking Confirmed!</h1>

        <p className="confirmation-message">
          Your ticket has been successfully
          booked.
        </p>

        <div className="booking-info">
          <div>
            <span>Event</span>

            <strong>
              {booking.event?.title ||
                "Event"}
            </strong>
          </div>

          <div>
            <span>Guest</span>

            <strong>
              {booking.guestName}
            </strong>
          </div>

          <div>
            <span>Email</span>

            <strong>
              {booking.guestEmail ||
                "Not provided"}
            </strong>
          </div>

          <div>
            <span>Booking ID</span>

            <strong>
              {booking._id}
            </strong>
          </div>

          <div>
            <span>Total Paid</span>

            <strong>
              ₹
              {Number(
                booking.totalAmount || 0
              ).toLocaleString("en-IN")}
            </strong>
          </div>
        </div>

        {booking.tickets?.length > 0 && (
          <div className="tickets-section">
            <h2>Your Tickets</h2>

            {booking.tickets?.map((ticket, index) => (
              <div className="ticket-card" key={ticket._id}>

                <div className="ticket-details">
                  <span>Ticket</span>

                  <strong>
                    {ticket.ticketCode || ticket._id}
                  </strong>

                  {ticket.tierName && (
                    <small>{ticket.tierName}</small>
                  )}

                  <button
                    type="button"
                    className="download-ticket-btn"
                    onClick={() => downloadTicket(ticket, index)}
                  >
                    ↓ Download Ticket
                  </button>
                </div>

                {ticket.qrDataUrl && (
                  <img
                    src={ticket.qrDataUrl}
                    alt="Ticket QR Code"
                    className="ticket-qr"
                  />
                )}

              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => router.push("/")}
        >
          Back to Home
        </button>
      </div>
    </main>
  );
}