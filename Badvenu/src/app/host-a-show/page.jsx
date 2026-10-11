"use client";

import React, { useState } from 'react';
import Navbar from '../../components/Navbar';
import SubNav from '../../components/SubNav';
import Footer from '../../components/Footer';
import { useRouter } from 'next/navigation';
import { User, Calendar, Ticket, ChevronRight, ChevronLeft, Check, Image as ImageIcon } from 'lucide-react';
import { createEvent } from '../../services/event.service';
import './HostShow.css';


export default function HostShow() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    hostName: '',
    hostBio: '',
    hostEmail: '',
    eventTitle: '',
    eventDescription: '',
    eventDate: '',
    eventTime: '',
    eventVenue: '',
  });

  const [ticketTiers, setTicketTiers] = useState([
    {
      id: crypto.randomUUID(),
      name: "General Admission",
      price: "0",
      quantity: "100",
      color: "#8a2be2",
    }
  ])

  const [selectedTierId, setSelectedTierId] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const updateTicketTier = (id, field, value) => {
    setTicketTiers((prev) =>
      prev.map((tier) =>
        tier.id === id
          ? { ...tier, [field]: value }
          : tier
      )
    );
  };


  const addTicketTier = () => {
    const newTier = {
      id: `tier-${Date.now()}`,
      name: "New Ticket",
      price: "0",
      quantity: "50",
      color: "#8a2be2",
    };

    setTicketTiers((prev) => [...prev, newTier]);
    setSelectedTierId(newTier.id);
  };

  const removeTicketTier = (id) => {
    if (ticketTiers.length === 1) {
      alert("An event must have at least one ticket type.");
      return;
    }

    const remainingTiers = ticketTiers.filter(
      (tier) => tier.id !== id
    );

    setTicketTiers(remainingTiers);

    if (selectedTierId === id) {
      setSelectedTierId(remainingTiers[0].id);
    }
  };

  const selectedTier =
    ticketTiers.find((tier) => tier.id === selectedTierId) || ticketTiers[0];

  const nextStep = () => setStep(prev => Math.min(prev + 1, 3));
  const prevStep = () => setStep(prev => Math.max(prev - 1, 1));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step < 3) {
      nextStep();
      return;
    }

    setIsSubmitting(true);
    // Simulate API call
    try {

      const startAt = new Date(`${formData.eventDate}T${formData.eventTime}`);

      const payload = {
        title: formData.eventTitle,
        venueName: formData.eventVenue,
        city: "",
        startAt: startAt.toISOString(),
        description: formData.eventDescription,
        capacity: ticketTiers.reduce(
          (total, tier) => total + Number(tier.quantity),
          0
        ),

        pricingTiers: ticketTiers.map((tier) => ({
          name: tier.name.trim(),
          price: Number(tier.price),
          totalQty: Number(tier.quantity),
        })),
      };

      const event = await createEvent(payload);

      console.log("Event Created: ", event);
      router.push("/host-dashboard");

    } catch (error) {
      console.error("Event creation failed:", error);
      alert(error.message || "Unable to create event. Please try again.");
    }
    finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="host-show-page">
      <Navbar />
      <SubNav />

      <main className="host-main container">
        <div className="host-header">
          <h1>Let's get your show on the road.</h1>
          <p>Fill out the details below to start selling tickets in minutes.</p>
        </div>

        <div className="host-wizard">
          {/* Progress Steps */}
          <div className="wizard-progress">
            <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>
              <div className="step-icon"><User size={20} /></div>
              <span>Host Info</span>
            </div>
            <div className={`progress-line ${step >= 2 ? 'active' : ''}`}></div>
            <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>
              <div className="step-icon"><Calendar size={20} /></div>
              <span>Event Details</span>
            </div>
            <div className={`progress-line ${step >= 3 ? 'active' : ''}`}></div>
            <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>
              <div className="step-icon"><Ticket size={20} /></div>
              <span>Tickets</span>
            </div>
          </div>

          {/* Form Content */}
          <div className="wizard-content">
            <form onSubmit={handleSubmit}>

              {/* STEP 1 */}
              {step === 1 && (
                <div className="form-step animate-in">
                  <h2>Host Information</h2>
                  <div className="form-group">
                    <label>Organizer / Host Name</label>
                    <input
                      type="text"
                      name="hostName"
                      placeholder="e.g. Comedy Central, John Doe"
                      value={formData.hostName}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Contact Email</label>
                    <input
                      type="email"
                      name="hostEmail"
                      placeholder="you@example.com"
                      value={formData.hostEmail}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Host Bio</label>
                    <textarea
                      name="hostBio"
                      placeholder="Tell attendees a bit about yourself or your organization..."
                      rows="4"
                      value={formData.hostBio}
                      onChange={handleChange}
                    ></textarea>
                  </div>
                </div>
              )}

              {/* STEP 2 */}
              {step === 2 && (
                <div className="form-step animate-in">
                  <h2>Event Details</h2>
                  <div className="form-group">
                    <label>Event Title</label>
                    <input
                      type="text"
                      name="eventTitle"
                      placeholder="e.g. Summer Night Standup"
                      value={formData.eventTitle}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Date</label>
                      <input
                        type="date"
                        name="eventDate"
                        value={formData.eventDate}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Time</label>
                      <input
                        color='white'
                        type="time"
                        name="eventTime"
                        value={formData.eventTime}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Venue / Location</label>
                    <input
                      type="text"
                      name="eventVenue"
                      placeholder="e.g. The Laugh Factory, 123 Main St"
                      value={formData.eventVenue}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Event Description</label>
                    <textarea
                      name="eventDescription"
                      placeholder="What should attendees expect?"
                      rows="4"
                      value={formData.eventDescription}
                      onChange={handleChange}
                      required
                    ></textarea>
                  </div>
                </div>
              )}

              {/* STEP 3 */}

              {step === 3 && (
                <div className="form-step animate-in">
                  <h2>Ticket Designer</h2>

                  <div className="ticket-designer-layout">
                    <div className="ticket-controls">
                      <div className="ticket-tier-list">
                        {ticketTiers.map((tier, index) => (
                          <div
                            key={tier.id}
                            className={`ticket-tier-editor ${selectedTierId === tier.id ? "selected" : ""
                              }`}
                          >
                            <div className="ticket-tier-editor-header">
                              <button
                                type="button"
                                className="ticket-tier-select"
                                onClick={() => setSelectedTierId(tier.id)}
                              >
                                <span
                                  className="ticket-color-dot"
                                  style={{ backgroundColor: tier.color }}
                                />
                                <span>
                                  {tier.name || `Ticket Type ${index + 1}`}
                                </span>
                              </button>

                              <button
                                type="button"
                                className="ticket-remove-btn"
                                onClick={() => removeTicketTier(tier.id)}
                                disabled={ticketTiers.length === 1}
                                aria-label={`Remove ${tier.name}`}
                              >
                                Remove
                              </button>
                            </div>

                            <div className="form-group">
                              <label>Ticket Tier Name</label>
                              <input
                                type="text"
                                value={tier.name}
                                onFocus={() => setSelectedTierId(tier.id)}
                                onChange={(e) =>
                                  updateTicketTier(
                                    tier.id,
                                    "name",
                                    e.target.value
                                  )
                                }
                                required
                              />
                            </div>

                            <div className="form-row">
                              <div className="form-group">
                                <label>Price (₹)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={tier.price}
                                  onFocus={() => setSelectedTierId(tier.id)}
                                  onChange={(e) =>
                                    updateTicketTier(
                                      tier.id,
                                      "price",
                                      e.target.value
                                    )
                                  }
                                  required
                                />
                              </div>

                              <div className="form-group">
                                <label>Quantity Available</label>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={tier.quantity}
                                  onFocus={() => setSelectedTierId(tier.id)}
                                  onChange={(e) =>
                                    updateTicketTier(
                                      tier.id,
                                      "quantity",
                                      e.target.value
                                    )
                                  }
                                  required
                                />
                              </div>
                            </div>

                            <div className="form-group">
                              <label>Theme Color</label>
                              <input
                                type="color"
                                value={tier.color}
                                onFocus={() => setSelectedTierId(tier.id)}
                                onChange={(e) =>
                                  updateTicketTier(
                                    tier.id,
                                    "color",
                                    e.target.value
                                  )
                                }
                                className="color-picker"
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        className="btn-secondary add-ticket-btn"
                        onClick={addTicketTier}
                      >
                        + Add Ticket Type
                      </button>

                      <p className="ticket-capacity-summary">
                        Total capacity:{" "}
                        <strong>
                          {ticketTiers.reduce(
                            (total, tier) =>
                              total + (Number(tier.quantity) || 0),
                            0
                          )}
                        </strong>
                      </p>
                    </div>

                    <div className="ticket-preview-container">
                      <label>Live Preview</label>

                      <div
                        className="ticket-preview"
                        style={{
                          "--ticket-color": selectedTier?.color || "#8a2be2",
                        }}
                      >
                        <div className="ticket-preview-header">
                          <ImageIcon size={24} opacity={0.5} />
                          <span>{formData.hostName || "Host Name"}</span>
                        </div>

                        <div className="ticket-preview-body">
                          <h3>{formData.eventTitle || "Event Title"}</h3>

                          <div className="ticket-details-grid">
                            <div>
                              <small>Date</small>
                              <p>{formData.eventDate || "YYYY-MM-DD"}</p>
                            </div>

                            <div>
                              <small>Time</small>
                              <p>{formData.eventTime || "--:--"}</p>
                            </div>

                            <div className="full-width">
                              <small>Venue</small>
                              <p>{formData.eventVenue || "Event Location"}</p>
                            </div>
                          </div>
                        </div>

                        <div className="ticket-preview-footer">
                          <div className="ticket-tier">
                            {selectedTier?.name || "Ticket Type"}
                          </div>

                          <div className="ticket-price">
                            ₹{Number(selectedTier?.price || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <p className="ticket-preview-hint">
                        Select a ticket type to preview its design.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Form Navigation */}
              <div className="form-actions">
                {step > 1 && (
                  <button type="button" className="btn-secondary" onClick={prevStep} disabled={isSubmitting}>
                    <ChevronLeft size={18} /> Back
                  </button>
                )}

                <button type="submit" className="btn-primary ml-auto" disabled={isSubmitting}>
                  {step < 3 ? (
                    <>Next <ChevronRight size={18} /></>
                  ) : (
                    isSubmitting ? 'Creating Event...' : <>Go Live <Check size={18} /></>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
