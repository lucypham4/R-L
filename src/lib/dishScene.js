import {
  AmbientLight,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  WebGLRenderer,
} from 'three';

/**
 * The tour's dishes, as actual geometry.
 *
 * Each vessel is a lathe -- a profile curve spun around its axis -- and
 * the chef's photograph is projected straight down onto its inner
 * surface. That works because of how the photographs were taken: a
 * circular plate shot from about 55 degrees of elevation lands in frame
 * as an ellipse, and stretching that ellipse back to a circle recovers
 * the top-down view. `scripts/dish-assets/topdown.py` does the stretching
 * and reports the elevation it measured; the camera here is placed at
 * that same elevation, so a dish at rest matches the photograph it came
 * from and every rotation moves away from a pose that is already right.
 *
 * The result is a real object: it has a silhouette that changes as it
 * turns, it catches the key light along its rim, and it drops a shadow.
 * What it is not is a reconstruction of the food, which stays a
 * photograph lying on the surface -- so the scenes turn the dishes
 * through tens of degrees, not hundreds.
 */

// The elevation the dishes were photographed from, measured across all
// seventeen (see topdown.py's output). Everything is framed from here.
const CAMERA_ELEVATION = (55 * Math.PI) / 180;

// Sampled off the rims: the same dark ceramic in every photograph.
const CERAMIC = '#463f36';

const loader = new TextureLoader();
const cache = new Map();

function texture(url) {
  if (!cache.has(url)) {
    const t = loader.load(url);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    cache.set(url, t);
  }
  return cache.get(url);
}

/**
 * Projects a lathe's UVs straight down its axis, so a top-down texture
 * lands on it the way the camera saw it.
 *
 * A lathe's own UVs run around-and-along the profile, which would wrap
 * the photograph around the bowl like a label on a tin. These put it
 * where it belongs.
 */
function projectFromAbove(geometry, radius) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, 0.5 + pos.getX(i) / (2 * radius), 0.5 + pos.getZ(i) / (2 * radius));
  }
  uv.needsUpdate = true;
}

/** The inside of a vessel: centre, out and up to the rim. */
function innerProfile(radius, depth) {
  return [
    new Vector2(0, 0),
    new Vector2(radius * 0.3, depth * 0.03),
    new Vector2(radius * 0.58, depth * 0.17),
    new Vector2(radius * 0.78, depth * 0.45),
    new Vector2(radius * 0.92, depth * 0.76),
    new Vector2(radius, depth),
  ];
}

/** The outside: over the rim, down the wall, in to the foot. */
function outerProfile(radius, depth) {
  return [
    new Vector2(radius, depth),
    new Vector2(radius * 1.035, depth * 0.97),
    new Vector2(radius * 1.02, depth * 0.62),
    new Vector2(radius * 0.88, depth * 0.24),
    new Vector2(radius * 0.6, depth * 0.02),
    new Vector2(radius * 0.34, -depth * 0.02),
    new Vector2(radius * 0.33, 0),
    new Vector2(0, 0),
  ];
}

function ceramicMaterial() {
  return new MeshStandardMaterial({ color: new Color(CERAMIC), roughness: 0.62, metalness: 0.04 });
}

/**
 * One dish: geometry for the vessel, photograph for what is in it.
 * `setTexture` swaps which dish it is without rebuilding anything, which
 * is what the archive scene riffles through.
 */
function dish(url, { radius = 1, depth = 0.34 } = {}) {
  const group = new Group();

  const innerGeo = new LatheGeometry(innerProfile(radius, depth), 128);
  projectFromAbove(innerGeo, radius);
  const innerMat = new MeshStandardMaterial({
    map: url ? texture(url) : null,
    roughness: 0.78,
    metalness: 0,
    side: DoubleSide,
  });
  const inner = new Mesh(innerGeo, innerMat);
  inner.receiveShadow = true;
  group.add(inner);

  const outer = new Mesh(new LatheGeometry(outerProfile(radius, depth), 128), ceramicMaterial());
  outer.castShadow = true;
  outer.receiveShadow = true;
  group.add(outer);

  group.userData.setTexture = (next) => {
    innerMat.map = texture(next);
    innerMat.needsUpdate = true;
  };
  return group;
}

/** A flat disc carrying one transparent layer, floated just above the
 *  surface below it so it can be revealed on its own. */
function overlay(url, radius, y) {
  const geo = new CircleGeometry(radius, 96);
  geo.rotateX(-Math.PI / 2);
  // A CircleGeometry's own UVs are already a planar projection from
  // above, so they need no correcting -- unlike the lathe's.
  const mesh = new Mesh(
    geo,
    new MeshStandardMaterial({
      map: texture(url),
      transparent: true,
      roughness: 0.8,
      metalness: 0,
      depthWrite: false,
    })
  );
  mesh.position.y = y;
  mesh.renderOrder = 1;
  return mesh;
}

