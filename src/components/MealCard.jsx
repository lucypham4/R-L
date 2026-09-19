import { useRef } from 'react';
import './MealCard.css';

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const LONG_PRESS_MS = 500;

export function formatMealDate(iso) {
  return dateFormatter.format(new Date(iso)).replace(/ /g, ' ').toUpperCase();
}

export default function MealCard({ meal, onOpen, onLongPress, editMode, onDelete }) {
  const pressTimer = useRef(null);
  const longPressedRef = useRef(false);

  function startPress() {
    if (!onLongPress) return;
    longPressedRef.current = false;
    pressTimer.current = setTimeout(() => {
      longPressedRef.current = true;
      onLongPress(meal);
    }, LONG_PRESS_MS);
  }

  function cancelPress() {
    clearTimeout(pressTimer.current);
  }

  function handleClick() {
    if (editMode || longPressedRef.current) return;
    onOpen(meal);
  }

  return (
    <div className="meal-card-wrap">
      <button
        type="button"
        className="meal-card"
        onClick={handleClick}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
      >
        <span className="meal-card-image">
          {meal.photos?.[0] ? (
            <img src={meal.photos[0]} alt={`${meal.name}, ${meal.cuisine} ${meal.category}`} className="meal-card-photo" />
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
        <button
          type="button"
          className="meal-card-delete-badge"
          aria-label={`Delete ${meal.name}`}
          onClick={() => onDelete(meal.id)}
        >
          ×
        </button>
      )}
    </div>
  );
}
