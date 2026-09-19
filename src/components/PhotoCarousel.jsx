import { useRef } from 'react';
import './PhotoCarousel.css';

const SWIPE_THRESHOLD = 50;

/**
 * A main photo with a thumbnail queue on the left. Navigate by tapping a
 * thumbnail, clicking the translucent arrows, or swiping the main image.
 * Editable (onAdd/onRemove) in the add-meal flow, read-only when viewing a
 * saved meal.
 */
export default function PhotoCarousel({
  photos,
  activeIndex,
  onActiveChange,
  onRemove,
  onAdd,
  maxPhotos,
  alt = '',
  emptyLabel,
  showQueue = true,
}) {
  const swipeStart = useRef(null);

  function go(delta) {
    const next = activeIndex + delta;
    if (next < 0 || next >= photos.length) return;
    onActiveChange(next);
  }

  function handlePointerDown(e) {
    swipeStart.current = { x: e.clientX, y: e.clientY };
  }

  function handlePointerUp(e) {
    if (!swipeStart.current) return;
    const dx = e.clientX - swipeStart.current.x;
    const dy = e.clientY - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    go(dx < 0 ? 1 : -1);
  }

  const active = photos[activeIndex];

  return (
    <div className="photo-carousel">
      {showQueue && (photos.length > 0 || onAdd) && (
        <div className="photo-carousel-queue">
          {photos.map((photo, i) => (
            <div key={photo.id} className={`photo-carousel-thumb-wrap ${i === activeIndex ? 'photo-carousel-thumb-active' : ''}`}>
              <button type="button" className="photo-carousel-thumb" onClick={() => onActiveChange(i)} aria-label={`View photo ${i + 1}`}>
                <img src={photo.src} alt="" />
              </button>
              {onRemove && (
                <span
                  className="photo-carousel-remove"
                  role="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => onRemove(i)}
                >
                  ×
                </span>
              )}
            </div>
          ))}
          {onAdd && photos.length < maxPhotos && (
            <button type="button" className="photo-carousel-thumb photo-carousel-add" onClick={onAdd} aria-label="Add photo">
              +
            </button>
          )}
        </div>
      )}

      <div
        className="photo-carousel-main"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => (swipeStart.current = null)}
      >
        {active ? (
          <img src={active.src} alt={alt} className="photo-carousel-main-photo" />
        ) : (
          <span className="photo-carousel-empty">{emptyLabel}</span>
        )}

        {photos.length > 1 && (
          <>
            <button
              type="button"
              className="photo-carousel-arrow photo-carousel-arrow-prev"
              onClick={() => go(-1)}
              disabled={activeIndex === 0}
              aria-label="Previous photo"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              className="photo-carousel-arrow photo-carousel-arrow-next"
              onClick={() => go(1)}
              disabled={activeIndex === photos.length - 1}
              aria-label="Next photo"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
