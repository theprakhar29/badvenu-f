import React from 'react';
import './MovieGrid.css';

const bookings = [];

const YourBookings = () => {
  if (bookings.length === 0) return null;

  return (
    <section className="section-container" style={{ background: 'transparent' }}>
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">Your Bookings</h2>
        </div>
        
        <div className="bookings-list" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {bookings.map(booking => (
            <div key={booking.id} className="booking-card" style={{ 
              display: 'flex', 
              background: 'var(--bg-glass)', 
              backdropFilter: 'blur(10px)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px', 
              overflow: 'hidden', 
              boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
              width: '100%',
              maxWidth: '450px',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.borderColor = 'rgba(255, 0, 127, 0.4)'; e.currentTarget.style.boxShadow = '0 10px 25px rgba(255, 0, 127, 0.2)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)'; }}
            >
              <img src={booking.img} alt={booking.title} style={{ width: '120px', objectFit: 'cover' }} />
              <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h3 style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>{booking.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0' }}>{booking.date} | {booking.time}</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0', marginBottom: '16px' }}>Seats: {booking.seats}</p>
                <button className="btn-primary" style={{ alignSelf: 'flex-start', padding: '8px 20px', fontSize: '12px' }}>View Ticket</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default YourBookings;
