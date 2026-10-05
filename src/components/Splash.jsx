import { useEffect, useState } from 'react';
import { tokenMs } from '../lib/motion';
import './Splash.css';

// Once a visit: a fresh tab plays it, a reload in the same tab doesn't.
const SEEN_KEY = 'splash-seen';

function seenThisVisit() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // storage blocked: it plays again on the next load, no worse than that
  }
}

// How long to wait for the wordmark's face before shining whatever has
// arrived: a glint across Georgia that then swaps to Tinos would be worse
// than a glint across Georgia.
const FONT_WAIT_MS = 700;

/**
 * The first frame of the app: "Staj" in steel, one glint run across it
 * like light along a knife's edge, then a cross-fade into the app, which
 * is already there underneath. A tap or a key skips straight to the
 * fade.
 *
 *   wait   the frame, empty, while the wordmark's face loads
 *   shine  the word fades in and the glint crosses it (--dur-sheen)
 *   leave  the frame dissolves into the app (--dur-dissolve)
 */
export default function Splash() {
  const [phase, setPhase] = useState(() => (seenThisVisit() ? 'done' : 'wait'));
  // Whether the word has been shown: skipped before it was, the frame
  // leaves empty rather than flashing the word on its way out.
  const [lit, setLit] = useState(false);

  useEffect(() => {
    if (phase === 'done') return undefined;
    markSeen();
    let cancelled = false;
    const font = document.fonts?.load ? document.fonts.load('400 64px Tinos') : Promise.resolve();
    Promise.race([font, new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS))])
      .catch(() => {})
      .then(() => {
        if (!cancelled) setPhase((p) => (p === 'wait' ? 'shine' : p));
      });
    return () => {
      cancelled = true;
    };
  }, []); // once, on mount

  useEffect(() => {
    if (phase === 'shine') {
      setLit(true);
      // The word fades in over --dur-color while the glint is still off
      // its left edge; the glint then takes --dur-sheen to cross.
      const t = setTimeout(() => setPhase('leave'), tokenMs('--dur-color') + tokenMs('--dur-sheen'));
      return () => clearTimeout(t);
    }
    if (phase === 'leave') {
      const t = setTimeout(() => setPhase('done'), tokenMs('--dur-dissolve'));
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  useEffect(() => {
    if (phase === 'done' || phase === 'leave') return undefined;
    const skip = () => setPhase('leave');
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div
      className={`splash splash-${phase}${lit ? ' splash-lit' : ''}`}
      aria-hidden="true"
      data-testid="splash"
      // Swallows the tap, so it skips the frame rather than landing on
      // whatever is hidden under it.
      onPointerDown={(e) => {
        e.preventDefault();
        setPhase('leave');
      }}
    >
      <p className="splash-word">Staj</p>
    </div>
  );
}
