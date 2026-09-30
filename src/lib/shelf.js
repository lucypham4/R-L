// The archive as the dish view walks it. The list is newest first, and
// the numbering runs the other way ("No. 12 of 47" is the twelfth oldest),
// so `delta` +1 -- the next number up -- is one place towards the front of
// the list.
//
// The ends are joined: one step past the newest dish is the oldest, and
// one step back from the oldest is the newest, so a swipe never runs out
// of dishes. With a single dish there's nowhere to go.

/** The dish `delta` steps along from `list[index]`, or undefined. */
export function stepOnShelf(list, index, delta) {
  const n = list.length;
  if (n < 2 || index < 0) return undefined;
  return list[(((index - delta) % n) + n) % n];
}
