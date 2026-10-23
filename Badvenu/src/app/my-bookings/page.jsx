
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCustomerBookings } from "../../services/customer.service";
import "./page.css";

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function formatDate(date) {
  if (!date) return "Date not available";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Date not available";
  }

  return parsedDate.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// function getStatusClass(status) {
//   const normalized = String(status || "").toUpperCase();

//   if (["CONFIRMED", "PAID", "SUCCESS"].includes(normalized)) {
//     return "booking-status status-success";
//   }

//   if (["PENDING", "PROCESSING"].includes(normalized)) {
//     return "booking-status status-pending";
//   }

//   if (["FAILED", "CANCELLED", "EXPIRED"].includes(normalized)) {
//     return "booking-status status-failed";
//   }

//   return "booking-status";
// }

function getStatusClass(status) {
  const normalized = String(status || "").toUpperCase();

  switch (normalized) {
    case "CONFIRMED":
    case "PAID":
    case "SUCCESS":
    case "UNUSED":
    case "VALID":
      return "status-success";

    case "PENDING":
    case "PROCESSING":
      return "status-pending";

    case "USED":
      return "status-used";

    case "VOID":
    case "FAILED":
    case "CANCELLED":
    case "EXPIRED":
    case "INVALID":
    case "NOT_AUTHORIZED":
    case "ALREADY_USED":
      return "status-danger";

    default:
      return "status-unknown";
  }
}

function getTicketStatusLabel(status) {
  const normalized = String(status || "").toUpperCase();

  switch (normalized) {
    case "UNUSED":
      return "Valid — Ready to use";
    case "USED":
      return "Used — Entry recorded";
    case "VOID":
      return "Invalid ticket";
    default:
      return normalized || "Status unavailable";
  }
}

