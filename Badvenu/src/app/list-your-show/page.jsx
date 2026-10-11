"use client";

import React from 'react';
import Navbar from '../../components/Navbar';
import SubNav from '../../components/SubNav';
import Footer from '../../components/Footer';
import Link from 'next/link';
import { Mic2, Music, Palette, Trophy, Users, CheckCircle2, TrendingUp, Zap } from 'lucide-react';
import './ListYourShow.css';

export default function ListYourShow() {
  return (
    <div className="lys-page">
      <Navbar />
      <SubNav />
      
      <main className="lys-main">
        {/* Hero Section */}
        <section className="lys-hero">
          <div className="container">
            <h1>Bring Your Event to the<br/>Next Generation.</h1>
            <p>Join the fastest-growing ticketing platform. Reach millions of active users, sell out faster, and get real-time analytics.</p>
            <Link href="/host-a-show">
              <button className="btn-primary">Host Now</button>
            </Link>
          </div>
        </section>

        {/* Categories Section */}
        <section className="lys-section">
          <div className="container">
            <h2 className="lys-section-title">What can you host?</h2>
            <div className="lys-categories-grid">
              <div className="lys-category-card">
                <div className="lys-category-icon"><Mic2 size={32} /></div>
                <h3>Stand-up Comedy</h3>
              </div>
              <div className="lys-category-card">
                <div className="lys-category-icon"><Music size={32} /></div>
                <h3>Music & Concerts</h3>
              </div>
              <div className="lys-category-card">
                <div className="lys-category-icon"><Palette size={32} /></div>
                <h3>Workshops & Arts</h3>
              </div>
              <div className="lys-category-card">
                <div className="lys-category-icon"><Trophy size={32} /></div>
                <h3>Sports & eSports</h3>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="lys-section">
          <div className="container">
            <h2 className="lys-section-title">Why Badvenu?</h2>
            <div className="lys-features-grid">
              <div className="lys-feature">
                <div className="lys-feature-icon"><Users size={28} /></div>
                <div className="lys-feature-content">
                  <h3>Massive Reach</h3>
                  <p>Get your event in front of millions of highly engaged Gen-Z users actively looking for experiences.</p>
                </div>
              </div>
              <div className="lys-feature">
                <div className="lys-feature-icon"><Zap size={28} /></div>
                <div className="lys-feature-content">
                  <h3>Instant Payouts</h3>
                  <p>Don't wait for your money. Get access to your ticketing revenue quickly and seamlessly.</p>
                </div>
              </div>
              <div className="lys-feature">
                <div className="lys-feature-icon"><TrendingUp size={28} /></div>
                <div className="lys-feature-content">
                  <h3>Real-time Analytics</h3>
                  <p>Track your sales, audience demographics, and marketing performance live from our host dashboard.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Process Section */}
        <section className="lys-section">
          <div className="container">
            <h2 className="lys-section-title">How it works</h2>
            <div className="lys-process-steps">
              <div className="lys-step">
                <div className="lys-step-num">1</div>
                <h3>Tell us about it</h3>
                <p>Fill out a simple form with your event details, pricing, and creative assets.</p>
              </div>
              <div className="lys-step">
                <div className="lys-step-num">2</div>
                <h3>Get Approved</h3>
                <p>Our team quickly verifies your details to ensure platform quality and safety.</p>
              </div>
              <div className="lys-step">
                <div className="lys-step-num"><CheckCircle2 size={32} /></div>
                <h3>Go Live & Sell Out</h3>
                <p>Your event is published! Watch the tickets fly as users discover your show.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="container">
          <div className="lys-cta">
            <h2>Ready to go live?</h2>
            <p>It takes less than 5 minutes to set up your organizer profile.</p>
            <Link href="/host-a-show">
              <button className="btn-primary" style={{ padding: '16px 48px', fontSize: '18px' }}>
                List Your Show Now
              </button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
