// The open dish lives in the URL (`?meal=<id>`), so a dish can be linked
// to and the browser's back button closes it.
//
// Opening a dish pushes a history entry and stepping to the next replaces
// it, so Back leaves the dish rather than walking every dish you passed.
// Closing pops that entry when this page pushed it. It used to push a
// second, meal-less entry instead, which left the browser's back button
// reopening the dish you had just closed -- the opposite of what the
// dish's back arrow promises.

const DISH = { dish: true };

function urlWith(id) {
  const url = new URL(window.location);
  if (id === null) url.searchParams.delete('meal');
  else url.searchParams.set('meal', id);
  return url;
}

export function pushDish(id) {
  window.history.pushState(DISH, '', urlWith(id));
}

export function replaceDish(id) {
  window.history.replaceState(window.history.state, '', urlWith(id));
}

/**
 * Leaves the open dish. Goes back when the entry was pushed by opening it
 * here; a dish reached by a link has nothing of ours behind it, so its
 * entry is rewritten in place instead of leaving the site.
 */
export function leaveDish() {
  if (window.history.state?.dish) {
    window.history.back();
    return;
  }
  if (new URL(window.location).searchParams.has('meal')) {
    window.history.replaceState(window.history.state, '', urlWith(null));
  }
}

/**
 * Whether the open dish was opened from the gallery on this page, as
 * opposed to reached by a link. The first leaves a card behind for the
 * dish's photo to fly out of and back to (lib/dishFlight.js); the second has
 * no such card to speak of: nobody tapped it.
 */
export function openedFromGallery() {
  return Boolean(window.history.state?.dish);
}
