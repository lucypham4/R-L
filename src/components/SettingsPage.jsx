import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import Button from './Button';
import PhotoCropModal from './PhotoCropModal';
import { Label, TextInput, ErrorText } from './TextField';
import { THEME_LABELS } from '../lib/theme';
import { AVATAR_SIZE } from '../lib/avatar';
import { changePassword, requestPasswordReset } from '../lib/auth';
import './SettingsPage.css';

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// The picture in the top right of the gallery. Choosing one goes through
// the crop modal, framed as the circle it will be shown in.
function ProfileRow({ avatarUrl, name, onChangeAvatar }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | saving | error
  const [error, setError] = useState('');
  const saving = status === 'saving';

  async function save(blob) {
    setFile(null);
    setStatus('saving');
    setError('');
    try {
      await onChangeAvatar(blob);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(err.message || '');
    }
  }

  return (
    <>
      <div className="settings-profile">
        <Avatar src={avatarUrl} size={72} />
        <div className="settings-profile-body">
          {name && <p className="settings-profile-name">{name}</p>}
          <div className="settings-actions">
            <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={saving}>
              {saving ? 'Saving…' : avatarUrl ? 'Change photo' : 'Add photo'}
            </Button>
            {avatarUrl && (
              <Button variant="ghost" onClick={() => save(null)} disabled={saving}>
                Remove
              </Button>
            )}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            // Cleared so choosing the same file again still fires.
            e.target.value = '';
            if (chosen) setFile(chosen);
          }}
        />
      </div>
      {status === 'error' && (
        <p className="settings-row-body settings-row-error">Could not save that photo. {error}</p>
      )}
      {file && (
        <PhotoCropModal file={file} round outputSize={AVATAR_SIZE} onCancel={() => setFile(null)} onCrop={save} />
      )}
    </>
  );
}

