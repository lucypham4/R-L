import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';

/**
 * The tour's 3D illustrations: ceramics and food, built from geometry
 * rather than loaded from model files.
 *
 * Procedural rather than a .glb for three reasons. There is nothing to
 * fetch, so the art can't fail to appear on a plane inside the Capacitor
 * shell -- the exact failure the Rive art had to be rescued from. It costs
 * a few hundred bytes instead of a few hundred kilobytes. And the shapes
 * read from the app's own colour tokens, so the scenes follow the theme
 * instead of being baked to one palette and looking wrong in the other.
 *
 * The trade is that a plate is a profile curve here rather than something
 * modelled by hand. See docs/design-system/illustration.md for how to
 * bring a sculpted model in instead when a scene outgrows this.
 */

// Read a colour token off the document so the scenes follow the theme.
// Falls back to the light palette when there's no document (tests, SSR).
function token(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Which token to make the ceramics out of.
 *
 * --color-surface is the right answer in the light theme: a plate that is
 * a shade off the paper. In the dark theme it is #211f1c against a
 * #141311 background, and a plate that close to the page disappears --
 * the scene becomes food floating in a void. Dark needs the ceramic to go
 * the other way and stand *off* the page, so it takes the strong line
 * colour instead.
 *
 * Decided from the background's luminance rather than from a data-theme
 * attribute, because the theme can also come from the OS preference, and
 * this way it is right for both without asking which.
 */
function ceramicColour() {
  const bg = new Color(token('--color-bg', '#faf9f6'));
  const isDark = bg.r * 0.2126 + bg.g * 0.7152 + bg.b * 0.0722 < 0.35;
  return token(isDark ? '--color-line-strong' : '--color-surface', '#f1eee7');
}

/**
 * A plate or bowl, as a profile spun around its axis.
 *
 * `rimHeight` is what separates the two: a plate is a shallow dish with a
 * lifted edge, a bowl is the same curve pulled up and in. Both get a small
 * foot so they read as ceramics sitting on a surface rather than discs.
 */
function ceramicGeometry({ radius = 1, rimHeight = 0.12, depth = 0.1, foot = 0.35 }) {
  const profile = [
    new Vector2(0, 0),
    new Vector2(foot * 0.6, 0),
    new Vector2(foot, 0.02),
    new Vector2(radius * 0.55, depth * 0.35),
    new Vector2(radius * 0.85, depth * 0.8),
    new Vector2(radius, depth + rimHeight * 0.6),
    new Vector2(radius * 1.02, depth + rimHeight),
    // Back down the underside, so the rim has thickness when seen edge-on.
    new Vector2(radius * 0.99, depth + rimHeight * 0.82),
    new Vector2(radius * 0.8, depth * 0.62),
    new Vector2(foot * 1.05, 0.06),
    new Vector2(foot * 0.95, 0.14),
    new Vector2(0, 0.14),
  ];
  return new LatheGeometry(profile, 96);
}

/**
 * A serving of food on a plate.
 *
 * Two things make this read as food rather than as scattered gravel, and
 * both were wrong on the first attempt. Density: real plating is a mound
 * with a few pieces fallen away from it, not an even sprinkle across the
 * whole surface, so placement is biased hard toward the middle and a
 * minority of pieces are allowed to stray. And facet count: a
 * subdivided icosahedron with its vertices pushed around reads as
 * something cooked, while the undivided one reads as a cut gem.
 *
 * The pieces stay flat-shaded on purpose -- the visible facets are what
 * keep these as illustrations rather than a failed attempt at a
 * photograph.
 */
function foodCluster(rng, palette, { count = 26, spread = 0.34, scale = 1 } = {}) {
  const group = new Group();
  for (let i = 0; i < count; i++) {
    const geometry = new IcosahedronGeometry(1, 1);
    // Rough the vertices up so no two pieces are the same shape, and
    // squash on Y so they sit rather than roll.
    const pos = geometry.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const k = 0.7 + rng() * 0.6;
      pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) * k * 0.62, pos.getZ(v) * k);
    }
    geometry.computeVertexNormals();

    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color: new Color(palette[i % palette.length]),
        roughness: 0.88,
        metalness: 0,
        flatShading: true,
      })
    );
    // Most of the serving sits in a mound; every fourth piece is allowed
    // to fall away from it, which is what stops the cluster reading as a
    // single blob.
    const strays = i % 4 === 3;
    const angle = rng() * Math.PI * 2;
    const r = (strays ? 0.55 + rng() * 0.45 : Math.sqrt(rng()) * 0.62) * spread;
    const size = (0.05 + rng() * 0.055) * scale * (strays ? 0.75 : 1);
    mesh.scale.setScalar(size);
    // Stack height falls off toward the edge of the mound, so the middle
    // stands proud the way a plated portion does.
    const mound = Math.max(0, 1 - r / spread) * 0.09 * scale;
    mesh.position.set(Math.cos(angle) * r, 0.1 + size * 0.5 + mound * rng(), Math.sin(angle) * r);
    mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    group.add(mesh);
  }
  return group;
}

