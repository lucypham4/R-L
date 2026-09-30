// The one-sentence summary on a dish's resting card, as both functions
// that write one ask for it. Keep SUMMARY_MAX in step with src/lib/meal.js.

// Two lines of the card's serif at phone widths is about 54 characters.
// Asked for under SUMMARY_TARGET so there's room; anything past SUMMARY_MAX
// is thrown away rather than cut, since a cut summary is what this exists
// to replace.
export const SUMMARY_TARGET = 50;
export const SUMMARY_MAX = 55;

export const SUMMARY_GUIDANCE =
  `One complete sentence, under ${SUMMARY_TARGET} characters, that says what the dish is, ` +
  'for the top of its recipe card (e.g. "Charred leeks under brown butter and hazelnut."). ' +
  'A new sentence, not the description shortened. Third person, never first. Ends with a full stop.';

/** The summary as the app should store it, or '' if it won't do. */
export function cleanSummary(value: unknown): string {
  if (typeof value !== 'string') return '';
  let s = value.trim().replace(/^["'“‘]+|["'”’]+$/g, '').trim();
  if (!s) return '';
  if (!/[.!?]$/.test(s)) s += '.';
  return s.length <= SUMMARY_MAX ? s : '';
}
