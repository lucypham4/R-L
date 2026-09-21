import { lazy, Suspense } from 'react';
import './OnboardingArt.css';

// Pulled in only when a step actually uses Rive art; see RiveArt.jsx for
// why it's worth the extra chunk.
const RiveArt = lazy(() => import('./RiveArt'));

// One slot, three possible fillings, so the tour's four panels can mix
// animated and static art without each one needing its own component:
//
//   { kind: 'rive',  src, artboard, stateMachine, alt }
//   { kind: 'image', src, alt }
//   undefined  -> the labelled placeholder, unchanged from before
//
// See onboardingSteps.js for the registry that decides which is which.
export default function OnboardingArt({ art, label, hint, ratio = '16 / 9' }) {
  if (art?.kind === 'rive') {
    return (
      // The fallback is an empty box of the same aspect ratio, so the
      // card doesn't reflow when the Rive chunk finishes loading.
      <Suspense fallback={<div className="onboarding-art onboarding-art-filled" style={{ aspectRatio: ratio }} />}>
        <RiveArt art={art} ratio={ratio} />
      </Suspense>
    );
  }

  if (art?.kind === 'image') {
    return (
      <div className="onboarding-art onboarding-art-filled" style={{ aspectRatio: ratio }}>
        <img className="onboarding-art-image" src={art.src} alt={art.alt || ''} />
      </div>
    );
  }

  return (
    <div className="onboarding-art" style={{ aspectRatio: ratio }} aria-hidden="true">
      <span className="onboarding-art-label">{label}</span>
      <span className="onboarding-art-hint">{hint}</span>
    </div>
  );
}