// Deterministic RNG, so a scene looks the same every time the tour is
// opened rather than reshuffling its food on each mount.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function ceramicMaterial(colour) {
  return new MeshStandardMaterial({ color: new Color(colour), roughness: 0.75, metalness: 0.02 });
}

/** One plate with food on it, as a group ready to be positioned. */
function plated(rng, colours, { radius = 1, food = 14, scale = 1 } = {}) {
  const group = new Group();
  const plate = new Mesh(ceramicGeometry({ radius }), ceramicMaterial(colours.ceramic));
  group.add(plate);
  group.add(foodCluster(rng, colours.food, { count: food, spread: radius * 0.4, scale }));
  return group;
}

/**
 * The four scenes, one per tour step. Each returns the group to add and an
 * `update(t)` that animates it, where `t` is seconds since the scene
 * started. Keeping the motion in a closure per scene means none of them
 * need to know about the renderer or each other.
 */
const SCENES = {
  // "Every dish, remembered" -- a single plate turning slowly, the way you
  // would rotate one to look at it.
  plate(colours) {
    const rng = seeded(7);
    const root = new Group();
    const dish = plated(rng, colours, { radius: 1, food: 30 });
    root.add(dish);
    root.rotation.x = 0.1;
    return {
      root,
      update(t) {
        dish.rotation.y = t * 0.28;
        dish.position.y = Math.sin(t * 0.9) * 0.03;
      },
    };
  },

  // "Log it your way" -- a bowl, tipped toward the viewer as if being
  // photographed from above.
  bowl(colours) {
    const rng = seeded(21);
    const root = new Group();
    const dish = new Group();
    const bowl = new Mesh(
      ceramicGeometry({ radius: 0.82, rimHeight: 0.42, depth: 0.3, foot: 0.3 }),
      ceramicMaterial(colours.ceramic)
    );
    dish.add(bowl);
    const food = foodCluster(rng, colours.food, { count: 30, spread: 0.3, scale: 0.95 });
    food.position.y = 0.2;
    dish.add(food);
    root.add(dish);
    root.rotation.x = 0.26;
    return {
      root,
      update(t) {
        dish.rotation.y = -t * 0.22;
        root.rotation.z = Math.sin(t * 0.6) * 0.04;
      },
    };
  },

  // "Watch it grow" -- plates orbiting, so the scene reads as a set
  // rather than an object. The archive, not a dish.
  archive(colours) {
    const rng = seeded(43);
    const root = new Group();
    const ring = new Group();
    const dishes = [];
    const COUNT = 5;
    for (let i = 0; i < COUNT; i++) {
      const dish = plated(rng, colours, { radius: 0.46, food: 14, scale: 0.6 });
      const angle = (i / COUNT) * Math.PI * 2;
      dish.position.set(Math.cos(angle) * 0.95, 0, Math.sin(angle) * 0.95);
      ring.add(dish);
      dishes.push({ dish, phase: i * 1.2 });
    }
    root.add(ring);
    root.rotation.x = 0.42;
    return {
      root,
      update(t) {
        ring.rotation.y = t * 0.2;
        // Each plate rises on its own phase, so the ring breathes instead
        // of pulsing as one object.
        for (const { dish, phase } of dishes) {
          dish.position.y = Math.sin(t * 0.8 + phase) * 0.1;
          dish.rotation.y = -t * 0.2;
        }
      },
    };
  },

  // "Share it when you're ready" -- one plate lifting clear of the others.
  share(colours) {
    const rng = seeded(88);
    const root = new Group();
    const base = plated(rng, colours, { radius: 0.78, food: 20, scale: 0.8 });
    base.position.y = -0.34;
    root.add(base);

    const lifting = plated(rng, colours, { radius: 0.78, food: 20, scale: 0.8 });
    root.add(lifting);
    root.rotation.x = 0.34;

    // An earlier pass put a tinted ring around the rising plate to signal
    // "leaving". It read as a hula hoop. The lift plus a little scale does
    // the same job without adding an object that isn't food or ceramic.
    return {
      root,
      update(t) {
        const cycle = (t * 0.32) % 1;
        const eased = cycle * cycle * (3 - 2 * cycle);
        lifting.position.y = 0.06 + eased * 0.62;
        // Growing as it rises reads as coming toward the viewer, which is
        // what makes it a plate being handed over rather than one floating.
        lifting.scale.setScalar(1 + eased * 0.16);
        lifting.rotation.y = t * 0.3;
        base.rotation.y = -t * 0.12;
      },
    };
  },
};

