// The JavaScript half of the motion system.
//
// CSS handles reduced motion on its own, by neutralising the movement
// tokens in tokens.css. But motion driven from JS -- a smooth scroll, a
// Rive state machine -- can't read those tokens, so it asks here
// instead. Keeping the query in one module means there's a single answer
// to "does this user want movement" across the whole app.

const QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion() {
  // matchMedia is missing in non-browser contexts (SSR, tests, the
  // static-site export path). Treating that as "no preference" keeps the
  // default behaviour unchanged.
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

// Subscribes to changes in the preference, so a component can re-render
// if the chef flips the OS setting while the app is open. Returns an
// unsubscribe function, shaped for useEffect.
export function onReducedMotionChange(handler) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  const listener = (e) => handler(e.matches);
  mql.addEventListener('change', listener);
  return () => mql.removeEventListener('change', listener);
}

// Scroll helper that degrades to an instant jump under reduced motion,
// where a long smooth scroll is precisely the kind of movement the
// setting exists to suppress.
export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

// The same, for any scroll container.
export function scrollElementTo(el, top) {
  el.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

// Reads a duration token (`--dur-dissolve`, `--dur-color`) as
// milliseconds. A timer or a Web Animation that has to line up with the
// CSS reads the token rather than copying its value, so reduced motion,
// which redefines the tokens, shortens both at once.
export function tokenMs(name) {
  if (typeof window === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = parseFloat(raw);
  if (Number.isNaN(value)) return 0;
  return raw.endsWith('ms') ? value : value * 1000;
}
