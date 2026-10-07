import { useCallback, useEffect, useRef, useState } from 'react';
import { tokenMs } from '../lib/motion';
import CloseIcon from './CloseIcon';
import FilterSelect from './FilterSelect';
import SegmentedToggle from './SegmentedToggle';
import { SORTS } from '../lib/dishOrder';
import './Bubbles.css';
import './FilterSheet.css';

export default function FilterSheet({
  sort,
  onChangeSort,
  selectedCuisines,
  selectedCategories,
  year,
  cuisines,
  categories,
  years,
  onToggleCuisine,
  onToggleCategory,
  onChangeYear,
  hasActiveFilters,
  onClearAll,
  onClose,
}) {
  const closeRef = useRef(null);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Every way out (the close button, the backdrop, Escape) goes through
  // here: the sheet plays its exit and is taken off the page once that has
  // run. How long that takes is the tokens' say, not copied here, so reduced
  // motion, which shortens them, shortens the wait with them.
  const requestClose = useCallback(() => {
    if (exitTimer.current !== null) return;
    setClosing(true);
    const exitMs = Math.max(tokenMs('--dur-move'), tokenMs('--dur-color'));
    exitTimer.current = setTimeout(() => onCloseRef.current(), exitMs);
  }, []);

  useEffect(() => () => clearTimeout(exitTimer.current), []);

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === 'Escape') requestClose();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [requestClose]);

  return (
    <div
      className={`filter-sheet-overlay ${closing ? 'filter-sheet-overlay-closing' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
    >
      <div className={`filter-sheet ${closing ? 'filter-sheet-closing' : ''}`} role="dialog" aria-modal="true" aria-label="Filters">
        <div className="filter-sheet-header">
          <h2 className="filter-sheet-title">Filters</h2>
          <div className="filter-sheet-header-actions">
            {hasActiveFilters && (
              <button type="button" className="filter-sheet-clear-all" onClick={onClearAll}>
                Clear all
              </button>
            )}
            <button ref={closeRef} type="button" className="filter-sheet-close" onClick={requestClose} aria-label="Close">
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        <div className="filter-sheet-body">
          {/* How the dishes are laid out, not which of them show, so
              Clear all leaves it be and it never lights the filter dot. */}
          <div className="filter-sheet-group">
            <span className="filter-sheet-label">Sort by</span>
            <SegmentedToggle
              label="Sort by"
              className="filter-sheet-sort"
              options={SORTS}
              value={sort}
              onChange={onChangeSort}
            />
          </div>

          <FilterChipGroup label="Cuisine" options={cuisines} selected={selectedCuisines} onToggle={onToggleCuisine} />
          <FilterChipGroup label="Category" options={categories} selected={selectedCategories} onToggle={onToggleCategory} />

          <div className="filter-sheet-group">
            <span className="filter-sheet-label">Year</span>
            <FilterSelect label="Year" value={year} options={years} onChange={onChangeYear} onClear={() => onChangeYear('')} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChipGroup({ label, options, selected, onToggle }) {
  if (options.length === 0) return null;

  return (
    <div className="filter-sheet-group">
      <span className="filter-sheet-label">{label}</span>
      <div className="bubble-row">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            className={`bubble ${selected.includes(option) ? 'bubble-selected' : ''}`}
            aria-pressed={selected.includes(option)}
            onClick={() => onToggle(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
