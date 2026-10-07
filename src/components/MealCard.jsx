import { useEffect, useRef, useState } from 'react';
import { getSquareCropUrl } from '../lib/autoSquareCrop';
import DeleteBadge from './DeleteBadge';
import './MealCard.css';

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const LONG_PRESS_MS = 500;
// A press that wanders further than this before the long press fires was
// the start of a scroll or a drag across the grid, not a hold.
const HOLD_SLOP = 10;

export function formatMealDate(iso) {
  return dateFormatter.format(new Date(iso)).replace(/ /g, ' ');
}

export default function MealCard({ meal, onOpen, onLongPress, editMode, onDelete, dragging, style }) {
  const pressTimer = useRef(null);
  const pressStart = useRef(null);
  const longPressedRef = useRef(false);
  const rawPhoto = meal.photos?.[0] ?? null;
  const [thumbSrc, setThumbSrc] = useState(rawPhoto);

  // Most photos already fill their 1:1 thumbnail edge to edge (every JPEG
  // from the crop wizard does); this only replaces the src when an older
  // background-removed PNG turns out to have transparent padding baked in.
  useEffect(() => {
    setThumbSrc(rawPhoto);
    if (!rawPhoto) return;
    let cancelled = false;
    getSquareCropUrl(rawPhoto).then((url) => {
      if (!cancelled) setThumbSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [rawPhoto]);

  // The long press hands on where it was held, so that moving on from
  // there can drag the dish (Gallery, lib/useDishReorder.js).
  function startPress(e) {
    if (!onLongPress) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    longPressedRef.current = false;
    const point = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    pressStart.current = point;
    pressTimer.current = setTimeout(() => {
      longPressedRef.current = true;
      onLongPress(meal, point);
    }, LONG_PRESS_MS);
  }

  function movePress(e) {
    const start = pressStart.current;
    if (!start || e.pointerId !== start.pointerId) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > HOLD_SLOP) cancelPress();
  }

  function cancelPress() {
    clearTimeout(pressTimer.current);
    pressStart.current = null;
  }

  function handleClick() {
    if (editMode || longPressedRef.current) return;
    onOpen(meal);
  }

  return (
    <div className={`meal-card-wrap ${dragging ? 'meal-card-wrap-dragging' : ''}`} style={style} data-dish-id={meal.id}>
      <button
        type="button"
        className="meal-card"
        onClick={handleClick}
        // A held dish is the chef's to move, not the phone's to offer to
        // save or share as a picture.
        onContextMenu={onLongPress ? (e) => e.preventDefault() : undefined}
        onPointerDown={startPress}
        onPointerMove={movePress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
      >
        {/* data-meal-photo is what the dish's photo flies to and from
            (lib/dishFlight.js). */}
        <span className="meal-card-image" data-meal-photo={meal.id}>
          {thumbSrc ? (
            <img
              src={thumbSrc}
              alt={`${meal.name}, ${meal.cuisine} ${meal.category}`}
              className="meal-card-photo"
              draggable={false}
            />
          ) : (
            <span className="meal-card-image-label" aria-hidden="true">
              food cutout · 1:1
            </span>
          )}
        </span>
        <span className="meal-card-name">{meal.name}</span>
        <span className="meal-card-meta">
          {meal.cuisine} · {meal.category}
        </span>
        <span className="meal-card-date">{formatMealDate(meal.date)}</span>
      </button>

      {editMode && (
        <DeleteBadge className="meal-card-delete-badge" label={`Delete ${meal.name}`} onClick={() => onDelete(meal.id)} />
      )}
    </div>
  );
}
