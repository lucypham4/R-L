const KEYS = {
  category: 'meal-diary-categories',
  cuisine: 'meal-diary-cuisines',
};

// Category: the standard menu courses. Cuisine: four of the world's most
// widely eaten cuisines, a reasonable starting point rather than a
// definitive ranking. Both lists are just a starting point, edited in
// place from the bubble picker itself.
const DEFAULTS = {
  category: ['Appetizer', 'Entree', 'Dessert', 'Amuse Bouche'],
  cuisine: ['Italian', 'Chinese', 'Japanese', 'Mexican'],
};

export function loadBubbleList(kind) {
  try {
    const raw = localStorage.getItem(KEYS[kind]);
    return raw ? JSON.parse(raw) : [...DEFAULTS[kind]];
  } catch {
    return [...DEFAULTS[kind]];
  }
}

export function saveBubbleList(kind, list) {
  try {
    localStorage.setItem(KEYS[kind], JSON.stringify(list));
  } catch {
    // Storage blocked; the list just won't be remembered next time.
  }
}
