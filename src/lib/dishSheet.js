// The dish sheet: one scroll position drives the dish view through its
// three rest states, and this module turns that position into where each
// piece of the view should be.
//
//   peek       scrollTop 0. The name large and the photo large; the sheet
//              floats below them with the meta line, a two-line summary,
//              the date and the serves.
//   open       scrollTop S. The sheet has become the page. The meta line
//              and a smaller name sit centred at its top, the photo
//              below them, the recipe below that.
//   collapsed  scrollTop S + collapse. The photo has shrunk to a
//              thumbnail beside a left-aligned name, and the recipe
//              scrolls up underneath.
//
// Everything that appears in more than one state is one element that
// travels between them, so a sheet dragged half-way leaves every piece
// half-way. The transition *is* the input, not an animation the input
// fires, which is what makes it reversible mid-gesture.
//
// Layout for each state stays in CSS. The peek boxes are the elements'
// own; the collapsed boxes are the header's own; the open state's photo
// box is an invisible slot. This module only measures those boxes and
// interpolates between them. Measured with offset*, not
// getBoundingClientRect, so neither the interpolation's own transforms
// nor the entrance animation's `translate` leak into the geometry.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, p) => a + (b - a) * p;
// 0 before `from`, 1 after `to`, linear between. The choreography below
// is written in these: which part of a gesture each change happens in.
const ramp = (p, from, to) => clamp01((p - from) / (to - from));

/** The layout box of `el` in `root`'s coordinates, ignoring transforms. */
function layoutBox(el, root) {
  let x = 0;
  let y = 0;
  for (let node = el; node && node !== root; node = node.offsetParent) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, bottom: y + h };
}

const px = (value) => parseFloat(value) || 0;

/**
 * Reads the geometry of every state from the current layout. Call it
 * whenever the layout can have changed: a resize, a font arriving, a
 * photo loading, a different dish.
 */
export function measureDishSheet(els) {
  const { root } = els;
  const box = (el) => layoutBox(el, root);
  const W = root.clientWidth;
  const H = root.clientHeight;

  const peek = box(els.peek);
  const S = els.sheet.offsetTop;
  const photo = box(els.photo);
  const slotPhoto = box(els.slotPhoto);
  const slotThumb = box(els.slotThumb);
  const headRow = box(els.headRow);

  // The open state's header ends where its photo slot does, not where
  // the photo does. A landscape photo is shorter than a portrait one, and
  // tying the recipe to the slot keeps it from jumping when you step
  // between the two.
  const openBottom = slotPhoto.bottom;
  const collapsedBottom = headRow.bottom;

  // A photo that hasn't loaded has no size to scale. It holds still until
  // it arrives, and the resize that follows re-measures.
  const fits = photo.w > 0 && photo.h > 0;
  const fit = (slot) => (fits ? Math.min(slot.w / photo.w, slot.h / photo.h, 1) : 1);

  return {
    W,
    H,
    S,
    collapse: Math.max(0, openBottom - collapsedBottom),
    openBottom,
    collapsedBottom,
    bodyTop: openBottom + px(getComputedStyle(els.slotPhoto).marginBottom),

    insetX: peek.x,
    insetB: H - peek.bottom,
    radius: px(getComputedStyle(root).getPropertyValue('--radius-surface')),

    hero: box(els.heroTitle),
    bar: box(els.barTitle),
    // The ratio the two names scale by to stand in for each other.
    k: px(getComputedStyle(els.heroTitle).fontSize) / (px(getComputedStyle(els.barTitle).fontSize) || 1),
    meta: box(els.meta),

    photo,
    photoOpen: { s: fit(slotPhoto), x: slotPhoto.cx - photo.cx, y: slotPhoto.cy - photo.cy },
    photoThumb: { s: fit(slotThumb), x: slotThumb.cx - photo.cx, y: slotThumb.cy - photo.cy },
  };
}

/**
 * Where everything is at scroll position `t`.
 *
 * `quantise` is the reduced-motion substitute. The pieces that travel --
 * the names, the meta line, the photo, the arrows -- snap between their
 * rest positions at the half-way mark instead of travelling, and the
 * caller fades them in where they land. Everything that only changes
 * colour, opacity or shape stays continuous, since none of that moves.
 */