const SCENES = {
  /** The dessert, turning slowly enough to read as one object. */
  dessert(assets) {
    const root = new Group();
    const d = dish(assets.dessert, { radius: 1, depth: 0.42 });
    root.add(d);
    return {
      root,
      update(t) {
        d.rotation.y = t * 0.22;
        d.position.y = Math.sin(t * 0.8) * 0.022;
      },
    };
  },

  /**
   * The squash soup, assembled: the bowl on its plate, the toast set
   * down beside it, then the scallion oil, the chives and the almonds.
   *
   * Everything here is geometry except the food itself. The plate and
   * the bowl are lathes; the soup is a disc inside the bowl; each
   * garnish is its own disc a hair above the last, which is what lets
   * them arrive one at a time.
   */
  soup(assets) {
    const root = new Group();

    const plate = new Group();
    const plateInner = new Mesh(new LatheGeometry(innerProfile(1.32, 0.06), 128), ceramicMaterial());
    plateInner.receiveShadow = true;
    const plateOuter = new Mesh(new LatheGeometry(outerProfile(1.32, 0.06), 128), ceramicMaterial());
    plateOuter.castShadow = true;
    plate.add(plateInner, plateOuter);
    root.add(plate);

    const bowl = new Group();
    // Sat on the plate, not in it, and deep enough that its wall reads as
    // a wall. An earlier pass had the soup almost flush with the rim and
    // the whole thing looked like a puddle on a disc.
    bowl.position.set(-0.26, 0.055, -0.06);
    const bowlInner = new Mesh(new LatheGeometry(innerProfile(0.86, 0.52), 128), ceramicMaterial());
    const bowlOuter = new Mesh(new LatheGeometry(outerProfile(0.86, 0.52), 128), ceramicMaterial());
    bowlOuter.castShadow = true;
    bowlInner.receiveShadow = true;
    bowl.add(bowlInner, bowlOuter);
    root.add(bowl);

    // Sunk below the rim, and narrower than it, so the bowl's wall is
    // visible around the soup the way it is in the photograph.
    const SURFACE = 0.33;
    const soupTop = overlay(assets.soupSurface, 0.7, SURFACE);
    const swirl = overlay(assets.soupSwirl, 0.7, SURFACE + 0.004);
    const chives = overlay(assets.soupChives, 0.7, SURFACE + 0.009);
    const almonds = overlay(assets.soupAlmonds, 0.7, SURFACE + 0.015);
    bowl.add(soupTop, swirl, chives, almonds);

    // The toast is the one thing that is not a surface of revolution, so
    // it stays a photograph -- stood up slightly, leaning on the plate
    // rim the way it does in the shot.
    const breadTex = texture(assets.bread);
    const bread = new Mesh(
      new PlaneGeometry(1.15, 1.15),
      new MeshStandardMaterial({
        map: breadTex,
        transparent: true,
        // Without a cutoff the feathered edge of the cut-out renders as a
        // pale halo and the toast looks like a decal.
        alphaTest: 0.45,
        roughness: 0.85,
        side: DoubleSide,
      })
    );
    bread.position.set(0.74, 0.3, 0.26);
    bread.rotation.set(-Math.PI / 4.2, 0.22, -0.13);
    bread.castShadow = true;
    root.add(bread);

    const layers = [
      { mesh: bread, from: 0.1, to: 0.22, drop: 0.5, slide: 0.5 },
      { mesh: swirl, from: 0.28, to: 0.44, grow: true },
      { mesh: chives, from: 0.48, to: 0.6, drop: 0.16 },
      { mesh: almonds, from: 0.64, to: 0.76, drop: 0.24 },
    ];
    for (const l of layers) l.mesh.visible = false;

    const CYCLE = 11;
    return {
      root,
      update(t) {
        const p = (t / CYCLE) % 1;
        const ease = (x) => x * x * (3 - 2 * x);

        const inBase = Math.min(1, Math.max(0, (p - 0.02) / 0.08));
        bowl.position.y = 0.05 + (1 - ease(inBase)) * 0.35;
        plateInner.material.opacity = 1;

        for (const l of layers) {
          const k = Math.min(1, Math.max(0, (p - l.from) / (l.to - l.from)));
          l.mesh.visible = k > 0 && p < 0.95;
          const e = ease(k);
          l.mesh.material.opacity = l.grow ? 1 : e;
          if (l.grow) {
            // The oil spreads outward from the middle of the bowl,
            // which is both how it was drizzled and the only reveal that
            // reads as a swirl rather than a picture of one fading up.
            l.mesh.scale.setScalar(Math.max(0.001, e));
          }
          if (l.drop) l.mesh.position.y = (l.mesh === bread ? 0.3 : SURFACE + 0.02) + (1 - e) * l.drop;
          if (l.slide) l.mesh.position.x = 0.74 + (1 - e) * l.slide;
        }

        root.rotation.y = Math.sin(t * 0.18) * 0.09;
      },
      // The plate and the toast together are wider than a single dish.
      frame: 1.12,
    };
  },

  /**
   * The archive filling up: a grid of dishes, each riffling through the
   * collection and settling, after the loading screen that inspired it.
   */
  archive(assets) {
    const root = new Group();
    const urls = assets.dishes;
    const cells = [];
    const COLS = 3;
    const ROWS = 3;
    const STEP = 0.95;
    for (let i = 0; i < COLS * ROWS; i++) {
      const d = dish(urls[i % urls.length], { radius: 0.4, depth: 0.15 });
      d.position.set(
        ((i % COLS) - (COLS - 1) / 2) * STEP,
        0,
        (Math.floor(i / COLS) - (ROWS - 1) / 2) * STEP
      );
      root.add(d);
      cells.push({ dish: d, seed: (i * 7) % urls.length, settleAt: 1.1 + i * 0.42, shown: -1 });
    }
    root.rotation.y = 0.12;

    const SWAP = 0.19;
    const CYCLE = 1.1 + cells.length * 0.42 + 2.6;
    return {
      root,
      update(t) {
        const p = t % CYCLE;
        for (const c of cells) {
          const settled = p > c.settleAt;
          const step = Math.floor((settled ? c.settleAt : p) / SWAP);
          const idx = (c.seed + step) % urls.length;
          if (idx !== c.shown) {
            c.dish.userData.setTexture(urls[idx]);
            c.shown = idx;
          }
          const rise = Math.min(1, Math.max(0, (p - c.settleAt + 0.35) / 0.35));
          c.dish.position.y = (1 - rise * rise * (3 - 2 * rise)) * 0.12;
          c.dish.rotation.y = settled ? 0 : p * 0.7;
        }
      },
      // Three rows of dishes, and the near row is closest to the camera,
      // so this needs the most room of the four.
      frame: 1.42,
    };
  },

  /** The zucchini dish lifting, as if handed across a pass. */
  zucchini(assets) {
    const root = new Group();
    const d = dish(assets.zucchini, { radius: 1, depth: 0.4 });
    root.add(d);
    return {
      root,
      update(t) {
        const s = Math.sin(t * 0.55);
        d.position.y = 0.06 + s * 0.09;
        d.rotation.y = t * 0.16;
        d.rotation.z = Math.sin(t * 0.4) * 0.035;
      },
    };
  },
};

