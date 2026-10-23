import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link  from "next/link";
import { getPublishedEvents } from "../services/event.service";
import { API_URL } from "../lib/api";
import "./HeroCarousel.css";


const HeroCarousel = () => {
  const [events, setEvents] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
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

        // Prioritize events with banners.
        const sortedEvents = [...eventList].sort(
          (a, b) =>
            Number(Boolean(b.bannerUrl)) -
            Number(Boolean(a.bannerUrl))
        );

        if (isMounted) {
          setEvents(sortedEvents);
          setCurrentIndex(0);
        }
      } catch (err) {
        console.error("Failed to load hero events:", err);

        if (isMounted) {
          setError("Unable to load featured events right now.");
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

  useEffect(() => {
    if (events.length < 2) return;

    const timer = setInterval(() => {
      setCurrentIndex((previous) => (previous + 1) % events.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [events.length]);

  const goToNext = () => {
    setCurrentIndex((previous) => (previous + 1) % events.length);
  };

  const goToPrevious = () => {
    setCurrentIndex((previous) =>
      previous === 0 ? events.length - 1 : previous - 1
    );
  };

  if (loading) {
    return (
      <section className="hero-carousel-wrapper">
        <div className="carousel-container carousel-message">
          Loading featured events...
        </div>
      </section>
    );
  }

  if (error || events.length === 0) {
    return (
      <section className="hero-carousel-wrapper">
        <div className="carousel-container carousel-message">
          {error || "No featured events available yet."}
        </div>
      </section>
    );
  }

  const activeEvent = events[currentIndex];

  const bannerUrl = activeEvent.bannerUrl
    ? activeEvent.bannerUrl.startsWith("http")
      ? activeEvent.bannerUrl
      : `${API_URL}${activeEvent.bannerUrl}`
    : "/favicon.svg";

  const formattedDate = activeEvent.startAt
    ? new Date(activeEvent.startAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date to be announced";

  const activeColor = "rgba(255, 0, 127, 0.22)";

  return (
    <div
      className="hero-carousel-wrapper"
      style={{
        background: `radial-gradient(circle at center, ${activeColor} 0%, transparent 70%)`,
      }}
    >
      <div className="carousel-container">
        <div
          className="carousel-track"
          style={{
            transform: `translateX(-${currentIndex * 100}%)`,
          }}
        >
          {events.map((event) => {
            const imageUrl = event.bannerUrl
              ? event.bannerUrl.startsWith("http")
                ? event.bannerUrl
                : `${API_URL}${event.bannerUrl}`
              : "/favicon.svg";

            return (
              <div className="carousel-slide" key={event._id || event.id || event.slug}>
                <Link
                  href={`/events/${event.slug}`}
                  className="hero-event-link"
                  aria-label={`View ${event.title}`}
                >
                  <img
                    src={imageUrl}
                    alt={event.title || "Featured Badvenu event"}
                    className="carousel-image"
                  />

                  <div className="hero-event-overlay">
                    <span className="hero-event-badge">
                      Featured Event
                    </span>

                    <h2>{event.title}</h2>

                    <p>
                      {event.venueName || "Venue TBA"}
                      {event.city ? ` · ${event.city}` : ""}
                    </p>

                    <p className="hero-event-date">{formattedDate}</p>

                    <span className="hero-event-cta">
                      Explore Event →
                    </span>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>

        {events.length > 1 && (
          <>
            <button
              type="button"
              className="carousel-nav prev-btn"
              onClick={goToPrevious}
              aria-label="Previous featured event"
            >
              <ChevronLeft size={32} />
            </button>

            <button
              type="button"
              className="carousel-nav next-btn"
              onClick={goToNext}
              aria-label="Next featured event"
            >
              <ChevronRight size={32} />
            </button>

            <div className="carousel-indicators">
              {events.map((event, index) => (
                <button
                  type="button"
                  key={event._id || event.id || event.slug}
                  className={`indicator ${
                    index === currentIndex ? "active" : ""
                  }`}
                  onClick={() => setCurrentIndex(index)}
                  aria-label={`Show event ${index + 1}`}
                  aria-current={index === currentIndex ? "true" : undefined}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HeroCarousel;