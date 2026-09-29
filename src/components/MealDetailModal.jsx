import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toCanvas } from 'html-to-image';
import { normaliseServes } from '../lib/meal';
import { onReducedMotionChange, prefersReducedMotion, scrollElementTo, token, tokenMs } from '../lib/motion';
import { applyDishSheetFrame, dishSheetFrame, measureDishSheet } from '../lib/dishSheet';
import { AXIS_BIAS, AXIS_SLOP, releaseVelocity, rubberBand, shouldCommit } from '../lib/dishSwipe';
import './Bubbles.css';
import './MealDetailModal.css';

const fullDateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'recipe'
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// html-to-image can't reliably embed <img> elements (they render inside an
// SVG foreignObject, which browsers restrict from loading nested raster
// resources), so the photo is drawn onto the finished canvas by hand
// instead of relying on the library for it. The photo box is always a
// full-width square at the very top of the card, so no need to measure it.
/**
 * Draws the photo into `box` ({ x, y, size, radius }, in canvas pixels),
 * cropped square and clipped to its rounded corners. The path is drawn
 * with arcTo because CanvasRenderingContext2D.roundRect is newer than the
 * iOS 15 the app still supports.
 */
function drawPhotoCover(canvas, img, { x, y, size, radius }) {
  const ctx = canvas.getContext('2d');
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const sSize = imgRatio > 1 ? img.naturalHeight : img.naturalWidth;
  const sx = imgRatio > 1 ? (img.naturalWidth - sSize) / 2 : 0;
  const sy = imgRatio > 1 ? 0 : (img.naturalHeight - sSize) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + size, y, x + size, y + size, radius);
  ctx.arcTo(x + size, y + size, x, y + size, radius);
  ctx.arcTo(x, y + size, x, y, radius);
  ctx.arcTo(x, y, x + size, y, radius);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, sx, sy, sSize, sSize, x, y, size, size);
  ctx.restore();
}

// The space between a photo leaving the side of the view and the next one
// arriving, so the two never touch mid-slide.
const SLIDE_GAP = 24;

// The pieces that travel between the sheet's states. Under reduced motion
// they jump instead, and these are the ones that fade in where they land.
const TRAVELLERS = ['heroTitle', 'barTitle', 'meta', 'photo', 'prev', 'next'];

/**
 * Stable callback refs by name, collected into one object the sheet's
 * geometry can read. Stable so React doesn't detach and reattach every
 * ref on every render.
 */
function useElements() {
  const ref = useRef(null);
  if (!ref.current) {
    const els = {};
    const binds = {};
    ref.current = {
      els,
      bind: (name) =>
        (binds[name] ??= (el) => {
          els[name] = el;
        }),
    };
  }
  return ref.current;
}

/**
 * The dish name, cross-dissolving in place when the dish changes: the
 * outgoing name stays mounted over the incoming one, so both are legible
 * at once part-way through. Rendered twice, once large for the resting
 * sheet and once small for the header, and both dissolve together.
 */
function DishName({ id, name, outgoing }) {
  return (
    <>
      {outgoing && (
        <span key={`out-${outgoing}`} className="dish-name-out" aria-hidden="true">
          {outgoing}
        </span>
      )}
      <span key={id} className="dish-name-in">
        {name}
      </span>
    </>
  );
}

function Chevron({ direction }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}

