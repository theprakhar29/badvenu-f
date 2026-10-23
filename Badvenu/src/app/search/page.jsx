
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, MapPin, CalendarDays } from "lucide-react";
import Navbar from "../../components/Navbar";
import SubNav from "../../components/SubNav";
import Footer from "../../components/Footer";
import { getPublishedEvents } from "../../services/event.service";
import { API_URL } from "../../lib/api";
import "./search.css";

function formatDate(dateValue) {
  if (!dateValue) return "Date to be announced";

  const date = new Date(dateValue);

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

function getBannerUrl(bannerUrl) {
  if (!bannerUrl) return "";

  if (/^https?:\/\//i.test(bannerUrl)) return bannerUrl;

  return `${API_URL.replace(/\/$/, "")}/${bannerUrl.replace(/^\//, "")}`;
}

function SearchResults() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") || "").trim();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      if (!query) {
        setEvents([]);
        setError("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await getPublishedEvents({ q: query });

        if (cancelled) return;

        const list = Array.isArray(response)
          ? response
          : Array.isArray(response?.events)
            ? response.events
            : [];

        setEvents(list);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load search results.");
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadEvents();

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <main className="search-page">
      <div className="search-page-heading">
        <span className="search-page-eyebrow">DISCOVER BADVENU</span>
        <h1>Search events</h1>
        {query ? (
          <p>
            Results for <strong>&ldquo;{query}&rdquo;</strong>
          </p>
        ) : (
          <p>Search for a show, city, venue or event category.</p>
        )}
      </div>

      {!query && (
        <div className="search-state">
          <Search size={32} />
          <h2>What are you looking for?</h2>
          <p>Use the search bar above to discover your next experience.</p>
        </div>
      )}

      {loading && (
        <div className="search-state" role="status">
          <p>Finding events for you...</p>
        </div>
      )}

      {error && !loading && (
        <div className="search-state search-state-error" role="alert">
          <h2>Something went wrong</h2>
          <p>{error}</p>
          <button
            type="button"
            className="search-retry"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && query && events.length === 0 && (
        <div className="search-state">
          <Search size={32} />
          <h2>No events found</h2>
          <p>
            We couldn&apos;t find published events matching
            {" "}&ldquo;{query}&rdquo;. Try a different title, city or venue.
          </p>
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <>
          <p className="search-result-count">
            {events.length} {events.length === 1 ? "event" : "events"} found
          </p>

          <section className="search-results-grid">
            {events.map((event) => {
              const banner = getBannerUrl(event.bannerUrl);
              const price = getStartingPrice(event);

              return (
                <Link
                  href={`/events/${event.slug}`}
                  className="search-event-card"
                  key={event._id || event.slug}
                >
                  <div className="search-event-image">
                    {banner ? (
                      <img src={banner} alt={event.title || "Event banner"} />
                    ) : (
                      <div className="search-event-placeholder">
                        <CalendarDays size={32} />
                        <span>BADVENU</span>
                      </div>
                    )}
                  </div>

                  <div className="search-event-details">
                    <span className="search-event-category">
                      {(event.category || "EVENTS").replaceAll("_", " ")}
                    </span>

                    <h2>{event.title}</h2>

                    <p className="search-event-meta">
                      <CalendarDays size={15} />
                      {formatDate(event.startAt)}
                    </p>

                    {(event.venueName || event.city) && (
                      <p className="search-event-meta">
                        <MapPin size={15} />
                        {[event.venueName, event.city].filter(Boolean).join(", ")}
                      </p>
                    )}

                    <div className="search-event-bottom">
                      <span>
                        {price === null
                          ? "Price unavailable"
                          : price === 0
                            ? "Free"
                            : `From ₹${price.toLocaleString("en-IN")}`}
                      </span>
                      <span className="search-event-view">View event →</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}

export default function SearchPage() {
  return (
    <div className="app">
      <Navbar />
      <SubNav />
      <Suspense
        fallback={
          <main className="search-page">
            <div className="search-state">Loading search...</div>
          </main>
        }
      >
        <SearchResults />
      </Suspense>
      <Footer />
    </div>
  );
}