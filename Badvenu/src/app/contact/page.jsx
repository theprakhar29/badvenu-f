"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, MessageCircle, Ticket, Users } from "lucide-react";
import Navbar from "../../components/Navbar";
import SubNav from "../../components/SubNav";
import Footer from "../../components/Footer";
import { submitContactMessage } from "../../services/contact.service";
import "./contact.css";

const initialForm = {
  name: "",
  email: "",
  subject: "",
  message: "",
};

export default function ContactPage() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      subject: form.subject.trim(),
      message: form.message.trim(),
    };

    if (
      !payload.name ||
      !payload.email ||
      !payload.subject ||
      !payload.message
    ) {
      setError("Please complete all fields.");
      return;
    }

    if (payload.name.length > 100) {
      setError("Name must be 100 characters or fewer.");
      return;
    }

    if (payload.subject.length > 150) {
      setError("Subject must be 150 characters or fewer.");
      return;
    }

    if (payload.message.length > 5000) {
      setError("Message must be 5000 characters or fewer.");
      return;
    }

    setLoading(true);

    try {
      const response = await submitContactMessage(payload);
      setSuccess(
        `${response.message || "Your enquiry has been submitted."}${
          response.referenceId ? ` Reference: ${response.referenceId}` : ""
        }`
      );
      setForm(initialForm);
    } catch (err) {
      setError(
        err.message ||
          "We couldn't submit your enquiry. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <Navbar />
      <SubNav />

      <main className="contact-page">
        <section className="contact-hero">
          <span className="contact-eyebrow">WE'RE HERE TO HELP</span>
          <h1>Let's talk about your next experience.</h1>
          <p>
            Questions about tickets, payments or listing a show?
            Send us a message and our team will take a look.
          </p>
        </section>

        <section className="contact-layout">
          <div className="contact-info">
            <h2>How can we help?</h2>
            <p className="contact-muted">
              Choose a topic in your message so we can direct your enquiry
              to the right team.
            </p>

            <div className="contact-topic">
              <Ticket size={22} />
              <div>
                <h3>Bookings and tickets</h3>
                <p>Questions about your booking or ticket confirmation.</p>
              </div>
            </div>

            <div className="contact-topic">
              <MessageCircle size={22} />
              <div>
                <h3>Payments and refunds</h3>
                <p>Tell us about a payment or refund concern.</p>
              </div>
            </div>

            <div className="contact-topic">
              <Users size={22} />
              <div>
                <h3>List your show</h3>
                <p>Contact us about bringing your event to Badvenu.</p>
              </div>
            </div>

            <div className="contact-topic">
              <Mail size={22} />
              <div>
                <h3>General enquiries</h3>
                <p>Feedback, suggestions and anything else we can help with.</p>
              </div>
            </div>
          </div>

          <div className="contact-form-card">
            <h2>Send us a message</h2>
            <p className="contact-muted">
              All fields are required.
            </p>

            {success && (
              <div className="contact-alert contact-success" role="status">
                {success}
              </div>
            )}

            {error && (
              <div className="contact-alert contact-error" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="contact-field">
                <label htmlFor="contact-name">Your name</label>
                <input
                  id="contact-name"
                  name="name"
                  autoComplete="name"
                  maxLength={100}
                  value={form.name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="contact-field">
                <label htmlFor="contact-email">Email address</label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  value={form.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="contact-field">
                <label htmlFor="contact-subject">Subject</label>
                <select
                  id="contact-subject"
                  name="subject"
                  value={form.subject}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select a topic</option>
                  <option value="Booking or tickets">Booking or tickets</option>
                  <option value="Payment or refund">Payment or refund</option>
                  <option value="List your show">List your show</option>
                  <option value="Website feedback">Website feedback</option>
                  <option value="Other enquiry">Other enquiry</option>
                </select>
              </div>

              <div className="contact-field">
                <label htmlFor="contact-message">Your message</label>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={6}
                  maxLength={5000}
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Tell us how we can help..."
                  required
                />
                <span className="contact-character-count">
                  {form.message.length}/5000
                </span>
              </div>

              <button
                type="submit"
                className="contact-submit"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send message"}
              </button>
            </form>
          </div>
        </section>

        <p className="contact-privacy-note">
          Please don't include passwords, payment card details or other
          sensitive information in your message.
        </p>

        <div className="contact-back-link">
          <Link href="/">← Back to Badvenu</Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}