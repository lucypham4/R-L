import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar';
import Gallery from './Gallery';
import MealDetailModal from './MealDetailModal';
import { SpecialtyTags, SocialLinks, chefTitle } from './ChefDetails';
import { fetchChefBySlug, DEFAULT_PAGE_THEME } from '../lib/chefsApi';
import { fetchMeals } from '../lib/mealsApi';
import { leaveDish, pushDish, replaceDish } from '../lib/dishHistory';
import { shelfOf, stepOnShelf } from '../lib/shelf';
import { useLingering } from '../lib/useLingering';
import { measureChefHeader, chefHeaderFrame, applyChefHeaderFrame, applyChefHeaderLayout, resultsScroll } from '../lib/chefHeader';
import { prefersReducedMotion, onReducedMotionChange, tokenMs } from '../lib/motion';
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

// The pieces that travel between the header and the bar. Under reduced
// motion they jump instead, and fade in where they land.
const TRAVELLERS = ['travelAvatar', 'travelName', 'travelNameSmall'];

/**
 * Drives the picture and name between the header and the pinned bar from
 * the scroll position (lib/chefHeader.js), docks the search under them, and
 * snaps the page between the two rests. Returns a ref binder for the
 * pieces, whether the travelling copies have taken over yet (until the
 * first measure they stay hidden and the header's own show), and what to
 * do when the search or a filter changes the dishes shown.
 */
function useTravellingHeader(ready) {
  const els = useRef({});
  const bind = useCallback((key) => (el) => {
    els.current[key] = el;
  }, []);
  const [travelling, setTravelling] = useState(false);
  const geometry = useRef(null);
  const remeasure = useRef(null);
  const lift = useRef(0);

  // Searching from the docked bar leaves the reader where they are unless
  // the results now start above the screen; then they are brought up to
  // just under the bar, which stays collapsed. With a short header the
  // dishes reach the bar before it has finished collapsing, so at the
  // collapsed rest the first of them is under it; while a search or filter
  // narrows the list from there, the results are let down by that much, and
  // put back when the search is cleared.
  const keepResultsInView = useCallback((narrowed) => {
    const g = geometry.current;
    const count = els.current.count;
    if (!g || !g.search || !count) return;
    const docked = window.scrollY >= g.distance - 1;
    const base = g.search.results - lift.current;
    const next = narrowed && (docked || lift.current > 0) ? Math.max(0, Math.ceil(g.distance - base)) : 0;
    if (next !== lift.current) {
      lift.current = next;
      count.style.marginTop = next ? `${next}px` : '';
      remeasure.current?.();
    }
    const top = resultsScroll(geometry.current);
    if (window.scrollY > top) window.scrollTo(0, top);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const e = els.current;
    // The search and the gallery are Gallery's; found rather than bound.
    e.search = e.root?.querySelector('.gallery-search');
    e.count = e.root?.querySelector('.gallery-count');
    e.gallery = e.root?.querySelector('.gallery');
    const keys = ['root', 'startAvatar', 'startName', 'endAvatar', 'endName', 'endSearch', 'backdrop', 'snapCollapsed', 'search', 'gallery', ...TRAVELLERS];
    if (keys.some((k) => !e[k])) return;

    let g = null;
    let last = null;
    let quantise = prefersReducedMotion();
    // Straight from the scroll event, as the dish sheet does: a frame
    // scheduled after it would land a frame behind the page.
    const render = () => {
      if (!g) return;
      const f = chefHeaderFrame(window.scrollY, g, quantise);
      applyChefHeaderFrame(f, g, e);
      if (quantise && last && last.m !== f.m) {
        const duration = tokenMs('--dur-color');
        for (const key of TRAVELLERS) {
          const to = Number(getComputedStyle(e[key]).opacity);
          if (to > 0) e[key].animate([{ opacity: 0 }, { opacity: to }], { duration, easing: 'ease-out' });
        }
      }
      last = f;
    };
    const measure = () => {
      g = measureChefHeader(e);
      geometry.current = g;
      applyChefHeaderLayout(g, e);
      render();
    };

    measure();
    remeasure.current = measure;
    setTravelling(true);
    document.documentElement.classList.add('public-chef-snap');
    window.addEventListener('scroll', render, { passive: true });
    window.addEventListener('resize', measure);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resize?.observe(e.startName);
    document.fonts?.ready.then(measure);
    const offMotion = onReducedMotionChange((reduce) => {
      quantise = reduce;
      render();
    });
    return () => {
      document.documentElement.classList.remove('public-chef-snap');
      e.root.style.removeProperty('--public-search-dock');
      e.gallery.style.minHeight = '';
      e.search.style.translate = '';
      if (e.count) {
        e.count.style.opacity = '';
        e.count.style.marginTop = '';
      }
      lift.current = 0;
      remeasure.current = null;
      geometry.current = null;
      window.removeEventListener('scroll', render);
      window.removeEventListener('resize', measure);
      resize?.disconnect();
      offMotion();
    };
  }, [ready]);

  return { bind, travelling, keepResultsInView };
}

