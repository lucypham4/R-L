import { useEffect, useRef, useState } from 'react';
import { mountDishScene } from '../lib/dishScene';
import { prefersReducedMotion, onReducedMotionChange } from '../lib/motion';
import './SceneArt.css';

import dessert from '../assets/dishes/top/dessert.webp';
import zucchini from '../assets/dishes/top/zucchini.webp';
import soupSurface from '../assets/dishes/top/soup-surface.webp';
import soupSwirl from '../assets/dishes/top/soup-swirl.webp';
import soupChives from '../assets/dishes/top/soup-chives.webp';
import soupAlmonds from '../assets/dishes/top/soup-almonds.webp';
// The toast is the one element that isn't a surface of revolution, so it
// stays the cut-out photograph rather than a top-down projection.
import bread from '../assets/dishes/soup-bread.webp';

// The archive's dishes, globbed so adding a photograph to the folder is
// the whole change.
const DISHES = Object.entries(
  import.meta.glob('../assets/dishes/top/dish-*.webp', { eager: true, query: '?url', import: 'default' })
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

const ASSETS = { dessert, zucchini, soupSurface, soupSwirl, soupChives, soupAlmonds, bread, dishes: DISHES };

/**
 * A tour illustration: the chef's dishes as 3D geometry.
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
    const handle = mountDishScene(canvas, art.scene, ASSETS, { reduced: prefersReducedMotion() });
    sceneRef.current = handle;
    return () => {
      handle.dispose();
      sceneRef.current = null;
    };
  }, [art.scene]);

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
