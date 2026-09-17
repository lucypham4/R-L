import { useEffect, useRef } from 'react';
import FilterSelect from './FilterSelect';
import './FilterSheet.css';

export default function FilterSheet({
  cuisine,
  category,
  year,
  cuisines,
  categories,
  years,
  onChangeCuisine,
  onChangeCategory,
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
          <FilterSelect label="Cuisine" value={cuisine} options={cuisines} onChange={onChangeCuisine} onClear={() => onChangeCuisine('')} />
          <FilterSelect label="Category" value={category} options={categories} onChange={onChangeCategory} onClear={() => onChangeCategory('')} />
          <FilterSelect label="Year" value={year} options={years} onChange={onChangeYear} onClear={() => onChangeYear('')} />
        </div>
      </div>
    </div>
  );
}
