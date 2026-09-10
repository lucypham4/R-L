import { useMemo, useState } from 'react';
import Button from './Button';
import FilterSelect from './FilterSelect';
import MealCard from './MealCard';
import './Gallery.css';

export default function Gallery({ meals, onOpenMeal, onAddMeal }) {
  const [cuisine, setCuisine] = useState('');
  const [category, setCategory] = useState('');
  const [year, setYear] = useState('');

  const cuisines = useMemo(() => uniqueSorted(meals.map((m) => m.cuisine)), [meals]);
  const categories = useMemo(() => uniqueSorted(meals.map((m) => m.category)), [meals]);
  const years = useMemo(
    () => uniqueSorted(meals.map((m) => String(new Date(m.date).getFullYear()))).sort().reverse(),
    [meals]
  );

  const filtered = meals.filter((m) => {
    if (cuisine && m.cuisine !== cuisine) return false;
    if (category && m.category !== category) return false;
    if (year && String(new Date(m.date).getFullYear()) !== year) return false;
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
          <h1 className="gallery-title">Meal Diary</h1>
          <p className="gallery-tagline">Private chef · portfolio &amp; archive</p>
        </div>
        <Button variant="secondary" onClick={onAddMeal}>
          + Add meal
        </Button>
      </header>

      <div className="gallery-filters">
        <FilterSelect label="Cuisine" value={cuisine} options={cuisines} onChange={setCuisine} onClear={() => setCuisine('')} />
        <FilterSelect label="Category" value={category} options={categories} onChange={setCategory} onClear={() => setCategory('')} />
        <FilterSelect label="Year" value={year} options={years} onChange={setYear} onClear={() => setYear('')} />
        {hasActiveFilters && (
          <Button variant="ghost" onClick={clearFilters}>
            Clear
          </Button>
        )}
        <span className="gallery-count">
          {filtered.length} of {meals.length} meals
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="gallery-empty">No meals match those filters.</p>
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
