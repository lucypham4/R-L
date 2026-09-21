import { useRef, useState } from 'react';
import Button from './Button';
import OnboardingArt from './OnboardingArt';
import { buildSteps } from './onboardingSteps';
import './OnboardingTour.css';

const ICONS = {
  book: (
    <path d="M12 5.5c-1.6-1.1-4.2-1.6-6.5-1.3v14c2.3-.3 4.9.2 6.5 1.3 1.6-1.1 4.2-1.6 6.5-1.3v-14c-2.3-.3-4.9.2-6.5 1.3zM12 5.5v14" />
  ),
  camera: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7l1.4-2.5h5.2L16 7" />
      <circle cx="12" cy="13.5" r="3.4" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="9.5" y="3" width="6" height="6" rx="1" fillOpacity="0.15" fill="currentColor" />
      <rect x="16" y="3" width="5" height="6" rx="1" />
      <rect x="3" y="9.5" width="6" height="6" rx="1" fillOpacity="0.15" fill="currentColor" />
      <rect x="9.5" y="9.5" width="6" height="6" rx="1" />
      <rect x="3" y="16" width="6" height="5" rx="1" fillOpacity="0.15" fill="currentColor" />
    </>
  ),
  share: (
    <>
      <path d="M12 3v11M12 3l-4 4M12 3l4 4" />
      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </>
  ),
};

function Icon({ name }) {
  return (
    <svg className="onboarding-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

const SWIPE_THRESHOLD = 50;

export default function OnboardingTour({ onDone, publicUrl }) {
  const [step, setStep] = useState(0);
  // Which way the last move went, so the panel slides in from the side
  // the chef came from instead of always the same direction. Swiping
  // back that animates forward feels like the app misread the gesture.
  const [direction, setDirection] = useState('forward');
  const STEPS = buildSteps(publicUrl);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const swipeStart = useRef(null);

  function goNext() {
    setDirection('forward');
    setStep((n) => n + 1);
  }

  function goBack() {
    setDirection('back');
    setStep((n) => n - 1);
  }

  function handlePointerDown(e) {
    swipeStart.current = { x: e.clientX, y: e.clientY };
  }

  function handlePointerUp(e) {
    if (!swipeStart.current) return;
    const dx = e.clientX - swipeStart.current.x;
    const dy = e.clientY - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) {
      isLast ? onDone() : goNext();
    } else if (step > 0) {
      goBack();
    }
  }

  return (
    <div className="onboarding-screen">
      <div
        className="onboarding-card"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => (swipeStart.current = null)}
      >
        <button type="button" className="onboarding-skip" onClick={onDone}>
          Skip
        </button>

        <div key={step} className={`onboarding-panel onboarding-panel-${direction}`}>
          <Icon name={current.icon} />
          <h2 className="onboarding-title">{current.title}</h2>
          <p className="onboarding-body">{current.body}</p>

          <OnboardingArt
            art={current.art}
            label={current.artLabel}
            hint={current.artHint}
            ratio={current.ratio}
          />
        </div>

        <div className="onboarding-dots">
          {STEPS.map((s, i) => (
            <span key={s.title} className={`onboarding-dot ${i === step ? 'onboarding-dot-active' : ''}`} />
          ))}
        </div>

        <div className="onboarding-footer">
          {step > 0 && (
            <Button type="button" variant="secondary" onClick={goBack}>
              Back
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            onClick={() => (isLast ? onDone() : goNext())}
          >
            {isLast ? "Let's cook" : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
