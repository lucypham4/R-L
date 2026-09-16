import { useState } from 'react';
import Button from './Button';
import './OnboardingTour.css';

const STEPS = [
  {
    title: 'Welcome to your kitchen notebook',
    body: "This is where every dish you cook lives — photographed, dated, and noted the way you'd actually talk about it. Just you and your partner can add to it.",
    artLabel: 'Cover illustration',
    artHint: '16:9 · ≥1600px wide',
  },
  {
    title: 'Log a dish, your way',
    body: 'Add a photo, or skip the camera and sketch it with the pen tool instead — either one uploads the same way.',
    artLabel: 'Add-meal illustration',
    artHint: '1:1 · ≥800px',
  },
  {
    title: 'Share it on your terms',
    body: 'Publish site bundles your meals into a public gallery you control — a separate, read-only page for clients, with no sign-in and no admin controls.',
    artLabel: 'Publish illustration',
    artHint: '1:1 · ≥800px',
  },
];

export default function OnboardingTour({ onDone }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card" role="dialog" aria-modal="true" aria-label="Welcome to Meal Diary">
        <button type="button" className="onboarding-skip" onClick={onDone}>
          Skip
        </button>

        <div className="onboarding-art" aria-hidden="true">
          <span className="onboarding-art-label">{current.artLabel}</span>
          <span className="onboarding-art-hint">{current.artHint}</span>
        </div>

        <h2 className="onboarding-title">{current.title}</h2>
        <p className="onboarding-body">{current.body}</p>

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
            {isLast ? 'Get started' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
