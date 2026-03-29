'use client';

import { useState } from 'react';

interface Category {
  slug: string;
  label: string;
}

type ChipState = 'neutral' | 'include' | 'exclude';

interface WhatFilterProps {
  categories: Category[];
  includedCategories: string[];
  excludedCategories: string[];
  search: string;
  onApply: (included: string[], excluded: string[], search: string) => void;
  onClose: () => void;
}

export default function WhatFilter({
  categories,
  includedCategories,
  excludedCategories,
  search: initialSearch,
  onApply,
  onClose,
}: WhatFilterProps) {
  const [chipStates, setChipStates] = useState<Record<string, ChipState>>(() => {
    const states: Record<string, ChipState> = {};
    categories.forEach((cat) => {
      if (includedCategories.includes(cat.slug)) {
        states[cat.slug] = 'include';
      } else if (excludedCategories.includes(cat.slug)) {
        states[cat.slug] = 'exclude';
      } else {
        states[cat.slug] = 'neutral';
      }
    });
    return states;
  });
  const [search, setSearch] = useState(initialSearch);

  const cycleState = (slug: string) => {
    setChipStates((prev) => {
      const current = prev[slug] || 'neutral';
      const next: ChipState =
        current === 'neutral' ? 'include' : current === 'include' ? 'exclude' : 'neutral';
      return { ...prev, [slug]: next };
    });
  };

  const handleApply = () => {
    const included = Object.entries(chipStates)
      .filter(([, state]) => state === 'include')
      .map(([slug]) => slug);
    const excluded = Object.entries(chipStates)
      .filter(([, state]) => state === 'exclude')
      .map(([slug]) => slug);
    onApply(included, excluded, search);
  };

  const handleClear = () => {
    const cleared: Record<string, ChipState> = {};
    categories.forEach((cat) => {
      cleared[cat.slug] = 'neutral';
    });
    setChipStates(cleared);
    setSearch('');
  };

  return (
    <div className="filter-dialog-backdrop" onClick={onClose}>
      <div className="filter-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4 text-white">What are you looking for?</h3>

        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search keywords..."
            className="w-full px-3 py-2 border border-[rgba(255,255,255,0.1)] rounded-lg text-sm focus:outline-none focus:border-[#e91e63] bg-[#16143a] text-white placeholder-gray-500"
          />
        </div>

        <p className="text-xs text-gray-500 mb-3">
          Click to include (green), click again to exclude (red), click again to reset
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => cycleState(cat.slug)}
              className={`category-chip ${chipStates[cat.slug] || 'neutral'}`}
            >
              {chipStates[cat.slug] === 'include' && '+ '}
              {chipStates[cat.slug] === 'exclude' && '- '}
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleClear}
            className="flex-1 py-2 px-4 rounded-lg border border-[rgba(255,255,255,0.15)] text-sm font-medium text-gray-400 hover:bg-[rgba(255,255,255,0.05)]"
          >
            Clear
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-2 px-4 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: '#e91e63' }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
