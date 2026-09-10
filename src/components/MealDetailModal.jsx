import { useEffect, useRef } from 'react';
import './MealDetailModal.css';

const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const fullDateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function MealDetailModal({ meal, index, total, onClose }) {
  const closeRef = useRef(null);

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

  if (!meal) return null;

  const date = new Date(meal.date);

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
          <h2 className="modal-plate-name">{meal.name}</h2>
          <div className="modal-rule" />
          <div className="modal-plate-image">
            {meal.photoUrl ? (
              <img src={meal.photoUrl} alt={`${meal.name}, ${meal.cuisine} ${meal.category}`} className="modal-plate-photo" />
            ) : (
              <span>food cutout · full res</span>
            )}
          </div>
          <div className="modal-plate-footer">Meal Diary · {monthFormatter.format(date)}</div>
        </div>

        <div className="modal-text">
          <h2 className="modal-text-name">{meal.name}</h2>
          <p className="modal-text-sub">
            {meal.cuisine} · {fullDateFormatter.format(date)} · Serves {meal.serves}
          </p>

          {meal.ingredients.length > 0 && (
            <>
              <ul className="modal-ingredients">
                {meal.ingredients.map((ing) => (
                  <li key={ing}>{ing}</li>
                ))}
              </ul>
              <div className="modal-rule" />
            </>
          )}

          {meal.method.length > 0 ? (
            <ol className="modal-method">
              {meal.method.map((step, i) => (
                <li key={i}>
                  <span className="modal-method-num">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="modal-description">{meal.description}</p>
          )}

          {meal.note && <p className="modal-note">{meal.note}</p>}

          <div className="modal-footer">
            <div className="modal-tags">
              {meal.tags.map((tag) => (
                <span key={tag} className="modal-tag">
                  {tag}
                </span>
              ))}
            </div>
            <span className="modal-index">
              No. {index} of {total}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
