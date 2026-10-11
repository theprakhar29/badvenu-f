"use client";

import React from 'react';
import Navbar from '../../components/Navbar';
import SubNav from '../../components/SubNav';
import YourBookings from '../../components/YourBookings';
import Footer from '../../components/Footer';

export default function MyShows() {
  return (
    <div className="app" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <SubNav />
      
      <main style={{ flex: 1, padding: '40px 0' }}>
        <div className="container">
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '32px', marginBottom: '10px' }}>
            My Profile
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '40px' }}>
            Manage your tickets and upcoming experiences.
          </p>
        </div>
        
        {/* We reuse the YourBookings component here */}
        <YourBookings />
      </main>

      <Footer />
    </div>
  );
}