export const SCENE_NAMES = Object.keys(SCENES);

/**
 * Mounts a scene into `canvas` and starts it.
 *
 * Returns a handle with `setPaused` (used for reduced motion and for
 * pausing off-screen) and `dispose`, which MUST be called on unmount.
 * Three keeps geometries, materials and the GL context off the JS heap,
 * so letting a canvas go out of scope leaks GPU memory and eventually
 * costs the page its context -- browsers cap how many are alive at once,
 * and the tour creates a new one on every step.
 */
export function mountDishScene(canvas, sceneName, { reduced = false } = {}) {
  const colours = {
    ceramic: ceramicColour(),
    // Deliberately not --color-accent. That red is a signal colour, sized
    // for a button; at this scale on a pale plate it reads as plastic.
    // These are cooked-food colours: herb, olive, terracotta, cream,
    // mushroom, and a beet red dark enough to look like food.
    food: ['#8a9a63', '#6f7a4f', '#b5713f', '#e2d5b4', '#a08a6d', '#8f4646'],
  };

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 1.85, 3.1);
  camera.lookAt(0, 0, 0);

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true, // the paper background shows through
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setClearAlpha(0);

  // Light enough to read as ceramic without a specular hotspot: one key
  // from above-left, plus ambient so the shadowed side never goes muddy
  // against a pale background.
  const key = new DirectionalLight(0xffffff, 2.1);
  key.position.set(-2.4, 4, 2.6);
  scene.add(key);
  const fill = new DirectionalLight(0xffffff, 0.5);
  fill.position.set(3, 1.2, -2);
  scene.add(fill);
  scene.add(new AmbientLight(0xffffff, 1.5));

  const built = (SCENES[sceneName] ?? SCENES.plate)(colours);
  scene.add(built.root);

  let paused = reduced;
  let frame = null;
  let disposed = false;
  const start = performance.now();

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    // Capping at 2 keeps a 3x phone from rendering four times the pixels
    // for a difference nobody can see on a matte illustration.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function draw(seconds) {
    built.update(seconds);
    renderer.render(scene, camera);
  }

  function loop() {
    if (disposed) return;
    frame = requestAnimationFrame(loop);
    if (paused) return;
    draw((performance.now() - start) / 1000);
  }

  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    resize();
    // Redraw immediately: while paused nothing else will, and the canvas
    // would otherwise stretch its last frame until the size settles.
    draw(paused ? 0 : (performance.now() - start) / 1000);
  }) : null;
  observer?.observe(canvas);

  resize();
  // Reduced motion still gets the illustration, held on its first frame.
  draw(0);
  loop();

  return {
    setPaused(next) {
      if (next === paused) return;
      paused = next;
      if (paused) draw(0);
    },
    dispose() {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      scene.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      renderer.dispose();
      // Without this the context lingers until GC, and the tour can open
      // five of them before the browser starts dropping the oldest.
      renderer.forceContextLoss?.();
    },
  };
}