export function dishSheetFrame(t, g, quantise = false) {
  const p1 = g.S > 0 ? clamp01(t / g.S) : 1;
  const p2 = g.collapse > 0 ? clamp01((t - g.S) / g.collapse) : t > g.S ? 1 : 0;
  const m1 = quantise ? (p1 >= 0.5 ? 1 : 0) : p1;
  const m2 = quantise ? (p2 >= 0.5 ? 1 : 0) : p2;
  const midX = g.W / 2;

  // The large name hands over to the small one. They travel together,
  // each scaled to stand in for the other, and cross between 45% and 55%
  // of the drag. The overlap is kept that narrow on purpose: the large
  // name usually wraps and the small one never does, so a long overlap
  // reads as three lines of ghosted type rather than one name shrinking.
  // Stepping between dishes is where the name gets its full-length
  // dissolve; this is a hand-over.
  const heroTitle = {
    x: (midX - g.hero.cx) * m1,
    y: (g.bar.cy - g.hero.cy) * m1,
    s: lerp(1, 1 / g.k, m1),
    o: 1 - ramp(m1, 0, 0.55),
  };
  const barTitle = {
    x: lerp(lerp(g.hero.cx - g.bar.cx, midX - g.bar.cx, m1), 0, m2),
    y: lerp(g.hero.cy - g.bar.cy, 0, m1),
    s: lerp(g.k, 1, m1),
    o: ramp(m1, 0.45, 0.9),
  };

  // The header's meta line doesn't travel up from the card: it would have
  // to cross the photo and the name on the way. The card has its own,
  // which rides up and fades with the summary; this one arrives in place
  // with the small name, then slides from centred to left as the header
  // collapses.
  const meta = {
    x: lerp(midX - g.meta.cx, 0, m2),
    o: ramp(m1, 0.5, 0.9),
  };

  // Into the thumbnail the photo takes an arc rather than the diagonal:
  // across first, then up. A straight line would carry it through the
  // right-hand end of the name, which is sliding left at the same time;
  // the arc goes around it.
  const { photoOpen: po, photoThumb: pt } = g;
  const photo = {
    x: lerp(po.x * m1, pt.x, ramp(m2, 0, 0.6)),
    y: lerp(po.y * m1, pt.y, ramp(m2, 0.2, 1)),
    s: lerp(lerp(1, po.s, m1), pt.s, m2),
  };

  // The arrows follow the photo's centre down to the open state, and are
  // gone by the first third of the collapse, before the thumbnail gets
  // small enough to make them look like they belong to it.
  const steps = { y: po.y * m1, o: 1 - ramp(m2, 0, 0.35) };

  // The header's backdrop. Its lower edge tracks the collapse one-to-one
  // with the recipe rising under it, so the recipe never slides under the
  // photo; once the header is compact, the recipe scrolls on underneath
  // and fades through the backdrop's soft edge.
  const backdrop = {
    y: lerp(g.openBottom, g.collapsedBottom, m2) - g.H,
    o: ramp(p1, 0.8, 1),
  };

  // The card's shape. At rest it floats, inset on three sides and rounded
  // on all four corners. Open, it's a sheet flush with the sides and the
  // bottom of the screen, with its top corners still rounded, like every
  // other bottom sheet. The lower corners flatten into the screen's own
  // across the whole drag rather than at the end, so they never visibly
  // snap.
  const card = {
    side: g.insetX * (1 - p1),
    bottom: g.insetB * (1 - p1),
    top: g.radius,
    r: g.radius * (1 - p1),
    flush: p1 >= 1,
  };

  return {
    p1,
    p2,
    m1,
    m2,
    state: p1 < 0.5 ? 'peek' : p2 >= 0.5 ? 'collapsed' : 'open',
    heroTitle,
    barTitle,
    meta,
    photo,
    steps,
    backdrop,
    card,
    // The card's own contents are gone by 30% of the drag, which is about
    // when its meta line reaches the bottom of the photo. Photos are often
    // cut out, so anything still visible would show through them.
    peekOpacity: 1 - ramp(p1, 0, 0.3),
    bodyOpacity: ramp(p1, 0.45, 1),
  };
}

function place(el, { x = 0, y = 0, s = 1, o }) {
  if (!el) return;
  el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
  if (o !== undefined) el.style.opacity = String(o);
}

/** Writes a frame to the elements. Transform, opacity and clip only. */
export function applyDishSheetFrame(els, f) {
  place(els.heroTitle, f.heroTitle);
  place(els.barTitle, f.barTitle);
  place(els.meta, f.meta);
  place(els.photo, f.photo);
  // Radius and hairline are divided back out of the photo's scale in
  // CSS, so a thumbnail keeps the same corner as the full-size photo.
  els.photo?.style.setProperty('--dish-photo-scale', String(f.photo.s));
  place(els.prev, f.steps);
  place(els.next, f.steps);
  place(els.backdrop, f.backdrop);

  const { card } = f;
  if (els.surface) {
    els.surface.style.clipPath = `inset(0 ${card.side}px round ${card.top}px ${card.top}px 0 0)`;
  }
  if (els.frame) {
    const s = els.frame.style;
    s.visibility = card.flush ? 'hidden' : '';
    s.left = `${card.side}px`;
    s.right = `${card.side}px`;
    s.bottom = `${card.bottom}px`;
    s.borderRadius = `0 0 ${card.r}px ${card.r}px`;
  }
  if (els.peekFade) els.peekFade.style.opacity = String(f.peekOpacity);
  if (els.handle) els.handle.style.opacity = String(f.peekOpacity);
  if (els.body) els.body.style.opacity = String(f.bodyOpacity);
}
