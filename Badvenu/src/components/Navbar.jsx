
"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import SignInModal from "./SignInModal";
import {
  getCurrentUser,
  logout,
} from "../services/auth.service.js";
import {
  getCustomerProfile,
  logoutCustomer,
} from "../services/customer.service.js";
import "./Navbar.css";
import Link from "next/link";

const Navbar = () => {
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [accountType, setAccountType] = useState("customer");

  const [organiser, setOrganiser] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);

  const handleSearch = (event) => {
    event.preventDefault();

    const query = searchQuery.trim();

    if (!query) {
      searchInputRef.current?.focus();
      return;
    }

    router.push(`/search?q=${encodeURIComponent(query)}`);
  };


  useEffect(() => {
    let cancelled = false;

    const restoreSessions = async () => {
      setIsLoadingUser(true);

      const [organiserResult, customerResult] = await Promise.allSettled([
        getCurrentUser(),
        getCustomerProfile(),
      ]);

      if (cancelled) return;

      setOrganiser(
        organiserResult.status === "fulfilled"
          ? organiserResult.value?.user ?? organiserResult.value
          : null
      );

      setCustomer(
        customerResult.status === "fulfilled"
          ? customerResult.value?.customer ?? null
          : null
      );

      setIsLoadingUser(false);
    };

    restoreSessions();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthSuccess = (authenticatedUser) => {
    if (accountType === "customer") {
      setCustomer(authenticatedUser);
    } else {
      setOrganiser(authenticatedUser?.user ?? authenticatedUser);
    }
  };

  const handleLogout = async (type) => {
    try {
      if (type === "customer") {
        await logoutCustomer();
        setCustomer(null);
      } else {
        await logout();
        setOrganiser(null);
      }
    } catch (error) {
      console.error(`${type} logout failed:`, error);
    }
  };

  const openSignIn = (type) => {
    setAccountType(type);
    setIsSignInOpen(true);
  };

  const activeUser = customer || organiser;
  const activeType = customer ? "customer" : "organiser";

  return (
    <>
      <nav className="navbar">
        <div className="container flex items-center justify-between navbar-inner">
          <div className="flex items-center nav-left">
            <div className="logo">
              <a href="/">
                <span className="logo-text">
                  bad<span className="brand-red">venu</span>
                </span>
              </a>
            </div>

            <form className="search-bar" onSubmit={handleSearch} role="search">
              <button
                type="submit"
                className="search-submit"
                aria-label="Search events"
              >
                <Search className="search-icon" size={18} />
              </button>

              <input
                ref={searchInputRef}
                type="search"
                name="q"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search events, plays, sports, activities..."
                className="search-input"
                aria-label="Search Badvenu events"
                maxLength={100}
              />

              {searchQuery && (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                >
                  ×
                </button>
              )}
            </form>
          </div>

          <div className="flex items-center nav-right">
            {isLoadingUser ? (
              <span style={{ opacity: 0.6 }}>Loading...</span>
            ) : activeUser ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <span>
                  Hi, {activeUser.name || activeUser.email}
                </span>
                {activeType === "customer" && (
                  <Link
                    href="/profile"
                    className="navbar-profile-link"
                    style={{ textDecoration: "none" }}
                  >
                    My Profile
                  </Link>
                )}
                <button
                  className="btn-primary sign-in-btn"
                  onClick={() => handleLogout(activeType)}
                >
                  Logout
                </button>
              </div>
            ) : (
              <>
                <button
                  className="btn-primary sign-in-btn"
                  onClick={() => openSignIn("customer")}
                >
                  Sign In
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <SignInModal
        key={accountType}
        isOpen={isSignInOpen}
        initialAccountType={accountType}
        onClose={() => setIsSignInOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </>
  );
};

export default Navbar;
