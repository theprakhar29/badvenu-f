"use client";


import React, { useState } from "react";
import { login, signup } from "../services/auth.service.js";
import "./SignInModal.css";

// console.log("🔥 SIGN IN MODAL COMPONENT LOADED");

const SignInModal = ({ isOpen, onClose, onAuthSuccess }) => {
  //  console.log("🔥 SignInModal RENDERED", { isOpen });
  const [isSignUpMode, setIsSignUpMode] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    setError("");
  };

  const handleSubmit = async (e) => {
      // console.log("🔥🔥🔥 HANDLE SUBMIT FIRED");
    e.preventDefault();

    
    setError("");
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

      console.log("Authenticated user:", user);

      onAuthSuccess?.(user);

      onClose();

      setFormData({
        name: "",
        email: "",
        password: "",
      });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = (e) => {
    e.preventDefault();

    setIsSignUpMode((prev) => !prev);
    setError("");

    setFormData({
      name: "",
      email: "",
      password: "",
    });
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
        >
          ×
        </button>

        <h2 className="modal-title">
          {isSignUpMode ? "Join Badvenu" : "Welcome Back"}
        </h2>

        <p className="modal-subtitle">
          {isSignUpMode
            ? "Create an account to unlock the full Badvenu experience."
            : "Sign in to unlock the full Badvenu experience."}
        </p>

        <div className="social-login-container">
          <button
            className="social-btn google-btn"
            type="button"
            disabled
          >
            Continue with Google
          </button>

          <button
            className="social-btn apple-btn"
            type="button"
            disabled
          >
            Continue with Apple
          </button>
        </div>

        <div className="divider">
          <span>
            or {isSignUpMode ? "sign up" : "sign in"} with email
          </span>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          {isSignUpMode && (
            <div className="form-group">
              <label htmlFor="auth-name">Full Name</label>

              <input
                id="auth-name"
                type="text"
                name="name"
                placeholder="John Doe"
                value={formData.name}
                onChange={handleChange}
                required
                minLength={2}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="auth-email">Email Address</label>

            <input
              id="auth-email"
              type="email"
              name="email"
              placeholder="genz@badvenu.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="auth-password">Password</label>

            <input
              id="auth-password"
              type="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={isSignUpMode ? 8 : undefined}
            />
          </div>

          {error && (
            <div
              style={{
                color: "#ff4d6d",
                fontSize: "14px",
                marginBottom: "12px",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            //  onClick={() => console.log("🔥 SIGN IN BUTTON CLICKED")}

            disabled={isSubmitting}
          >
            {isSubmitting
              ? isSignUpMode
                ? "Creating account..."
                : "Signing in..."
              : isSignUpMode
                ? "Sign Up"
                : "Sign In"}
          </button>
        </form>

        <div className="modal-footer">
          <p>
            {isSignUpMode
              ? "Already have an account? "
              : "Don't have an account? "}

            <a
              href="#"
              className="text-neon"
              onClick={toggleMode}
            >
              {isSignUpMode ? "Sign in" : "Sign up"}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignInModal;

