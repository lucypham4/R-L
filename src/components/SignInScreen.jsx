import { useState } from 'react';
import Button from './Button';
import { Label, TextInput, ErrorText } from './TextField';
import { signIn, signUp, resendConfirmation } from '../lib/auth';
import './SignInScreen.css';

export default function SignInScreen({ initialMode = 'signin', onGuest }) {
  const [mode, setMode] = useState(initialMode); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | working | error
  const [error, setError] = useState('');
  const [confirmNotice, setConfirmNotice] = useState('');
  const [resendStatus, setResendStatus] = useState('idle'); // idle | sending | sent | error
  const [resendError, setResendError] = useState('');

  const isSignUp = mode === 'signup';
  const isWorking = status === 'working';

  async function handleResend() {
    if (!email.trim()) {
      setResendStatus('error');
      setResendError('Enter your email above first.');
      return;
    }
    setResendStatus('sending');
    setResendError('');
    try {
      await resendConfirmation(email.trim());
      setResendStatus('sent');
    } catch (err) {
      setResendStatus('error');
      setResendError(err.message || 'Could not resend the email.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setConfirmNotice('');
    setStatus('working');
    try {
      if (isSignUp) {
        const session = await signUp(email.trim(), password);
        if (!session) {
          // Email confirmation is required, no session yet.
          setConfirmNotice('Check your email for a confirmation link, then sign in below.');
          setMode('signin');
          setPassword('');
        }
      } else {
        await signIn(email.trim(), password);
      }
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Something went wrong.');
    }
  }

  return (
    <div className="signin-screen">
      <div className="signin-card">
        <p className="signin-eyebrow">Meal Diary</p>
        <h1 className="signin-title">{isSignUp ? 'Create your account' : 'Sign in'}</h1>
        <p className="signin-subtitle">
          {isSignUp ? 'Optional. Get a public page and multi-device access.' : 'For a public page and multi-device access.'}
        </p>

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
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {confirmNotice && <p className="signin-notice">{confirmNotice}</p>}
          {status === 'error' && <ErrorText>{error}</ErrorText>}

          <Button type="submit" variant="primary" disabled={isWorking}>
            {isWorking ? (isSignUp ? 'Creating account…' : 'Signing in…') : isSignUp ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <button
          type="button"
          className="signin-switch"
          onClick={() => {
            setMode(isSignUp ? 'signin' : 'signup');
            setError('');
            setConfirmNotice('');
          }}
        >
          {isSignUp ? 'Already have an account? Sign in' : 'New chef? Create an account'}
        </button>

        {!isSignUp && (
          <div className="signin-resend">
            {resendStatus === 'sent' ? (
              <p className="signin-notice">Confirmation email resent. Check your inbox.</p>
            ) : (
              <button type="button" className="signin-resend-link" onClick={handleResend} disabled={resendStatus === 'sending'}>
                {resendStatus === 'sending' ? 'Sending…' : "Didn't get a confirmation email? Resend"}
              </button>
            )}
            {resendStatus === 'error' && <p className="signin-notice signin-notice-error">{resendError}</p>}
          </div>
        )}

        {onGuest && (
          <button type="button" className="signin-guest-link" onClick={onGuest}>
            Not now, continue without an account
          </button>
        )}
      </div>
    </div>
  );
}
