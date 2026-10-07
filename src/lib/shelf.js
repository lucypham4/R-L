import { sortDishes } from './dishOrder';

// The archive as the dish view walks it, in the order it numbers the
// dishes: No. 1 first, so `delta` +1 -- the next number up -- is the next
// dish in the list.
//
// Which order that is follows how the gallery is sorted. In the chef's
// own order (Custom) the shelf is that order, the way the grid reads, so
// stepping on from a dish brings up the one after it on the home screen
// or the public page. Sorted by date, newest or oldest first, it's the
// archive in the order the dishes were made, so "No. 12 of 47" is the
// twelfth oldest whichever way round the grid shows them.
//
// The ends are joined: one step past the last dish is the first, and one
// step back from the first is the last, so a swipe never runs out of
// dishes. With a single dish there's nowhere to go.

/** Every dish, in the order the dish view numbers and steps through them. */
export function shelfOf(meals, sort, order) {
  return sort === 'custom' ? sortDishes(meals, 'custom', order) : sortDishes(meals, 'oldest');
}

/** The dish `delta` steps along from `list[index]`, or undefined. */
export function stepOnShelf(list, index, delta) {
  const n = list.length;
  if (n < 2 || index < 0) return undefined;
  return list[(((index + delta) % n) + n) % n];
}
