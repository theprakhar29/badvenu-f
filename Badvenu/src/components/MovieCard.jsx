import React from 'react';
import { Star } from 'lucide-react';

const MovieCard = ({ title, genre, rating, votes, img }) => {
  return (
    <div className="movie-card">
      <div className="img-container">
        <img src={img} alt={title} className="movie-poster" />
        <div className="rating-bar flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Star fill="#F84464" color="#F84464" size={14} />
            <span className="rating-score">{rating}/10</span>
          </div>
          <span className="votes-count">{votes} Votes</span>
        </div>
      </div>
      <div className="movie-details">
        <h3 className="movie-title">{title}</h3>
        <p className="movie-genre">{genre}</p>
      </div>
    </div>
  );
};

export default MovieCard;
