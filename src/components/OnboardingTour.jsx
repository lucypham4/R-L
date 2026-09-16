import { useState } from 'react';
import Button from './Button';
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

function buildSteps(publicUrl) {
  return [
    {
      icon: 'book',
      title: 'Every dish, remembered',
      body: "A photo, a date, a note about what you'd do differently next time — the way you'd actually talk about the food you cook, kept somewhere real.",
      artLabel: 'Cover illustration',
      artHint: '16:9 · ≥1600px wide',
    },
    {
      icon: 'camera',
      title: 'Log it your way',
      body: "Snap a photo, or skip the camera entirely and sketch the plate with the pen tool — either one lands on the card the same way.",
      artLabel: 'Add-meal illustration',
      artHint: '1:1 · ≥800px',
    },
    {
      icon: 'grid',
      title: 'Watch it grow',
      body: "Every meal adds to the archive. Flip back through it by cuisine, category, or year as it slowly fills in.",
      artLabel: 'Growing-archive illustration',
      artHint: '1:1 · ≥800px',
    },
    {
      icon: 'share',
      title: 'Share it when you’re ready',
      body: publicUrl
        ? `Your public page is already live at ${publicUrl} — share it with clients any time, no sign-in needed on their end.`
        : "Download a shareable copy any time from Download copy. Sign in later if you'd like a live public page and access from another device — that's optional, never required.",
      artLabel: 'Share illustration',
      artHint: '1:1 · ≥800px',
    },
  ];
}

export default function OnboardingTour({ onDone, publicUrl }) {
  const [step, setStep] = useState(0);
  const STEPS = buildSteps(publicUrl);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card" role="dialog" aria-modal="true" aria-label="Welcome to Meal Diary">
        <button type="button" className="onboarding-skip" onClick={onDone}>
          Skip
        </button>

        <Icon name={current.icon} />
        <h2 className="onboarding-title">{current.title}</h2>
        <p className="onboarding-body">{current.body}</p>

        <div className="onboarding-art" aria-hidden="true">
          <span className="onboarding-art-label">{current.artLabel}</span>
          <span className="onboarding-art-hint">{current.artHint}</span>
        </div>

        <div className="onboarding-dots">
          {STEPS.map((s, i) => (
            <span key={s.title} className={`onboarding-dot ${i === step ? 'onboarding-dot-active' : ''}`} />
          ))}
        </div>

        <div className="onboarding-footer">
          {step > 0 && (
            <Button type="button" variant="secondary" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
          >
            {isLast ? "Let's cook" : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
