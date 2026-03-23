'use client';

import { useState } from 'react';

interface WhoFilterProps {
  ageMax?: number;
  onApply: (ageMax?: number) => void;
  onClose: () => void;
}

export default function WhoFilter({ ageMax: initialAge, onApply, onClose }: WhoFilterProps) {
  const [age, setAge] = useState<string>(initialAge !== undefined ? String(initialAge) : '');

  const handleApply = () => {
    onApply(age ? parseInt(age, 10) : undefined);
  };

  const handleClear = () => {
    setAge('');
  };

  return (
    <div className="filter-dialog-backdrop" onClick={onClose}>
      <div className="filter-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Who is going?</h3>

        <div className="mb-6">
          <label className="block text-sm text-gray-600 mb-1">Child age</label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="e.g. 5"
            min="0"
            max="18"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#e91e63]"
          />
          <p className="text-xs text-gray-400 mt-1">Filter events appropriate for this age</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleClear}
            className="flex-1 py-2 px-4 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
