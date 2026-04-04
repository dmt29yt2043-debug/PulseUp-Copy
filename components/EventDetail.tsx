'use client';

import { useState, useMemo } from 'react';
import type { Event } from '@/lib/types';
import { useFavorites } from '@/lib/FavoritesContext';

interface EventDetailProps {
  event: Event | null;
  open: boolean;
  onClose: () => void;
}

type DetailTab = 'overview' | 'good_to_know' | 'reviews' | 'location';

/* ── helpers ── */

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatTime(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const h = d.getHours();
    if (h === 0 && d.getMinutes() === 0) return 'All day';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function priceLabel(event: Event): string {
  if (event.is_free) return 'Free';
  if (event.price_summary) return event.price_summary;
  if (event.price_min > 0 && event.price_max > 0) return `$${event.price_min}–$${event.price_max}`;
  if (event.price_min > 0) return `$${event.price_min}+`;
  return '—';
}

/* ── sub-components ── */

function MetaBar({ event }: { event: Event }) {
  const cols = [
    { label: 'DATE', value: formatDateShort(event.next_start_at) },
    { label: 'START TIME', value: formatTime(event.next_start_at) },
    { label: 'VENUE', value: event.venue_name || '—' },
    { label: 'AGE GROUP', value: event.age_label || 'All Ages' },
    { label: 'PRICE', value: priceLabel(event) },
  ];

  return (
    <div className="ed-meta-bar">
      {cols.map((c, i) => (
        <div key={i} className="ed-meta-col">
          <span className="ed-meta-label">{c.label}</span>
          <span className={`ed-meta-value${c.label === 'PRICE' && event.is_free ? ' ed-free' : ''}`}>
            {c.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function OverviewTab({ event }: { event: Event }) {
  return (
    <div className="ed-tab-content">
      {event.description && (
        <>
          <h3 className="ed-section-title">
            <span className="ed-sparkle">✦</span> description
          </h3>
          <p className="ed-body">{event.description}</p>
        </>
      )}

      {/* Categories as chips */}
      {event.categories && event.categories.length > 0 && (
        <div className="ed-chips">
          {event.categories.map((cat) => (
            <span key={cat} className="ed-chip">{cat}</span>
          ))}
        </div>
      )}

      {/* Accessibility info */}
      {(event.data?.venue_stroller_friendly || event.data?.venue_wheelchair_accessible) && (
        <div className="ed-access-info">
          {event.data.venue_wheelchair_accessible && (
            <span className="ed-access-badge">♿ Wheelchair accessible</span>
          )}
          {event.data.venue_stroller_friendly && (
            <span className="ed-access-badge">🍼 Stroller friendly</span>
          )}
        </div>
      )}
    </div>
  );
}

function GoodToKnowItem({ label, text }: { label: string; text: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = text.length > 80 ? text.slice(0, 80) + '...' : text;

  return (
    <div className="ed-gtk-item">
      <div className="ed-gtk-header">
        <span className="ed-gtk-label">{label}</span>
        {text.length > 80 && (
          <button className="ed-gtk-more" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'LESS' : 'SHOW MORE'} ›
          </button>
        )}
      </div>
      <p className="ed-gtk-text">{expanded ? text : preview}</p>
    </div>
  );
}

function GoodToKnowTab({ event }: { event: Event }) {
  const d = event.derisk;
  if (!d) return <p className="ed-empty">No additional info available.</p>;

  const sections = [
    { label: 'What You Get', value: d.what_you_get },
    { label: 'Practical Tips', value: d.practical_tips },
    { label: 'Best For & Duration', value: [d.who_its_best_for, d.duration].filter(Boolean).join('. ') || undefined },
    { label: 'Crowds', value: d.crowds },
    { label: 'What to Expect', value: d.what_to_expect },
    { label: 'How to Get There', value: d.how_to_get_there },
    { label: 'Tickets', value: d.tickets_availability },
    { label: 'Price Info', value: d.price_info },
    { label: 'Verdict', value: d.verdict },
  ].filter((s) => s.value) as { label: string; value: string }[];

  if (sections.length === 0) return <p className="ed-empty">No additional info available.</p>;

  return (
    <div className="ed-tab-content">
      <h3 className="ed-section-title">Good to know</h3>
      <div className="ed-gtk-list">
        {sections.map((s) => (
          <GoodToKnowItem key={s.label} label={s.label} text={s.value} />
        ))}
      </div>
    </div>
  );
}

function ReviewsTab({ event }: { event: Event }) {
  if (!event.reviews || event.reviews.length === 0) {
    return <p className="ed-empty">No reviews yet.</p>;
  }

  return (
    <div className="ed-tab-content">
      <h3 className="ed-section-title">
        Reviews
        {event.rating_avg > 0 && (
          <span className="ed-rating-inline"> ★ {event.rating_avg.toFixed(1)}</span>
        )}
      </h3>
      <div className="ed-reviews-list">
        {event.reviews.map((review, i) => (
          <div key={i} className="ed-review-card">
            <p className="ed-review-text">&ldquo;{review.text}&rdquo;</p>
            {review.source && <p className="ed-review-source">{review.source}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function LocationTab({ event }: { event: Event }) {
  const hasCoords = event.lat != null && event.lon != null;

  return (
    <div className="ed-tab-content">
      <h3 className="ed-section-title">Location</h3>

      {/* Details */}
      <div className="ed-location-details">
        {event.venue_name && (
          <div className="ed-loc-row">
            <span className="ed-loc-icon">📍</span>
            <span className="ed-loc-value">{event.venue_name}</span>
          </div>
        )}
        {event.address && (
          <div className="ed-loc-row">
            <span className="ed-loc-icon">🏠</span>
            <span className="ed-loc-value">{event.address}</span>
          </div>
        )}
        {event.subway && (
          <div className="ed-loc-row">
            <span className="ed-loc-icon">🚇</span>
            <span className="ed-loc-value">{event.subway}</span>
          </div>
        )}
        {event.derisk?.how_to_get_there && (
          <p className="ed-body" style={{ marginTop: 12 }}>{event.derisk.how_to_get_there}</p>
        )}
      </div>

      {/* Mini map */}
      {hasCoords && (
        <div className="ed-minimap">
          <img
            src={`https://api.tomtom.com/map/1/staticimage?layer=basic&style=night&format=png&zoom=15&center=${event.lon},${event.lat}&width=440&height=260&key=AazPA2VhMEk25KTIGOQ4Y5m84sZ8FhJC`}
            alt="Map"
            className="ed-minimap-img"
            onError={(e) => {
              // Fallback: OpenStreetMap static
              (e.target as HTMLImageElement).src = `https://staticmap.openstreetmap.de/staticmap.php?center=${event.lat},${event.lon}&zoom=15&size=440x260&markers=${event.lat},${event.lon},red-pushpin`;
            }}
          />
          <div className="ed-minimap-pin" />
        </div>
      )}
    </div>
  );
}

/* ── main component ── */

export default function EventDetail({ event, open, onClose }: EventDetailProps) {
  const [imgError, setImgError] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const { isFavorite, toggle } = useFavorites();
  const liked = event ? isFavorite(event.id) : false;

  // Count available tabs
  const tabs = useMemo<{ key: DetailTab; label: string }[]>(() => {
    const t: { key: DetailTab; label: string }[] = [{ key: 'overview', label: 'Overview' }];
    if (event?.derisk && Object.values(event.derisk).some(Boolean)) {
      t.push({ key: 'good_to_know', label: 'Good to know' });
    }
    t.push({ key: 'reviews', label: 'Reviews' });
    t.push({ key: 'location', label: 'Location' });
    return t;
  }, [event]);

  // Reset tab when event changes
  const [prevId, setPrevId] = useState<number | null>(null);
  if (event && event.id !== prevId) {
    setPrevId(event.id);
    setActiveTab('overview');
    setImgError(false);
  }

  if (!event) return null;

  return (
    <>
      <div
        className={`event-detail-backdrop ${open ? 'open' : ''}`}
        onClick={onClose}
      />
      <div className={`event-detail-overlay ${open ? 'open' : ''}`}>
        {/* ── Top bar: X, Share, Save ── */}
        <div className="ed-topbar">
          <button onClick={onClose} className="ed-topbar-btn" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div className="ed-topbar-right">
            <button className="ed-topbar-btn" aria-label="Share" onClick={() => navigator.share?.({ title: event.title, url: event.source_url || window.location.href }).catch(() => {})}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
            <button
              className={`ed-topbar-btn ${liked ? 'ed-liked' : ''}`}
              aria-label="Save"
              onClick={() => toggle(event)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={liked ? '#ff8d89' : 'none'} stroke={liked ? '#ff8d89' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
        </div>

        {/* ── Title + location + rating ── */}
        <div className="ed-header">
          <h2 className="ed-title">{event.title}</h2>
          <div className="ed-subtitle-row">
            {event.city && <span className="ed-subtitle-item">{event.city}</span>}
            {event.venue_name && (
              <>
                <span className="ed-dot">·</span>
                <span className="ed-subtitle-item">{event.venue_name}</span>
              </>
            )}
            {event.rating_avg > 0 && (
              <>
                <span className="ed-dot">·</span>
                <span className="ed-rating">★ {event.rating_avg.toFixed(1)}</span>
              </>
            )}
          </div>
        </div>

        {/* ── Hero image ── */}
        <div className="ed-hero">
          {event.image_url && !imgError ? (
            <img
              src={event.image_url}
              alt={event.title}
              className="ed-hero-img"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="ed-hero-placeholder">
              <span>🎪</span>
            </div>
          )}
        </div>

        {/* ── Metadata bar ── */}
        <MetaBar event={event} />

        {/* ── Tabs ── */}
        <div className="ed-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`ed-tab ${activeTab === tab.key ? 'ed-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="ed-content">
          {activeTab === 'overview' && <OverviewTab event={event} />}
          {activeTab === 'good_to_know' && <GoodToKnowTab event={event} />}
          {activeTab === 'reviews' && <ReviewsTab event={event} />}
          {activeTab === 'location' && <LocationTab event={event} />}
        </div>

        {/* ── Buy ticket ── */}
        {event.source_url && (
          <div className="ed-cta-wrap">
            <a
              href={event.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ed-cta"
            >
              Buy ticket
            </a>
          </div>
        )}
      </div>
    </>
  );
}
