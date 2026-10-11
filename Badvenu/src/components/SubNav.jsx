import React from 'react';
import './SubNav.css';

const SubNav = () => {
  return (
    <div className="subnav">
      <div className="container flex items-center justify-between subnav-inner">
        <ul className="flex items-center subnav-links nav-links-left">
          <li><button>Plays</button></li>
          <li><button>StandUp</button></li>
          <li><button>Sports</button></li>
          <li><button>Events</button></li>
          <li><button>Activities</button></li>
        </ul>

        <ul className="flex items-center subnav-links nav-links-right">
          <li><a href="/list-your-show">List Your Show</a></li>
          <li><a href="/my-shows">My Shows</a></li>
          {
          <li><a href="/host-dashboard">Dashboard</a></li>
          }
        </ul>
      </div>
    </div>
  );
};

export default SubNav;
