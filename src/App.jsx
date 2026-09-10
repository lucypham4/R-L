import { useEffect, useMemo, useState } from 'react';
import Gallery from './components/Gallery';
import MealDetailModal from './components/MealDetailModal';
import AddMealForm from './components/AddMealForm';
import ThemeToggle from './components/ThemeToggle';
import { initialMeals, createMeal } from './data/meals';
import './App.css';

export default function App() {
  const [meals, setMeals] = useState(initialMeals);
  const [openMealId, setOpenMealId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const sortedMeals = useMemo(
    () => [...meals].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [meals]
  );

  const cuisines = useMemo(() => Array.from(new Set(meals.map((m) => m.cuisine))).sort(), [meals]);
  const categories = useMemo(() => Array.from(new Set(meals.map((m) => m.category))).sort(), [meals]);

  const openIndex = sortedMeals.findIndex((m) => m.id === openMealId);
  const openMeal = openIndex >= 0 ? sortedMeals[openIndex] : null;

  function handleAddMeal(fields) {
    const meal = createMeal(fields);
    setMeals((prev) => [meal, ...prev]);
    setShowAddForm(false);
  }

  return (
    <div>
      <div className="app-topbar">
        <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))} />
      </div>

      <Gallery meals={sortedMeals} onOpenMeal={(meal) => setOpenMealId(meal.id)} onAddMeal={() => setShowAddForm(true)} />

      {openMeal && (
        <MealDetailModal
          meal={openMeal}
          index={sortedMeals.length - openIndex}
          total={sortedMeals.length}
          onClose={() => setOpenMealId(null)}
        />
      )}

      {showAddForm && (
        <AddMealForm cuisines={cuisines} categories={categories} onSave={handleAddMeal} onCancel={() => setShowAddForm(false)} />
      )}
    </div>
  );
}