function getTicketCount(items) {
  if (!Array.isArray(items)) return 0;

  return items.reduce(
    (total, item) => total + (Number(item.quantity) || 0),
    0
  );
}

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);


  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };

      return entities[char];
    });
  }

  function downloadTicket(ticket, booking, event, index) {
    const qrDataUrl = ticket?.qrDataUrl;

    if (
      typeof qrDataUrl !== "string" ||
      !/^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(
        qrDataUrl
      )
    ) {
      window.alert(
        "The QR code is unavailable for this ticket. Please refresh and try again."
      );
      return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      window.alert(
        "Your browser blocked the ticket window. Please allow pop-ups and try again."
      );
      return;
    }

    const eventTitle = escapeHtml(event?.title || "Badvenu Event");
    const ticketType = escapeHtml(ticket?.tierName || `Ticket ${index + 1}`);
    const bookingReference = escapeHtml(
      booking?.id || booking?._id || "Not available"
    );
    const eventDate = escapeHtml(formatDate(event?.startAt));
    const venue = escapeHtml(
      [event?.venueName, event?.city].filter(Boolean).join(" · ") ||
      "Venue details unavailable"
    );
    const ticketStatus = escapeHtml(ticket?.status || "Unknown");
    const qrImage = qrDataUrl.replace(/\s/g, "");

    printWindow.document.open();
    printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${eventTitle} - ${ticketType}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 32px;
            font-family: Arial, sans-serif;
            color: #202027;
            background: #f5f5f7;
          }
          .ticket {
            max-width: 650px;
            margin: 0 auto;
            padding: 30px;
            border: 1px solid #dedee5;
            border-radius: 16px;
            background: white;
          }
          .brand {
            color: #b5283d;
            font-size: 22px;
            font-weight: 800;
          }
          h1 {
            margin: 24px 0 8px;
            font-size: 28px;
            overflow-wrap: anywhere;
          }
          .muted { color: #666670; line-height: 1.6; }
          .details {
            margin-top: 24px;
            border-top: 1px solid #e8e8ed;
          }
          .detail {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            padding: 14px 0;
            border-bottom: 1px solid #e8e8ed;
          }
          .detail span { color: #666670; }
          .detail strong { text-align: right; overflow-wrap: anywhere; }
          .qr {
            display: block;
            width: 220px;
            height: 220px;
            margin: 24px auto 12px;
            object-fit: contain;
          }
          .scan-note { text-align: center; font-size: 13px; }
          .reference {
            margin-top: 24px;
            font-size: 12px;
            overflow-wrap: anywhere;
          }
          .actions {
            margin-top: 24px;
            text-align: center;
          }
          button {
            padding: 12px 20px;
            border: 0;
            border-radius: 8px;
            background: #b5283d;
            color: white;
            font-weight: bold;
            cursor: pointer;
          }
          @media print {
            body { padding: 0; background: white; }
            .ticket { border: 0; border-radius: 0; padding: 12px; }
            .actions { display: none; }
          }
        </style>
      </head>
      <body>
        <main class="ticket">
          <div class="brand">badvenu</div>
          <h1>${eventTitle}</h1>
          <p class="muted">${eventDate}</p>
          <p class="muted">${venue}</p>

          <div class="details">
            <div class="detail">
              <span>Ticket type</span>
              <strong>${ticketType}</strong>
            </div>
            <div class="detail">
              <span>Ticket status</span>
              <strong>${ticketStatus}</strong>
            </div>
            <div class="detail">
              <span>Booking reference</span>
              <strong>${bookingReference}</strong>
            </div>
          </div>

          <img class="qr" src="${qrImage}" alt="Ticket QR code" />
          <p class="muted scan-note">
            Present this QR code at the event entrance.
          </p>

          <div class="reference">
            Keep this ticket safe. Entry is subject to successful validation
            by the event organiser.
          </div>

          <div class="actions">
            <button onclick="window.print()">Print / Save as PDF</button>
          </div>
        </main>
        <script>
          window.addEventListener("load", () => {
            const qr = document.querySelector(".qr");
            const printWhenReady = () => {
              setTimeout(() => window.print(), 300);
            };

            if (qr.complete && qr.naturalWidth > 0) {
              printWhenReady();
            } else {
              qr.addEventListener("load", printWhenReady, { once: true });
              qr.addEventListener("error", () => {
                document.querySelector(".scan-note").textContent =
                  "QR image failed to load. Return to Badvenu and try again.";
              }, { once: true });
            }
          });
        </script>
      </body>
    </html>
  `);
    printWindow.document.close();
  }

  useEffect(() => {
    let cancelled = false;

    async function loadBookings() {
      try {
        setIsLoading(true);
        setError("");
        setNeedsSignIn(false);

        const result = await getCustomerBookings();

        if (!cancelled) {
          setBookings(
            Array.isArray(result?.bookings) ? result.bookings : []
          );
        }
      } catch (err) {
        if (cancelled) return;

        const message = err?.message || "Unable to load your bookings.";

        if (
          message.includes("401") ||
          /unauthorized|not authenticated|authentication required/i.test(
            message
          )
        ) {
          setNeedsSignIn(true);
        } else {
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadBookings();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="my-bookings-page">
      <div className="my-bookings-container">
        <header className="my-bookings-header">
          <div>
            <p className="my-bookings-eyebrow">YOUR BADVENU ACCOUNT</p>
            <h1>My Bookings</h1>
            <p className="my-bookings-subtitle">
              Your events, bookings, and ticket details in one place.
            </p>
          </div>

          <Link href="/" className="bookings-back-link">
            Explore events
          </Link>
        </header>

        {isLoading && (
          <section className="bookings-message">
            <div className="bookings-spinner" />
            <h2>Loading your bookings...</h2>
            <p>Please wait while we fetch your booking details.</p>
          </section>
        )}

        {!isLoading && needsSignIn && (
          <section className="bookings-message">
            <div className="bookings-message-icon">🔐</div>
            <h2>Sign in to view your bookings</h2>
            <p>
              Sign in with the email address you used when booking your
              tickets. You can open Sign In from the homepage.
            </p>
            <Link href="/" className="bookings-primary-button">
              Go to homepage and sign in
            </Link>
          </section>
        )}

        {!isLoading && !needsSignIn && error && (
          <section className="bookings-message">
            <div className="bookings-message-icon">!</div>
            <h2>We couldn’t load your bookings</h2>
            <p>{error}</p>
            <button
              type="button"
              className="bookings-primary-button"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </section>
        )}

        {!isLoading &&
          !needsSignIn &&
          !error &&
          bookings.length === 0 && (
            <section className="bookings-message">
              <div className="bookings-message-icon">🎟️</div>
              <h2>No bookings yet</h2>
              <p>
                When you book an event using your verified email address,
                your bookings will appear here.
              </p>
              <Link href="/" className="bookings-primary-button">
                Discover events
              </Link>
            </section>
          )}

        {!isLoading &&
          !needsSignIn &&
          !error &&
          bookings.length > 0 && (
            <section className="bookings-list">
              <div className="bookings-list-heading">
                <h2>Your tickets and reservations</h2>
                <span>
                  {bookings.length}{" "}
                  {bookings.length === 1 ? "booking" : "bookings"}
                </span>
              </div>

              {bookings.map((booking) => {
                const event = booking.event || {};
                const tickets = Array.isArray(booking.tickets)
                  ? booking.tickets
                  : [];

                const ticketCount =
                  tickets.length > 0
                    ? tickets.length
                    : getTicketCount(booking.items);

                return (
                  <article
                    className="booking-card"
                    key={booking.id || booking._id}
                  >
                    <div className="booking-card-top">
                      <div className="booking-event-details">
                        <p className="booking-event-label">EVENT</p>
                        <h3>{event.title || "Event details unavailable"}</h3>
                        <p className="booking-event-date">
                          {formatDate(event.startAt)}
                        </p>
                        {(event.venueName || event.city) && (
                          <p className="booking-event-venue">
                            {[event.venueName, event.city]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>

                      <span className={getStatusClass(booking.status)}>
                        {booking.status || "Unknown"}
                      </span>
                    </div>

                    <div className="booking-card-divider" />

                    <div className="booking-summary">
                      <div className="booking-summary-item">
                        <span>Booking date</span>
                        <strong>{formatDate(booking.createdAt)}</strong>
                      </div>

                      <div className="booking-summary-item">
                        <span>Tickets</span>
                        <strong>
                          {ticketCount}{" "}
                          {ticketCount === 1 ? "ticket" : "tickets"}
                        </strong>
                      </div>

                      <div className="booking-summary-item">
                        <span>Total amount</span>
                        <strong className="booking-total">
                          {formatCurrency(booking.totalAmount)}
                        </strong>
                      </div>
                    </div>

                    {booking.id && (
                      <p className="booking-reference">
                        Booking reference: {booking.id}
                      </p>
                    )}

                    {tickets.length > 0 && (
                      <div className="booking-ticket-list">
                        <h4>Ticket overview</h4>

                        {tickets.map((ticket, index) => (
                          <div
                            className="booking-ticket-row"
                            key={ticket.id || ticket._id || index}
                          >

                            <div className="booking-ticket-info">
                              <div>
                                <strong>
                                  {ticket.tierName || `Ticket ${index + 1}`}
                                </strong>
                                <span>
                                  {ticket.usedAt
                                    ? `Used on ${formatDate(ticket.usedAt)}`
                                    : "Present this QR code at the entrance"}
                                </span>
                              </div>

                              {typeof ticket.qrDataUrl === "string" &&
                                ticket.qrDataUrl.startsWith("data:image/") ? (
                                <img
                                  className="booking-ticket-qr"
                                  src={ticket.qrDataUrl}
                                  alt={`QR code for ${ticket.tierName || "ticket"}`}
                                  width={180}
                                  height={180}
                                />
                              ) : (
                                <p className="booking-qr-unavailable">
                                  QR code unavailable
                                </p>
                              )}
                            </div>


                            <span
                              className={`booking-status ${getStatusClass(ticket.status)}`}
                              role="status"
                            >
                              {getTicketStatusLabel(ticket.status)}
                            </span>

                            <button
                              type="button"
                              className="booking-download-button"
                              onClick={() => downloadTicket(ticket, booking, event, index)}
                            >
                              <span aria-hidden="true">↓</span>
                              Print / Save as PDF
                            </button>

                          </div>

                        ))}

                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          )}
      </div>
    </main>
  );
}
