import React from 'react';
import { MessageCircle, Globe, Camera, Tv } from 'lucide-react';
import './Footer.css';
import Link from "next/link";

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container">

        <div className="footer-top flex items-center justify-between" style={{ padding: '20px 0', borderBottom: '1px solid #333', marginBottom: '20px' }}>
          <div className="footer-contact">
            <h4 className="footer-heading" style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>Want to list your show?</h4>
          </div>
          {/* <button className="btn-primary contact-btn" style={{ padding: '10px 20px', borderRadius: '4px' }}>Contact Us</button>
           */}
          <Link
            href="/contact"
            className="btn-primary contact-btn"
            style={{ padding: "10px 20px", borderRadius: "4px" }}
          >
            Contact Us
          </Link>
        </div>

        <div className="footer-links-container">
          <div className="footer-logo flex justify-center items-center">
            <span className="logo-text text-light">bad<span className="brand-red">venu</span></span>
          </div>

          <div className="social-links flex justify-center items-center gap-4">
            <div className="social-icon"><MessageCircle size={20} /></div>
            <div className="social-icon"><Globe size={20} /></div>
            <div className="social-icon"><Camera size={20} /></div>
            <div className="social-icon"><Tv size={20} /></div>
          </div>

          <p className="copyright-text text-center">
            Copyright 2024 © Badvenu Entertainment. All Rights Reserved.
            <br />
            The content and images used on this site are copyright protected and copyrights vests with the respective owners. The usage of the content and images on this website is intended to promote the works and no endorsement of the artist shall be implied. Unauthorized use is prohibited and punishable by law.
          </p>
        </div>

      </div>
    </footer>
  );
};

export default Footer;
