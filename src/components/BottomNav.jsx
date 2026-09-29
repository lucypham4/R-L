import './BottomNav.css';

// The end glyphs are balanced by their clearance from the pill's rounded
// ends, not by how far their ink reaches sideways.
//
// An earlier pass gave every glyph the same ink span, x 4.5 -> 19.5, which
// made the horizontal gaps at each end identical and still left the pill
// looking tighter on the right. The ends are semicircles, so they curve in
// above and below the middle, and what the eye reads as the gap is the
// distance to that curve. The house is widest at its eaves, at mid-height,
// where the end is furthest away. The person was widest at its shoulders,
// at the very bottom of the glyph, right where the end curves in: 1.3px
// closer to its end than the house was to its own.
//
// So the shoulders now finish higher and a little narrower, at x 5 -> 19,
// y 19. That puts the person's bottom level with the house's (18.66), where
// it had sat a unit and a third lower, and brings its clearance within a
// fraction of a pixel of the house's. tests/bottom-nav.spec.js measures the
// clearance from the rendered paths; check a new icon against it.
const ICONS = {
  home: <path d="M4.5 11.17l7.5-5.83 7.5 5.83M6.17 10.33v8.33h4.17v-5h3.33v5h4.17V10.33" />,
  add: <path d="M12 4.5v15M4.5 12h15" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19c1.4-3.67 4.67-5.5 7-5.5s5.6 1.83 7 5.5" />
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
