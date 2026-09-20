import { insertMeal } from './mealsApi';
import { loadLocalMeals, saveLocalMeals } from './localMeals';

// Local meals whose only photo refs are blob: URLs never survived a
// Cloudinary upload, so they're already dead after any reload (see
// cloudinary.js / the "won't survive a reload" notice) — nothing to carry
// across. Anything else (a Cloudinary secure_url) is already portable.
function withoutDeadPhotos(meal) {
  return { ...meal, photos: (meal.photos ?? []).filter((url) => !url.startsWith('blob:')) };
}

/**
 * Copies this browser's local meals into `userId`'s cloud account, one at a
 * time. Meals that insert successfully are dropped from local storage;
 * meals that fail (network, auth) are left there for a later retry.
 */
export async function importLocalMeals(userId) {
  const localMeals = loadLocalMeals();
  const imported = [];
  const remaining = [];

  for (const meal of localMeals) {
    try {
      imported.push(await insertMeal(withoutDeadPhotos(meal), userId));
    } catch {
      remaining.push(meal);
    }
  }

  saveLocalMeals(remaining);

  return { imported, succeeded: imported.length, failed: remaining.length, total: localMeals.length };
}

export function countLocalMeals() {
  return loadLocalMeals().length;
}
