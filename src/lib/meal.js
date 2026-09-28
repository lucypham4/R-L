// The shape of a meal, in the one place every path agrees on it.

export const DEFAULT_SERVES = 2;

/**
 * Coerces whatever a caller has -- a form's string, a database integer, a
 * meal logged before the field existed -- into a whole positive number, or
 * null when there isn't one.
 *
 * Null matters. For most of this app's life `serves` was a column with a
 * default and no input behind it, so every meal ever saved claimed to serve
 * two people, on the recipe card and on the image chefs share with clients.
 * Returning null for "we were never told" lets the card say nothing instead
 * of asserting something it doesn't know, and keeps the older meals from
 * rendering a dangling "Serves" with a blank after it.
 */
export function normaliseServes(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}
