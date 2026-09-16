import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import { generateStaticSiteHtml, downloadStaticSite } from '../lib/staticSite';
import './PublishModal.css';

export default function PublishModal({ meals, onClose }) {
  const [includeAll, setIncludeAll] = useState(true);
  const [selectedIds, setSelectedIds] = useState(() => new Set(meals.map((m) => m.id)));
  const [status, setStatus] = useState('idle'); // idle | generating | done | error
  const [error, setError] = useState('');
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

  function toggleMeal(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const mealsToPublish = includeAll ? meals : meals.filter((m) => selectedIds.has(m.id));

  async function handleGenerate() {
    setError('');
    setStatus('generating');
    try {
      if (mealsToPublish.length === 0) {
        throw new Error('Choose at least one meal to include.');
      }
      const html = generateStaticSiteHtml(mealsToPublish, { siteTitle: 'Meal Diary' });
      downloadStaticSite(html);
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not generate the site.');
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="publish-card" role="dialog" aria-modal="true" aria-label="Publish site">
        <button ref={closeRef} type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2 className="publish-title">Publish site</h2>
        <p className="publish-subtitle">
          Bundle the gallery into a single, read-only HTML file — no admin controls, no login.
        </p>

        <div className="publish-toggle">
          <label>
            <input type="radio" checked={includeAll} onChange={() => setIncludeAll(true)} />
            Include all meals ({meals.length})
          </label>
          <label>
            <input type="radio" checked={!includeAll} onChange={() => setIncludeAll(false)} />
            Choose meals
          </label>
        </div>

        {!includeAll && (
          <ul className="publish-meal-list">
            {meals.map((meal) => (
              <li key={meal.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(meal.id)}
                    onChange={() => toggleMeal(meal.id)}
                  />
                  {meal.name}
                </label>
              </li>
            ))}
          </ul>
        )}

        {status === 'error' && <p className="publish-error">! {error}</p>}

        {status === 'done' ? (
          <div className="publish-done">
            <p>
              <strong>{mealsToPublish.length}</strong> meal{mealsToPublish.length === 1 ? '' : 's'} exported as{' '}
              <code>meal-diary-portfolio.html</code>.
            </p>
            <p className="publish-next-step">
              This file just downloaded to your computer. Upload it as-is to any static host — Vercel, Netlify,
              GitHub Pages — to make it live. Automatic one-click deploy needs a hosting API token, which isn't set
              up yet — tell me which host you'd like to use and I can wire that up next.
            </p>
            <Button type="button" variant="secondary" onClick={handleGenerate}>
              Download again
            </Button>
          </div>
        ) : (
          <div className="publish-footer">
            <Button type="button" variant="primary" onClick={handleGenerate} disabled={status === 'generating'}>
              {status === 'generating' ? 'Generating…' : 'Generate static site'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
