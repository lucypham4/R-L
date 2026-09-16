const KEY = 'meal-diary-local-meals';

/**
 * Storage for anyone using the app without an account — real persistence,
 * scoped to this one browser/device. Signing in later (optional, for
 * multi-device access) switches to Supabase instead; this never syncs.
 */
export function loadLocalMeals() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalMeals(meals) {
  try {
    localStorage.setItem(KEY, JSON.stringify(meals));
  } catch {
    // Storage blocked (private browsing, quota) — meals just won't persist.
  }
}

// A sequential counter would collide across reloads once meals are actually
// persisted (it always restarts from the same number), unlike the in-memory
// demo mode it was borrowed from — so local meals get a real unique id.
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
