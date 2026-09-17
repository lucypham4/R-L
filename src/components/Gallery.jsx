import { useMemo, useState } from 'react';
import Button from './Button';
import FilterSheet from './FilterSheet';
import MealCard from './MealCard';
import './Gallery.css';

export default function Gallery({
  meals,
  onOpenMeal,
  onAddMeal,
  title = 'Meal Diary',
  tagline = 'Private chef · portfolio & archive',
}) {
  const [search, setSearch] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [category, setCategory] = useState('');
  const [year, setYear] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const cuisines = useMemo(() => uniqueSorted(meals.map((m) => m.cuisine)), [meals]);
  const categories = useMemo(() => uniqueSorted(meals.map((m) => m.category)), [meals]);
  const years = useMemo(
    () => uniqueSorted(meals.map((m) => String(new Date(m.date).getFullYear()))).sort().reverse(),
    [meals]
  );

  const query = search.trim().toLowerCase();

  const filtered = meals.filter((m) => {
    if (cuisine && m.cuisine !== cuisine) return false;
    if (category && m.category !== category) return false;
    if (year && String(new Date(m.date).getFullYear()) !== year) return false;
    if (query) {
      const haystack = [m.name, m.cuisine, m.category, m.description, ...(m.ingredients || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const hasActiveFilters = Boolean(cuisine || category || year);

  function clearFilters() {
    setCuisine('');
    setCategory('');
    setYear('');
  }

  return (
    <div className="gallery">
      <header className="gallery-header">
        <div>
          <h1 className="gallery-title">{title}</h1>
          <p className="gallery-tagline">{tagline}</p>
        </div>
      </header>

      <div className="gallery-search-row">
        <div className="gallery-search-field">
          <SearchIcon />
          <input
            type="search"
            className="gallery-search-input"
            placeholder="Search meals…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search meals"
          />
          <button
            type="button"
            className={`gallery-filter-btn ${hasActiveFilters ? 'gallery-filter-btn-active' : ''}`}
            onClick={() => setShowFilters(true)}
            aria-label="Open filters"
          >
            <FilterIcon />
            {hasActiveFilters && <span className="gallery-filter-dot" aria-hidden="true" />}
          </button>
        </div>
        <span className="gallery-count">
          {filtered.length} of {meals.length} meals
        </span>
      </div>

      {showFilters && (
        <FilterSheet
          cuisine={cuisine}
          category={category}
          year={year}
          cuisines={cuisines}
          categories={categories}
          years={years}
          onChangeCuisine={setCuisine}
          onChangeCategory={setCategory}
          onChangeYear={setYear}
          hasActiveFilters={hasActiveFilters}
          onClearAll={clearFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      {filtered.length === 0 ? (
        meals.length === 0 ? (
          <div className="gallery-empty-state">
            <h2 className="gallery-empty-title">Add your first dish</h2>
            <p className="gallery-empty-body">Start with a photo.</p>
            {onAddMeal && (
              <Button variant="primary" onClick={onAddMeal}>
                + Add meal
              </Button>
            )}
          </div>
        ) : (
          <p className="gallery-empty">No meals match those filters.</p>
        )
      ) : (
        <div className="gallery-grid">
          {filtered.map((meal) => (
            <MealCard key={meal.id} meal={meal} onOpen={onOpenMeal} />
          ))}
        </div>
      )}
    </div>
  );
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort();
}

function SearchIcon() {
  return (
    <svg className="gallery-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}
