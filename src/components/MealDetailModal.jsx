import { useEffect, useRef, useState } from 'react';
import { toCanvas } from 'html-to-image';
import PhotoCarousel from './PhotoCarousel';
import { normaliseServes } from '../lib/meal';
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

/**
 * How long the outgoing dish name needs to stay mounted, read from the
 * token rather than duplicated here -- reduced motion shortens
 * --dur-dissolve, and the timeout has to shorten with it or the old
 * title lingers invisibly and blocks nothing but memory.
 */
function dissolveMs() {
  if (typeof window === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--dur-dissolve').trim();
  const value = parseFloat(raw);
  if (Number.isNaN(value)) return 0;
  return raw.endsWith('ms') ? value : value * 1000;
}

export default function MealDetailModal({ meal, index, total, onClose, onStep }) {
  const closeRef = useRef(null);
  const shareCardRef = useRef(null);
  const [shareStatus, setShareStatus] = useState('idle'); // idle | working | done | error
  const [photoIndex, setPhotoIndex] = useState(0);
  // The name of the dish being stepped away from, kept alive just long
  // enough to cross-dissolve with the one arriving.
  const [outgoingName, setOutgoingName] = useState(null);
  const shownNameRef = useRef(meal?.name);
  const swipeStart = useRef(null);

  const canStep = typeof onStep === 'function' && total > 1;
  // `index` is 1-based in the archive's numbering and the step arrows move
  // it, so it doubles as the bounds check: No. 1 has nothing behind it and
  // No. {total} nothing ahead.
  const canStepBack = canStep && index > 1;
  const canStepForward = canStep && index < total;

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

  useEffect(() => {
    setPhotoIndex(0);
  }, [meal?.id]);

  // Start a dissolve whenever the dish changes under us, and clear it
  // once the outgoing title has faded out.
  useEffect(() => {
    if (!meal || shownNameRef.current === meal.name) return;
    setOutgoingName(shownNameRef.current);
    shownNameRef.current = meal.name;
    const ms = dissolveMs();
    if (!ms) {
      setOutgoingName(null);
      return;
    }
    const timer = setTimeout(() => setOutgoingName(null), ms);
    return () => clearTimeout(timer);
  }, [meal?.id, meal?.name]);

  function handleSwipeStart(e) {
    // A dish with several photos has its own horizontal swipe inside the
    // carousel. Pointer events bubble, so without this a swipe there would
    // advance the photo *and* step to the next dish. The carousel owns
    // horizontal gestures that start on it; the card takes the rest.
    if (e.target.closest?.('.photo-carousel-main')) {
      swipeStart.current = null;
      return;
    }
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
    if (delta > 0 ? canStepForward : canStepBack) onStep(delta);
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
  const heroPhotoUrl = photos[0] ?? null;

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
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={meal.name}
        onPointerDown={canStep ? handleSwipeStart : undefined}
        onPointerUp={canStep ? handleSwipeEnd : undefined}
        onPointerCancel={canStep ? () => (swipeStart.current = null) : undefined}
      >
        <button ref={closeRef} type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="modal-plate">
          <div className="modal-plate-header">
            <span className="meta">{meal.category}</span>
            <span className="modal-plate-count">{total}</span>
          </div>
          <div className="modal-rule" />
          <PhotoCarousel
            photos={photos.map((src, i) => ({ id: i, src }))}
            activeIndex={photoIndex}
            onActiveChange={setPhotoIndex}
            alt={`${meal.name}, ${meal.cuisine} ${meal.category}`}
            emptyLabel="food cutout · full res"
            showQueue={false}
          />
        </div>

        <div className="modal-text">
          {/* The name cross-dissolves in place: the outgoing title stays
              mounted, absolutely positioned over the incoming one, so
              both are legible at once part-way through. */}
          <div className="modal-name-stack">
            {outgoingName && (
              <h2 key={outgoingName} className="modal-text-name modal-name-out" aria-hidden="true">
                {outgoingName}
              </h2>
            )}
            <h2 key={meal.id} className="modal-text-name modal-name-in">
              {meal.name}
            </h2>
          </div>

          {/* Everything below the name focus-pulls as a block. Remounting
              on the dish id is what replays the animation. */}
          <div className="modal-text-body" key={meal.id}>
            {meal.description && <p className="modal-description">{meal.description}</p>}
            <p className="modal-text-sub">{subLine}</p>

            {meal.ingredients.length > 0 && (
              <>
                <div className="bubble-row modal-ingredients">
                  {meal.ingredients.map((ing) => (
                    <span key={ing} className="bubble">
                      {ing}
                    </span>
                  ))}
                </div>
                <div className="modal-rule" />
              </>
            )}

            {meal.method.length > 0 && (
              <ol className="modal-method">
                {meal.method.map((step, i) => (
                  <li key={i}>
                    <span className="modal-method-num">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            )}

            {meal.note && <p className="modal-note">{meal.note}</p>}
          </div>

          <div className="modal-footer">
            <button type="button" className="modal-share" onClick={handleShare} disabled={shareStatus === 'working'}>
              {shareStatus === 'working' ? 'Preparing…' : shareStatus === 'done' ? 'Saved image' : shareStatus === 'error' ? 'Could not share' : 'Share'}
            </button>
            {canStep ? (
              <div className="modal-step">
                <button
                  type="button"
                  className="modal-step-btn"
                  onClick={() => onStep(-1)}
                  disabled={!canStepBack}
                  aria-label="Previous dish"
                >
                  ‹
                </button>
                <span className="modal-index">
                  No. {index} of {total}
                </span>
                <button
                  type="button"
                  className="modal-step-btn"
                  onClick={() => onStep(1)}
                  disabled={!canStepForward}
                  aria-label="Next dish"
                >
                  ›
                </button>
              </div>
            ) : (
              <span className="modal-index">
                No. {index} of {total}
              </span>
            )}
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
          <div className="share-card-footer">meal diary</div>
        </div>
      </div>
    </div>
  );
}
