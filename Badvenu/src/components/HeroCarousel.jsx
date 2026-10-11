import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './HeroCarousel.css';

const banners = [
  { id: 1, img: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&q=80&w=1200&h=300', alt: 'Movie Banner 1', color: 'rgba(230, 57, 70, 0.5)' },
  { id: 2, img: 'https://images.unsplash.com/photo-1470229722913-7c092bce8e4e?auto=format&fit=crop&q=80&w=1200&h=300', alt: 'Event Banner 2', color: 'rgba(123, 44, 191, 0.5)' },
  { id: 3, img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=1200&h=300', alt: 'Concert Banner 3', color: 'rgba(0, 240, 255, 0.5)' }
];

const HeroCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const goToNext = () => setCurrentIndex((prev) => (prev + 1) % banners.length);
  const goToPrev = () => setCurrentIndex((prev) => (prev === 0 ? banners.length - 1 : prev - 1));

  const activeColor = banners[currentIndex].color;

  return (
    <div 
      className="hero-carousel-wrapper" 
      style={{ 
        background: `radial-gradient(circle at center, ${activeColor} 0%, transparent 70%)`,
        transition: 'background 0.8s ease'
      }}
    >
      <div className="carousel-container" style={{ boxShadow: `0 20px 50px ${activeColor}` }}>
        
        <button className="carousel-nav prev-btn" onClick={goToPrev}>
          <ChevronLeft size={32} />
        </button>
        
        <div className="carousel-track" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
          {banners.map((banner) => (
            <div key={banner.id} className="carousel-slide">
              <img src={banner.img} alt={banner.alt} className="carousel-image" />
            </div>
          ))}
        </div>

        <button className="carousel-nav next-btn" onClick={goToNext}>
          <ChevronRight size={32} />
        </button>

        <div className="carousel-indicators">
          {banners.map((_, idx) => (
            <button
              key={idx}
              className={`indicator ${idx === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(idx)}
            />
          ))}
        </div>

      </div>
    </div>
  );
};

export default HeroCarousel;
