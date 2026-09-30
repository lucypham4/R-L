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

// The line on a dish's resting card: one whole sentence, two lines of the
// card's serif at phone widths (about 54 characters at 360-390px). Asked
// of the AI under 50, and held to this as a hard limit, so a chef's own
// has a little room.
export const SUMMARY_MAX = 55;

function firstSentence(text) {
  const match = /^\s*(.+?[.!?])(?=\s|$)/.exec(text || '');
  return match ? match[1] : (text || '').trim();
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "Leek with brown butter and hazelnut." -- a menu's way of saying what's
// on the plate, from the first ingredients, trimmed to fit.
function ingredientLine(ingredients) {
  const list = (ingredients || []).map((s) => s.trim()).filter(Boolean);
  for (let n = Math.min(list.length, 3); n > 0; n--) {
    const [lead, ...rest] = list.slice(0, n);
    const line = rest.length === 0 ? lead : `${lead} with ${rest.join(' and ')}`;
    const sentence = `${capitalise(line)}.`;
    if (sentence.length <= SUMMARY_MAX) return sentence;
  }
  return '';
}

/**
 * What the resting card says about a dish: always a complete sentence,
 * never the description cut off to fit. In order of preference, the
 * summary written for it (by the AI fill, or by the chef); the
 * description's first sentence, if that fits; a line made from its
 * ingredients. Empty only when there's nothing to make one from.
 */
export function summaryOf(meal) {
  const written = meal?.summary?.trim();
  if (written) return written;
  const first = firstSentence(meal?.description);
  if (first && first.length <= SUMMARY_MAX) return first;
  return ingredientLine(meal?.ingredients);
}

/**
 * Whether a dish has no summary of its own and the card has had to make
 * do with its ingredients, or with nothing -- the case worth asking the
 * AI to write one for.
 */
export function needsSummary(meal) {
  if (meal?.summary?.trim()) return false;
  const first = firstSentence(meal?.description);
  return !(first && first.length <= SUMMARY_MAX) && Boolean(meal?.description?.trim());
}
