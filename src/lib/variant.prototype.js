// PROTOTYPE, not production. Throwaway: see the prototype skill.
//
// Question: how would Staj differ if it were built to the apple-design
// skill (.claude/skills/apple-design) instead of as it is today?
//
// Two variants of the whole app, switchable with `?variant=` and the
// floating bar (PrototypeSwitcher):
//
//   today  Staj as it ships.
//   apple  Where the skill disagrees with the app, the skill wins:
//          - swipes between dishes and the two bottom sheets run on springs
//            that take over the finger's speed, and pick where to land by
//            projecting that speed forward (momentum), not by a distance
//            threshold;
//          - the filter and action sheets can be dragged down to dismiss,
//            and grabbed again while they move;
//          - press release settles without overshoot (no bounce on a tap);
//          - reading text and small labels are set in the system face.
//
// The choice is held for the tab (sessionStorage) as well as in the URL, so
// a link that drops the query string doesn't drop the variant.

import { prefersReducedMotion } from './motion';

export const VARIANTS = [
  { key: 'today', name: 'Staj today' },
  { key: 'apple', name: 'apple-design skill' },
];

const KEY = 'staj-prototype-variant';

function stored() {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Reads the variant from the URL, then the tab, and applies it. */
export function initVariant() {
  const asked = new URLSearchParams(window.location.search).get('variant');
  const key = VARIANTS.some((v) => v.key === asked) ? asked : stored();
  setVariant(VARIANTS.some((v) => v.key === key) ? key : 'today', { explicit: Boolean(asked || stored()) });
}

let explicitlyAsked = false;

export function setVariant(key, { explicit = true } = {}) {
  document.documentElement.dataset.variant = key;
  explicitlyAsked ||= explicit;
  if (!explicit) return;
  try {
    sessionStorage.setItem(KEY, key);
  } catch {
    // Private mode: the URL still carries it.
  }
  const url = new URL(window.location);
  url.searchParams.set('variant', key);
  window.history.replaceState(window.history.state, '', url);
}

export function currentVariant() {
  return document.documentElement.dataset.variant ?? 'today';
}

/**
 * Whether the bar shows: in development, on a Vercel preview, or wherever
 * someone has asked for a variant by name. A stray merge can't show it to
 * a chef who never typed `?variant=`.
 */
export function showSwitcher() {
  return import.meta.env.DEV || import.meta.env.VITE_VERCEL_ENV === 'preview' || explicitlyAsked;
}

/**
 * The skill's motion, where it applies. Under reduced motion the apple
 * variant falls back to today's motion, which already substitutes fades for
 * travel (motion.md), so the comparison is only of the full-motion paths.
 */
export function appleMotion() {
  return currentVariant() === 'apple' && !prefersReducedMotion();
}