export default function PublicChefPage({ slug }) {
  const [status, setStatus] = useState('loading'); // loading | ready | not-found | error
  const [chef, setChef] = useState(null);
  const [meals, setMeals] = useState([]);
  const [openMealId, setOpenMealId] = useState(null);
  // In the chef's own order to begin with: the page is their work, laid
  // out as they arranged it. A visitor can sort it by date instead, but
  // has no way to rearrange it.
  const [sort, setSort] = useState('custom');
  const [error, setError] = useState('');
  const { bind, travelling, keepResultsInView } = useTravellingHeader(status === 'ready');

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

  const shelf = useMemo(() => shelfOf(meals, sort, chef?.dishOrder), [meals, sort, chef]);
  const openIndex = shelf.findIndex((m) => String(m.id) === String(openMealId));
  const openMeal = openIndex >= 0 ? shelf[openIndex] : null;
  // The dish stays on the page while its photo flies back to its card; see
  // App.jsx.
  const { shown, leaving, key: shownKey, done: dishGone } = useLingering(openMeal);
  const shownIndex = shown ? shelf.findIndex((m) => m.id === shown.id) : -1;
  const prevMeal = stepOnShelf(shelf, shownIndex, -1);
  const nextMeal = stepOnShelf(shelf, shownIndex, 1);

  function handleOpenMeal(meal) {
    pushDish(meal.id);
    setOpenMealId(meal.id);
  }

  // A client reading a chef's page steps between dishes the same way the
  // chef does: by swipe, arrow or arrow key, through the chef's own order
  // unless they've sorted by date. `delta` is in the modal's numbering,
  // and wraps round at both ends (lib/shelf.js).
  function handleStepMeal(delta) {
    const next = stepOnShelf(shelf, openIndex, delta);
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
    <div ref={bind('root')} className={`public-chef-page ${travelling ? 'public-chef-travelling' : ''}`}>
      {/* The bar the chef settles into: a backdrop that fades in as they
          arrive, and empty slots marking where the picture and name end
          up, and under them where the search docks. Decorative, like the
          travelling copies: the heading is in the header, and the search
          is the page's own, which sticks in that slot. */}
      <div className="public-chef-bar" aria-hidden="true">
        <div ref={bind('backdrop')} className="public-chef-bar-backdrop" />
        <div className="public-chef-bar-inner">
          <span ref={bind('endAvatar')} className="public-chef-bar-avatar" />
          <span ref={bind('endName')} className="public-chef-bar-name">
            {name}
          </span>
        </div>
        <span ref={bind('endSearch')} className="public-chef-bar-search" />
      </div>
      <div ref={bind('travelAvatar')} className="public-chef-travel-avatar" aria-hidden="true">
        <Avatar src={chef.avatarUrl} size={112} />
      </div>
      <span ref={bind('travelName')} className="public-chef-travel-name" aria-hidden="true">
        {name}
      </span>
      <span ref={bind('travelNameSmall')} className="public-chef-travel-name public-chef-travel-name-small" aria-hidden="true">
        {name}
      </span>

      <Gallery
        meals={meals}
        onOpenMeal={handleOpenMeal}
        onQueryChange={keepResultsInView}
        header={<ChefHeader chef={chef} bind={bind} />}
        sort={sort}
        onSortChange={setSort}
        dishOrder={chef.dishOrder}
      />

      {/* The collapsed rest's snap area, from where the name sits in the
          bar to the end of the page, and a last snap point at the very
          end (see PublicChefPage.css). */}
      <div ref={bind('snapCollapsed')} className="public-chef-snap-area" aria-hidden="true" />
      <div className="public-chef-snap-end" aria-hidden="true" />

      {shown && (
        <MealDetailModal
          key={shownKey}
          meal={shown}
          index={shownIndex >= 0 ? shownIndex + 1 : shelf.length}
          total={shelf.length}
          exiting={leaving}
          onExited={dishGone}
          onClose={closeMeal}
          onStep={handleStepMeal}
          prevMeal={prevMeal}
          nextMeal={nextMeal}
        />
      )}
    </div>
  );
}
