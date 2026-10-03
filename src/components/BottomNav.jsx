import './BottomNav.css';

// The end glyphs are balanced by their clearance from the pill's rounded
// ends, not by how far their ink reaches sideways. The ends are
// semicircles, so they curve in above and below the middle, and what the
// eye reads as the gap is the distance to that curve: ink near a glyph's
// top or bottom corners sits closer to its end than ink at mid-height.
//
// The house's nearest ink is the foot of its wall, low and to the side.
// A bare plus has nothing there -- only the tip of its crossbar, dead
// level with the end's centre -- and against the house it left the right
// end 2.9px roomier. A plus in a circle has ink all the way round, and the
// circle's shoulders come within 0.2px of the house's clearance. (A bigger
// bare plus could match it too, but only at a size that outweighs the
// house.) tests/bottom-nav.spec.js measures the clearance from the
// rendered paths; check a new icon against it.
//
// Profile used to be a third tab. It's the picture in the top right of the
// gallery now (Gallery.jsx), where it can be the chef's own face.
const ICONS = {
  home: <path d="M4.5 11.17l7.5-5.83 7.5 5.83M6.17 10.33v8.33h4.17v-5h3.33v5h4.17V10.33" />,
  add: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.25v7.5M8.25 12h7.5" />
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
];

// `active` is the id of the view currently on screen. It used to be
// hard-coded to Home, so the pill stayed under Home even while the add
// form or settings page was open.
export default function BottomNav({ onHome, onAdd, active = 'home' }) {
  const handlers = { home: onHome, add: onAdd };

  return (
    <>
      {/* The page fading out under the pill, so a dish scrolling down
          behind it goes soft rather than running into it. */}
      <div className="bottom-nav-fade" aria-hidden="true" />
      <nav className="bottom-nav" aria-label="Primary">
        {/* The tab labels are icon-only now, so tab.label reaches screen
            readers through aria-label instead of visible text. Without it
            this nav is two unlabelled buttons. */}
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
    </>
  );
}
