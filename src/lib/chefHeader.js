// The public page's header: one scroll position carries the chef's
// picture and name from the top of the page, large and centred, into the
// bar pinned at the top left.
//
//   top       scrollY 0. The picture large and centred, the name centred
//             under it, the chef's links, bio and specialties below.
//   pinned    scrollY D and beyond. A small picture with the name beside
//             it at the top left, the dishes scrolling up underneath.
//
// The picture and the name each travel as one element, so a page left
// half-way scrolled leaves them half-way. As with the dish sheet
// (dishSheet.js), the transition *is* the scroll, not an animation the
// scroll sets off, which is what lets it reverse mid-gesture.
//
// Both ends are laid out in CSS: the top by the header's own picture and
// name, which stay in the page (invisible) to hold their place and give
// the heading to screen readers; the pinned state by empty slots in the
// bar. This module only measures those boxes and interpolates.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, p) => a + (b - a) * p;
const ramp = (p, from, to) => clamp01((p - from) / (to - from));
// The picture gets most of its shrinking done early, so it is out of the
// name's way by the time the name slides in beside it.
const easeOut = (p) => 1 - (1 - p) * (1 - p);

/**
 * Reads both ends from the current layout. Call it whenever the layout can
 * have changed: a resize, a font arriving, a picture loading.
 *
 * `startAvatar`/`startName` are the header's own (in the page, so their
 * page position is their screen position at scrollY 0); `endAvatar`/
 * `endName` are the bar's slots (fixed, so their screen position is
 * where they are).
 */
export function measureChefHeader({ startAvatar, startName, endAvatar, endName }) {
  const scrollY = window.scrollY;
  const a0 = startAvatar.getBoundingClientRect();
  const n0 = startName.getBoundingClientRect();
  const a1 = endAvatar.getBoundingClientRect();
  const n1 = endName.getBoundingClientRect();
  const k = parseFloat(getComputedStyle(endName).fontSize) / parseFloat(getComputedStyle(startName).fontSize);
  const nameFrom = { x: n0.left, cy: n0.top + scrollY + n0.height / 2, w: n0.width, h: n0.height };
  const nameTo = { x: n1.left, cy: n1.top + n1.height / 2 };
  // The bar's name runs no further than the screen's right margin.
  const room = document.documentElement.clientWidth - n1.left - (a1.left || 0);
  return {
    avatar: {
      from: { cx: a0.left + a0.width / 2, cy: a0.top + scrollY + a0.height / 2, size: a0.width },
      to: { cx: a1.left + a1.width / 2, cy: a1.top + a1.height / 2, size: a1.width },
    },
    name: { from: nameFrom, to: nameTo, k, w: Math.min(nameFrom.w, room / k) },
    // Scrolled this far, the name has risen into the bar. Up to there it
    // rises with the page, so it never parts from the links below it.
    distance: Math.max(1, nameFrom.cy - nameTo.cy),
  };
}

/**
 * Where the picture and name are at scroll position `t`, and how opaque
 * the bar's backdrop is.
 *
 * `quantise` is the reduced-motion substitute: nothing shrinks or slides.
 * The picture and name scroll with the page until half-way, then swap to
 * their places in the bar.
 */
export function chefHeaderFrame(t, g, quantise = false) {
  const p = clamp01(t / g.distance);
  const m = quantise ? (p >= 0.5 ? 1 : 0) : p;
  const a = g.avatar;
  const n = g.name;

  const e = quantise ? m : easeOut(p);
  const size = lerp(a.from.size, a.to.size, e);
  const avatar = {
    cx: lerp(a.from.cx, a.to.cx, e),
    // Pulled down with the page when it is overscrolled (t < 0), and
    // scrolled with it before a reduced-motion swap.
    cy: quantise ? (m ? a.to.cy : a.from.cy - t) : lerp(a.from.cy, a.to.cy, e) - Math.min(t, 0),
    scale: size / a.from.size,
  };

  const scale = lerp(1, n.k, m);
  const name = {
    x: lerp(n.from.x, n.to.x, m),
    // Until it arrives, the name's height on screen is simply the page's.
    cy: m >= 1 ? n.to.cy : n.from.cy - t,
    scale,
  };

  return { avatar, name, backdrop: quantise ? m : ramp(p, 0.6, 1) };
}

/** Writes a frame onto the travelling elements. */
export function applyChefHeaderFrame(f, g, { travelAvatar, travelName, backdrop }) {
  const { avatar, name } = f;
  const half = g.avatar.from.size / 2;
  travelAvatar.style.transform =
    `translate(${avatar.cx - half * avatar.scale}px, ${avatar.cy - half * avatar.scale}px) scale(${avatar.scale})`;
  travelName.style.width = `${g.name.w}px`;
  travelName.style.transform =
    `translate(${name.x}px, ${name.cy - (g.name.from.h * name.scale) / 2}px) scale(${name.scale})`;
  backdrop.style.opacity = String(f.backdrop);
}
