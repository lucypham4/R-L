import './BottomNav.css';

const ICONS = {
  home: <path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" />,
  add: <path d="M12 5v14M5 12h14" />,
  theme: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
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

export default function BottomNav({ onHome, onAdd, onToggleTheme }) {
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
      <button type="button" className="bottom-nav-tab" onClick={onToggleTheme}>
        <Icon name="theme" />
        <span>Theme</span>
      </button>
    </nav>
  );
}
