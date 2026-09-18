import { useEffect, useRef } from 'react';
import FilterSelect from './FilterSelect';
import './Bubbles.css';
import './FilterSheet.css';

export default function FilterSheet({
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

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="filter-sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="filter-sheet" role="dialog" aria-modal="true" aria-label="Filters">
        <div className="filter-sheet-header">
          <h2 className="filter-sheet-title">Filters</h2>
          <div className="filter-sheet-header-actions">
            {hasActiveFilters && (
              <button type="button" className="filter-sheet-clear-all" onClick={onClearAll}>
                Clear all
              </button>
            )}
            <button ref={closeRef} type="button" className="filter-sheet-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>

        <div className="filter-sheet-body">
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