// Asks for the current password as well as the new one: see changePassword.
// Anyone who has forgotten theirs gets the same reset email as the sign-in
// screen's "Forgot password?".
function ChangePasswordRow({ email }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [status, setStatus] = useState('idle'); // idle | saving | error | done
  const [error, setError] = useState('');
  const [resetStatus, setResetStatus] = useState('idle'); // idle | sending | sent | error
  const toggleRef = useRef(null);
  const wasOpen = useRef(false);
  const saving = status === 'saving';

  // Closing the form takes away what had focus; hand it back to the button
  // that opened it.
  useEffect(() => {
    if (!open && wasOpen.current) toggleRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  function close() {
    setOpen(false);
    setCurrent('');
    setNext('');
    setError('');
    setResetStatus('idle');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    try {
      await changePassword(email, current, next);
      close();
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not change your password.');
    }
  }

  async function handleForgot() {
    setResetStatus('sending');
    try {
      await requestPasswordReset(email);
      setResetStatus('sent');
    } catch {
      setResetStatus('error');
    }
  }

  if (!open) {
    return (
      <div className="settings-block">
        {status === 'done' && (
          <p className="settings-row-body" role="status">
            Password changed. Use the new one next time you sign in.
          </p>
        )}
        <Button
          ref={toggleRef}
          variant="secondary"
          onClick={() => {
            setStatus('idle');
            setOpen(true);
          }}
        >
          Change password
        </Button>
      </div>
    );
  }

  return (
    <form className="settings-block settings-form" onSubmit={handleSubmit}>
      {/* The account the new password is for, so a password manager files
          it in the right place. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <div>
        <Label htmlFor="settings-current-password" required>
          Current password
        </Label>
        <TextInput
          id="settings-current-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="settings-new-password" required>
          New password
        </Label>
        <TextInput
          id="settings-new-password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </div>
      {status === 'error' && <ErrorText>{error}</ErrorText>}
      <div className="settings-actions">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save password'}
        </Button>
        <Button type="button" variant="ghost" onClick={close} disabled={saving}>
          Cancel
        </Button>
      </div>
      {resetStatus === 'sent' ? (
        <p className="settings-row-body" role="status">
          A reset link is on its way to {email}.
        </p>
      ) : (
        <button type="button" className="settings-text-link" onClick={handleForgot} disabled={resetStatus === 'sending'}>
          {resetStatus === 'sending' ? 'Sending…' : 'Forgot it? Email me a reset link'}
        </button>
      )}
      {resetStatus === 'error' && (
        <p className="settings-row-body settings-row-error">Could not send the email. Try again in a minute.</p>
      )}
    </form>
  );
}

// The public page's own light/dark setting. Distinct from the chef's
// in-app Appearance above: that one is per-device and follows the OS by
// default, while this is a property of the published page every client
// sees. Writes through on click so the live page updates immediately,
// with the previous value restored if the update fails.
function PublicPageThemeRow({ pageTheme, onChangePageTheme }) {
  const [value, setValue] = useState(pageTheme);
  const [status, setStatus] = useState('idle'); // idle | saving | error

  async function handleToggle() {
    const next = value === 'dark' ? 'light' : 'dark';
    const previous = value;
    setValue(next);
    setStatus('saving');
    try {
      await onChangePageTheme(next);
      setStatus('idle');
    } catch {
      setValue(previous);
      setStatus('error');
    }
  }

  return (
    <>
      <div className="settings-row">
        <span>Public page</span>
        <Button variant="secondary" onClick={handleToggle} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : value === 'dark' ? 'Dark' : 'Light'}
        </Button>
      </div>
      <p className="settings-row-body">
        How your page at your public link looks to everyone you share it with. Change it any time.
      </p>
      {status === 'error' && (
        <p className="settings-row-body settings-row-error">
          Could not save that. Check your connection and try again.
        </p>
      )}
    </>
  );
}

// Manual fallback for meals Local Import (see CONTEXT.md / ADR 0001) left
// behind — declined at sign-up, or lost to a partial failure. Only ever
// touches meals still sitting in local storage, so there's nothing to
// dedupe against what's already in the account.
function LocalMealsRow({ count, onImport }) {
  const [status, setStatus] = useState('idle'); // idle | working | done
  const [result, setResult] = useState(null);

  async function handleClick() {
    setStatus('working');
    const outcome = await onImport();
    setResult(outcome);
    setStatus('done');
  }

  if (status === 'done') {
    const { succeeded, failed } = result;
    return (
      <p className="settings-row-body">
        {failed === 0 ? `Imported ${plural(succeeded, 'meal')}.` : `Imported ${succeeded}, ${plural(failed, 'meal')} still stuck — try again later.`}
      </p>
    );
  }

  return (
    <>
      <p className="settings-row-body">{plural(count, 'meal')} from this device haven&rsquo;t been added to your account.</p>
      <Button variant="secondary" onClick={handleClick} disabled={status === 'working'}>
        {status === 'working' ? 'Importing…' : 'Import'}
      </Button>
    </>
  );
}

export default function SettingsPage({
  onBack,
  isSupabaseConfigured,
  session,
  publicUrl,
  theme,
  onToggleTheme,
  onSignIn,
  onSignOut,
  chefProfile,
  onChangePageTheme,
  localMealCount,
  onImportLocalMeals,
  avatarUrl,
  onChangeAvatar,
}) {
  return (
    <div className="settings-page">
      <header className="settings-header">
        <button type="button" className="settings-back" onClick={onBack}>
          ← Back
        </button>
        <h1 className="settings-title">Settings</h1>
      </header>

      <section className="settings-section">
        <h2 className="settings-section-title">Profile</h2>
        <ProfileRow avatarUrl={avatarUrl} name={chefProfile?.displayName} onChangeAvatar={onChangeAvatar} />
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Theme</h2>
        <div className="settings-row">
          <span>Appearance</span>
          <Button variant="secondary" onClick={onToggleTheme}>
            {THEME_LABELS[theme]}
          </Button>
        </div>

        {/* Only a signed-in chef with a profile has a public page to
            style, so guests never see this row. */}
        {chefProfile && onChangePageTheme && (
          <PublicPageThemeRow
            pageTheme={chefProfile.pageTheme}
            onChangePageTheme={onChangePageTheme}
          />
        )}
      </section>

      {isSupabaseConfigured && (
        <section className="settings-section">
          <h2 className="settings-section-title">Account</h2>
          {session ? (
            <>
              <p className="settings-email">{session.user.email}</p>
              {publicUrl && (
                <a className="settings-link" href={publicUrl} target="_blank" rel="noreferrer">
                  View public page ↗
                </a>
              )}
              <ChangePasswordRow email={session.user.email} />
              <Button variant="secondary" onClick={onSignOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <p className="settings-row-body">For a public page and multi-device access.</p>
              <Button variant="primary" onClick={onSignIn}>
                Sign in
              </Button>
            </>
          )}
        </section>
      )}

      {isSupabaseConfigured && session && localMealCount > 0 && (
        <section className="settings-section">
          <h2 className="settings-section-title">This device</h2>
          <LocalMealsRow count={localMealCount} onImport={onImportLocalMeals} />
        </section>
      )}
    </div>
  );
}
