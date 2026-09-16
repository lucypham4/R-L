import { useEffect, useMemo, useState } from 'react';
import Gallery from './Gallery';
import MealDetailModal from './MealDetailModal';
import { fetchChefBySlug } from '../lib/chefsApi';
import { fetchMeals } from '../lib/mealsApi';
import './PublicChefPage.css';

export default function PublicChefPage({ slug }) {
  const [status, setStatus] = useState('loading'); // loading | ready | not-found | error
  const [chef, setChef] = useState(null);
  const [meals, setMeals] = useState([]);
  const [openMealId, setOpenMealId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const chefProfile = await fetchChefBySlug(slug);
        if (!chefProfile) {
          if (!cancelled) setStatus('not-found');
          return;
        }
        const rows = await fetchMeals(chefProfile.id);
        if (cancelled) return;
        setChef(chefProfile);
        setMeals(rows);
        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Could not load this page.');
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Shareable meal links, same pattern as the admin app.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialMealId = params.get('meal');
    if (initialMealId) setOpenMealId(initialMealId);

    function onPopState() {
      const p = new URLSearchParams(window.location.search);
      setOpenMealId(p.get('meal'));
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const sortedMeals = useMemo(
    () => [...meals].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [meals]
  );
  const openIndex = sortedMeals.findIndex((m) => String(m.id) === String(openMealId));
  const openMeal = openIndex >= 0 ? sortedMeals[openIndex] : null;

  function handleOpenMeal(meal) {
    const url = new URL(window.location);
    url.searchParams.set('meal', meal.id);
    window.history.pushState({}, '', url);
    setOpenMealId(meal.id);
  }

  function closeMeal() {
    const url = new URL(window.location);
    url.searchParams.delete('meal');
    window.history.pushState({}, '', url);
    setOpenMealId(null);
  }

  if (status === 'loading') return null;

  if (status === 'not-found') {
    return (
      <div className="public-chef-missing">
        <p className="public-chef-missing-title">No chef at this page</p>
        <p className="public-chef-missing-body">Double-check the link.</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="public-chef-missing">
        <p className="public-chef-missing-title">Something went wrong</p>
        <p className="public-chef-missing-body">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <Gallery
        meals={sortedMeals}
        onOpenMeal={handleOpenMeal}
        title={chef.displayName}
        tagline="Portfolio & archive"
      />

      {openMeal && (
        <MealDetailModal
          meal={openMeal}
          index={sortedMeals.length - openIndex}
          total={sortedMeals.length}
          onClose={closeMeal}
        />
      )}
    </div>
  );
}
