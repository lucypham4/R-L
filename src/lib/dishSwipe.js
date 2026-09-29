// Swiping between dishes: the decisions, kept apart from the DOM.
//
// The dishes sit on a shelf, and a horizontal drag slides the one you're
// looking at along it with your finger while its neighbour comes in from
// the side you're heading. Letting go either finishes the move or sends
// both back. These functions are how far things go and which of the two
// happens; MealDetailModal does the moving.

// How far a finger travels before a drag counts as a swipe rather than a
// tap, and how much more horizontal than vertical it has to be. Anything
// more vertical belongs to the sheet's scroll.
export const AXIS_SLOP = 10;
export const AXIS_BIAS = 1.2;

// Let go past this share of the way to the neighbour and the move
// finishes; short of it, it settles back. A third, so a deliberate drag
// commits without having to carry the photo most of the way off screen.
export const COMMIT_FRACTION = 0.3;

// A flick commits however short it was, as long as it was heading the
// same way it was dragged. In px/ms: about the speed of a quick thumb.
export const FLING_VELOCITY = 0.45;

/**
 * Past the first or last dish there's nothing to move to, so the drag
 * resists instead of stopping dead: the photo follows a finger less and
 * less the further it goes, and never more than `limit`. The same curve
 * iOS uses at the end of a scroll view, so it reads as "that's the end"
 * rather than as the app not listening.
 */
export function rubberBand(dx, limit) {
  const pull = Math.abs(dx);
  return Math.sign(dx) * limit * (1 - 1 / ((pull * 0.55) / limit + 1));
}

// A finger that stops before it lifts has no speed left to carry, however
// fast it was going before it stopped.
const PAUSE_MS = 80;

/**
 * Horizontal velocity at release, in px/ms, from the last 100ms of moves.
 * `releasedAt` is the lift's timestamp: if the finger had been still for a
 * while by then, it was placed, not flicked.
 */
export function releaseVelocity(samples, releasedAt) {
  const last = samples[samples.length - 1];
  if (releasedAt - last.t > PAUSE_MS) return 0;
  const first = samples.find((s) => last.t - s.t <= 100) ?? last;
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/**
 * Whether letting go at `dx` (px, negative for leftward) with `velocity`
 * moves to the neighbour, given how far away it is and whether there is
 * one in that direction at all.
 */
export function shouldCommit({ dx, velocity, travel, hasNeighbour }) {
  if (!hasNeighbour || dx === 0) return false;
  if (Math.abs(dx) >= travel * COMMIT_FRACTION) return true;
  return Math.abs(velocity) >= FLING_VELOCITY && Math.sign(velocity) === Math.sign(dx);
}
