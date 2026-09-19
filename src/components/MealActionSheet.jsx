import { useEffect, useState } from 'react';
import './MealActionSheet.css';

export default function MealActionSheet({ meal, onClose, onDelete, onEditGallery }) {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | deleting | error
  const [error, setError] = useState('');

  useEffect(() => {
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
    <div className="action-sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="action-sheet" role="dialog" aria-modal="true" aria-label={meal.name}>
        <p className="action-sheet-title">{meal.name}</p>

        {confirming ? (
          <>
            <p className="action-sheet-warning">Delete this dish? This can't be undone.</p>
            {status === 'error' && <p className="action-sheet-error">{error}</p>}
            <button
              type="button"
              className="action-sheet-btn action-sheet-btn-danger"
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
            <button type="button" className="action-sheet-btn action-sheet-btn-danger" onClick={() => setConfirming(true)}>
              Delete dish
            </button>
            <button type="button" className="action-sheet-btn" onClick={onEditGallery}>
              Edit gallery
            </button>
            <button type="button" className="action-sheet-btn" onClick={onClose}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
