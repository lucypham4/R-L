import Button from './Button';
import './SettingsPage.css';

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
    </div>
  );
}
