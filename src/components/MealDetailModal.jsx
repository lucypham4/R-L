import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toCanvas } from 'html-to-image';
import { normaliseServes } from '../lib/meal';
import { onReducedMotionChange, prefersReducedMotion, scrollElementTo, tokenMs } from '../lib/motion';
import { applyDishSheetFrame, dishSheetFrame, measureDishSheet } from '../lib/dishSheet';
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
function drawPhotoCover(canvas, img) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const sSize = imgRatio > 1 ? img.naturalHeight : img.naturalWidth;
  const sx = imgRatio > 1 ? (img.naturalWidth - sSize) / 2 : 0;
  const sy = imgRatio > 1 ? 0 : (img.naturalHeight - sSize) / 2;
  ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, size, size);
}

const SWIPE_THRESHOLD = 60;

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

export default function MealDetailModal({ meal, index, total, onClose, onStep }) {
  const { els, bind } = useElements();
  const closeRef = useRef(null);
  const shareCardRef = useRef(null);
  const [shareStatus, setShareStatus] = useState('idle'); // idle | working | done | error
  // The name of the dish being stepped away from, kept alive just long
  // enough to cross-dissolve with the one arriving.
  const [outgoingName, setOutgoingName] = useState(null);
  const shownNameRef = useRef(meal?.name);
  const swipeStart = useRef(null);
  const swiped = useRef(false);

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

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
      if (!canStep) return;
      if (e.key === 'ArrowLeft' && index > 1) onStep(-1);
      if (e.key === 'ArrowRight' && index < total) onStep(1);
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, onStep, canStep, index, total]);

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

  function handleSwipeStart(e) {
    swiped.current = false;
    swipeStart.current = { x: e.clientX, y: e.clientY };
  }

  function handleSwipeEnd(e) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || !canStep) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    const delta = dx < 0 ? 1 : -1;
    if (delta > 0 ? canStepForward : canStepBack) {
      // A mouse drag ends in a click on whatever it was released over;
      // don't let that click also open the sheet.
      swiped.current = true;
      onStep(delta);
    }
  }

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
      const canvas = await toCanvas(shareCardRef.current, {
        pixelRatio: 2,
        skipFonts: true,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim() || '#faf9f6',
      });

      if (heroPhotoUrl) {
        const img = await loadImage(heroPhotoUrl);
        drawPhotoCover(canvas, img);
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
        onPointerDown={canStep ? handleSwipeStart : undefined}
        onPointerUp={canStep ? handleSwipeEnd : undefined}
        onPointerCancel={canStep ? () => (swipeStart.current = null) : undefined}
      >
        {/* What scrolls: the sheet, and the empty stretch above it that
            the resting sheet is pulled up through. Everything that
            travels between states lives in the stage on top instead. */}
        <div ref={bind('scroller')} className="dish-scroller">
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
            <button ref={closeRef} type="button" className="dish-close" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
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
                    onClick={() => onStep(-1)}
                    disabled={!canStepBack}
                    aria-label="Previous dish"
                  >
                    <Chevron direction="prev" />
                  </button>
                  <button
                    ref={bind('next')}
                    type="button"
                    className="dish-step dish-step-next"
                    onClick={() => onStep(1)}
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
