
"use client";

import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import SignInModal from "./SignInModal";
import { getCurrentUser, logout } from "../services/auth.service.js";
import "./Navbar.css";

const Navbar = () => {
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const loadCurrentUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setIsLoadingUser(false);
    }
  };

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const handleAuthSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <>
      <nav className="navbar">
        <div className="container flex items-center justify-between navbar-inner">
          <div className="flex items-center nav-left">
            <div className="logo">
              <a href="/">
              <span className="logo-text">
                bad<span className="brand-red">venu</span>
              </span></a>
            </div>

            <div className="search-bar">
              <Search className="search-icon" size={18} />

              <input
                type="text"
                placeholder="Search for Movies, Events, Plays, Sports and Activities"
                className="search-input"
              />
            </div>
          </div>

          <div className="flex items-center nav-right">
            {isLoadingUser ? (
              <span style={{ opacity: 0.6 }}>Loading...</span>
            ) : user ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <span>
                  Hi, {user.name}
                </span>

                <button
                  className="btn-primary sign-in-btn"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                className="btn-primary sign-in-btn"
                onClick={() => setIsSignInOpen(true)}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </>
  );
};

export default Navbar;

