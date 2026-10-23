"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UserRound,
  Mail,
  Ticket,
  CalendarDays,
  ShieldCheck,
  LogOut,
  ArrowRight,
} from "lucide-react";
import Navbar from "../../components/Navbar";
import SubNav from "../../components/SubNav";
import Footer from "../../components/Footer";
import {
  getCustomerProfile,
  getCustomerBookings,
  logoutCustomer,
} from "../../services/customer.service";
import "./profile.css";

function formatDate(value) {
  if (!value) return "Date not available";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date not available";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function isSignInError(error) {
  return (
    String(error?.message || "").includes("401") ||
    /unauthorized|not authenticated|authentication required/i.test(
      String(error?.message || "")
    )
  );
}

export default function CustomerProfilePage() {
  const router = useRouter();

  const [customer, setCustomer] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError("");
      setSignInRequired(false);

      try {
        const profileResult = await getCustomerProfile();

        if (cancelled) return;

        const currentCustomer = profileResult?.customer;

        if (!currentCustomer) {
          throw new Error("Customer profile was not returned by the server.");
        }

        setCustomer(currentCustomer);

        try {
          const bookingResult = await getCustomerBookings();

          if (!cancelled) {
            setBookings(
              Array.isArray(bookingResult?.bookings)
                ? bookingResult.bookings
                : []
            );
          }
        } catch (bookingError) {
          if (cancelled) return;

          if (isSignInError(bookingError)) {
            setSignInRequired(true);
            return;
          }

          setError(
            bookingError.message ||
              "Your profile loaded, but bookings could not be loaded."
          );
        }
      } catch (profileError) {
        if (cancelled) return;

        if (isSignInError(profileError)) {
          setSignInRequired(true);
        } else {
          setError(
            profileError.message || "Could not load your customer profile."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    setError("");

    try {
      await logoutCustomer();
      router.replace("/");
      router.refresh();
    } catch (logoutError) {
      setError(
        logoutError.message ||
          "Could not sign out. Please try again."
      );
    } finally {
      setLoggingOut(false);
    }
  }

  const confirmedBookings = bookings.filter((booking) =>
    ["CONFIRMED", "PAID", "SUCCESS"].includes(
      String(booking.status || "").toUpperCase()
    )
  );

  const totalSpent = confirmedBookings.reduce(
    (sum, booking) => sum + (Number(booking.totalAmount) || 0),
    0
  );

  const ticketCount = bookings.reduce((sum, booking) => {
    if (Array.isArray(booking.tickets) && booking.tickets.length > 0) {
      return sum + booking.tickets.length;
    }

    return (
      sum +
      (Array.isArray(booking.items)
        ? booking.items.reduce(
            (total, item) => total + (Number(item.quantity) || 0),
            0
          )
        : 0)
    );
  }, 0);

  return (
    <div className="app">
      <Navbar />
      <SubNav />

      <main className="customer-profile-page">
        <header className="customer-profile-header">
          <span className="customer-profile-eyebrow">YOUR BADVENU ACCOUNT</span>
          <h1>My profile</h1>
          <p>Manage your account and keep track of your event experiences.</p>
        </header>

        {loading ? (
          <section className="profile-state" role="status">
            Loading your profile...
          </section>
        ) : signInRequired ? (
          <section className="profile-state">
            <UserRound size={38} />
            <h2>Sign in to view your profile</h2>
            <p>Your profile and bookings are available after customer sign-in.</p>
            <Link className="profile-primary-button" href="/">
              Go to Badvenu and sign in
            </Link>
          </section>
        ) : (
          <>
            {error && (
              <div className="profile-alert" role="alert">
                {error}
                <button type="button" onClick={() => window.location.reload()}>
                  Try again
                </button>
              </div>
            )}

            {customer && (
              <>
                <section className="profile-account-card">
                  <div className="profile-avatar">
                    <UserRound size={34} />
                  </div>

                  <div className="profile-account-info">
                    <h2>{customer.name || "Badvenu Customer"}</h2>
                    <p>
                      <Mail size={15} />
                      {customer.email}
                    </p>
                    <span
                      className={
                        customer.emailVerified
                          ? "profile-verification verified"
                          : "profile-verification"
                      }
                    >
                      <ShieldCheck size={14} />
                      {customer.emailVerified
                        ? "Email verified"
                        : "Email verification status unavailable"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="profile-logout-button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                  >
                    <LogOut size={16} />
                    {loggingOut ? "Signing out..." : "Sign out"}
                  </button>
                </section>

                <section className="profile-stats-grid">
                  <article className="profile-stat-card">
                    <Ticket size={22} />
                    <span>Total tickets</span>
                    <strong>{ticketCount}</strong>
                  </article>

                  <article className="profile-stat-card">
                    <CalendarDays size={22} />
                    <span>Total bookings</span>
                    <strong>{bookings.length}</strong>
                  </article>

                  <article className="profile-stat-card">
                    <ShieldCheck size={22} />
                    <span>Confirmed spend</span>
                    <strong>{formatCurrency(totalSpent)}</strong>
                  </article>
                </section>

                <section className="profile-bookings-section">
                  <div className="profile-section-heading">
                    <div>
                      <h2>Recent bookings</h2>
                      <p>Your latest reservations and ticket details.</p>
                    </div>

                    <Link href="/my-bookings">
                      All bookings <ArrowRight size={16} />
                    </Link>
                  </div>

                  {bookings.length === 0 ? (
                    <div className="profile-empty-state">
                      <Ticket size={32} />
                      <h3>No bookings yet</h3>
                      <p>
                        When you book your first event, it will appear here.
                      </p>
                      <Link className="profile-primary-button" href="/">
                        Discover events
                      </Link>
                    </div>
                  ) : (
                    <div className="profile-bookings-list">
                      {bookings.slice(0, 5).map((booking) => {
                        const event = booking.event || {};

                        return (
                          <article
                            className="profile-booking-row"
                            key={booking.id || booking._id}
                          >
                            <div className="profile-booking-icon">
                              <Ticket size={22} />
                            </div>

                            <div className="profile-booking-info">
                              <h3>{event.title || "Badvenu Event"}</h3>
                              <p>
                                {formatDate(event.startAt)} ·{" "}
                                {[event.venueName, event.city]
                                  .filter(Boolean)
                                  .join(", ") || "Venue to be announced"}
                              </p>
                              <span>
                                {booking.status || "Status unavailable"}
                              </span>
                            </div>

                            <div className="profile-booking-total">
                              <strong>
                                {formatCurrency(booking.totalAmount)}
                              </strong>
                              {event.slug && (
                                <Link href={`/events/${event.slug}`}>
                                  Event details
                                </Link>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}