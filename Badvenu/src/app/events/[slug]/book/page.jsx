"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  getPublishedEventBySlug,
} from "../../../../services/event.service";

import {
  createBooking,
} from "../../../../services/booking.service";
import "./booking.css"

const BookingPage = () => {
  const params = useParams();
  const router = useRouter();

  const slug = params?.slug;

  const [event, setEvent] = useState(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const [quantities, setQuantities] = useState({});

  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    age: "",
  });

  useEffect(() => {
    if (!slug) return;

    const loadEvent = async () => {
      try {
        console.log("🎟️ Loading booking event:", slug);

        const data = await getPublishedEventBySlug(slug);

        console.log("🎟️ BOOKING EVENT:", data);

        setEvent(data);

        // Initialize ticket quantities
        const initialQuantities = {};

        data?.pricingTiers?.forEach((tier) => {
          initialQuantities[tier._id] = 0;
        });

        setQuantities(initialQuantities);
      } catch (err) {
        console.error("❌ Failed to load event:", err);

        setError(
          err.message || "Unable to load event."
        );
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [slug]);

  const handleCustomerChange = (e) => {
    const { name, value } = e.target;

    setCustomer((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const increaseQuantity = (tier) => {
    const available =
      Number(tier.totalQty || 0) -
      Number(tier.soldQty || 0) -
      Number(tier.reservedQty || 0);

    const currentQuantity =
      Number(quantities[tier._id]) || 0;

    if (currentQuantity >= available) {
      return;
    }

    setQuantities((previous) => ({
      ...previous,
      [tier._id]: currentQuantity + 1,
    }));
  };

  const decreaseQuantity = (tier) => {
    const currentQuantity =
      Number(quantities[tier._id]) || 0;

    if (currentQuantity <= 0) {
      return;
    }

    setQuantities((previous) => ({
      ...previous,
      [tier._id]: currentQuantity - 1,
    }));
  };

  const selectedTickets =
    event?.pricingTiers?.reduce((total, tier) => {
      return total + (Number(quantities[tier._id]) || 0);
    }, 0) || 0;

  const totalAmount =
    event?.pricingTiers?.reduce((total, tier) => {
      const quantity =
        Number(quantities[tier._id]) || 0;

      const price =
        Number(tier.price) || 0;

      return total + quantity * price;
    }, 0) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    if (selectedTickets <= 0) {
      setError("Please select at least one ticket.");
      return;
    }

    if (!customer.name.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (!customer.email.trim()) {
      setError("Please enter your email.");
      return;
    }

    try {
      setSubmitting(true);

      const items = event.pricingTiers
        .map((tier) => ({
          pricingTierId: tier._id,
          quantity:
            Number(quantities[tier._id]) || 0,
        }))
        .filter((item) => item.quantity > 0);

      const bookingData = {
        guestName: customer.name.trim(),

        guestEmail: customer.email.trim()
          ? customer.email.trim()
          : undefined,

        guestPhone: customer.phone.trim()
          ? customer.phone.trim()
          : undefined,

        items,

        formResponses: [],
      };

      console.log("📦 Creating booking:", bookingData);
      

      const booking = await createBooking(
        slug,
        bookingData
      );

      console.log("✅ BOOKING CREATED:", booking);

      /*
       * We will connect Razorpay in the next step.
       *
       * For now, move to the booking confirmation/
       * payment step using the booking ID.
       */

      const bookingId =
        booking?._id ||
        booking?.id ||
        booking?.booking?._id ||
        booking?.booking?.id;

      if (!bookingId) {
        console.error(
          "❌ Booking ID missing:",
          booking
        );

        throw new Error(
          "Booking was created, but the booking ID was not returned."
        );
      }

      router.push(
        `/booking/${bookingId}/payment`
      );
    } catch (err) {
      console.error("❌ Booking failed:", err);

      setError(
        err.message ||
        "Unable to create booking."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="container" style={{ padding: "60px 20px" }}>
        <p>Loading booking...</p>
      </main>
    );
  }

  if (error && !event) {
    return (
      <main className="container" style={{ padding: "60px 20px" }}>
        <h1>Unable to load booking</h1>

        <p>{error}</p>

        <button
          type="button"
          className="btn-primary"
          onClick={() =>
            router.push(`/events/${slug}`)
          }
          style={{ marginTop: "20px" }}
        >
          Back to Event
        </button>
      </main>
    );
  }

  if (!event) {
    return null;
  }

  return (
    <main className="booking-page">
      <div className="container">

        <button
          type="button"
          className="booking-back-button"
          onClick={() =>
            router.push(`/events/${event.slug}`)
          }
        >
          ← Back to Event
        </button>

        <div className="booking-layout">

          {/* LEFT */}
          <section className="booking-main">

            <h1>Book Tickets</h1>

            <div className="booking-event-summary">
              <h2>{event.title}</h2>

              <p>
                📍 {event.venueName}
                {event.city
                  ? `, ${event.city}`
                  : ""}
              </p>

              <p>
                📅{" "}
                {event.startAt
                  ? new Date(
                    event.startAt
                  ).toLocaleDateString(
                    "en-IN",
                    {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }
                  )
                  : "Date TBA"}
              </p>
            </div>

            {/* TICKETS */}
            <div className="booking-section">

              <h2>Select Tickets</h2>

              <div className="ticket-selection">

                {event.pricingTiers?.map(
                  (tier) => {
                    const available =
                      Math.max(
                        0,
                        Number(
                          tier.totalQty || 0
                        ) -
                        Number(
                          tier.soldQty || 0
                        ) -
                        Number(
                          tier.reservedQty || 0
                        )
                      );

                    const quantity =
                      Number(
                        quantities[tier._id]
                      ) || 0;

                    return (
                      <div
                        key={tier._id}
                        className="ticket-selection-row"
                      >

                        <div>
                          <h3>
                            {tier.name}
                          </h3>

                          <p>
                            ₹{tier.price}
                            {" "}per ticket
                          </p>

                          <small>
                            {available}{" "}
                            tickets available
                          </small>
                        </div>

                        <div className="quantity-control">

                          <button
                            type="button"
                            onClick={() =>
                              decreaseQuantity(
                                tier
                              )
                            }
                            disabled={
                              quantity <= 0
                            }
                          >
                            −
                          </button>

                          <span>
                            {quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              increaseQuantity(
                                tier
                              )
                            }
                            disabled={
                              quantity >=
                              available
                            }
                          >
                            +
                          </button>

                        </div>

                      </div>
                    );
                  }
                )}

              </div>
            </div>

            {/* CUSTOMER DETAILS */}
            <div className="booking-section">

              <h2>Your Details</h2>

              <form
                id="booking-form"
                onSubmit={handleSubmit}
              >

                <div className="form-field">

                  <label htmlFor="name">
                    Full Name *
                  </label>

                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={customer.name}
                    onChange={
                      handleCustomerChange
                    }
                    placeholder="Enter your full name"
                    required
                  />

                </div>

                <div className="form-field">

                  <label htmlFor="email">
                    Email *
                  </label>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={customer.email}
                    onChange={
                      handleCustomerChange
                    }
                    placeholder="Enter your email"
                    required
                  />

                </div>

                <div className="form-field">

                  <label htmlFor="phone">
                    Phone Number
                  </label>

                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={customer.phone}
                    onChange={
                      handleCustomerChange
                    }
                    placeholder="Enter your phone number"
                  />

                </div>

                <div className="form-field">

                  <label htmlFor="age">
                    Age
                  </label>

                  <input
                    id="age"
                    name="age"
                    type="number"
                    min="1"
                    max="120"
                    value={customer.age}
                    onChange={
                      handleCustomerChange
                    }
                    placeholder="Enter your age"
                  />

                </div>

              </form>

            </div>

            {error && (
              <div className="booking-error">
                {error}
              </div>
            )}

          </section>

          {/* RIGHT */}
          <aside className="booking-summary">

            <h2>Order Summary</h2>

            <div className="summary-event">
              <strong>
                {event.title}
              </strong>
            </div>

            <div className="summary-items">

              {event.pricingTiers?.map(
                (tier) => {
                  const quantity =
                    Number(
                      quantities[tier._id]
                    ) || 0;

                  if (quantity <= 0) {
                    return null;
                  }

                  return (
                    <div
                      key={tier._id}
                      className="summary-item"
                    >
                      <span>
                        {tier.name} ×{" "}
                        {quantity}
                      </span>

                      <strong>
                        ₹
                        {(
                          quantity *
                          Number(tier.price)
                        ).toLocaleString(
                          "en-IN"
                        )}
                      </strong>
                    </div>
                  );
                }
              )}

            </div>

            <div className="summary-total">

              <span>Total</span>

              <strong>
                ₹
                {totalAmount.toLocaleString(
                  "en-IN"
                )}
              </strong>

            </div>

            <button
              type="submit"
              form="booking-form"
              className="btn-primary booking-submit"
              disabled={
                submitting ||
                selectedTickets <= 0
              }
            >
              {submitting
                ? "Creating Booking..."
                : "Continue to Payment"}
            </button>

          </aside>

        </div>
      </div>
    </main>
  );
};

export default BookingPage;