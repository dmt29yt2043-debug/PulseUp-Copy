'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { Event, FilterState } from '@/lib/types';
import TopBar from '@/components/TopBar';
import FilterBar from '@/components/FilterBar';
import EventDetail from '@/components/EventDetail';
import ChatSidebar from '@/components/ChatSidebar';
import WhatFilter from '@/components/FilterDialogs/WhatFilter';
import WhenFilter from '@/components/FilterDialogs/WhenFilter';
import BudgetFilter from '@/components/FilterDialogs/BudgetFilter';
import WhoFilter from '@/components/FilterDialogs/WhoFilter';
import ResultCard from '@/components/discovery/ResultCard';
import type { MapBounds } from '@/components/discovery/discovery-state';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

interface Category {
  slug: string;
  label: string;
}

const PAGE_SIZE = 30;

export default function Home() {
  // Data state
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // UI state
  const [filters, setFilters] = useState<FilterState>({});
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  // Discovery state (inline instead of context for simpler wiring)
  const [hoveredItemId, setHoveredItemId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [searchAreaActive, setSearchAreaActive] = useState(false);
  const [boundsFiltered, setBoundsFiltered] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);

  // Fetch categories on mount
  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCategories(data);
      })
      .catch(console.error);
  }, []);

  // Fetch events when filters or page change
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('page_size', String(PAGE_SIZE));

      if (filters.categories && filters.categories.length > 0) {
        params.set('categories', filters.categories.join(','));
      }
      if (filters.excludeCategories && filters.excludeCategories.length > 0) {
        params.set('exclude_categories', filters.excludeCategories.join(','));
      }
      if (filters.priceMin !== undefined) {
        params.set('price_min', String(filters.priceMin));
      }
      if (filters.priceMax !== undefined) {
        params.set('price_max', String(filters.priceMax));
      }
      if (filters.isFree) {
        params.set('is_free', 'true');
      }
      if (filters.ageMax !== undefined) {
        params.set('age', String(filters.ageMax));
      }
      if (filters.dateFrom) {
        params.set('date_from', filters.dateFrom);
      }
      if (filters.dateTo) {
        params.set('date_to', filters.dateTo);
      }
      if (filters.search) {
        params.set('search', filters.search);
      }
      if (filters.lat && filters.lon && filters.distance) {
        params.set('lat', String(filters.lat));
        params.set('lon', String(filters.lon));
        params.set('distance', String(filters.distance));
      }

      const res = await fetch(`/api/events?${params.toString()}`);
      const data = await res.json();

      const evts = data.events || [];
      setEvents(evts);
      setFilteredEvents(evts);
      setTotal(data.total || 0);
      setBoundsFiltered(false);
      setSearchAreaActive(false);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Handlers
  const handleEventClick = useCallback((event: Event) => {
    setSelectedEvent(event);
    setDetailOpen(true);
    setSelectedItemId(event.id);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false);
    setTimeout(() => setSelectedEvent(null), 300);
  }, []);

  const handleFilterReset = useCallback(() => {
    setFilters({});
    setPage(1);
  }, []);

  const handleFiltersFromChat = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  // Discovery handlers
  const handleCardClick = useCallback((event: Event) => {
    setSelectedItemId(event.id);
    setSelectedEvent(event);
    setDetailOpen(true);
  }, []);

  const handleMapSelectItem = useCallback((id: number | null) => {
    setSelectedItemId(id);
    // Scroll to card in results list
    if (id != null && resultsRef.current) {
      const cardEl = resultsRef.current.querySelector(`[data-event-id="${id}"]`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, []);

  const handleViewDetailsFromMap = useCallback((event: Event) => {
    setSelectedEvent(event);
    setDetailOpen(true);
    setSelectedItemId(event.id);
  }, []);

  const handleSearchThisArea = useCallback(() => {
    if (!mapBounds) return;
    const inBounds = events.filter((e) => {
      if (e.lat == null || e.lon == null) return false;
      return (
        e.lat >= mapBounds.south &&
        e.lat <= mapBounds.north &&
        e.lon >= mapBounds.west &&
        e.lon <= mapBounds.east
      );
    });
    setFilteredEvents(inBounds);
    setBoundsFiltered(true);
    setSearchAreaActive(false);
  }, [mapBounds, events]);

  const handleBoundsChange = useCallback((bounds: MapBounds) => {
    setMapBounds(bounds);
  }, []);

  // Filter dialog handlers
  const handleWhatApply = useCallback(
    (included: string[], excluded: string[], search: string) => {
      setFilters((prev) => ({
        ...prev,
        categories: included.length > 0 ? included : undefined,
        excludeCategories: excluded.length > 0 ? excluded : undefined,
        search: search || undefined,
      }));
      setPage(1);
      setOpenFilter(null);
    },
    []
  );

  const handleWhenApply = useCallback((dateFrom: string, dateTo: string) => {
    setFilters((prev) => ({
      ...prev,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }));
    setPage(1);
    setOpenFilter(null);
  }, []);

  const handleBudgetApply = useCallback(
    (priceMin?: number, priceMax?: number, isFree?: boolean) => {
      setFilters((prev) => ({
        ...prev,
        priceMin,
        priceMax,
        isFree,
      }));
      setPage(1);
      setOpenFilter(null);
    },
    []
  );

  const handleWhoApply = useCallback((ageMax?: number) => {
    setFilters((prev) => ({
      ...prev,
      ageMax,
    }));
    setPage(1);
    setOpenFilter(null);
  }, []);

  const displayEvents = boundsFiltered ? filteredEvents : events;

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <FilterBar
        filters={filters}
        onOpenFilter={(name) => setOpenFilter(name)}
        onReset={handleFilterReset}
      />

      {/* Main split layout: chat | results | map */}
      <div className="discovery-layout">
        {/* Chat Sidebar */}
        <ChatSidebar
          filters={filters}
          onFiltersChange={handleFiltersFromChat}
          onEventClick={handleEventClick}
        />

        {/* Results column */}
        <div className="results-column" ref={resultsRef}>
          {loading ? (
            <div className="results-loading">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="result-skeleton">
                  <div className="result-skeleton-img" />
                  <div className="result-skeleton-text">
                    <div className="result-skeleton-line w-3/4" />
                    <div className="result-skeleton-line w-1/2" />
                    <div className="result-skeleton-line w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : displayEvents.length === 0 ? (
            <div className="results-empty">
              <p className="text-gray-500 text-base">No events found</p>
              <p className="text-gray-400 text-sm mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              <div className="results-header">
                <span className="text-xs text-gray-500">
                  {boundsFiltered
                    ? `${displayEvents.length} events in this area`
                    : `${total} events`}
                </span>
              </div>
              <div className="results-list">
                {displayEvents.map((event) => (
                  <ResultCard
                    key={event.id}
                    event={event}
                    isHovered={hoveredItemId === event.id}
                    isSelected={selectedItemId === event.id}
                    onMouseEnter={() => setHoveredItemId(event.id)}
                    onMouseLeave={() => setHoveredItemId(null)}
                    onClick={() => handleCardClick(event)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Map column */}
        <div className="map-column">
          <MapView
            events={displayEvents}
            hoveredItemId={hoveredItemId}
            selectedItemId={selectedItemId}
            onHoverItem={setHoveredItemId}
            onSelectItem={handleMapSelectItem}
            onBoundsChange={handleBoundsChange}
            onSearchAreaActive={setSearchAreaActive}
            searchAreaActive={searchAreaActive}
            onSearchThisArea={handleSearchThisArea}
            onViewDetails={handleViewDetailsFromMap}
          />
        </div>
      </div>

      {/* Event Detail Overlay */}
      <EventDetail
        event={selectedEvent}
        open={detailOpen}
        onClose={handleCloseDetail}
      />

      {/* Filter Dialogs */}
      {openFilter === 'what' && (
        <WhatFilter
          categories={categories}
          includedCategories={filters.categories || []}
          excludedCategories={filters.excludeCategories || []}
          search={filters.search || ''}
          onApply={handleWhatApply}
          onClose={() => setOpenFilter(null)}
        />
      )}
      {openFilter === 'when' && (
        <WhenFilter
          dateFrom={filters.dateFrom || ''}
          dateTo={filters.dateTo || ''}
          onApply={handleWhenApply}
          onClose={() => setOpenFilter(null)}
        />
      )}
      {openFilter === 'budget' && (
        <BudgetFilter
          priceMin={filters.priceMin}
          priceMax={filters.priceMax}
          isFree={filters.isFree}
          onApply={handleBudgetApply}
          onClose={() => setOpenFilter(null)}
        />
      )}
      {openFilter === 'who' && (
        <WhoFilter
          ageMax={filters.ageMax}
          onApply={handleWhoApply}
          onClose={() => setOpenFilter(null)}
        />
      )}
    </div>
  );
}
