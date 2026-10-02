import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar';
import Gallery from './Gallery';
import MealDetailModal from './MealDetailModal';
import { SpecialtyTags, SocialLinks, chefTitle } from './ChefDetails';
import { fetchChefBySlug, DEFAULT_PAGE_THEME } from '../lib/chefsApi';
import { fetchMeals } from '../lib/mealsApi';
import { leaveDish, pushDish, replaceDish } from '../lib/dishHistory';
import { stepOnShelf } from '../lib/shelf';
import { measureChefHeader, chefHeaderFrame, applyChefHeaderFrame } from '../lib/chefHeader';
import { prefersReducedMotion, onReducedMotionChange } from '../lib/motion';
import './PublicChefPage.css';

/**
 * Who the page belongs to, at the top: their picture and name, where else
 * to find them, their bio and their specialties, all centred above the
 * dishes. The picture and name here hold their place (and give screen
 * readers the heading); what you see of them is the travelling copy
 * below, which starts exactly on top of them.
 */
function ChefHeader({ chef, bind }) {
  return (
    <header className="public-chef-header">
      <div className="public-chef-identity">
        <span ref={bind('startAvatar')} className="public-chef-avatar-slot">
          <Avatar src={chef.avatarUrl} size={112} />
        </span>
        <h1 className="public-chef-name">
          <span ref={bind('startName')}>{chefTitle(chef.displayName)}</span>
        </h1>
      </div>
      <SocialLinks links={chef.links} className="public-chef-links" />
      {chef.bio && <p className="public-chef-bio">{chef.bio}</p>}
      <SpecialtyTags specialties={chef.specialties} className="public-chef-tags" />
    </header>
  );
}

/**
 * Drives the picture and name between the header and the pinned bar from
 * the scroll position (lib/chefHeader.js). Returns a ref binder for the
 * pieces, and whether the travelling copies have taken over yet: until
 * the first measure they stay hidden and the header's own show.
 */
function useTravellingHeader(ready) {
  const els = useRef({});
  const bind = useCallback((key) => (el) => {
    els.current[key] = el;
  }, []);
  const [travelling, setTravelling] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const e = els.current;
    const keys = ['startAvatar', 'startName', 'endAvatar', 'endName', 'travelAvatar', 'travelName', 'backdrop'];
    if (keys.some((k) => !e[k])) return;

    let g = null;
    let raf = 0;
    let quantise = prefersReducedMotion();
    const draw = () => {
      raf = 0;
      if (g) applyChefHeaderFrame(chefHeaderFrame(window.scrollY, g, quantise), g, e);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const measure = () => {
      g = measureChefHeader(e);
      draw();
    };

    measure();
    setTravelling(true);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', measure);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resize?.observe(e.startName);
    document.fonts?.ready.then(measure);
    const offMotion = onReducedMotionChange((reduce) => {
      quantise = reduce;
      draw();
    });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', measure);
      resize?.disconnect();
      offMotion();
    };
  }, [ready]);

  return { bind, travelling };
}

export default function PublicChefPage({ slug }) {
  const [status, setStatus] = useState('loading'); // loading | ready | not-found | error
  const [chef, setChef] = useState(null);
  const [meals, setMeals] = useState([]);
  const [openMealId, setOpenMealId] = useState(null);
  const [error, setError] = useState('');
  const { bind, travelling } = useTravellingHeader(status === 'ready');

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

  const name = chefTitle(chef.displayName);

  return (
    <div className={`public-chef-page ${travelling ? 'public-chef-travelling' : ''}`}>
      {/* The bar the chef settles into: a backdrop that fades in as they
          arrive, and empty slots marking where the picture and name end
          up. Decorative, like the travelling copies: the heading is in
          the header. */}
      <div className="public-chef-bar" aria-hidden="true">
        <div ref={bind('backdrop')} className="public-chef-bar-backdrop" />
        <div className="public-chef-bar-inner">
          <span ref={bind('endAvatar')} className="public-chef-bar-avatar" />
          <span ref={bind('endName')} className="public-chef-bar-name">
            {name}
          </span>
        </div>
      </div>
      <div ref={bind('travelAvatar')} className="public-chef-travel-avatar" aria-hidden="true">
        <Avatar src={chef.avatarUrl} size={112} />
      </div>
      <span ref={bind('travelName')} className="public-chef-travel-name" aria-hidden="true">
        {name}
      </span>

      <Gallery meals={sortedMeals} onOpenMeal={handleOpenMeal} header={<ChefHeader chef={chef} bind={bind} />} />

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
