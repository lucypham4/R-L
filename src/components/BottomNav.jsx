import './BottomNav.css';

// Every glyph's ink spans x 4.5 -> 19.5 inside the 24-unit viewBox.
//
// That matters because the first and last icons sit against the pill's
// rounded ends: the tabs themselves are exactly equal, but the painted
// glyphs were not. Home's ink ran 3 -> 21 while Profile's ran 4.5 ->
// 19.5, so the leftmost glyph reached 1.5 units closer to its edge than
// the rightmost did and the pill looked like it had more padding on the
// right. Equal ink insets make the end gaps identical without touching
// the layout, and incidentally stop Home reading as the chunkiest of the
// three. Keep any new icon inside the same 4.5 -> 19.5 span.
const ICONS = {
  home: <path d="M4.5 11.17l7.5-5.83 7.5 5.83M6.17 10.33v8.33h4.17v-5h3.33v5h4.17V10.33" />,
  add: <path d="M12 4.5v15M4.5 12h15" />,
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
