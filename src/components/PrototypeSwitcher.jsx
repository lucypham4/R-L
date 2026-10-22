// PROTOTYPE, not production. The floating bar that flips between the
// variants in src/lib/variant.prototype.js. Not part of the design being
// compared, so it doesn't use the app's look.

import { useEffect, useState } from 'react';
import { VARIANTS, currentVariant, setVariant, showSwitcher } from '../lib/variant.prototype';
import './PrototypeSwitcher.css';

export default function PrototypeSwitcher() {
  const [key, setKey] = useState(currentVariant);
  const index = VARIANTS.findIndex((v) => v.key === key);

  function go(step) {
    const next = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length].key;
    setVariant(next);
    setKey(next);
  }

  useEffect(() => {
    function onKeyDown(e) {
      const t = e.target;
      if (t.closest?.('input, textarea, select, [contenteditable]')) return;
      // Alt, so the dish view keeps its own arrow keys.
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  if (!showSwitcher()) return null;

  return (
    <div className="prototype-switcher" role="group" aria-label="Prototype variant">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant">
        ‹
      </button>
      <span>
        {String.fromCharCode(65 + index)} · {VARIANTS[index].name}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">
        ›
      </button>
    </div>
  );
}
