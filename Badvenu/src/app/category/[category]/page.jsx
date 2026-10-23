
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getPublishedEvents } from "../../../services/event.service";
import { API_URL } from "../../../lib/api";
import "./category.css";

const CATEGORIES = {
  plays: { title: "Plays", category: "PLAYS" },
  "stand-up": { title: "Stand-Up Comedy", category: "STAND_UP" },
  sports: { title: "Sports", category: "SPORTS" },
  events: { title: "Events & Concerts", category: "EVENTS" },
  activities: { title: "Activities & Workshops", category: "ACTIVITIES" },
};

function formatEventDate(value) {
  if (!value) return "Date to be announced";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date to be announced";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getStartingPrice(event) {
  const prices = (event.pricingTiers || [])
    .map((tier) => Number(tier.price))
    .filter((price) => Number.isFinite(price) && price >= 0);

  return prices.length ? Math.min(...prices) : null;
}

function getBannerUrl(event) {
  if (!event.bannerUrl) return null;

  if (/^https?:\/\//i.test(event.bannerUrl)) {
    return event.bannerUrl;
  }

  return `${API_URL}${event.bannerUrl.startsWith("/") ? "" : "/"}${event.bannerUrl}`;
}

export default function CategoryPage() {
  const params = useParams();
  const categorySlug = String(params?.category || "").toLowerCase();
  const config = CATEGORIES[categorySlug];

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      if (!config) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await getPublishedEvents({
          category: config.category,
        });

        const list = Array.isArray(response)
          ? response
          : response?.events || [];

        if (!cancelled) {
          setEvents(list);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load events.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadEvents();

    return () => {
      cancelled = true;
    };
  }, [categorySlug]);

  if (!config) {
    return (
      <main className="category-page">
        <div className="category-container">
          <h1>Category not found</h1>
          <Link href="/">Return to Badvenu</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="category-page">
      <div className="category-container">
        <nav className="category-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span>{config.title}</span>
        </nav>

        <header className="category-header">
          <p className="category-eyebrow">DISCOVER ON BADVENU</p>
          <h1>{config.title}</h1>
          <p>Find your next experience, all in one place.</p>
        </header>

        {loading && (
          <p className="category-message" role="status">
            Loading events...
          </p>
        )}

        {!loading && error && (
          <div className="category-message category-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="category-empty">
            <h2>Nothing listed here yet</h2>
            <p>
              We don't have any published events in this category right now.
              Please check back soon.
            </p>
            <Link href="/">Explore all events</Link>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <>
            <p className="category-result-count">
              {events.length} {events.length === 1 ? "event" : "events"}
            </p>

            <div className="category-grid">
              {events.map((event) => {
                const price = getStartingPrice(event);
                const banner = getBannerUrl(event);

                return (
                  <Link
                    href={`/events/${event.slug}`}
                    className="category-event-card"
                    key={event._id || event.id || event.slug}
                  >
                    <div className="category-event-image">
                      {banner ? (
                        <img
                          src={banner}
                          alt={event.title || "Event"}
                          loading="lazy"
                        />
                      ) : (
                        <div className="category-image-placeholder">
                          BADVENU
                        </div>
                      )}
                    </div>

                    <div className="category-event-content">
                      <h2>{event.title}</h2>

                      <p className="category-event-date">
                        {formatEventDate(event.startAt)}
                      </p>

                      <p className="category-event-location">
                        {[event.venueName, event.city]
                          .filter(Boolean)
                          .join(", ") || "Location to be announced"}
                      </p>

                      <div className="category-event-footer">
                        <span>
                          {price !== null
                            ? `From ₹${price}`
                            : "Price to be announced"}
                        </span>
                        <span aria-hidden="true">→</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
