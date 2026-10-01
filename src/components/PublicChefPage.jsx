import { useEffect, useMemo, useState } from 'react';
import Gallery from './Gallery';
import MealDetailModal from './MealDetailModal';
import { SpecialtyTags, SocialLinks } from './ChefDetails';
import { fetchChefBySlug, DEFAULT_PAGE_THEME } from '../lib/chefsApi';
import { fetchMeals } from '../lib/mealsApi';
import { leaveDish, pushDish, replaceDish } from '../lib/dishHistory';
import { stepOnShelf } from '../lib/shelf';
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

  // The public page renders the chef's chosen theme, not the visitor's OS
  // preference: this page is the chef's published work, so it should look
  // the same to every client they send it to. Setting data-theme
  // explicitly also pins it, since tokens.css only lets
  // prefers-color-scheme win when the attribute is absent.
  useEffect(() => {
    document.documentElement.dataset.theme = chef?.pageTheme ?? DEFAULT_PAGE_THEME;
  }, [chef]);

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
  const prevMeal = stepOnShelf(sortedMeals, openIndex, -1);
  const nextMeal = stepOnShelf(sortedMeals, openIndex, 1);

  function handleOpenMeal(meal) {
    pushDish(meal.id);
    setOpenMealId(meal.id);
  }

  // A client reading a chef's page steps between dishes the same way the
  // chef does: by swipe, arrow or arrow key. `delta` is in the modal's
  // numbering, which runs opposite to newest-first sortedMeals, and wraps
  // round at both ends (lib/shelf.js).
  function handleStepMeal(delta) {
    const next = stepOnShelf(sortedMeals, openIndex, delta);
    if (!next) return;
    replaceDish(next.id);
    setOpenMealId(next.id);
  }

  function closeMeal() {
    leaveDish();
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
        about={
          <div className="public-chef-about">
            {chef.bio && <p className="public-chef-bio">{chef.bio}</p>}
            <SpecialtyTags specialties={chef.specialties} />
            <SocialLinks links={chef.links} />
          </div>
        }
      />

      {openMeal && (
        <MealDetailModal
          meal={openMeal}
          index={sortedMeals.length - openIndex}
          total={sortedMeals.length}
          onClose={closeMeal}
          onStep={handleStepMeal}
          prevMeal={prevMeal}
          nextMeal={nextMeal}
        />
      )}
    </div>
  );
}
