import { useState } from 'react';
import Button from './Button';
import { THEME_LABELS } from '../lib/theme';
import './SettingsPage.css';

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
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
