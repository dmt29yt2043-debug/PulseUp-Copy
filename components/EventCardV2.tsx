'use client';

import { useState } from 'react';
import type { Event } from '@/lib/types';
import { useFavorites } from '@/lib/FavoritesContext';

interface EventCardV2Props {
  event: Event;
  isHovered: boolean;
  isSelected: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatPrice(event: Event): string {
  if (event.is_free) return 'FREE';
  if (event.price_min > 0) return `$${event.price_min}`;
  return '';
}

export default function EventCardV2({
  event,
  isHovered,
  isSelected,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: EventCardV2Props) {
  const [imgError, setImgError] = useState(false);
  const { isFavorite, toggle } = useFavorites();
  const liked = isFavorite(event.id);
  const priceText = formatPrice(event);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggle(event);
  };

  return (
    <div
      data-event-id={event.id}
      className={`event-card-v2 ${isHovered ? 'hovered' : ''} ${isSelected ? 'selected' : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {/* Image container */}
      <div className="event-card-v2-image">
        {event.image_url && !imgError ? (
          <img
            src={event.image_url}
            alt={event.title}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="event-card-v2-placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}

        {/* Favorite button */}
        <button className="event-card-v2-fav" onClick={handleLike}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={liked ? '#e91e63' : 'none'} stroke={liked ? '#e91e63' : 'white'} strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      {/* Card body */}
      <div className="event-card-v2-body">
        <h3 className="event-card-v2-title">{event.title}</h3>

        {event.venue_name && (
          <p className="event-card-v2-venue">{event.venue_name}</p>
        )}

        <div className="event-card-v2-bottom">
          <p className="event-card-v2-date">{formatDate(event.next_start_at)}</p>
          {priceText && (
            <span className="event-card-v2-price">{priceText}</span>
          )}
        </div>
      </div>
    </div>
  );
}
