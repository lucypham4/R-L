import { useEffect, useMemo, useState } from 'react';
import Avatar from './Avatar';
import Gallery from './Gallery';
import MealDetailModal from './MealDetailModal';
import { SpecialtyTags, SocialLinks, chefTitle } from './ChefDetails';
import { fetchChefBySlug, DEFAULT_PAGE_THEME } from '../lib/chefsApi';
import { fetchMeals } from '../lib/mealsApi';
import { leaveDish, pushDish, replaceDish } from '../lib/dishHistory';
import { stepOnShelf } from '../lib/shelf';
import './PublicChefPage.css';

/**
 * Who the page belongs to, at the top: their picture and name, where else
 * to find them, their bio and their specialties, all centred above the
 * dishes.
 */
function ChefHeader({ chef, headerRef }) {
  return (
    <header ref={headerRef} className="public-chef-header">
      <div className="public-chef-identity">
        <Avatar src={chef.avatarUrl} size={112} />
        <h1 className="public-chef-name">{chefTitle(chef.displayName)}</h1>
      </div>
      <SocialLinks links={chef.links} className="public-chef-links" />
      {chef.bio && <p className="public-chef-bio">{chef.bio}</p>}
      <SpecialtyTags specialties={chef.specialties} className="public-chef-tags" />
    </header>
  );
}

/**
 * Once the header has scrolled away, the chef stays with the reader: a
 * small picture and their name pinned to the top, the dishes fading out
 * beneath it. Decorative -- the heading it repeats is still in the page.
 */
function useScrolledPast(el) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return past;
}

export default function PublicChefPage({ slug }) {
  const [status, setStatus] = useState('loading'); // loading | ready | not-found | error
  const [chef, setChef] = useState(null);
  const [meals, setMeals] = useState([]);
  const [openMealId, setOpenMealId] = useState(null);
  const [error, setError] = useState('');
  // A callback ref: the header only exists once the chef has loaded.
  const [headerEl, setHeaderEl] = useState(null);
  const scrolledPast = useScrolledPast(headerEl);

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
      <div className={`public-chef-bar ${scrolledPast ? 'public-chef-bar-shown' : ''}`} aria-hidden="true">
        <div className="public-chef-bar-inner">
          <Avatar src={chef.avatarUrl} size={56} />
          <span className="public-chef-bar-name">{chefTitle(chef.displayName)}</span>
        </div>
      </div>

      <Gallery
        meals={sortedMeals}
        onOpenMeal={handleOpenMeal}
        header={<ChefHeader chef={chef} headerRef={setHeaderEl} />}
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
