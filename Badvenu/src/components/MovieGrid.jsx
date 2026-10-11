import React from 'react';
import MovieCard from './MovieCard';
import { ChevronRight } from 'lucide-react';
import './MovieGrid.css';

const movies = [
  { id: 1, title: 'Inception', genre: 'Action/Sci-Fi', rating: '8.8', votes: '2.2M', img: 'https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?auto=format&fit=crop&q=80&w=300&h=450' },
  { id: 2, title: 'Interstellar', genre: 'Adventure/Drama/Sci-Fi', rating: '8.6', votes: '1.6M', img: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&q=80&w=300&h=450' },
  { id: 3, title: 'The Dark Knight', genre: 'Action/Crime/Drama', rating: '9.0', votes: '2.5M', img: 'https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?auto=format&fit=crop&q=80&w=300&h=450' },
  { id: 4, title: 'Avatar', genre: 'Action/Adventure/Fantasy', rating: '7.8', votes: '1.2M', img: 'https://images.unsplash.com/photo-1518779578993-ec3579fee39f?auto=format&fit=crop&q=80&w=300&h=450' },
  { id: 5, title: 'The Matrix', genre: 'Action/Sci-Fi', rating: '8.7', votes: '1.8M', img: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&q=80&w=300&h=450' },
];

const MovieGrid = () => {
  return (
    <section className="section-container">
      <div className="container">
        <div className="section-header flex items-center justify-between">
          <h2 className="section-title">Recommendations of the Week</h2>
          <a href="#" className="see-all flex items-center">
            See All <ChevronRight size={16} />
          </a>
        </div>
        
        <div className="movie-grid">
          {movies.map(movie => (
            <MovieCard key={movie.id} {...movie} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default MovieGrid;
