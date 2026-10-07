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
// - The name rises at half the page's speed, about the rate the dish's
//   name shrinks into its bar (its whole hand-over takes the sheet's ~500px
//   of scroll), so the change is unhurried rather than over in a flick.
// - What scrolls on under it slides under the header's backdrop, as the
//   recipe slides under the dish's: the backdrop's lower edge tracks the
//   collapse one-to-one, and the page fades through its soft edge (the
//   dish's --space-xl gradient) rather than running into the name.
// - The picture arcs into its place, across first and then up, as the
//   dish's photo does into its thumbnail. Here the name starts *under* the
//   picture and rises into the bar, so the picture makes its arc in the
//   first part of the journey, clear of the name before it arrives.
// - The search docks in the bar, under the name, so a client can search
//   the dishes from anywhere on the page. It scrolls with the page until it
//   meets a lane that runs from just under the name at the top to its place
//   in the bar, and rides that lane up; past the collapse it is CSS sticky
//   in that place, so it holds still with no script behind it. The lane
//   keeps it clear of the name and picture whatever the header's length:
//   with a long bio it arrives after the collapse, with none it rises with
//   the header. Once it is held, the backdrop runs on under it, so what
//   scrolls by slides under the search as well as the name.
//
// Both rests are laid out in CSS: the top by the header's own picture
// and name, which stay in the page (invisible) to hold their place and
// give the heading to screen readers; the collapsed rest by empty slots in
// the bar. This module only measures those boxes and interpolates.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, p) => a + (b - a) * p;
// 0 before `from`, 1 after `to`, linear between, as in dishSheet.js.
const ramp = (p, from, to) => clamp01((p - from) / (to - from));

// The share of the journey the picture's arc takes. The name rises from
// directly under the picture, so the picture has to be up and out of its
// way by about half-way; this keeps a clear gap throughout.
const PICTURE_SPAN = 0.55;

// How much slower than the page the name rises: the collapse takes this
// many times the name's own rise of scroll. Two puts it near the dish
// name's rate.
const SLOWDOWN = 2;

// Over how many pixels of being held the search takes the backdrop with
// it, so the backdrop's edge grows under it rather than jumping there.
const DOCK_EASE = 12;

/**
 * Reads both rests from the current layout. Call it whenever the layout
 * can have changed: a resize, a font arriving, a picture loading.
 *
 * `startAvatar`/`startName` are the header's own (in the page, so their
 * page position is their screen position at scrollY 0); `endAvatar`/
 * `endName` are the bar's slots (fixed, so their screen position is
 * where they are).
 */
export function measureChefHeader({ root, startAvatar, startName, endAvatar, endName, search, endSearch, backdrop }) {
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
  // Where the header ends, as the backdrop's lower edge: under the name at
  // the top, under the bar once collapsed.
  const bar = endAvatar.closest('.public-chef-bar').getBoundingClientRect();
  // The header's own gap: the edge starts where the next thing under the
  // name does.
  const gap = parseFloat(getComputedStyle(startName.closest('header')).rowGap) || 0;
  const edgeFrom = n0.bottom + scrollY + gap;
  // The search: where the page has it (read with its sticking and its hold
  // taken off for a moment), and its place in the bar.
  let dock = null;
  if (search && endSearch) {
    const { position, translate } = search.style;
    search.style.position = 'static';
    search.style.translate = 'none';
    const s0 = search.getBoundingClientRect();
    search.style.position = position;
    search.style.translate = translate;
    const s1 = endSearch.getBoundingClientRect();
    // What comes after the search: the count, then the dishes. Scrolled to
    // `results`, the count sits just clear of the docked bar's soft edge.
    const count = search.nextElementSibling?.getBoundingClientRect();
    const soft = parseFloat(getComputedStyle(backdrop, '::after').height) || 0;
    dock = {
      y0: s0.top + scrollY,
      h: s0.height,
      top: s1.top,
      pad: bar.bottom - s1.bottom,
      soft,
      countY0: count ? count.top + scrollY : null,
      results: count ? count.top + scrollY - bar.bottom - soft - DOCK_EASE : 0,
    };
  }
  return {
    search: dock,
    edge: { from: edgeFrom, to: bar.bottom },
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
    // Scrolled this far, the name has risen into the bar.
    distance: Math.max(1, SLOWDOWN * (nameFrom.cy - nameTo.cy)),
  };
}

/**
 * Where everything is at scroll position `t`.
 *
 * `quantise` is the reduced-motion substitute, as for the dish: the
 * travelling pieces stop travelling. They hold their rest until half-way,
 * then jump to the bar; the caller fades them in where they land. The
 * backdrop's fade only fades, so it stays continuous.
 */
