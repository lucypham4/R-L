import { useEffect, useState } from 'react';
import { useSpringSheet } from '../lib/useSpringSheet.prototype';
import './MealActionSheet.css';

export default function MealActionSheet({ meal, onClose, onDelete, onEditGallery }) {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | deleting | error
  const [error, setError] = useState('');
  // PROTOTYPE (?variant=apple): the sheet rises and leaves on a spring, the
  // same way both ways, and can be dragged down to dismiss. Today's variant
  // closes it at once.
  const spring = useSpringSheet(onClose);
  const close = spring.requestClose ?? onClose;

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [close]);

  async function handleConfirmDelete() {
    setStatus('deleting');
    setError('');
    try {
      await onDelete(meal.id);
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not delete this dish.');
    }
  }

  return (
    <div {...spring.overlayProps} className="action-sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={spring.sheetRef}
        className={`action-sheet ${spring.active ? 'sheet-drag-zone' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={meal.name}
        {...spring.zoneProps}
      >
        {spring.active && <div className="sheet-grabber" aria-hidden="true" />}
        <p className="action-sheet-title">{meal.name}</p>

        {confirming ? (
          <>
            <p className="action-sheet-warning">Delete this dish? This can't be undone.</p>
            {status === 'error' && <p className="action-sheet-error">{error}</p>}
            <button
              type="button"
              className="action-sheet-btn action-sheet-btn-confirm"
              onClick={handleConfirmDelete}
              disabled={status === 'deleting'}
            >
              {status === 'deleting' ? 'Deleting…' : 'Delete dish'}
            </button>
            <button type="button" className="action-sheet-btn" onClick={() => setConfirming(false)} disabled={status === 'deleting'}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className="action-sheet-btn" onClick={() => setConfirming(true)}>
              Delete dish
            </button>
            <button type="button" className="action-sheet-btn" onClick={onEditGallery}>
              Edit gallery
            </button>
            <button type="button" className="action-sheet-btn" onClick={close}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
