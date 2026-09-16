import { useState } from 'react';
import Button from './Button';
import { Label, TextInput, ErrorText } from './TextField';
import { signIn } from '../lib/auth';
import './SignInScreen.css';

export default function SignInScreen({ onSignedIn = () => {} }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | signing-in | error
  const [error, setError] = useState('');

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
    <div className="signin-screen">
      <div className="signin-card">
        <p className="signin-eyebrow">Meal Diary</p>
        <h1 className="signin-title">Sign in</h1>
        <p className="signin-subtitle">For Lucy and her partner only — accounts are set up ahead of time.</p>

        <form className="signin-form" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="signin-email" required>
              Email
            </Label>
            <TextInput
              id="signin-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="signin-password" required>
              Password
            </Label>
            <TextInput
              id="signin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {status === 'error' && <ErrorText>{error}</ErrorText>}

          <Button type="submit" variant="primary" disabled={isSigningIn}>
            {isSigningIn ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="signin-footnote">Looking for the recipes? The public gallery lives on its own published site.</p>
      </div>
    </div>
  );
}
