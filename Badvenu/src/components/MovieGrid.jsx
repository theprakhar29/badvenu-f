"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getPublishedEvents } from "../services/event.service";
import { API_URL } from "../lib/api";
import "./MovieGrid.css";

const MovieGrid = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      try {
        const response = await getPublishedEvents();

        const eventList = Array.isArray(response)
          ? response
          : response?.events || [];

        // Prefer events with banner images, then show up to five.
        const recommended = [...eventList]
          .sort(
            (a, b) =>
              Number(Boolean(b.bannerUrl)) -
              Number(Boolean(a.bannerUrl))
          )
          .slice(0, 5);

        if (isMounted) {
          setEvents(recommended);
        }
      } catch (err) {
        console.error("Failed to load recommendations:", err);

        if (isMounted) {
          setError("Recommendations are temporarily unavailable.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadEvents();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="section-container">
      <div className="container">
        <div className="section-header flex items-center justify-between">
          <h2 className="section-title">
            Recommendations of the Week
          </h2>

          <Link href="/category/events" className="see-all flex items-center">
            Explore Events <ChevronRight size={16} />
          </Link>
        </div>

        {loading && <p>Finding events for you...</p>}

        {!loading && error && <p>{error}</p>}

        {!loading && !error && events.length === 0 && (
          <p>No published events to recommend yet. Check back soon!</p>
        )}

        {!loading && !error && events.length > 0 && (
          <div className="movie-grid">
            {events.map((event) => {
              const eventDate = event.startAt
                ? new Date(event.startAt)
                : null;

              const dateLabel =
                eventDate && !Number.isNaN(eventDate.getTime())
                  ? eventDate.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "Date to be announced";

              const prices = (event.pricingTiers || [])
                .map((tier) => Number(tier.price))
                .filter((price) => Number.isFinite(price) && price >= 0);

              const lowestPrice =
                prices.length > 0 ? Math.min(...prices) : null;

              const imageUrl = event.bannerUrl
                ? event.bannerUrl.startsWith("http")
                  ? event.bannerUrl
                  : `${API_URL}${event.bannerUrl}`
                : "/favicon.svg";

              return (
                <Link
                  href={`/events/${event.slug}`}
                  key={event._id || event.id || event.slug}
                  className="movie-card"
                >
                  <div className="img-container">
                    <img
                      src={imageUrl}
                      alt={event.title || "Badvenu event"}
                      className="movie-poster"
                    />

                    <div className="rating-bar">
                      <span className="rating-score">
                        {event.category || "EVENT"}
                      </span>
                    </div>
                  </div>

                  <div className="movie-details">
                    <h3 className="movie-title" title={event.title}>
                      {event.title}
                    </h3>

                    <p className="movie-genre">{dateLabel}</p>

                    <p className="movie-genre">
                      {event.venueName || "Venue TBA"}
                      {event.city ? ` · ${event.city}` : ""}
                    </p>

                    <p className="movie-genre">
                      {lowestPrice !== null
                        ? `Starting from ₹${lowestPrice}`
                        : "Check ticket prices"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default MovieGrid;