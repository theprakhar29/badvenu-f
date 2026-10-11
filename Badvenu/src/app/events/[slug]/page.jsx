"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPublishedEventBySlug } from "../../../services/event.service";
import "./slug.css"

const EventDetailsPage = () => {
  const params = useParams();
  const router = useRouter();

  const slug = params?.slug;

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;

    const loadEvent = async () => {
      try {
        console.log("🎫 Loading event:", slug);

        const data = await getPublishedEventBySlug(slug);

        console.log("🎫 EVENT DETAILS:", data);

        setEvent(data);
      } catch (err) {
        console.error("❌ Failed to load event:", err);
        setError(err.message || "Failed to load event.");
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [slug]);

  if (loading) {
    return (
      <main className="container" style={{ padding: "60px 20px" }}>
        <p>Loading event...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container" style={{ padding: "60px 20px" }}>
        <h1>Event not found</h1>
        <p>{error}</p>

        <button
          type="button"
          className="btn-primary"
          onClick={() => router.push("/")}
          style={{ marginTop: "20px" }}
        >
          Back to Events
        </button>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="container" style={{ padding: "60px 20px" }}>
        <h1>Event not found</h1>
      </main>
    );
  }

  const eventDate = event.startAt
    ? new Date(event.startAt)
    : null;

  const formattedDate = eventDate
    ? eventDate.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Date TBA";

  const formattedTime = eventDate
    ? eventDate.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Time TBA";

  const lowestPrice =
    event.pricingTiers?.length > 0
      ? Math.min(
          ...event.pricingTiers.map(
            (tier) => Number(tier.price) || 0
          )
        )
      : null;

  const bannerUrl = event.bannerUrl
    ? `${process.env.NEXT_PUBLIC_API_URL}${event.bannerUrl}`
    : "/favicon.svg";

  return (
    <main className="event-details-page">
      <div className="container">
        {/* Banner */}
        <div className="event-details-banner">
          <img
            src={bannerUrl}
            alt={event.title}
            className="event-details-image"
          />
        </div>

        {/* Main content */}
        <div className="event-details-layout">

          {/* Left side */}
          <section className="event-details-main">
            <h1>{event.title}</h1>

            {event.description && (
              <div className="event-description">
                <h2>About the Event</h2>
                <p>{event.description}</p>
              </div>
            )}

            <div className="event-information">
              <h2>Event Details</h2>

              <div className="event-info-item">
                <strong>📅 Date</strong>
                <span>{formattedDate}</span>
              </div>

              <div className="event-info-item">
                <strong>🕐 Time</strong>
                <span>{formattedTime}</span>
              </div>

              <div className="event-info-item">
                <strong>📍 Venue</strong>
                <span>
                  {event.venueName || "Venue TBA"}
                  {event.city ? `, ${event.city}` : ""}
                </span>
              </div>

              <div className="event-info-item">
                <strong>👥 Capacity</strong>
                <span>{event.capacity || "Not specified"}</span>
              </div>
            </div>
          </section>

          {/* Right side */}
          <aside className="event-booking-card">
            <h2>Book Your Tickets</h2>

            {lowestPrice !== null && (
              <div className="event-starting-price">
                <span>Tickets starting from</span>
                <strong>₹{lowestPrice}</strong>
              </div>
            )}

            <div className="ticket-summary">
              {event.pricingTiers?.map((tier) => (
                <div
                  key={tier._id || tier.name}
                  className="ticket-tier"
                >
                  <div>
                    <strong>{tier.name}</strong>
                    <p>
                      ₹{tier.price} per ticket
                    </p>
                  </div>

                  <div className="ticket-availability">
                    {Math.max(
                      0,
                      Number(tier.totalQty || 0) -
                        Number(tier.soldQty || 0) -
                        Number(tier.reservedQty || 0)
                    )}{" "}
                    left
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn-primary booking-button"
              onClick={() =>
                router.push(`/events/${event.slug}/book`)
              }
            >
              Book Tickets
            </button>
          </aside>
        </div>
      </div>
    </main>
  );
};

export default EventDetailsPage;