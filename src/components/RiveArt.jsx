import { useEffect, useState } from 'react';
import { useRive, RuntimeLoader } from '@rive-app/react-canvas';
// Imported for its two .wasm files only; ?url hands back an asset URL that
// Vite fingerprints and copies into dist/ like any other asset.
import riveWasm from '@rive-app/canvas/rive.wasm?url';
import riveWasmFallback from '@rive-app/canvas/rive_fallback.wasm?url';
import { prefersReducedMotion, onReducedMotionChange } from '../lib/motion';

// Self-host the Rive WebAssembly renderer.
//
// By default the runtime fetches its .wasm from jsDelivr on first use,
// which quietly makes an offline-capable app depend on a third-party CDN:
// the animation just never appears when that fetch fails, and it fails
// for good inside the Capacitor iOS shell on a plane. Pointing both URLs
// at bundled assets keeps the tour working with no network at all.
//
// Two files, because the runtime picks the SIMD build where it can and
// the fallback where it can't. Self-hosting only the first would send
// older browsers back to the CDN.
//
// Module scope is the right place for this: the module is lazy-loaded, so
// this runs immediately before the first useRive() call and can't race it.
RuntimeLoader.setWasmUrl(riveWasm);
RuntimeLoader.setWasmFallbackUrl(riveWasmFallback);

// Kept in its own module so OnboardingArt can React.lazy() it: the Rive
// runtime ships a WebAssembly renderer that costs roughly 65KB gzipped,
// and the only thing using it is a tour each chef sees once. Splitting it
// out keeps that weight off the first load of the gallery, which is the
// screen chefs actually open every day.
export default function RiveArt({ art, ratio }) {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  // A Rive state machine is movement the CSS tokens in tokens.css can't
  // reach, so the preference has to be honoured here instead: hold the
  // animation on its first frame, which still shows the illustration but
  // stops it looping.
  useEffect(() => onReducedMotionChange(setReduced), []);

  const { RiveComponent, rive } = useRive({
    src: art.src,
    artboard: art.artboard,
    stateMachines: art.stateMachine,
    autoplay: !reduced,
  });

  useEffect(() => {
    if (!rive) return;
    if (reduced) rive.pause();
    else rive.play();
  }, [rive, reduced]);

  return (
    <div
      className="onboarding-art onboarding-art-filled"
      style={{ aspectRatio: ratio }}
      role="img"
      aria-label={art.alt || ''}
    >
      <RiveComponent className="onboarding-art-rive" />
    </div>
  );
}
