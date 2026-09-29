import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion, onReducedMotionChange } from '../lib/motion';
import './SceneArt.css';

import dessert from '../assets/dishes/dessert.webp';
import zucchini from '../assets/dishes/zucchini.webp';
import soupBase from '../assets/dishes/soup-base.webp';
import soupBread from '../assets/dishes/soup-bread.webp';
import soupSwirl from '../assets/dishes/soup-swirl.webp';
import soupChives from '../assets/dishes/soup-chives.webp';
import soupAlmonds from '../assets/dishes/soup-almonds.webp';

// The archive's dishes, in filename order. Globbed rather than listed so
// adding a photograph to the folder is the whole change.
const DISHES = Object.entries(
  import.meta.glob('../assets/dishes/dish-*.webp', { eager: true, query: '?url', import: 'default' })
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

/**
 * The tour's illustrations: the chef's own dish photographs, composited
 * and animated.
 *
 * These are photographs, so they are laid out and moved as elements
 * rather than drawn as textures on geometry. Three reasons, all of which
 * showed up while building the version this replaces. A photograph
 * sampled onto a WebGL plane is softer than the same photograph in an
 * <img>, and these are the chef's own plating -- the one thing in the app
 * that should never look second-hand. `object-fit: contain` inside a
 * padded box cannot crop a dish, whereas a camera frustum crops whatever
 * falls outside it, which is how the previous pass lost the edges of its
 * scenes. And it costs no runtime at all, against roughly 130KB and a GL
 * context that has to be disposed by hand on every step of the tour.
 */

const SCENES = {
  dessert: DessertScene,
  soup: SoupScene,
  archive: ArchiveScene,
  zucchini: ZucchiniScene,
};

export default function SceneArt({ art, ratio }) {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => onReducedMotionChange(setReduced), []);

  const Scene = SCENES[art.scene] ?? DessertScene;

  return (
    <div
      className={`onboarding-art onboarding-art-filled scene ${reduced ? 'scene-still' : ''}`}
      style={{ aspectRatio: ratio }}
      role="img"
      aria-label={art.alt || ''}
    >
      <Scene reduced={reduced} />
    </div>
  );
}

/** A single dish, breathing. The quietest of the four, because it sits
 *  under the tour's opening line and shouldn't compete with it. */
function DessertScene() {
  return (
    <div className="scene-stage">
      <img className="scene-layer scene-breathe" src={dessert} alt="" draggable="false" />
    </div>
  );
}

/**
 * The squash soup, assembled a component at a time: soup, then the toast
 * alongside it, then the scallion oil, the chives and the almonds.
 *
 * Every layer is the same photograph cropped to the same box, so they
 * stack in register with no positioning to get wrong, and every layer
 * runs one animation of the same duration -- the timings live in the
 * keyframe percentages instead. That is what keeps five independently
 * animated elements in step with each other; five different durations
 * with five different delays drift apart within a couple of loops.
 */
function SoupScene() {
  return (
    <div className="scene-stage">
      <img className="scene-layer soup-base" src={soupBase} alt="" draggable="false" />
      <img className="scene-layer soup-bread" src={soupBread} alt="" draggable="false" />
      <img className="scene-layer soup-swirl" src={soupSwirl} alt="" draggable="false" />
      <img className="scene-layer soup-chives" src={soupChives} alt="" draggable="false" />
      <img className="scene-layer soup-almonds" src={soupAlmonds} alt="" draggable="false" />
    </div>
  );
}

const SLOTS = 9;
// How long a slot holds one dish before flicking to the next. Slower than
// the reference, which is indexing a collection of 124; nine slots over
// fifteen dishes reads as frantic at the same rate.
const SWAP_MS = 190;

/**
 * The archive filling up: a grid of slots, each riffling through the
 * dishes, settling one at a time until the grid is full.
 *
 * The src attributes are written straight to the DOM rather than held in
 * React state. Nine slots changing five times a second is 45 renders a
 * second through the reconciler for an effect that is nine assignments.
 */
function ArchiveScene({ reduced }) {
  const slotRefs = useRef([]);

  useEffect(() => {
    if (DISHES.length === 0) return undefined;
    const imgs = slotRefs.current.filter(Boolean);
    // Decode every dish once up front. Without this the first cycle
    // flickers as each image is fetched at the moment it is first shown.
    for (const url of DISHES) {
      const pre = new Image();
      pre.src = url;
    }

    if (reduced) {
      imgs.forEach((img, i) => {
        img.src = DISHES[i % DISHES.length];
        img.style.opacity = '1';
      });
      return undefined;
    }

    let raf = null;
    let start = null;
    // Each slot gets its own offset into the dish list and its own settle
    // time, so the grid fills unevenly rather than in a wave.
    const seeds = imgs.map((_, i) => (i * 7) % DISHES.length);
    const settleAt = imgs.map((_, i) => 1100 + i * 420);
    const CYCLE = 1100 + imgs.length * 420 + 2600;

    function frame(now) {
      if (start === null) start = now;
      const t = (now - start) % CYCLE;
      imgs.forEach((img, i) => {
        const settled = t > settleAt[i];
        const step = settled ? Math.floor(settleAt[i] / SWAP_MS) : Math.floor(t / SWAP_MS);
        const url = DISHES[(seeds[i] + step) % DISHES.length];
        if (img.src !== url) img.src = url;
        img.style.opacity = t < i * 90 ? '0' : '1';
        img.style.filter = settled ? 'none' : 'blur(0.4px)';
      });
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div className="scene-stage archive-grid">
      {Array.from({ length: SLOTS }, (_, i) => (
        <span key={i} className="archive-slot">
          <img
            ref={(el) => {
              slotRefs.current[i] = el;
            }}
            src={DISHES[i % Math.max(DISHES.length, 1)]}
            alt=""
            draggable="false"
          />
        </span>
      ))}
    </div>
  );
}

/** The zucchini dish lifting, as if being handed across a pass. The
 *  shadow shrinks as it rises, which is most of what sells the lift. */
function ZucchiniScene() {
  return (
    <div className="scene-stage">
      <span className="scene-shadow" aria-hidden="true" />
      <img className="scene-layer scene-lift" src={zucchini} alt="" draggable="false" />
    </div>
  );
}
