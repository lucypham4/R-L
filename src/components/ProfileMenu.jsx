import { useEffect, useRef, useState } from 'react';
import './ProfileMenu.css';

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.5-4 5-6 7.5-6s6 2 7.5 6" />
    </svg>
  );
}

export default function ProfileMenu({
  placement = 'below',
  triggerClassName,
  triggerLabel,
  isSupabaseConfigured,
  session,
  publicUrl,
  theme,
  onToggleTheme,
  onSignIn,
  onSignOut,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`profile-menu profile-menu-${placement}`} ref={rootRef}>
      <button
        type="button"
        className={triggerClassName || 'profile-menu-trigger'}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Profile"
      >
        <ProfileIcon />
        {triggerLabel && <span>{triggerLabel}</span>}
      </button>

      {open && (
        <div className="profile-menu-panel" role="menu">
          <button type="button" className="profile-menu-item" onClick={onToggleTheme}>
            <span>Theme</span>
            <span className="profile-menu-value">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>

          {isSupabaseConfigured && (
            <>
              <div className="profile-menu-divider" />
              {session ? (
                <>
                  {publicUrl && (
                    <a className="profile-menu-item" href={publicUrl} target="_blank" rel="noreferrer">
                      View public page ↗
                    </a>
                  )}
                  <div className="profile-menu-email">{session.user.email}</div>
                  <button type="button" className="profile-menu-item" onClick={onSignOut}>
                    Sign out
                  </button>
                </>
              ) : (
                <button type="button" className="profile-menu-item" onClick={onSignIn}>
                  Sign in for multi-device access
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
