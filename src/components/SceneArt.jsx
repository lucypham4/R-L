import { useEffect, useRef, useState } from 'react';
import { mountDishScene } from '../lib/dishScene';
import { prefersReducedMotion, onReducedMotionChange } from '../lib/motion';
import './SceneArt.css';

/**
 * A tour illustration: the chef's dishes, rebuilt as 3D geometry.
 *
 * Kept in its own module so OnboardingArt can React.lazy() it. Three.js
 * is around 130KB gzipped and the only thing using it is a tour each chef
 * sees once, so it has no business on the first load of the gallery --
 * which is the screen chefs open every day.
 *
 * The scene lives in lib/dishScene.js; this component owns nothing but
 * the canvas element's lifetime and the two reasons to stop drawing.
 */
export default function SceneArt({ art, ratio }) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => onReducedMotionChange(setReduced), []);

  // Mounted once per scene. `reduced` is deliberately not a dependency:
  // it is pushed into the running scene below instead, because rebuilding
  // a WebGL context in order to pause it would be absurd.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    // The toon outline is on unless a step's art says `outline: false`.
    const handle = mountDishScene(canvas, art.scene, {
      reduced: prefersReducedMotion(),
      outline: art.outline !== false,
    });
    sceneRef.current = handle;
    return () => {
      handle.dispose();
      sceneRef.current = null;
    };
  }, [art.scene, art.outline]);

  useEffect(() => {
    sceneRef.current?.setPaused(reduced);
  }, [reduced]);

  // A render loop that keeps going in a background tab is a battery cost
  // with nothing to show for it.
  useEffect(() => {
    function onVisibility() {
      sceneRef.current?.setPaused(document.hidden || prefersReducedMotion());
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <div
      className="onboarding-art onboarding-art-filled scene"
      style={{ aspectRatio: ratio }}
      role="img"
      aria-label={art.alt || ''}
    >
      <canvas ref={canvasRef} className="scene-canvas" />
    </div>
  );
}
