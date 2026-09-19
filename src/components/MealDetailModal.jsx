import { useEffect, useRef, useState } from 'react';
import { toCanvas } from 'html-to-image';
import PhotoCarousel from './PhotoCarousel';
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

export default function MealDetailModal({ meal, index, total, onClose }) {
  const closeRef = useRef(null);
  const shareCardRef = useRef(null);
  const [shareStatus, setShareStatus] = useState('idle'); // idle | working | done | error
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    setPhotoIndex(0);
  }, [meal?.id]);

  if (!meal) return null;

  const date = new Date(meal.date);
  const photos = meal.photos ?? [];
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
          />
        </div>

        <div className="modal-text">
          <h2 className="modal-text-name">{meal.name}</h2>
          {meal.description && <p className="modal-description">{meal.description}</p>}
          <p className="modal-text-sub">
            {meal.cuisine} · {fullDateFormatter.format(date)} · Serves {meal.serves}
          </p>

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

          <div className="modal-footer">
            <button type="button" className="modal-share" onClick={handleShare} disabled={shareStatus === 'working'}>
              {shareStatus === 'working' ? 'Preparing…' : shareStatus === 'done' ? 'Saved image' : shareStatus === 'error' ? 'Could not share' : 'Share'}
            </button>
            <span className="modal-index">
              No. {index} of {total}
            </span>
          </div>
        </div>
      </div>

      <div className="share-card-clip" aria-hidden="true">
        <div className="share-card" ref={shareCardRef}>
          <div className="share-card-image">{!heroPhotoUrl && <span>food cutout</span>}</div>
          <div className="share-card-body">
            <h2 className="share-card-name">{meal.name}</h2>
            {meal.description && <p className="share-card-description">{meal.description}</p>}
            <p className="share-card-sub">
              {meal.cuisine} · {fullDateFormatter.format(date)} · Serves {meal.serves}
            </p>

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
