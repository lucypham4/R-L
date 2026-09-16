import ProfileMenu from './ProfileMenu';
import './BottomNav.css';

const ICONS = {
  home: <path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" />,
  add: <path d="M12 5v14M5 12h14" />,
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export default function BottomNav({
  onHome,
  onAdd,
  isSupabaseConfigured,
  session,
  publicUrl,
  theme,
  onToggleTheme,
  onSignIn,
  onSignOut,
}) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <button type="button" className="bottom-nav-tab bottom-nav-tab-active" onClick={onHome}>
        <Icon name="home" />
        <span>Home</span>
      </button>
      <button type="button" className="bottom-nav-tab" onClick={onAdd}>
        <Icon name="add" />
        <span>Add</span>
      </button>
      <ProfileMenu
        placement="above"
        triggerClassName="bottom-nav-tab"
        triggerLabel="Profile"
        isSupabaseConfigured={isSupabaseConfigured}
        session={session}
        publicUrl={publicUrl}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />
    </nav>
  );
}
