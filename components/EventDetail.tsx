'use client';

import { useState } from 'react';
import type { Event } from '@/lib/types';
import { useFavorites } from '@/lib/FavoritesContext';

interface EventDetailProps {
  event: Event | null;
  open: boolean;
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function DeriskSection({ event }: { event: Event }) {
  const [expanded, setExpanded] = useState(false);
  const d = event.derisk;
  if (!d) return null;

  const fields: { label: string; value: string | undefined }[] = [
    { label: 'Crowds', value: d.crowds },
    { label: 'Duration', value: d.duration },
    { label: 'Price Info', value: d.price_info },
    { label: 'What You Get', value: d.what_you_get },
    { label: 'What to Expect', value: d.what_to_expect },
    { label: 'Practical Tips', value: d.practical_tips },
    { label: 'How to Get There', value: d.how_to_get_there },
    { label: 'Best For', value: d.who_its_best_for },
    { label: 'Tickets', value: d.tickets_availability },
    { label: 'Verdict', value: d.verdict },
  ].filter((f) => f.value);

  if (fields.length === 0) return null;

  return (
    <div className="border-t border-[rgba(255,255,255,0.08)] pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="font-semibold text-sm text-white">Good to Know</span>
        <span className="text-gray-500 text-lg">{expanded ? '\u2212' : '+'}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-3">
          {fields.map((f) => (
            <div key={f.label}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {f.label}
              </p>
              <p className="text-sm text-gray-300 mt-0.5">{f.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewsSection({ event }: { event: Event }) {
  const [expanded, setExpanded] = useState(false);
  if (!event.reviews || event.reviews.length === 0) return null;

  return (
    <div className="border-t border-[rgba(255,255,255,0.08)] pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="font-semibold text-sm text-white">
          Reviews ({event.reviews.length})
          {event.rating_avg > 0 && (
            <span className="ml-2 text-yellow-400">
              {'*'.repeat(Math.round(event.rating_avg))} {event.rating_avg.toFixed(1)}
            </span>
          )}
        </span>
        <span className="text-gray-500 text-lg">{expanded ? '\u2212' : '+'}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-3">
          {event.reviews.map((review, i) => (
            <div key={i} className="bg-[#1e1b4b] rounded-lg p-3">
              <p className="text-sm text-gray-300">{review.text}</p>
              {review.source && (
                <p className="text-xs text-gray-500 mt-1">{review.source}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EventDetail({ event, open, onClose }: EventDetailProps) {
  const [imgError, setImgError] = useState(false);
  const { isFavorite, toggle } = useFavorites();
  const liked = event ? isFavorite(event.id) : false;

  if (!event) return null;

  return (
    <>
      <div
        className={`event-detail-backdrop ${open ? 'open' : ''}`}
        onClick={onClose}
      />
      <div className={`event-detail-overlay ${open ? 'open' : ''}`}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="sticky top-3 left-auto ml-auto mr-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-[#1e1b4b] shadow-md text-gray-400 hover:text-white"
          style={{ float: 'right' }}
        >
          &#10005;
        </button>

        {/* Image */}
        <div className="relative aspect-[16/9] bg-[#1e1b4b]">
          {event.image_url && !imgError ? (
            <img
              src={event.image_url}
              alt={event.title}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1e1b4b] to-[#2a2563]">
              <span className="text-6xl">&#127915;</span>
            </div>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Title and heart */}
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-xl font-bold text-white leading-snug">{event.title}</h2>
            <button
              onClick={() => event && toggle(event)}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-[rgba(255,255,255,0.15)] hover:border-pink-400 transition-colors"
            >
              <span style={{ color: liked ? '#e91e63' : '#9ca3af', fontSize: 18 }}>
                {liked ? '\u2764' : '\u2661'}
              </span>
            </button>
          </div>

          {/* Tagline */}
          {event.tagline && (
            <p className="text-sm text-gray-400 italic">{event.tagline}</p>
          )}

          {/* Metadata */}
          <div className="space-y-2 text-sm">
            {event.next_start_at && (
              <div className="flex items-start gap-2">
                <span className="text-gray-500 w-5 text-center">&#128197;</span>
                <span className="text-gray-300">{formatDate(event.next_start_at)}</span>
              </div>
            )}
            {event.venue_name && (
              <div className="flex items-start gap-2">
                <span className="text-gray-500 w-5 text-center">&#128205;</span>
                <span className="text-gray-300">{event.venue_name}</span>
              </div>
            )}
            {event.address && (
              <div className="flex items-start gap-2">
                <span className="text-gray-500 w-5 text-center">&#127968;</span>
                <span className="text-gray-300">{event.address}</span>
              </div>
            )}
            {event.subway && (
              <div className="flex items-start gap-2">
                <span className="text-gray-500 w-5 text-center">&#128647;</span>
                <span className="text-gray-300">{event.subway}</span>
              </div>
            )}
            {event.categories && event.categories.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-gray-500 w-5 text-center">&#127991;</span>
                <div className="flex flex-wrap gap-1">
                  {event.categories.map((cat) => (
                    <span
                      key={cat}
                      className="px-2 py-0.5 bg-[rgba(255,255,255,0.06)] text-gray-400 text-xs rounded"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {event.age_label && (
              <div className="flex items-start gap-2">
                <span className="text-gray-500 w-5 text-center">&#128118;</span>
                <span className="text-gray-300">{event.age_label}</span>
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="text-gray-500 w-5 text-center">&#128176;</span>
              <span
                className="font-semibold"
                style={{ color: event.is_free ? '#22c55e' : 'white' }}
              >
                {event.is_free
                  ? 'Free'
                  : event.price_summary || `$${event.price_min}-$${event.price_max}`}
              </span>
            </div>
          </div>

          {/* Description */}
          {event.description && (
            <div className="border-t border-[rgba(255,255,255,0.08)] pt-4">
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                {event.description}
              </p>
            </div>
          )}

          {/* Good to Know */}
          <DeriskSection event={event} />

          {/* Reviews */}
          <ReviewsSection event={event} />

          {/* Buy ticket button */}
          {event.source_url && (
            <div className="pt-4">
              <a
                href={event.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center py-3 rounded-lg text-white font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#e91e63' }}
              >
                Buy Ticket
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
