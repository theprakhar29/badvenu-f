
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "../services/auth.service.js";
import { getCustomerProfile } from "../services/customer.service.js";
import "./SubNav.css";


const SubNav = () => {
  const [accountType, setAccountType] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const [organizerResult, customerResult] =
        await Promise.allSettled([
          getCurrentUser(),
          getCustomerProfile(),
        ]);

      if (cancelled) return;

      const organizer =
        organizerResult.status === "fulfilled"
          ? organizerResult.value?.user ?? organizerResult.value
          : null;

      const customer =
        customerResult.status === "fulfilled"
          ? customerResult.value?.customer ?? null
          : null;

      // Match Navbar.jsx: customer takes precedence if both sessions exist.
      if (customer) {
        setAccountType("customer");
      } else if (organizer) {
        setAccountType("organizer");
      } else {
        setAccountType(null);
      }

      setIsCheckingSession(false);
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav className="subnav" aria-label="Secondary navigation">
      <div className="container flex items-center justify-between subnav-inner">
        <ul className="flex items-center subnav-links nav-links-left">
          <li><Link href="/category/plays">Plays</Link></li>
          <li><Link href="/category/stand-up">Stand-Up</Link></li>
          <li><Link href="/category/sports">Sports</Link></li>
          <li><Link href="/category/events">Events</Link></li>
          <li><Link href="/category/activities">Activities</Link></li>
        </ul>

        <ul className="flex items-center subnav-links nav-links-right">
          <li>
            <Link href="/list-your-show">List Your Show</Link>
          </li>

          {!isCheckingSession && accountType === "customer" && (
            <li>
              <Link href="/my-bookings">My Bookings</Link>
            </li>
          )}

          {!isCheckingSession && accountType === "organizer" && (
            <>
              <li>
                <Link href="/my-shows">My Shows</Link>
              </li>
              <li>
                <Link href="/host-dashboard">Dashboard</Link>
              </li>
            </>
          )}
        </ul>
      </div>
    </nav>
  );
};

export default SubNav;