export default function MealDetailModal({ meal, index, total, onClose, onStep, prevMeal, nextMeal }) {
  const { els, bind } = useElements();
  const shareCardRef = useRef(null);
  const [shareStatus, setShareStatus] = useState('idle'); // idle | working | done | error
  // The name of the dish being stepped away from, kept alive just long
  // enough to cross-dissolve with the one arriving.
  const [outgoingName, setOutgoingName] = useState(null);
  const shownNameRef = useRef(meal?.name);
  const swiped = useRef(false);
  // The swipe in progress, and a step whose slide is still to be played
  // once the next dish has rendered.
  const drag = useRef(null);
  const pendingSlide = useRef(null);
  const stepRef = useRef(null);

  // The sheet. Geometry is re-measured on layout changes; everything else
  // is recomputed from scrollTop on every scroll event, outside React.
  // React only hears about the coarse state, for the handful of things
  // that are markup rather than style (aria-expanded, what's clickable).
  const geometry = useRef(null);
  const reduced = useRef(prefersReducedMotion());
  const lastFrame = useRef(null);
  const [sheetState, setSheetState] = useState('peek');
  const [ledeClamped, setLedeClamped] = useState(false);

  const hasPhoto = (meal?.photos?.length ?? 0) > 0;
  const canStep = typeof onStep === 'function' && total > 1;
  // `index` is 1-based in the archive's numbering and the step arrows move
  // it, so it doubles as the bounds check: No. 1 has nothing behind it and
  // No. {total} nothing ahead.
  const canStepBack = canStep && index > 1;
  const canStepForward = canStep && index < total;

  const render = useCallback(() => {
    const g = geometry.current;
    if (!g || !els.scroller) return;
    const f = dishSheetFrame(els.scroller.scrollTop, g, reduced.current);
    applyDishSheetFrame(els, f);

    // Under reduced motion the travellers jump between rest positions, so
    // fade them in where they land rather than let them cut.
    const prev = lastFrame.current;
    if (reduced.current && prev && (prev.m1 !== f.m1 || prev.m2 !== f.m2)) {
      const duration = tokenMs('--dur-color');
      for (const name of TRAVELLERS) {
        const el = els[name];
        if (!el) continue;
        const to = Number(getComputedStyle(el).opacity);
        if (to > 0) el.animate([{ opacity: 0 }, { opacity: to }], { duration, easing: 'ease-out' });
      }
    }
    lastFrame.current = f;
    if (f.state !== prev?.state) setSheetState(f.state);
  }, [els]);

  const measure = useCallback(() => {
    if (!els.root || !els.sheet) return;
    const g = measureDishSheet(els);
    geometry.current = g;
    els.body.style.paddingTop = `${g.bodyTop}px`;
    // The summary on the resting card is clamped to two lines. When a
    // description runs longer, the recipe repeats it in full, so nothing
    // the chef wrote is only reachable by a screen reader.
    if (els.lede) setLedeClamped(els.lede.scrollHeight > els.lede.clientHeight + 1);
    render();
  }, [els, render]);

  useLayoutEffect(() => {
    const scroller = els.scroller;
    measure();
    // Everything the geometry depends on changes size when it changes: the
    // view on a resize or rotation, the names and meta line on a new dish
    // or a web font landing, the photo when it loads.
    const ro = new ResizeObserver(() => measure());
    for (const name of ['root', 'heroTitle', 'barTitle', 'meta', 'photo']) {
      if (els[name]) ro.observe(els[name]);
    }
    scroller.addEventListener('scroll', render, { passive: true });
    const offReduced = onReducedMotionChange((value) => {
      reduced.current = value;
      render();
    });
    return () => {
      ro.disconnect();
      scroller.removeEventListener('scroll', render);
      offReduced();
    };
    // The photo element is swapped for a placeholder when a dish has none,
    // so the observer has to follow it.
  }, [els, measure, render, hasPhoto]);

  // A different dish means different text in every measured box, and a
  // remounted summary the observer above has never seen.
  useLayoutEffect(() => {
    measure();
  }, [measure, meal?.id]);

  // The second half of a step: the incoming photo slides in from where its
  // neighbour's drag had it, as the outgoing one (now the ghost) leaves.
  // Before paint, so the frame between the two halves is never seen.
  useLayoutEffect(() => {
    const slide = pendingSlide.current;
    pendingSlide.current = null;
    const { photo, ghost } = els;
    if (!slide || !photo) {
      if (!slide) hideGhost();
      return;
    }
    const { delta, fromX, travel: T } = slide;
    const duration = tokenMs('--dur-move');
    const easing = token('--ease-out');
    photo.getAnimations().forEach((a) => a.cancel());
    photo.animate(
      [
        { translate: `${fromX + delta * T}px 0`, opacity: 0.65 },
        { translate: '0px 0', opacity: 1 },
      ],
      { duration, easing }
    );
    if (ghost && !ghost.hidden) {
      const away = ghost.animate(
        [{ translate: `${fromX}px 0` }, { translate: `${-delta * T}px 0`, opacity: 0.65 }],
        { duration, easing }
      );
      away.onfinish = hideGhost;
    }
  }, [meal?.id]);

  // Focus moves into the dish once, when it opens, and onto the sheet's
  // scroller rather than a button. It used to go to the close button,
  // which drew the focus ring round it -- and because this ran again on
  // every step, it pulled focus off the step arrow and re-drew the ring
  // every time. The scroller is also what the keyboard should drive: Space
  // and the arrow keys scroll the recipe straight away.
  useEffect(() => {
    els.scroller?.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [els]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
      if (!canStep) return;
      if (e.key === 'ArrowLeft' && index > 1) stepRef.current(-1);
      if (e.key === 'ArrowRight' && index < total) stepRef.current(1);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, canStep, index, total]);

  // The neighbours' photos, fetched ahead so a step never waits on the
  // network half-way through its slide.
  useEffect(() => {
    for (const neighbour of [prevMeal, nextMeal]) {
      const src = neighbour?.photos?.[0];
      if (src) new Image().src = src;
    }
  }, [prevMeal, nextMeal]);

  // Start a dissolve whenever the dish changes under us, and clear it
  // once the outgoing title has faded out.
  useEffect(() => {
    if (!meal || shownNameRef.current === meal.name) return;
    setOutgoingName(shownNameRef.current);
    shownNameRef.current = meal.name;
    const ms = tokenMs('--dur-dissolve');
    if (!ms) {
      setOutgoingName(null);
      return;
    }
    const timer = setTimeout(() => setOutgoingName(null), ms);
    return () => clearTimeout(timer);
  }, [meal?.id, meal?.name]);

  // A dish stepped to from part-way down a recipe opens at the top of its
  // own recipe, not at the same depth in a different one. From the
  // resting or open states nothing moves: the photo is the fixed point
  // the step happens around.
  useEffect(() => {
    const g = geometry.current;
    if (g && els.scroller && els.scroller.scrollTop > g.S + 1) scrollElementTo(els.scroller, g.S);
  }, [els, meal?.id]);

  function setOpen(open) {
    const g = geometry.current;
    if (g) scrollElementTo(els.scroller, open ? g.S : 0);
  }

  // ---- Swiping between dishes ------------------------------------------
  //
  // The dishes sit on a shelf. A horizontal drag slides the photo along it
  // under the finger while the neighbour's photo comes in from the side
  // you're heading, and the text below drops out of focus. Let go past a
  // third of the way, or with a flick, and the move finishes; short of
  // that, both photos settle back and the text comes back into focus. The
  // step arrows and the arrow keys take the same slide, so there is one
  // way dishes move, whichever way you asked. src/lib/dishSwipe.js has
  // the thresholds.

  const hasNeighbour = (delta) => (delta > 0 ? canStepForward : canStepBack);
  const neighbourPhoto = (delta) => (delta > 0 ? nextMeal : prevMeal)?.photos?.[0] ?? null;
  const photoMoves = () => Boolean(els.photo) && sheetState !== 'collapsed';

  // Centre to fully off the side: half the view, half the photo, a gap.
  function travel() {
    const view = els.root.getBoundingClientRect().width;
    const photo = els.photo ? els.photo.getBoundingClientRect().width : 0;
    return view / 2 + photo / 2 + SLIDE_GAP;
  }

  // Focus is lost fast and regained slowly, as in the focus pull -- which
  // takes over from here if the swipe goes through.
  function setDefocused(on, { instant = false } = {}) {
    for (const el of [els.peekFade, els.body, els.meta]) {
      if (!el) continue;
      el.style.transition = instant ? 'none' : `filter var(${on ? '--dur-defocus' : '--dur-refocus'}) var(--ease-focus)`;
      el.style.filter = on ? 'blur(var(--blur-defocus))' : '';
    }
  }

  // The ghost is a second photo that stands where the sheet has put the
  // real one, at the same size, offset along the shelf by `x`. `translate`
  // rather than `transform`, so the offset composes with the sheet's own
  // transform instead of replacing it.
  function showGhost(src, x) {
    const { ghost, photo } = els;
    if (!ghost) return;
    ghost.getAnimations().forEach((a) => a.cancel());
    if (!src || !photo) {
      hideGhost();
      return;
    }
    if (ghost.getAttribute('src') !== src) ghost.src = src;
    ghost.style.transform = photo.style.transform;
    ghost.style.setProperty('--dish-photo-scale', photo.style.getPropertyValue('--dish-photo-scale') || '1');
    ghost.style.translate = `${x}px 0`;
    ghost.hidden = false;
  }

  function hideGhost() {
    const { ghost } = els;
    if (!ghost) return;
    ghost.hidden = true;
    ghost.style.translate = '';
    ghost.style.opacity = '';
  }

  function handlePointerDown(e) {
    swiped.current = false;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, mode: 'pending', x: 0, samples: [{ x: e.clientX, t: e.timeStamp }] };
  }

  function handlePointerMove(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (d.mode === 'pending') {
      if (Math.hypot(dx, dy) < AXIS_SLOP) return;
      // Mostly vertical: that's the sheet's scroll, and it keeps it.
      if (Math.abs(dx) < Math.abs(dy) * AXIS_BIAS) {
        drag.current = null;
        return;
      }
      d.mode = 'swipe';
      d.travel = travel();
      d.movesPhoto = photoMoves();
      try {
        els.root.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone; the move below still applies.
      }
      setDefocused(true);
    }
    d.samples.push({ x: e.clientX, t: e.timeStamp });
    if (d.samples.length > 12) d.samples.shift();

    const dir = dx < 0 ? 1 : -1; // +1: the next dish, arriving from the right
    const has = hasNeighbour(dir);
    d.x = has ? dx : rubberBand(dx, d.travel * 0.25);
    if (!d.movesPhoto) return;
    const q = Math.min(1, Math.abs(d.x) / d.travel);
    els.photo.style.translate = `${d.x}px 0`;
    els.photo.style.opacity = String(1 - 0.35 * q);
    if (has) {
      showGhost(neighbourPhoto(dir), d.x + dir * d.travel);
      if (els.ghost) els.ghost.style.opacity = String(0.65 + 0.35 * q);
    } else {
      hideGhost();
    }
  }

  function handlePointerUp(e) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.mode !== 'swipe' || e.pointerId !== d.id) return;
    // A mouse drag ends in a click on whatever it was released over;
    // don't let that click also open the sheet.
    swiped.current = true;
    const dir = d.x < 0 ? 1 : -1;
    const commit = shouldCommit({
      dx: d.x,
      velocity: releaseVelocity(d.samples, e.timeStamp),
      travel: d.travel,
      hasNeighbour: hasNeighbour(dir),
    });
    if (commit) slideTo(dir, d.x);
    else settleBack(d);
  }

  function handlePointerCancel() {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === 'swipe') settleBack(d);
  }

  function settleBack(d) {
    const duration = tokenMs('--dur-move');
    const { photo, ghost } = els;
    if (photo && d.movesPhoto) {
      photo.animate(
        [
          { translate: `${d.x}px 0`, opacity: photo.style.opacity || 1 },
          { translate: '0px 0', opacity: 1 },
        ],
        { duration, easing: token('--ease-spring') }
      );
      photo.style.translate = '';
      photo.style.opacity = '';
    }
    if (ghost && !ghost.hidden) {
      const dir = d.x < 0 ? 1 : -1;
      const away = ghost.animate([{ translate: ghost.style.translate }, { translate: `${dir * d.travel}px 0` }], {
        duration,
        easing: token('--ease'),
      });
      away.onfinish = hideGhost;
    }
    setDefocused(false);
  }

  // One step along the shelf, from wherever a drag left the photo (0 for
  // an arrow). The outgoing photo is handed to the ghost, which carries it
  // off the side; the photo element takes the incoming dish and slides in
  // behind it once it has rendered (the layout effect below).
  function slideTo(delta, fromX = 0) {
    if (!hasNeighbour(delta)) return;
    const { photo } = els;
    if (photoMoves()) {
      const outgoing = photo.tagName === 'IMG' ? photo.getAttribute('src') : null;
      showGhost(outgoing, fromX);
      if (els.ghost) els.ghost.style.opacity = photo.style.opacity || '1';
      pendingSlide.current = { delta, fromX, travel: travel() };
    }
    if (photo) {
      photo.style.translate = '';
      photo.style.opacity = '';
    }
    // The incoming text brings its own focus pull.
    setDefocused(false, { instant: true });
    onStep(delta);
  }
  stepRef.current = slideTo;

  if (!meal) return null;

  const date = new Date(meal.date);
  const photos = meal.photos ?? [];
  // Meals logged before the serves field existed have nothing to say here,
  // and the card shouldn't invent it -- this line also goes onto the image
  // chefs hand to clients.
  const serves = normaliseServes(meal.serves);
  const subLine = [meal.cuisine, fullDateFormatter.format(date), serves && `Serves ${serves}`]
    .filter(Boolean)
    .join(' · ');
  const metaLine = [meal.cuisine, meal.category].filter(Boolean).join(' · ');
  const heroPhotoUrl = photos[0] ?? null;
  const expanded = sheetState !== 'peek';

  async function handleShare() {
    setShareStatus('working');
    try {
      const PIXEL_RATIO = 2;
      const canvas = await toCanvas(shareCardRef.current, {
        pixelRatio: PIXEL_RATIO,
        skipFonts: true,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim() || '#faf9f6',
      });

      if (heroPhotoUrl) {
        const img = await loadImage(heroPhotoUrl);
        // Where the card laid out the photo's slot, scaled to the canvas.
        const slot = shareCardRef.current.querySelector('.share-card-image');
        const card = shareCardRef.current.getBoundingClientRect();
        const rect = slot.getBoundingClientRect();
        drawPhotoCover(canvas, img, {
          x: (rect.left - card.left) * PIXEL_RATIO,
          y: (rect.top - card.top) * PIXEL_RATIO,
          size: rect.width * PIXEL_RATIO,
          radius: parseFloat(getComputedStyle(slot).borderTopLeftRadius) * PIXEL_RATIO,
        });
      }

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) throw new Error('Could not create the image.');

      const file = new File([blob], `${slugify(meal.name)}.jpg`, { type: 'image/jpeg' });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: meal.name });
        } catch {
          // User cancelled the native share sheet, not an error.
        }
        setShareStatus('idle');
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setShareStatus('done');
      setTimeout(() => setShareStatus('idle'), 2000);
    } catch {
      setShareStatus('error');
      setTimeout(() => setShareStatus('idle'), 2000);
    }
  }

  return (
    <div className="modal-overlay dish-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={bind('root')}
        className="dish"
        data-sheet={sheetState}
        role="dialog"
        aria-modal="true"
        aria-label={meal.name}
        onPointerDown={canStep ? handlePointerDown : undefined}
        onPointerMove={canStep ? handlePointerMove : undefined}
        onPointerUp={canStep ? handlePointerUp : undefined}
        onPointerCancel={canStep ? handlePointerCancel : undefined}
      >
        {/* What scrolls: the sheet, and the empty stretch above it that
            the resting sheet is pulled up through. Everything that
            travels between states lives in the stage on top instead. */}
        <div ref={bind('scroller')} className="dish-scroller" tabIndex={-1}>
          <div className="dish-spacer" />
          <div ref={bind('sheet')} className="dish-sheet">
            <div ref={bind('surface')} className="dish-surface" />

            <div
              ref={bind('peek')}
              className="dish-peek"
              onClick={() => {
                if (!expanded && !swiped.current) setOpen(true);
              }}
            >
              <button
                ref={bind('handle')}
                type="button"
                className="dish-handle"
                aria-label="Recipe"
                aria-expanded={expanded}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(!expanded);
                }}
              />
              <div ref={bind('peekFade')} className="dish-peek-fade">
                <span className="meta dish-peek-meta dish-focus" key={`meta-${meal.id}`}>
                  {metaLine}
                </span>
                <div className="dish-peek-summary dish-focus" key={meal.id}>
                  {meal.description && (
                    <p ref={bind('lede')} className="dish-lede">
                      {meal.description}
                    </p>
                  )}
                </div>
                <div className="dish-peek-facts dish-focus" key={`facts-${meal.id}`}>
                  <span className="meta">{fullDateFormatter.format(date)}</span>
                  {serves && <span className="meta">Serves {serves}</span>}
                </div>
              </div>
            </div>

            <div ref={bind('body')} className="dish-body">
              {/* Everything below the name focus-pulls as a block when the
                  dish changes. Remounting on the dish id is what replays
                  the animation. */}
              <div className="dish-body-inner dish-focus" key={meal.id}>
                {ledeClamped && (
                  <p className="dish-description" aria-hidden="true">
                    {meal.description}
                  </p>
                )}

                {meal.ingredients.length > 0 && (
                  <div className="bubble-row dish-ingredients">
                    {meal.ingredients.map((ing) => (
                      <span key={ing} className="bubble">
                        {ing}
                      </span>
                    ))}
                  </div>
                )}

                {meal.ingredients.length > 0 && meal.method.length > 0 && <hr className="dish-rule" />}

                {meal.method.length > 0 && (
                  <ol className="modal-method dish-method">
                    {meal.method.map((step, i) => (
                      <li key={i}>
                        <span className="modal-method-num">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                )}

                {meal.note && <p className="modal-note dish-note">{meal.note}</p>}

                {photos.slice(1).map((src, i) => (
                  <img key={src} src={src} alt={`${meal.name}, photo ${i + 2}`} className="dish-more-photo" loading="lazy" />
                ))}
              </div>
            </div>
          </div>
          <div className="dish-scroll-end" />
        </div>

        <div className="dish-stage">
          {/* The page colour around the resting card's sides and bottom.
              It sits outside the scroller so the card's lower edge stays
              put while the sheet scrolls up through it. */}
          <div ref={bind('frame')} className="dish-frame" />
          <div ref={bind('backdrop')} className="dish-backdrop" />

          <div className="dish-bar">
            <button type="button" className="dish-back" onClick={onClose} aria-label="Back">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M11 5l-7 7 7 7" />
              </svg>
            </button>
            <span className="dish-index">
              No. {index} of {total}
            </span>
            <button type="button" className="dish-share" onClick={handleShare} disabled={shareStatus === 'working'}>
              {shareStatus === 'working' ? 'Preparing…' : shareStatus === 'done' ? 'Saved image' : shareStatus === 'error' ? 'Could not share' : 'Share'}
            </button>
          </div>

          <div className="dish-hero">
            <h2 ref={bind('heroTitle')} className="dish-hero-title">
              <DishName id={meal.id} name={meal.name} outgoing={outgoingName} />
            </h2>
            <div className="dish-plate">
              {/* Stands in for a photo sliding along the shelf: the
                  neighbour coming in during a drag, the outgoing dish
                  leaving during a step. */}
              <img ref={bind('ghost')} className="dish-ghost" alt="" aria-hidden="true" hidden />
              {heroPhotoUrl ? (
                <img
                  ref={bind('photo')}
                  src={heroPhotoUrl}
                  alt={`${meal.name}, ${meal.cuisine} ${meal.category}`}
                  className="dish-photo"
                  onClick={() => sheetState === 'collapsed' && setOpen(true)}
                />
              ) : (
                <div ref={bind('photo')} className="dish-photo dish-photo-empty">
                  <span>food cutout · full res</span>
                </div>
              )}
              {canStep && (
                <>
                  <button
                    ref={bind('prev')}
                    type="button"
                    className="dish-step dish-step-prev"
                    onClick={() => slideTo(-1)}
                    disabled={!canStepBack}
                    aria-label="Previous dish"
                  >
                    <Chevron direction="prev" />
                  </button>
                  <button
                    ref={bind('next')}
                    type="button"
                    className="dish-step dish-step-next"
                    onClick={() => slideTo(1)}
                    disabled={!canStepForward}
                    aria-label="Next dish"
                  >
                    <Chevron direction="next" />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="dish-head">
            <div ref={bind('headRow')} className="dish-head-row">
              <div className="dish-head-text">
                {/* The card has its own copy; this one is the header's, so
                    only one of the two is ever announced. */}
                <div ref={bind('meta')} className="meta dish-meta" aria-hidden="true">
                  <span className="dish-focus" key={meal.id}>
                    {metaLine}
                  </span>
                </div>
                <div ref={bind('barTitle')} className="dish-bar-title" aria-hidden="true">
                  <DishName id={meal.id} name={meal.name} outgoing={outgoingName} />
                </div>
              </div>
              <div ref={bind('slotThumb')} className="dish-slot-thumb" />
            </div>
            <div ref={bind('slotPhoto')} className="dish-slot-photo" />
          </div>
        </div>
      </div>

      <div className="share-card-clip" aria-hidden="true">
        <div className="share-card" ref={shareCardRef}>
          <div className="share-card-image">{!heroPhotoUrl && <span>food cutout</span>}</div>
          <div className="share-card-body">
            <h2 className="share-card-name">{meal.name}</h2>
            {meal.description && <p className="share-card-description">{meal.description}</p>}
            <p className="share-card-sub">{subLine}</p>

            {meal.ingredients.length > 0 && (
              <div className="bubble-row share-card-ingredients">
                {meal.ingredients.map((ing) => (
                  <span key={ing} className="bubble">
                    {ing}
                  </span>
                ))}
              </div>
            )}

            {meal.method.length > 0 && (
              <ol className="modal-method share-card-method">
                {meal.method.map((step, i) => (
                  <li key={i}>
                    <span className="modal-method-num">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            )}

            {meal.note && <p className="modal-note share-card-note">{meal.note}</p>}
          </div>
          <div className="share-card-footer">staj</div>
        </div>
      </div>
    </div>
  );
}
