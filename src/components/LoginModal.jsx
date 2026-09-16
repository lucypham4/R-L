import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import { Label, TextInput, ErrorText } from './TextField';
import { signIn } from '../lib/auth';
import './LoginModal.css';

export default function LoginModal({ onSignedIn, onCancel }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | signing-in | error
  const [error, setError] = useState('');
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === 'Escape' && status !== 'signing-in') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onCancel, status]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setStatus('signing-in');
    try {
      await signIn(email.trim(), password);
      onSignedIn();
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not sign in.');
    }
  }

  const isSigningIn = status === 'signing-in';

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !isSigningIn && onCancel()}>
      <div className="login-card" role="dialog" aria-modal="true" aria-label="Sign in">
        <button ref={closeRef} type="button" className="modal-close" onClick={onCancel} disabled={isSigningIn} aria-label="Close">
          ×
        </button>

        <h2 className="login-title">Sign in</h2>
        <p className="login-subtitle">For Lucy and her partner only — accounts are set up ahead of time.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="login-email" required>
              Email
            </Label>
            <TextInput
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="login-password" required>
              Password
            </Label>
            <TextInput
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {status === 'error' && <ErrorText>{error}</ErrorText>}

          <div className="login-footer">
            <Button type="submit" variant="primary" disabled={isSigningIn}>
              {isSigningIn ? 'Signing in…' : 'Sign in'}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={isSigningIn}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
