"use client";

import React, { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import SubNav from "../../components/SubNav";
import Footer from "../../components/Footer";
import {
  Settings,
  DollarSign,
  Calendar,
  MapPin,
  X,
  TicketCheck,
} from "lucide-react";
// import { getMyEvents } from "../../services/event.service.js";
import {
  getMyEvents,
  getEventStats,
  updateEventStatus,
} from "../../services/event.service.js";
import "./Dashboard.css";
import Link from "next/link";

export default function HostDashboard() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [eventStats, setEventStats] = useState(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({});

  // =========================================================
  // LOAD ORGANIZER EVENTS
  // =========================================================

  useEffect(() => {
    const loadEvents = async () => {
      try {
        setIsLoading(true);
        setError("");

        const data = await getMyEvents();

        console.log("📋 MY EVENTS:", data);

        // Backend normally returns an array.
        // This also protects us if the API returns { events: [...] }.
        const eventList = Array.isArray(data)
          ? data
          : data?.events || [];

        setEvents(eventList);

        if (eventList.length > 0) {
          setSelectedEvent(eventList[0]);
          setEditFormData(eventList[0]);
        }
      } catch (err) {
        console.error("❌ Failed to load events:", err);
        setError(err.message || "Failed to load events.");
      } finally {
        setIsLoading(false);
      }
    };

    loadEvents();
  }, []);


  // =========================================================
  // LOAD EVENTS STATS
  // =========================================================
  const loadEventStats = async (eventId) => {
    if (!eventId) return;

    try {
      setIsStatsLoading(true);

      const stats = await getEventStats(eventId);

      console.log("📊 EVENT STATS:", stats);

      setEventStats(stats);
    } catch (err) {
      console.error(
        "❌ Failed to load event statistics:",
        err
      );

      setEventStats(null);
    } finally {
      setIsStatsLoading(false); ticketsTotal
    }
  };

  useEffect(() => {
    if (selectedEvent?._id) {
      loadEventStats(selectedEvent._id);
    }
  }, [selectedEvent?._id]);
  // =========================================================
  // LOADING STATE
  // =========================================================

  if (isLoading) {
    return (
      <div className="host-dashboard-page">
        <Navbar />
        <SubNav />

        <main className="dashboard-main container">
          <div className="dashboard-header">
            <div>
              <h1>Dashboard</h1>
              <p>Loading your events...</p>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  // =========================================================
  // ERROR STATE
  // =========================================================

  if (error) {
    return (
      <div className="host-dashboard-page">
        <Navbar />
        <SubNav />

        <main className="dashboard-main container">
          <div className="dashboard-header">
            <div>
              <h1>Dashboard</h1>
              <p>There was a problem loading your events.</p>
            </div>
          </div>

          <div className="dashboard-card">
            <p style={{ color: "#ff4d6d" }}>{error}</p>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  const handlePublish = async () => {
    if (!selectedEvent?._id) return;

    try {
      setError("");

      const updatedEvent = await updateEventStatus(
        selectedEvent._id,
        "PUBLISHED"
      );

      console.log("✅ Event published:", updatedEvent);

      // Refresh events from backend
      const data = await getMyEvents();

      const eventList = Array.isArray(data)
        ? data
        : data?.events || [];

      setEvents(eventList);

      const updated =
        eventList.find(
          (event) => event._id === selectedEvent._id
        ) || updatedEvent;

      setSelectedEvent(updated);
    } catch (err) {
      console.error("❌ Publish failed:", err);
      setError(err.message || "Failed to publish event.");
    }
  };
  // =========================================================
  // NO EVENTS
  // =========================================================

  if (!selectedEvent) {
    return (
      <div className="host-dashboard-page">
        <Navbar />
        <SubNav />

        <main className="dashboard-main container">
          <div className="dashboard-header">
            <div>
              <h1>Dashboard</h1>
              <p>Manage your events, track sales, and edit details.</p>
            </div>
          </div>

          <div className="dashboard-card">
            <h2>No events yet</h2>
            <p>
              You haven't created any events yet. Create your first event to
              see it here.
            </p>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  // =========================================================
  // SELECTED EVENT DATA
  // =========================================================

  const event = selectedEvent;

  /*
   * Your backend may not currently provide real ticket-sales
   * analytics from /api/events/mine.
   *
   * Therefore we should NOT pretend these numbers are real.
   */
  const ticketsTotal =
    Number(eventStats?.totalTickets) || 0;

  const ticketsSold =
    Number(eventStats?.ticketsSold) || 0;

  const ticketsReserved =
    Number(eventStats?.ticketsReserved) || 0;

  const ticketsLeft =
    Number(eventStats?.ticketsRemaining) || 0;

  const confirmedBookings =
    Number(eventStats?.confirmedBookings) || 0;

  const moneyCollected =
    Number(eventStats?.totalRevenue) || 0;

  const progressPercent =
    Number(eventStats?.salesPercentage) || 0;

  const ticketsCheckedIn =
    Number(eventStats?.checkedInTickets) || 0;

  const attendancePercentage =
    Number(eventStats?.attendancePercentage) || 0;

  // =========================================================
  // DATE / TIME
  // =========================================================

  const eventDateObj = event.startAt
    ? new Date(event.startAt)
    : event.date
      ? new Date(event.date)
      : null;

  const formattedDate = eventDateObj
    ? eventDateObj.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    : "Date not available";

  const formattedTime = eventDateObj
    ? eventDateObj.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    })
    : "";

  const canEdit = eventDateObj
    ? new Date() < eventDateObj
    : true;

  // =========================================================
  // EDIT
  // =========================================================

  const handleEditChange = (e) => {
    const { name, value } = e.target;

    setEditFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();

    /*
     * IMPORTANT:
     * Your current backend does not have a general
     * PUT /api/events/:id endpoint.
     *
     * So don't pretend this saves to MongoDB yet.
     *
     * For now update the local dashboard display only.
     */
    setSelectedEvent(editFormData);

    setEvents((prev) =>
      prev.map((item) =>
        item._id === editFormData._id ? editFormData : item
      )
    );

    setIsEditModalOpen(false);
  };

  return (
    <div className="host-dashboard-page">
      <Navbar />
      <SubNav />

      <main className="dashboard-main container">

        {/* =====================================================
            HEADER
        ====================================================== */}

        <div className="dashboard-header">
          <div>
            <h1>Dashboard</h1>
            <p>
              Manage your events, track sales, and edit details.
            </p>
          </div>

          <button
            className="btn-primary edit-btn"
            onClick={() => {
              setEditFormData(event);
              setIsEditModalOpen(true);
            }}
            disabled={!canEdit}
            title={
              !canEdit
                ? "Editing is only allowed before the event."
                : "Edit event details"
            }
          >
            <Settings size={18} />
            Edit Event Details
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => loadEventStats(event._id)}
            disabled={isStatsLoading}
          >
            {isStatsLoading ? "Refreshing..." : "Refresh Statistics"}
          </button>
        </div>

        {!canEdit && (
          <div className="edit-warning">
            Editing is disabled because the event has already started or
            passed.
          </div>
        )}

        {/* =====================================================
            EVENT SELECTOR
        ====================================================== */}

        {events.length > 1 && (
          <div className="dashboard-card">
            <label htmlFor="event-selector">
              Select Event
            </label>

            <select
              id="event-selector"
              value={event._id}
              onChange={(e) => {
                const selected = events.find(
                  (item) => item._id === e.target.value
                );

                if (selected) {
                  setSelectedEvent(selected);
                  setEditFormData(selected);
                }
              }}
            >
              {events.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* =====================================================
            DASHBOARD GRID
        ====================================================== */}

        <div className="dashboard-grid">

          {/* EVENT OVERVIEW */}


          <div className="dashboard-card event-overview">
            <div className="card-header">
              <h2>{event.title}</h2>

              <span className="status-badge">
                {event.status === "DRAFT" && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handlePublish}
                  >
                    Publish Event
                  </button>

                )}
                <Link href={`/host-dashboard/scanner/${event._id}`}
                  className="btn-secondary"
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  Scan Tickets
                </Link>
              </span>
            </div>

            <div className="event-meta">
              <div>
                <Calendar size={16} />

                {formattedDate}

                {formattedTime && ` @ ${formattedTime}`}
              </div>

              <div>
                <MapPin size={16} />

                {event.venueName ||
                  event.venue ||
                  "Venue not specified"}
              </div>

              {event.city && (
                <div>
                  <MapPin size={16} />
                  {event.city}
                </div>

              )}



            </div>

            <div className="progress-container">
              <div className="progress-labels">
                <span>Tickets Sold</span>

                <span>
                  {ticketsSold} / {ticketsTotal}
                </span>
              </div>

              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${progressPercent}%`,
                  }}
                />

              </div>

            </div>

            <div className="ticket-breakdown">
              <span>
                Sold: <strong>{ticketsSold}</strong>
              </span>

              <span>
                Reserved: <strong>{ticketsReserved}</strong>
              </span>

              <span>
                Remaining: <strong>{ticketsLeft}</strong>
              </span>
            </div>
          </div>

          {/* CONFIRMED BOOKINGS */}

          <div className="dashboard-card stat-card">
            <div className="stat-icon">
              <Calendar size={24} />
            </div>

            <div className="stat-info">
              <span className="stat-label">
                Confirmed Bookings
              </span>

              <span className="stat-value">
                {isStatsLoading
                  ? "..."
                  : confirmedBookings}
              </span>
            </div>
          </div>


          {/* TICKETS REMAINING */}

          <div className="dashboard-card stat-card">
            <div className="stat-icon">
              <Settings size={24} />
            </div>

            <div className="stat-info">
              <span className="stat-label">
                Tickets Remaining
              </span>

              <span className="stat-value">
                {isStatsLoading
                  ? "..."
                  : ticketsLeft}
              </span>
            </div>
          </div>


          {/* MONEY */}

          <div className="dashboard-card stat-card highlight">
            <div className="stat-icon">
              <DollarSign size={24} />
            </div>

            <div className="stat-info">
              <span className="stat-label">
                Money Collected
              </span>

              <span className="stat-value">
                ₹
                {moneyCollected.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

        </div>


        {/* TICKETS CHECKED IN */}
        <div className="dashboard-card stat-card">
          <div className="stat-icon">
            <TicketCheck size={24} />
          </div>

          <div className="stat-info">
            <span className="stat-label">
              Tickets Checked In
            </span>

            <span className="stat-value">
              {isStatsLoading ? "..." : ticketsCheckedIn}
            </span>

            <span className="stat-label">
              {isStatsLoading
                ? "Loading attendance..."
                : `${attendancePercentage}% of tickets sold (proportion of sold tickets that have been checked in)`}
            </span>
          </div>
        </div>


        {/* =====================================================
            EDIT MODAL
        ====================================================== */}

        {isEditModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content animate-in">

              <div className="modal-header">
                <h2>Edit Event Details</h2>

                <button
                  className="close-btn"
                  onClick={() =>
                    setIsEditModalOpen(false)
                  }
                  type="button"
                >
                  <X size={24} />
                </button>
              </div>

              <form
                onSubmit={handleEditSubmit}
                className="edit-form"
              >

                <div className="form-group">
                  <label>Event Title</label>

                  <input
                    type="text"
                    name="title"
                    value={editFormData.title || ""}
                    onChange={handleEditChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Venue</label>

                  <input
                    type="text"
                    name="venueName"
                    value={editFormData.venueName || ""}
                    onChange={handleEditChange}
                  />
                </div>

                <div className="form-group">
                  <label>City</label>

                  <input
                    type="text"
                    name="city"
                    value={editFormData.city || ""}
                    onChange={handleEditChange}
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>

                  <textarea
                    name="description"
                    value={editFormData.description || ""}
                    onChange={handleEditChange}
                    rows="3"
                  />
                </div>

                <div className="modal-actions">

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setIsEditModalOpen(false)
                    }
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="btn-primary"
                  >
                    Save Changes
                  </button>

                </div>

              </form>
            </div>
          </div>
        )}

      </main>

      <Footer />
    </div>
  );
}