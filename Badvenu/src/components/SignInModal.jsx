
"use client";

import React, { useEffect, useState } from "react";
import { login, signup } from "../services/auth.service.js";
import {
  requestCustomerOtp,
  verifyCustomerOtp,
} from "../services/customer.service.js";
import "./SignInModal.css";

const SignInModal = ({ isOpen, onClose, onAuthSuccess,  initialAccountType = "customer"}) => {
  const [accountType, setAccountType] = useState(initialAccountType);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [customerStep, setCustomerStep] = useState("email");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    code: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setAccountType("customer");
      setIsSignUpMode(false);
      setCustomerStep("email");
      setFormData({ name: "", email: "", password: "", code: "" });
      setError("");
      setMessage("");
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    setError("");
  };

  const switchAccountType = (type) => {
    setAccountType(type);
    setIsSignUpMode(false);
    setCustomerStep("email");
    setFormData({ name: "", email: "", password: "", code: "" });
    setError("");
    setMessage("");
  };

  const handleOrganiserSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      let user;

      if (isSignUpMode) {
        user = await signup({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        });
      } else {
        user = await login({
          email: formData.email,
          password: formData.password,
        });
      }

      onAuthSuccess?.(user);
      onClose();

      setFormData({ name: "", email: "", password: "", code: "" });
    } catch (err) {
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomerRequestOtp = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      await requestCustomerOtp({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
      });

      setCustomerStep("otp");
      setMessage("If the request was accepted, check your email for the verification code.");
    } catch (err) {
      setError(err.message || "Unable to request a verification code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomerVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const result = await verifyCustomerOtp({
        email: formData.email.trim().toLowerCase(),
        code: formData.code.trim(),
      });

      onAuthSuccess?.(result.customer);
      onClose();
    } catch (err) {
      setError(err.message || "Verification failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleOrganiserMode = (e) => {
    e.preventDefault();
    setIsSignUpMode((prev) => !prev);
    setError("");
    setMessage("");
    setFormData({ name: "", email: "", password: "", code: "" });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close"
          onClick={onClose}
          type="button"
          aria-label="Close modal"
        >
          ×
        </button>

        <h2 className="modal-title">Welcome to Badvenu</h2>

        <p className="modal-subtitle">
          {accountType === "customer"
            ? "Sign in to discover shows and manage your tickets."
            : "Manage your events and ticket sales."}
        </p>

        <div
          className="auth-account-switch"
          role="group"
          aria-label="Choose account type"
        >
          <button
            type="button"
            className={`auth-account-option ${
              accountType === "customer" ? "active" : ""
            }`}
            onClick={() => switchAccountType("customer")}
            aria-pressed={accountType === "customer"}
          >
            Customer
          </button>

          <button
            type="button"
            className={`auth-account-option ${
              accountType === "organiser" ? "active" : ""
            }`}
            onClick={() => switchAccountType("organiser")}
            aria-pressed={accountType === "organiser"}
          >
            Organiser
          </button>
        </div>

        {accountType === "customer" ? (
          <>
            {customerStep === "email" ? (
              <form
                className="modal-form"
                onSubmit={handleCustomerRequestOtp}
              >
                <div className="form-group">
                  <label htmlFor="customer-name">Full Name</label>
                  <input
                    id="customer-name"
                    name="name"
                    type="text"
                    placeholder="Your full name"
                    value={formData.name}
                    onChange={handleChange}
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="customer-email">Email Address</label>
                  <input
                    id="customer-email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                {message && (
                  <p role="status" className="auth-message">
                    {message}
                  </p>
                )}

                {error && (
                  <p role="alert" className="auth-error">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Sending code..." : "Continue with Email"}
                </button>
              </form>
            ) : (
              <form
                className="modal-form"
                onSubmit={handleCustomerVerifyOtp}
              >
                <p className="auth-message">
                  Enter the six-digit code sent to{" "}
                  <strong>{formData.email}</strong>.
                </p>

                <div className="form-group">
                  <label htmlFor="customer-code">Verification Code</label>
                  <input
                    id="customer-code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={formData.code}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        code: e.target.value.replace(/\D/g, "").slice(0, 6),
                      }));
                      setError("");
                    }}
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                  />
                </div>

                {error && (
                  <p role="alert" className="auth-error">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={isSubmitting || formData.code.length !== 6}
                >
                  {isSubmitting ? "Verifying..." : "Verify and Sign In"}
                </button>

                <button
                  type="button"
                  className="social-btn"
                  disabled={isSubmitting}
                  onClick={() => {
                    setCustomerStep("email");
                    setFormData((prev) => ({ ...prev, code: "" }));
                    setError("");
                    setMessage("");
                  }}
                >
                  Change email
                </button>
              </form>
            )}
          </>
        ) : (
          <>
            <div className="divider">
              <span>
                Organiser {isSignUpMode ? "sign up" : "sign in"}
              </span>
            </div>

            <form className="modal-form" onSubmit={handleOrganiserSubmit}>
              {isSignUpMode && (
                <div className="form-group">
                  <label htmlFor="organiser-name">Full Name</label>
                  <input
                    id="organiser-name"
                    name="name"
                    type="text"
                    placeholder="Your full name"
                    value={formData.name}
                    onChange={handleChange}
                    minLength={2}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="organiser-email">Email Address</label>
                <input
                  id="organiser-email"
                  name="email"
                  type="email"
                  placeholder="organiser@example.com"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="organiser-password">Password</label>
                <input
                  id="organiser-password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete={
                    isSignUpMode ? "new-password" : "current-password"
                  }
                  value={formData.password}
                  onChange={handleChange}
                  minLength={isSignUpMode ? 8 : undefined}
                  required
                />
              </div>

              {error && (
                <p role="alert" className="auth-error">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? isSignUpMode
                    ? "Creating account..."
                    : "Signing in..."
                  : isSignUpMode
                    ? "Create Organiser Account"
                    : "Sign In as Organiser"}
              </button>
            </form>

            <div className="modal-footer">
              <p>
                {isSignUpMode
                  ? "Already have an organiser account? "
                  : "New to organising events? "}
                <a
                  href="#"
                  className="text-neon"
                  onClick={(e) => {
                    toggleOrganiserMode(e);
                  }}
                >
                  {isSignUpMode ? "Sign in" : "Sign up"}
                </a>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SignInModal;
