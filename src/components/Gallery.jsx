import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar';
import Button from './Button';
import CloseIcon from './CloseIcon';
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
  title = 'Staj',
  // In place of the wordmark header: a public page puts its chef there.
  header,
  // Called after the search or a filter changes what's shown, once the
  // grid has re-rendered, with whether anything is narrowing the list. The
  // public page uses it to bring the results up under its header when the
  // search is docked there.
  onQueryChange,
  // The chef's picture, top right, which opens their profile. A public
  // page leaves it out: its visitors have no profile of their own here.
  avatarUrl,
  onOpenProfile,
}) {
  const [search, setSearch] = useState('');
  const [selectedCuisines, setSelectedCuisines] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [year, setYear] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [actionSheetMeal, setActionSheetMeal] = useState(null);
  // Why the last × in edit mode didn't delete its dish, shown in the edit
  // bar where the chef is looking. The dish stays in the grid.
  const [editError, setEditError] = useState('');
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
      const haystack = [m.name, m.cuisine, m.category, m.summary, m.description, ...(m.ingredients || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const activeFilterCount = selectedCuisines.length + selectedCategories.length + (year ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  const queryKey = JSON.stringify([query, selectedCuisines, selectedCategories, year]);
  const lastQueryKey = useRef(queryKey);
  useEffect(() => {
    if (lastQueryKey.current === queryKey) return;
    lastQueryKey.current = queryKey;
    onQueryChange?.(Boolean(query) || hasActiveFilters);
  }, [queryKey, onQueryChange, query, hasActiveFilters]);

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

  async function handleDeleteFromBadge(id) {
    setEditError('');
    try {
      await onDeleteMeal(id);
    } catch (err) {
      setEditError(err.message || "Couldn't delete this dish.");
    }
  }

  async function handleDeleteFromSheet(id) {
    await onDeleteMeal(id);
    setActionSheetMeal(null);
  }

  return (
    <div className="gallery">
      {header ?? (
        <header className={`gallery-header ${editMode ? 'gallery-header-editing' : ''}`}>
          <h1 className="gallery-title">{title}</h1>
          {onOpenProfile && (
            <button type="button" className="gallery-avatar" onClick={onOpenProfile} aria-label="My profile">
              <Avatar src={avatarUrl} size={36} />
            </button>
          )}
        </header>
      )}

      <div className="gallery-search-row">
        <div className="gallery-search">
          <div className="gallery-search-field">
            <SearchIcon />
            <input
              type="search"
              className="gallery-search-input"
              placeholder="Search dishes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search dishes"
            />
          </div>
          <button
            type="button"
            className={`gallery-filter-btn ${hasActiveFilters ? 'gallery-filter-btn-active' : ''}`}
            onClick={() => setShowFilters(true)}
            aria-label={hasActiveFilters ? `Open filters, ${activeFilterCount} active` : 'Open filters'}
            aria-haspopup="dialog"
          >
            <FilterIcon />
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
          {editError ? (
            <span className="gallery-edit-error" role="alert">
              {editError}
            </span>
          ) : (
            <span>
              Tap <CloseIcon className="gallery-edit-hint-icon" size={14} label="the cross" /> to delete a dish
            </span>
          )}
          <button
            type="button"
            className="gallery-edit-done"
            onClick={() => {
              setEditMode(false);
              setEditError('');
            }}
          >
            Done
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        meals.length === 0 ? (
          <div className="gallery-empty-state">
            {/* The first thing a new chef sees, with no tour before it
                (ADR 0004), so it says what the app is for and hands them
                the one thing to do next. */}
            <h2 className="gallery-empty-title">No dishes yet</h2>
            <p className="gallery-empty-body">Snap a photo or sketch it, and it'll live here.</p>
            {onAddMeal && (
              <Button variant="primary" onClick={onAddMeal}>
                Add your first dish
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
              onDelete={handleDeleteFromBadge}
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

// Two parallel lines, each with a round hollow node on it, the nodes
// staggered (the top one left of centre, the bottom one right of it). The
// lines stop at a node's edge on either side rather than running through it.
function FilterIcon() {
  return (
    <svg viewBox="0 0 512 512" fill="none" stroke="currentColor" strokeWidth="40" strokeLinecap="round" aria-hidden="true">
      <path d="M22 172H66M190 172H488" />
      <circle cx="127" cy="172" r="62" />
      <path d="M22 340H322M446 340H488" />
      <circle cx="385" cy="340" r="62" />
    </svg>
  );
}
