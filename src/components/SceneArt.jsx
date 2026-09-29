import { useEffect, useRef, useState } from 'react';
import { mountDishScene } from '../lib/dishScene';
import { prefersReducedMotion, onReducedMotionChange } from '../lib/motion';

/**
 * A 3D tour illustration.
 *
 * Kept in its own module so OnboardingArt can React.lazy() it. Three.js is
 * around 150KB gzipped and the only thing using it is a tour each chef
 * sees once, so it has no business on the first load of the gallery --
 * which is the screen chefs actually open every day.
 *
 * The scene itself lives in lib/dishScene.js; this component owns nothing
 * but the canvas element's lifetime and the two reasons to stop drawing.
 */
export default function SceneArt({ art, ratio }) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => onReducedMotionChange(setReduced), []);

  // Mount once per scene. `reduced` is deliberately not a dependency: it
  // is pushed into the running scene below instead, because rebuilding a
  // WebGL context to pause it would be absurd.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const handle = mountDishScene(canvas, art.scene, { reduced: prefersReducedMotion() });
    sceneRef.current = handle;
    return () => {
      handle.dispose();
      sceneRef.current = null;
    };
  }, [art.scene]);

  useEffect(() => {
    sceneRef.current?.setPaused(reduced);
  }, [reduced]);

  // A moving illustration that keeps drawing in a background tab is a
  // battery cost with nothing to show for it.
  useEffect(() => {
    function onVisibility() {
      sceneRef.current?.setPaused(document.hidden || prefersReducedMotion());
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <div
      className="onboarding-art onboarding-art-filled"
      style={{ aspectRatio: ratio }}
      role="img"
      aria-label={art.alt || ''}
    >
      <canvas ref={canvasRef} className="onboarding-art-canvas" />
    </div>
  );
}
