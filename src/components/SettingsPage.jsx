import { useState } from 'react';
import Button from './Button';
import './SettingsPage.css';

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
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
  onDownloadCopy,
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
            {theme === 'dark' ? 'Dark' : 'Light'}
          </Button>
        </div>
      </section>

      {onDownloadCopy && (
        <section className="settings-section">
          <h2 className="settings-section-title">Export</h2>
          <p className="settings-row-body">Download a static, offline copy of your meal diary.</p>
          <Button variant="secondary" onClick={onDownloadCopy}>
            Download copy
          </Button>
        </section>
      )}

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
