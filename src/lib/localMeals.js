const KEY = 'meal-diary-local-meals';

/**
 * Storage for anyone using the app without an account: real persistence,
 * scoped to this one browser/device. Signing in later (optional, for
 * multi-device access) switches to Supabase instead; this never syncs.
 */
// Meals saved before the multi-photo update stored a single `photoUrl`
// string instead of a `photos` array; upgrade them in place on read so
// existing local photos keep showing instead of silently disappearing.
function migratePhotos(meal) {
  if (meal.photos) return meal;
  const { photoUrl, ...rest } = meal;
  return { ...rest, photos: photoUrl ? [photoUrl] : [] };
}

export function loadLocalMeals() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const meals = JSON.parse(raw).map(migratePhotos);
    saveLocalMeals(meals);
    return meals;
  } catch {
    return [];
  }
}

export function saveLocalMeals(meals) {
  try {
    localStorage.setItem(KEY, JSON.stringify(meals));
  } catch {
    // Storage blocked (private browsing, quota); meals just won't persist.
  }
}

// A sequential counter would collide across reloads once meals are actually
// persisted (it always restarts from the same number), unlike the in-memory
// demo mode it was borrowed from, so local meals get a real unique id.
function newLocalId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createLocalMeal(fields) {
  return {
    id: newLocalId(),
    ingredients: [],
    method: [],
    tags: [],
    note: '',
    serves: 2,
    ...fields,
  };
}
