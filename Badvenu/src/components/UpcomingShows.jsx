"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getPublishedEvents } from "../services/event.service";
import "./LiveEvents.css";

const UpcomingShows = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const data = await getPublishedEvents();

        console.log("🏠 PUBLIC EVENTS:", data);

        const eventList = Array.isArray(data)
          ? data
          : data?.events || [];

        setEvents(eventList);
      } catch (err) {
        console.error("❌ Failed to load events:", err);
        setError(err.message || "Failed to load events");
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, []);

  if (loading) {
    return (
      <section className="live-events-container">
        <div className="container">
          <h2 className="events-title">
            Upcoming Shows and Events
          </h2>

          <p>Loading events...</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="live-events-container">
        <div className="container">
          <h2 className="events-title">
            Upcoming Shows and Events
          </h2>

          <p>Unable to load events right now.</p>
        </div>
      </section>
    );
  }

  if (events.length === 0) {
    return (
      <section className="live-events-container">
        <div className="container">
          <h2 className="events-title">
            Upcoming Shows and Events
          </h2>

          <p>No published events available yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="live-events-container">
      <div className="container">

        <h2 className="events-title">
          Upcoming Shows and Events
        </h2>

        <div className="events-grid">

          {events.map((event) => {

            const eventDate = event.startAt
              ? new Date(event.startAt)
              : null;

            const formattedDate = eventDate
              ? eventDate.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "Date TBA";

            const formattedTime = eventDate
              ? eventDate.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";

            const lowestPrice =
              event.pricingTiers?.length > 0
                ? Math.min(
                    ...event.pricingTiers.map(
                      (tier) => Number(tier.price) || 0
                    )
                  )
                : null;

            const eventUrl = `/events/${event.slug}`;

            return (
              <Link
                href={eventUrl}
                key={event._id}
                className="event-card"
              >

                {/* Banner */}
                <div className="event-image-wrapper">
                  <img
                    src={
                      event.bannerUrl
                        ? `${process.env.NEXT_PUBLIC_API_URL}${event.bannerUrl}`
                        : "/favicon.svg"
                    }
                    alt={event.title}
                    className="event-img"
                  />
                </div>

                {/* Event information */}
                <div className="event-card-content">

                  <h3 className="event-card-title">
                    {event.title}
                  </h3>

                  <div className="event-card-info">

                    <p>
                      📅 {formattedDate}
                    </p>

                    {formattedTime && (
                      <p>
                        🕐 {formattedTime}
                      </p>
                    )}

                    <p>
                      📍 {event.venueName || "Venue TBA"}
                      {event.city
                        ? `, ${event.city}`
                        : ""}
                    </p>

                  </div>

                  {lowestPrice !== null && (
                    <div className="event-card-price">
                      From ₹{lowestPrice}
                    </div>
                  )}

                  <div className="event-card-action">
                  <button className="btn-primary" style={{ alignSelf: 'flex-start', padding: '8px 20px', fontSize: '12px' }}>Book Ticket</button>
                  </div>

                </div>

              </Link>
            );
          })}

        </div>
      </div>
    </section>
  );
};

export default UpcomingShows;