export const SCENE_NAMES = Object.keys(SCENES);

/**
 * Mounts a scene into `canvas`.
 *
 * `dispose()` is not optional. Three keeps geometries, materials and the
 * GL context off the JS heap, browsers cap how many live contexts a page
 * may have, and the tour creates a new one on every step.
 */
export function mountDishScene(canvas, sceneName, assets, { reduced = false } = {}) {
  const scene = new Scene();

  const camera = new PerspectiveCamera(34, 1, 0.1, 100);

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearAlpha(0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const key = new DirectionalLight(0xffffff, 3.0);
  key.position.set(-2.6, 4.2, 2.8);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.radius = 3;
  scene.add(key);
  const fill = new DirectionalLight(0xffffff, 0.55);
  fill.position.set(3, 1.4, -2);
  scene.add(fill);
  scene.add(new AmbientLight(0xffffff, 1.35));

  // Catches the shadow and nothing else, so the dish sits on something
  // without a visible surface appearing under it.
  const ground = new Mesh(
    new PlaneGeometry(14, 14),
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.11, depthWrite: false })
  );
  ground.geometry.rotateX(-Math.PI / 2);
  ground.position.y = -0.02;
  ground.visible = false;
  scene.add(ground);

  const built = (SCENES[sceneName] ?? SCENES.dessert)(assets);
  scene.add(built.root);

  // Each scene composes at its own size, so it says how far back the
  // camera has to stand. Framing them all the same either crops the wide
  // ones or strands the single dishes in whitespace.
  const dist = 4.6 * (built.frame ?? 1);
  camera.position.set(0, Math.sin(CAMERA_ELEVATION) * dist, Math.cos(CAMERA_ELEVATION) * dist);
  camera.lookAt(0, 0, 0);

  let paused = reduced;
  let frame = null;
  let disposed = false;
  const start = performance.now();

  function fit() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
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

  const observer =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          fit();
          draw(paused ? 0 : (performance.now() - start) / 1000);
        })
      : null;
  observer?.observe(canvas);

  fit();
  // Reduced motion still gets the dish, held where its animation starts.
  draw(reduced ? 3.2 : 0);
  loop();

  return {
    setPaused(next) {
      if (next === paused) return;
      paused = next;
      if (paused) draw(3.2);
    },
    dispose() {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      scene.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
      for (const t of cache.values()) t.dispose();
      cache.clear();
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
