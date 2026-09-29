import { useState } from 'react';
import Button from './Button';
import { Label, TextInput, ErrorText } from './TextField';
import { updatePassword } from '../lib/auth';
import './SignInScreen.css';

/**
 * Where a password-reset link lands. The link has already signed the chef
 * in; this is the one thing it was for.
 */
export default function NewPasswordScreen({ email, onDone }) {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | working | error | done
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setStatus('working');
    try {
      await updatePassword(password);
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not save your new password.');
    }
  }

  if (status === 'done') {
    return (
      <div className="signin-screen">
        <div className="signin-card">
          <p className="signin-eyebrow">Staj</p>
          <h1 className="signin-title">Password updated</h1>
          <p className="signin-subtitle">You&rsquo;re signed in. Use the new password next time, on any device.</p>
          <div className="signin-form">
            <Button type="button" variant="primary" onClick={onDone} autoFocus>
              Continue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="signin-screen">
      <div className="signin-card">
        <p className="signin-eyebrow">Staj</p>
        <h1 className="signin-title">Choose a new password</h1>
        <p className="signin-subtitle">For {email}.</p>

        <form className="signin-form" onSubmit={handleSubmit}>
          {/* The account the password belongs to, for password managers:
              without it they have a new password and nowhere to file it. */}
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <div>
            <Label htmlFor="new-password" required>
              New password
            </Label>
            <TextInput
              id="new-password"
              type="password"
              autoComplete="new-password"
              autoFocus
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {status === 'error' && <ErrorText>{error}</ErrorText>}

          <Button type="submit" variant="primary" disabled={status === 'working'}>
            {status === 'working' ? 'Saving…' : 'Save new password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
