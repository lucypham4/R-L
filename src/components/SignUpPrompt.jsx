import { useEffect } from 'react';
import Button from './Button';
import './MealActionSheet.css';
import './SignUpPrompt.css';

export const SIGN_UP_PITCH = 'Sign up with your email to make your page live.';

/**
 * Asked at the one moment an account is worth having: a guest has tried to
 * share a page that doesn't exist yet (ADR 0004). Dismissing it changes
 * nothing; the app keeps working on this device as before.
 */
export default function SignUpPrompt({ onSignIn, onClose }) {
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

  return (
    <div className="action-sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="action-sheet sign-up-prompt" role="dialog" aria-modal="true" aria-labelledby="sign-up-prompt-title">
        <p id="sign-up-prompt-title" className="action-sheet-title">
          {SIGN_UP_PITCH}
        </p>
        <p className="action-sheet-warning">Everything else works without an account.</p>
        <Button type="button" variant="primary" onClick={() => onSignIn('signup')} autoFocus>
          Sign up
        </Button>
        <Button type="button" variant="secondary" onClick={() => onSignIn('signin')}>
          I already have an account
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Not now
        </Button>
      </div>
    </div>
  );
}
