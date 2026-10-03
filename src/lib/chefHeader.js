// The public page's header: one scroll position carries the chef's
// picture and name from the top of the page, large and centred, into the
// bar pinned at the top left. It is the dish sheet's collapse
// (dishSheet.js, docs/design-system/motion.md) on the window's own
// scroll, and moves the same way:
//
//   top        scrollY 0. The picture large and centred, the name centred
//              under it, the chef's links, bio and specialties below.
//   collapsed  scrollY D and beyond. A small picture with the name beside
//              it at the top left, the dishes scrolling up underneath.
//
// - One scroll position drives everything. A page left half-way leaves
//   the picture and name half-way, and scrolling back reverses it.
// - The two rests snap (PublicChefPage.css): a release between them
//   settles on the nearer one; past the collapse the page scrolls freely,
//   inside a snap area that starts at the collapse and runs to the end.
// - The name hands over: a large copy and a small one travel together,
//   each scaled to stand in for the other, and cross between 45% and 55%.
// - The picture arcs into its place, across first and then up, as the
//   dish's photo does into its thumbnail. Here the name starts *under* the
//   picture and rises into the bar, so the picture makes its arc in the
//   first part of the journey, clear of the name before it arrives.
// - The bar's backdrop comes in over the last fifth.
//
// Both rests are laid out in CSS: the top by the header's own picture
// and name, which stay in the page (invisible) to hold their place and
// give the heading to screen readers; the collapsed rest by empty slots in
// the bar. This module only measures those boxes and interpolates.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, p) => a + (b - a) * p;
// 0 before `from`, 1 after `to`, linear between, as in dishSheet.js.
const ramp = (p, from, to) => clamp01((p - from) / (to - from));

// The share of the journey the picture's arc takes. The name rises with
// the page from directly under the picture, so the picture has to be up
// and out of its way by about half-way; this keeps a clear gap throughout.
const PICTURE_SPAN = 0.55;

/**
 * Reads both rests from the current layout. Call it whenever the layout
 * can have changed: a resize, a font arriving, a picture loading.
 *
 * `startAvatar`/`startName` are the header's own (in the page, so their
 * page position is their screen position at scrollY 0); `endAvatar`/
 * `endName` are the bar's slots (fixed, so their screen position is
 * where they are).
 */
export function measureChefHeader({ root, startAvatar, startName, endAvatar, endName }) {
  const scrollY = window.scrollY;
  const a0 = startAvatar.getBoundingClientRect();
  const n0 = startName.getBoundingClientRect();
  const a1 = endAvatar.getBoundingClientRect();
  const n1 = endName.getBoundingClientRect();
  const nameFrom = { x: n0.left, top: n0.top + scrollY, cy: n0.top + scrollY + n0.height / 2, w: n0.width, h: n0.height };
  const nameTo = { x: n1.left, cy: n1.top + n1.height / 2, h: n1.height };
  // The ratio the two names scale by to stand in for each other.
  const k = parseFloat(getComputedStyle(endName).fontSize) / parseFloat(getComputedStyle(startName).fontSize);
  // The small name runs no further than the screen's right margin.
  const room = document.documentElement.clientWidth - n1.left - a1.left;
  return {
    avatar: {
      top: a0.top + scrollY,
      from: { cx: a0.left + a0.width / 2, cy: a0.top + scrollY + a0.height / 2, size: a0.width },
      to: { cx: a1.left + a1.width / 2, cy: a1.top + a1.height / 2, size: a1.width },
    },
    // Each name as wide as it sets in its own size (the bar's letter-
    // spacing is looser, so the small one isn't simply the large one
    // scaled), and neither past the screen's right margin once in the bar.
    name: { from: nameFrom, to: nameTo, k, w: Math.min(nameFrom.w, room / k), wSmall: Math.min(n1.width, room) },
    rootTop: root.getBoundingClientRect().top + scrollY,
    // Scrolled this far, the name has risen into the bar. Up to there it
    // rises with the page, so it never parts from the links below it.
    distance: Math.max(1, nameFrom.cy - nameTo.cy),
  };
}

/**
 * Where everything is at scroll position `t`.
 *
 * `quantise` is the reduced-motion substitute, as for the dish: the
 * travelling pieces stop travelling. They hold their rest, which at the
 * top is their place in the page, until half-way, then jump to the bar;
 * the caller fades them in where they land. The backdrop only fades, so
 * it stays continuous.
 */
export function chefHeaderFrame(t, g, quantise = false) {
  const p = clamp01(t / g.distance);
  const m = quantise ? (p >= 0.5 ? 1 : 0) : p;
  const { avatar: a, name: n } = g;

  // The picture: across first, then up, as the dish's photo arcs into its
  // thumbnail, made within the first part of the journey.
  const q = quantise ? m : ramp(m, 0, PICTURE_SPAN);
  const size = lerp(a.from.size, a.to.size, q);
  const avatar = {
    cx: lerp(a.from.cx, a.to.cx, ramp(q, 0, 0.6)),
    // At the top it rides the page, so an overscroll pulls it down with
    // everything else, and so does scrolling before a reduced-motion jump.
    cy: lerp(a.from.cy - Math.max(0, quantise ? t : 0) - Math.min(t, 0), a.to.cy, ramp(q, 0.2, 1)),
    scale: size / a.from.size,
  };

  // The name: until it arrives its height on screen is simply the page's;
  // it slides left as it rises. Both copies travel together; the large one
  // goes, the small one comes, crossing between 45% and 55%.
  const name = {
    x: lerp(n.from.x, n.to.x, m),
    cy: m >= 1 ? n.to.cy : n.from.cy - t,
  };
  const large = { ...name, scale: lerp(1, n.k, m), o: 1 - ramp(m, 0, 0.55) };
  const small = { ...name, scale: lerp(1 / n.k, 1, m), o: ramp(m, 0.45, 0.9) };

  return { p, m, avatar, large, small, backdrop: ramp(p, 0.8, 1) };
}

/** Writes a frame onto the travelling elements. Transform and opacity only. */
export function applyChefHeaderFrame(f, g, els) {
  const half = g.avatar.from.size / 2;
  els.travelAvatar.style.transform =
    `translate3d(${f.avatar.cx - half * f.avatar.scale}px, ${f.avatar.cy - half * f.avatar.scale}px, 0) scale(${f.avatar.scale})`;

  const placeName = (el, frame, height, width) => {
    el.style.width = `${width}px`;
    el.style.transform = `translate3d(${frame.x}px, ${frame.cy - (height * frame.scale) / 2}px, 0) scale(${frame.scale})`;
    el.style.opacity = String(frame.o);
  };
  placeName(els.travelName, f.large, g.name.from.h, g.name.w);
  placeName(els.travelNameSmall, f.small, g.name.to.h, g.name.wSmall);

  els.backdrop.style.opacity = String(f.backdrop);

  // The two rests are snap points: the top of the page, and the top of a
  // snap area that starts where the name sits in the bar and runs to the
  // end, so everything past the collapse scrolls freely.
  els.startAvatar.style.scrollMarginTop = `${g.avatar.top}px`;
  els.snapCollapsed.style.top = `${g.distance - g.rootTop}px`;
}
