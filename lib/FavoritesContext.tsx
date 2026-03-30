'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Event } from './types';

interface FavoritesContextValue {
  favorites: Set<number>;
  toggle: (event: Event) => void;
  isFavorite: (id: number) => boolean;
  favoriteEvents: Event[];
}

const FavoritesContext = createContext<FavoritesContextValue>({
  favorites: new Set(),
  toggle: () => {},
  isFavorite: () => false,
  favoriteEvents: [],
});

const STORAGE_KEY = 'pulseup_favorites';

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favoriteMap, setFavoriteMap] = useState<Map<number, Event>>(new Map());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const arr: Event[] = JSON.parse(stored);
        setFavoriteMap(new Map(arr.map((e) => [e.id, e])));
      }
    } catch {}
  }, []);

  const toggle = useCallback((event: Event) => {
    setFavoriteMap((prev) => {
      const next = new Map(prev);
      if (next.has(event.id)) {
        next.delete(event.id);
      } else {
        next.set(event.id, event);
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next.values())));
      } catch {}
      return next;
    });
  }, []);

  const isFavorite = useCallback((id: number) => favoriteMap.has(id), [favoriteMap]);

  const favorites = new Set(favoriteMap.keys());
  const favoriteEvents = Array.from(favoriteMap.values());

  return (
    <FavoritesContext.Provider value={{ favorites, toggle, isFavorite, favoriteEvents }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
