import { useEffect, useMemo, useState } from 'react';
import Button from './Button';
import FilterSheet from './FilterSheet';
import MealCard from './MealCard';
import MealActionSheet from './MealActionSheet';
import './Gallery.css';

// Cards past this index all share the same entrance delay, so a long
// archive's cascade finishes in about a second instead of scaling with
// the number of meals.
const STAGGER_CAP = 12;

// How long the entrance stays armed after the first cards render. Covers
// the capped cascade (STAGGER_CAP * --stagger-step) plus one --dur-enter,
// with room to spare.
const INTRO_WINDOW_MS = 900;

export default function Gallery({
  meals,
  onOpenMeal,
  onAddMeal,
  onDeleteMeal,
  title = 'Meal Diary',
  tagline = 'Private chef · portfolio & archive',
}) {
  const [search, setSearch] = useState('');
  const [selectedCuisines, setSelectedCuisines] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [year, setYear] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [actionSheetMeal, setActionSheetMeal] = useState(null);
  // The staggered entrance is a first-impression flourish, not a
  // permanent property of the grid. Once the intro window closes the
  // class comes off, so re-filtering never replays it.
  const [introDone, setIntroDone] = useState(false);

  const cuisines = useMemo(() => uniqueSorted(meals.map((m) => m.cuisine)), [meals]);
  const categories = useMemo(() => uniqueSorted(meals.map((m) => m.category)), [meals]);
  const years = useMemo(
    () => uniqueSorted(meals.map((m) => String(new Date(m.date).getFullYear()))).sort().reverse(),
    [meals]
  );

  const hasRenderedMeals = meals.length > 0;

  useEffect(() => {
    if (!hasRenderedMeals || introDone) return;
    const timer = setTimeout(() => setIntroDone(true), INTRO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [hasRenderedMeals, introDone]);

  const query = search.trim().toLowerCase();

  const filtered = meals.filter((m) => {
    if (selectedCuisines.length && !selectedCuisines.includes(m.cuisine)) return false;
    if (selectedCategories.length && !selectedCategories.includes(m.category)) return false;
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

  const hasActiveFilters = Boolean(selectedCuisines.length || selectedCategories.length || year);

  function toggleCuisine(value) {
    setSelectedCuisines((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function toggleCategory(value) {
    setSelectedCategories((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function clearFilters() {
    setSelectedCuisines([]);
    setSelectedCategories([]);
    setYear('');
  }

  async function handleDeleteFromSheet(id) {
    await onDeleteMeal(id);
    setActionSheetMeal(null);
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
          selectedCuisines={selectedCuisines}
          selectedCategories={selectedCategories}
          year={year}
          cuisines={cuisines}
          categories={categories}
          years={years}
          onToggleCuisine={toggleCuisine}
          onToggleCategory={toggleCategory}
          onChangeYear={setYear}
          hasActiveFilters={hasActiveFilters}
          onClearAll={clearFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      {editMode && (
        <div className="gallery-edit-bar">
          <span>Tap × to delete a dish</span>
          <button type="button" className="gallery-edit-done" onClick={() => setEditMode(false)}>
            Done
          </button>
        </div>
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
        <div className={`gallery-grid ${introDone ? '' : 'gallery-grid-intro'}`}>
          {filtered.map((meal, i) => (
            <MealCard
              key={meal.id}
              meal={meal}
              style={{ '--stagger-index': Math.min(i, STAGGER_CAP) }}
              onOpen={onOpenMeal}
              onLongPress={onDeleteMeal ? setActionSheetMeal : undefined}
              editMode={editMode}
              onDelete={onDeleteMeal}
            />
          ))}
        </div>
      )}

      {actionSheetMeal && (
        <MealActionSheet
          meal={actionSheetMeal}
          onClose={() => setActionSheetMeal(null)}
          onDelete={handleDeleteFromSheet}
          onEditGallery={() => {
            setEditMode(true);
            setActionSheetMeal(null);
          }}
        />
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
