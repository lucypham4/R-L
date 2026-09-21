import './BottomNav.css';

const ICONS = {
  home: <path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" />,
  add: <path d="M12 5v14M5 12h14" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.5-4 5-6 7.5-6s6 2 7.5 6" />
    </>
  ),
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'add', label: 'Add' },
  { id: 'profile', label: 'Profile' },
];

// `active` is the id of the view currently on screen. It used to be
// hard-coded to Home, so the pill stayed under Home even while the add
// form or settings page was open.
export default function BottomNav({ onHome, onAdd, onProfile, active = 'home' }) {
  const handlers = { home: onHome, add: onAdd, profile: onProfile };

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {/* The tab labels are icon-only now, so tab.label reaches screen
          readers through aria-label instead of visible text. Without it
          this nav is three unlabelled buttons. */}
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`bottom-nav-tab ${isActive ? 'bottom-nav-tab-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={tab.label}
            onClick={handlers[tab.id]}
          >
            <Icon name={tab.id} />
          </button>
        );
      })}
    </nav>
  );
}
