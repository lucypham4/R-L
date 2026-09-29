import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import { Label, TextInput, ErrorText } from './TextField';
import { signIn, signUp, resendConfirmation, requestPasswordReset } from '../lib/auth';
import './SignInScreen.css';

const COPY = {
  signin: {
    title: 'Sign in',
    subtitle: 'For a public page and multi-device access.',
    submit: 'Sign in',
    working: 'Signing in…',
  },
  signup: {
    title: 'Create your account',
    subtitle: 'Optional. Get a public page and multi-device access.',
    submit: 'Create account',
    working: 'Creating account…',
  },
  forgot: {
    title: 'Reset your password',
    subtitle: "Enter your account's email and we'll send a link to choose a new password.",
    submit: 'Send reset link',
    working: 'Sending…',
  },
};

export default function SignInScreen({ initialMode = 'signin', initialNotice = '', onGuest }) {
  const [mode, setMode] = useState(initialMode); // signin | signup | forgot
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | working | error
  const [error, setError] = useState('');
  const [confirmNotice, setConfirmNotice] = useState(initialNotice);
  const [resendStatus, setResendStatus] = useState('idle'); // idle | sending | sent | error
  const [resendError, setResendError] = useState('');
  const [resetSentTo, setResetSentTo] = useState('');
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const isSignUp = mode === 'signup';
  const isForgot = mode === 'forgot';
  const isWorking = status === 'working';
  const copy = COPY[mode];

  // The link that switched modes has gone, and focus with it. Put it where
  // the next thing to type is: the email to reset, or, back on the sign-in
  // form with the email already there, the password. Keyed on the mode
  // alone, so typing never moves it.
  useEffect(() => {
    const target = mode === 'signin' && email ? passwordRef.current : emailRef.current;
    target?.focus();
  }, [mode]);

  function switchMode(next) {
    setMode(next);
    setStatus('idle');
    setError('');
    setConfirmNotice('');
    setResetSentTo('');
  }

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
      if (isForgot) {
        await requestPasswordReset(email.trim());
        setResetSentTo(email.trim());
      } else if (isSignUp) {
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
        <p className="signin-eyebrow">Staj</p>
        <h1 className="signin-title">{copy.title}</h1>
        <p className="signin-subtitle">{copy.subtitle}</p>

        <form className="signin-form" onSubmit={handleSubmit}>
          {/* First, so "below" means the whole form: the password to sign
              in with, or the links that send a new email. */}
          {confirmNotice && <p className="signin-notice">{confirmNotice}</p>}
          <div>
            <Label htmlFor="signin-email" required>
              Email
            </Label>
            <TextInput
              ref={emailRef}
              id="signin-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setResetSentTo('');
              }}
              required
            />
          </div>
          {!isForgot && (
            <div>
              <Label htmlFor="signin-password" required>
                Password
              </Label>
              <TextInput
                ref={passwordRef}
                id="signin-password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {!isSignUp && (
                <button type="button" className="signin-forgot" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
              )}
            </div>
          )}

          {resetSentTo && (
            <p className="signin-notice" role="status">
              If there&rsquo;s an account for {resetSentTo}, a reset link is on its way. It can take a minute, and
              sometimes lands in spam.
            </p>
          )}
          {status === 'error' && <ErrorText>{error}</ErrorText>}

          <Button type="submit" variant="primary" disabled={isWorking}>
            {isWorking ? copy.working : resetSentTo ? 'Send again' : copy.submit}
          </Button>
        </form>

        <button
          type="button"
          className="signin-switch"
          onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin'
            ? 'New chef? Create an account'
            : isForgot
              ? 'Remembered it? Back to sign in'
              : 'Already have an account? Sign in'}
        </button>

        {mode === 'signin' && (
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
