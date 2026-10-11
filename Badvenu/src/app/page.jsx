"use client";

import React from 'react';
import Navbar from '../components/Navbar';
import SubNav from '../components/SubNav';
import HeroCarousel from '../components/HeroCarousel';
import UpcomingShows from '../components/UpcomingShows';
import YourBookings from '../components/YourBookings';
import MovieGrid from '../components/MovieGrid';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <div className="app">
      <Navbar />
      <SubNav />
      <HeroCarousel />
      <UpcomingShows />
      <YourBookings />
      <MovieGrid />
      <Footer />
    </div>
  );
}
