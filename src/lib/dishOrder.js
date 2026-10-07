// The order the gallery lays dishes out in: newest first, oldest first, or
// the chef's own. The chef's own is a list of dish ids, set by holding a
// dish on the home screen and dragging it somewhere else. Signed in, it's
// saved to their profile, which is how their public page shows the dishes
// in the same order; without an account it's kept on this device.

export const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'custom', label: 'Custom' },
];

export const DEFAULT_SORT = 'newest';

const SORT_KEY = 'staj-dish-sort';
const ORDER_KEY = 'staj-dish-order';

function isSort(value) {
  return SORTS.some((s) => s.value === value);
}

/** How this device last sorted the home screen. */
export function loadSort() {
  try {
    const stored = localStorage.getItem(SORT_KEY);
    return isSort(stored) ? stored : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

export function saveSort(sort) {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    // Storage blocked: the sort just won't be remembered.
  }
}

/** A guest's custom order, as dish ids. */
export function loadLocalOrder() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function saveLocalOrder(ids) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: the order lasts until the page is reloaded.
  }
}

const time = (meal) => new Date(meal.date).getTime() || 0;

/**
 * `meals` laid out by `sort`. Under 'custom', dishes follow `order`;
 * any it doesn't name yet -- logged since the chef last arranged them, or
 * every dish, before they ever have -- go first, newest first, the way a
 * new dish lands at the top of the newest-first list.
 */
export function sortDishes(meals, sort, order = []) {
  const newest = [...meals].sort((a, b) => time(b) - time(a));
  // The exact mirror of newest first, dishes from the same day included,
  // so the two date sorts are the same archive read from either end.
  if (sort === 'oldest') return newest.reverse();
  if (sort !== 'custom') return newest;
  const rank = new Map(order.map((id, i) => [String(id), i]));
  const unplaced = newest.filter((m) => !rank.has(String(m.id)));
  const placed = newest
    .filter((m) => rank.has(String(m.id)))
    .sort((a, b) => rank.get(String(a.id)) - rank.get(String(b.id)));
  return [...unplaced, ...placed];
}

/** `ids` with `id` taken out and put back in at `index`. */
export function moveId(ids, id, index) {
  const rest = ids.filter((x) => x !== id);
  rest.splice(index, 0, id);
  return rest;
}

/**
 * The whole archive's order after `id` was dragged within a filtered view
 * of it. `all` is every dish id in the order the grid was showing them
 * in; `visible` is the ids on screen, after the drag. The dish lands
 * straight after whichever visible dish now comes before it (or before
 * the one after it, if it went to the front), so the dishes the filter
 * hid keep their places relative to everything else.
 */
export function placeAmong(all, visible, id) {
  const at = visible.indexOf(id);
  const rest = all.filter((x) => x !== id);
  if (at > 0) {
    rest.splice(rest.indexOf(visible[at - 1]) + 1, 0, id);
  } else if (visible.length > 1) {
    rest.splice(rest.indexOf(visible[1]), 0, id);
  } else {
    return all;
  }
  return rest;
}