export function chefHeaderFrame(t, g, quantise = false) {
  const p = clamp01(t / g.distance);
  const m = quantise ? (p >= 0.5 ? 1 : 0) : p;
  const { avatar: a, name: n } = g;
  // An overscroll at the top pulls everything down with the page.
  const pull = -Math.min(t, 0);

  // The picture: across first, then up, as the dish's photo arcs into its
  // thumbnail, made within the first part of the journey.
  const q = quantise ? m : ramp(m, 0, PICTURE_SPAN);
  const size = lerp(a.from.size, a.to.size, q);
  const avatar = {
    cx: lerp(a.from.cx, a.to.cx, ramp(q, 0, 0.6)),
    cy: lerp(a.from.cy, a.to.cy, ramp(q, 0.2, 1)) + pull,
    scale: size / a.from.size,
  };

  // The name slides left as it rises. Both copies travel together; the
  // large one goes, the small one comes, crossing between 45% and 55%.
  const name = {
    x: lerp(n.from.x, n.to.x, m),
    cy: lerp(n.from.cy, n.to.cy, m) + pull,
  };
  const large = { ...name, scale: lerp(1, n.k, m), o: 1 - ramp(m, 0, 0.55) };
  const small = { ...name, scale: lerp(1 / n.k, 1, m), o: ramp(m, 0.45, 0.9) };

  // The search scrolls with the page until it meets its lane, then rides
  // it: just under the name at the top, its place in the bar at the end.
  // `hold` is what the script adds to where CSS sticking puts it (no more
  // than its place in the bar), which past the collapse is nothing.
  let search = null;
  if (g.search) {
    const s = g.search;
    const natural = s.y0 - t;
    const lane = lerp(g.edge.from, s.top, m) + pull;
    const y = Math.max(natural, lane);
    search = { y, hold: y - Math.max(natural, s.top), docked: clamp01((y - natural) / DOCK_EASE) };
  }

  // The backdrop's lower edge follows the header up, and it is there as
  // soon as anything starts to slide under it. Once the search is held, it
  // reaches under the search too.
  let edge = lerp(g.edge.from, g.edge.to, m) + pull;
  if (search) edge = Math.max(edge, lerp(edge, search.y + g.search.h + g.search.pad, search.docked));
  const backdrop = { edge, o: ramp(p, 0, 0.12) };

  // The count goes before it reaches the backdrop's soft edge rather than
  // through it: the collapsed rest can land it right in the fade, where a
  // half-faded line reads as a mistake rather than as something scrolling
  // under.
  if (search && g.search.countY0 !== null) {
    search.count = clamp01((g.search.countY0 - t - (edge + g.search.soft)) / DOCK_EASE);
  }

  return { p, m, avatar, large, small, backdrop, search };
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

  els.backdrop.style.transform = `translate3d(0, ${f.backdrop.edge - els.backdrop.offsetHeight}px, 0)`;
  els.backdrop.style.opacity = String(f.backdrop.o);

  if (f.search) {
    els.search.style.translate = f.search.hold > 0.01 ? `0 ${f.search.hold}px` : '';
    if (els.count && f.search.count !== undefined) els.count.style.opacity = String(f.search.count);
  }

  // The two rests are snap points: the top of the page, and the top of a
  // snap area that starts where the name sits in the bar and runs to the
  // end, so everything past the collapse scrolls freely.
  els.startAvatar.style.scrollMarginTop = `${g.avatar.top}px`;
  els.snapCollapsed.style.top = `${g.distance - g.rootTop}px`;
}

/**
 * What a new measure changes about the page itself, as opposed to a frame:
 * where the search sticks, and enough room below the dishes that the page
 * can always reach the collapse and bring the results up under the docked
 * search (filtering down to a few dishes would otherwise shorten the page
 * under the reader and throw the header open again).
 */
export function applyChefHeaderLayout(g, { root, gallery }) {
  if (!g.search) return;
  root.style.setProperty('--public-search-dock', `${g.search.top}px`);
  const galleryTop = gallery.getBoundingClientRect().top + window.scrollY;
  gallery.style.minHeight = `${Math.ceil(resultsScroll(g) + window.innerHeight - galleryTop)}px`;
}

/**
 * The scroll at which the results start just under the docked search, and
 * never short of the collapse.
 */
export function resultsScroll(g) {
  return Math.max(g.distance, g.search ? g.search.results : 0);
}
