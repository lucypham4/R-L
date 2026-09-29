import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import {
  blackberry,
  chive,
  crumb,
  curd,
  flake,
  heap,
  liquid,
  quenelle,
  raspberry,
  ribbon,
  seeded,
  shard,
  spiral,
  toast,
} from './dishFood';
import PALETTES from '../assets/dishes/palettes.json';

/**
 * The tour's dishes, built rather than photographed.
 *
 * Every vessel is a lathe -- a profile curve spun around its axis -- and
 * everything in it is geometry too: a quenelle is a tapered ellipsoid, a
 * blackberry is a cluster of drupelets, the scallion oil is a tube swept
 * along an Archimedean spiral. See dishFood.js for the kit.
 *
 * An earlier pass projected the photographs onto the vessels instead.
 * That reads well from the angle the photograph was taken at and falls
 * apart either side of it, because a picture of food has no silhouette of
 * its own -- so the scenes could only turn through a few degrees. Built
 * food can be lit, can cast shadows on the plate under it, and can be
 * looked at from anywhere.
 *
 * The photographs are still the reference. Every colour here was sampled
 * from them (`scripts/dish-assets/palettes.py`), the proportions were
 * measured off them, and the camera sits at the 55 degrees of elevation
 * they were consistently shot from.
 */

const CAMERA_ELEVATION = (55 * Math.PI) / 180;

// The same dark ceramic in every photograph.
const CERAMIC = '#463f36';

// Sampled from the chef's photographs. Where a sampled mean sat in
// shadow, the value here is the lit quartile instead -- a mean taken
// across a photograph's own shading is darker than the thing itself.
const FOOD = {
  iceCream: '#f2dcab',
  crumble: '#eec88b',
  chocolate: '#6c4134',
  chocolateDark: '#4b3128',
  raspberry: '#bb3535',
  blackberry: '#251b18',
  soup: '#e8a835',
  oil: '#9e9c2c',
  chive: '#6d761d',
  almond: '#e9c592',
  crust: '#94582f',
  crumb: '#e3b487',
  zucchini: '#a9ba74',
  zucchiniPale: '#cbd49a',
  ricotta: '#efe6d4',
};

function ceramicMaterial() {
  return new MeshStandardMaterial({ color: new Color(CERAMIC), roughness: 0.62, metalness: 0.04 });
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

/** A vessel, plus the height of its inner surface at a given radius, so
 *  food can be set down on it rather than floated above it. */
function vessel(radius, depth) {
  const group = new Group();
  const inner = new Mesh(new LatheGeometry(innerProfile(radius, depth), 128), ceramicMaterial());
  inner.receiveShadow = true;
  const outer = new Mesh(new LatheGeometry(outerProfile(radius, depth), 128), ceramicMaterial());
  outer.castShadow = true;
  outer.receiveShadow = true;
  group.add(inner, outer);
  group.userData.floorAt = (r) => depth * Math.pow(Math.min(1, r / radius), 2.1);
  return group;
}

const SCENES = {
  /**
   * The dessert: a quenelle of ice cream on crumble, with berries and a
   * fan of tempered-chocolate shards.
   */
  dessert() {
    const rng = seeded(21);
    const root = new Group();
    const bowl = vessel(1, 0.42);
    root.add(bowl);

    const plated = new Group();
    plated.position.y = 0.02;
    bowl.add(plated);

    // Crumble first: the quenelle is set down on a bed of it.
    for (let i = 0; i < 90; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 0.46;
      const c = crumb(rng() > 0.7 ? FOOD.almond : FOOD.crumble, { size: 0.022 + rng() * 0.022, rng });
      c.position.set(Math.cos(a) * r, bowl.userData.floorAt(r) + 0.012, Math.sin(a) * r);
      c.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      plated.add(c);
    }

    const scoop = quenelle(FOOD.iceCream, { length: 0.62, width: 0.42, height: 0.36, rng });
    scoop.position.set(-0.02, 0.19, 0.02);
    scoop.rotation.y = -0.5;
    plated.add(scoop);

    // Berries tucked around the base, where they sit in the photograph.
    const berries = [
      [raspberry(FOOD.raspberry, { radius: 0.115, rng }), -0.42, 0.26],
      [raspberry(FOOD.raspberry, { radius: 0.105, rng }), 0.36, 0.34],
      [raspberry(FOOD.raspberry, { radius: 0.1, rng }), 0.06, 0.48],
      [blackberry(FOOD.blackberry, { radius: 0.12, rng }), -0.17, 0.45],
      [blackberry(FOOD.blackberry, { radius: 0.115, rng }), 0.47, 0.08],
      [blackberry(FOOD.blackberry, { radius: 0.1, rng }), -0.47, -0.08],
    ];
    for (const [b, x, z] of berries) {
      b.position.set(x, bowl.userData.floorAt(Math.hypot(x, z)) + 0.07, z);
      b.rotation.y = rng() * 3;
      plated.add(b);
    }

    // The fan of shards, rising from behind the quenelle.
    const fan = new Group();
    fan.position.set(0, 0.34, -0.02);
    for (let i = 0; i < 9; i++) {
      const sh = shard(i % 2 ? FOOD.chocolate : FOOD.chocolateDark, {
        length: 0.34 + rng() * 0.2,
        thickness: 0.009 + rng() * 0.004,
      });
      sh.rotation.z = (i / 8 - 0.5) * 1.9;
      sh.rotation.x = -0.25 + rng() * 0.2;
      fan.add(sh);
    }
    plated.add(fan);

    return {
      root,
      update(t) {
        root.rotation.y = t * 0.2;
        root.position.y = Math.sin(t * 0.8) * 0.022;
      },
      frame: 1.0,
    };
  },

  /**
   * The squash soup, assembled: the bowl on its plate, the toast set down
   * beside it, then the scallion oil, the chives and the almonds.
   */
  soup() {
    const rng = seeded(7);
    const root = new Group();

    const plate = vessel(1.32, 0.06);
    root.add(plate);

    const bowl = vessel(0.86, 0.52);
    bowl.position.set(-0.26, 0.055, -0.06);
    root.add(bowl);

    const SURFACE = 0.3;
    const soupTop = liquid(FOOD.soup, { radius: 0.685, dome: 0.014 });
    soupTop.position.y = SURFACE;
    bowl.add(soupTop);

    const oil = spiral(FOOD.oil, { innerRadius: 0.07, outerRadius: 0.55, turns: 2.4, thickness: 0.014 });
    oil.position.y = SURFACE + 0.012;
    bowl.add(oil);

    const chives = new Group();
    for (let i = 0; i < 54; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 0.6;
      const c = chive(FOOD.chive, { length: 0.034 + rng() * 0.022, radius: 0.009 + rng() * 0.004 });
      c.position.set(Math.cos(a) * r, rng() * 0.006, Math.sin(a) * r);
      // Lying down, not standing up -- they were scattered, not planted.
      c.rotation.set(Math.PI / 2 + (rng() - 0.5) * 0.5, rng() * Math.PI, (rng() - 0.5) * 0.4);
      chives.add(c);
    }
    bowl.add(chives);

    const almonds = new Group();
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 0.17;
      const f = flake(FOOD.almond, { length: 0.07 + rng() * 0.03, rng });
      f.position.set(Math.cos(a) * r, rng() * 0.022, Math.sin(a) * r);
      f.rotation.set((rng() - 0.5) * 0.9, rng() * Math.PI, (rng() - 0.5) * 0.9);
      almonds.add(f);
    }
    bowl.add(almonds);

    // Measured off the photograph: the slice is 0.71 of the soup surface
    // across. The surface here is 1.37 units wide, so the slice is about
    // 0.97 long -- an earlier pass read that measurement against the
    // radius instead of the diameter and produced a slab longer than the
    // plate, hanging off the side of the frame.
    const slice = toast(FOOD.crust, FOOD.crumb, { length: 0.98, width: 0.72, depth: 0.17 });
    const sliceRest = [0.68, 0.12, 0.36];
    slice.rotation.set(0.1, -0.5, 0.2);
    root.add(slice);

    const stages = [
      { node: slice, from: 0.1, to: 0.24, rest: sliceRest, entry: [1.3, 0.56, 0.62] },
      { node: oil, from: 0.3, to: 0.46, grow: true },
      { node: chives, from: 0.5, to: 0.62, drop: 0.3 },
      { node: almonds, from: 0.66, to: 0.78, drop: 0.36 },
    ];

    const CYCLE = 11;
    return {
      root,
      update(t) {
        const p = (t / CYCLE) % 1;
        const ease = (x) => x * x * (3 - 2 * x);

        const arrive = ease(Math.min(1, Math.max(0, (p - 0.02) / 0.08)));
        bowl.position.y = 0.055 + (1 - arrive) * 0.4;
        soupTop.scale.setScalar(0.6 + arrive * 0.4);

        for (const st of stages) {
          const e = ease(Math.min(1, Math.max(0, (p - st.from) / (st.to - st.from))));
          st.node.visible = e > 0 && p < 0.95;
          if (st.grow) st.node.scale.setScalar(Math.max(0.001, e));
          if (st.drop) st.node.position.y = SURFACE + 0.014 + (1 - e) * st.drop;
          if (st.entry) {
            st.node.position.set(
              st.rest[0] + (1 - e) * (st.entry[0] - st.rest[0]),
              st.rest[1] + (1 - e) * (st.entry[1] - st.rest[1]),
              st.rest[2] + (1 - e) * (st.entry[2] - st.rest[2])
            );
          }
        }

        root.rotation.y = Math.sin(t * 0.18) * 0.1;
      },
      frame: 1.28,
    };
  },

  /**
   * The archive filling up: nine dishes riffling through the collection
   * and settling one at a time, after the loading screen that inspired it.
   *
   * Fifteen dishes cannot each be modelled by hand and do not need to be.
   * At this size what identifies one is its palette and how far its food
   * spreads, both of which palettes.json takes from the photographs.
   */
  archive() {
    const keys = Object.keys(PALETTES);
    const root = new Group();
    const COLS = 3;
    const ROWS = 3;
    const STEP = 0.95;
    const cells = [];

    for (let i = 0; i < COLS * ROWS; i++) {
      const cell = new Group();
      cell.position.set(
        ((i % COLS) - (COLS - 1) / 2) * STEP,
        0,
        (Math.floor(i / COLS) - (ROWS - 1) / 2) * STEP
      );
      cell.add(vessel(0.4, 0.15));

      // Every dish's heap is built once and hidden, so riffling through
      // them is a visibility flip rather than rebuilding meshes at 5Hz.
      const heaps = keys.map((k, n) => {
        const spec = PALETTES[k];
        const h = heap(spec.colors, {
          radius: 0.4 * Math.min(0.68, spec.spread * 0.6),
          count: 34,
          seed: n * 31 + i,
          scale: 1.05,
        });
        h.position.set(spec.offset[0] * 0.3, 0.035, spec.offset[1] * 0.3);
        h.visible = false;
        cell.add(h);
        return h;
      });

      root.add(cell);
      cells.push({ cell, heaps, seed: (i * 7) % keys.length, settleAt: 1.1 + i * 0.42, shown: -1 });
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
          const idx = (c.seed + step) % c.heaps.length;
          if (idx !== c.shown) {
            if (c.shown >= 0) c.heaps[c.shown].visible = false;
            c.heaps[idx].visible = true;
            c.shown = idx;
          }
          const rise = Math.min(1, Math.max(0, (p - c.settleAt + 0.35) / 0.35));
          c.cell.position.y = (1 - rise * rise * (3 - 2 * rise)) * 0.12;
          c.cell.rotation.y = settled ? 0 : p * 0.7;
        }
      },
      frame: 1.42,
    };
  },

  /** Shaved courgette with ricotta and toasted almonds, lifting. */
  zucchini() {
    const rng = seeded(43);
    const root = new Group();
    const bowl = vessel(1, 0.4);
    root.add(bowl);

    const plated = new Group();
    plated.position.y = 0.04;
    bowl.add(plated);

    for (let i = 0; i < 15; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 0.28;
      const rb = ribbon(rng() > 0.55 ? FOOD.zucchini : FOOD.zucchiniPale, {
        length: 0.42 + rng() * 0.24,
        width: 0.1 + rng() * 0.04,
        rng,
        seed: i * 13 + 3,
      });
      rb.position.set(Math.cos(a) * r, 0.05 + rng() * 0.1, Math.sin(a) * r);
      rb.rotation.set((rng() - 0.5) * 0.7, rng() * Math.PI, (rng() - 0.5) * 0.7);
      plated.add(rb);
    }

    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.1 + Math.sqrt(rng()) * 0.34;
      const c = curd(FOOD.ricotta, { size: 0.04 + rng() * 0.03, rng });
      c.position.set(Math.cos(a) * r, bowl.userData.floorAt(r) + 0.05 + rng() * 0.08, Math.sin(a) * r);
      plated.add(c);
    }

    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.08 + Math.sqrt(rng()) * 0.42;
      const f = flake(FOOD.almond, { length: 0.06 + rng() * 0.035, rng });
      f.position.set(Math.cos(a) * r, bowl.userData.floorAt(r) + 0.035 + rng() * 0.1, Math.sin(a) * r);
      f.rotation.set((rng() - 0.5) * 1.2, rng() * Math.PI, (rng() - 0.5) * 1.2);
      plated.add(f);
    }

    return {
      root,
      update(t) {
        root.position.y = 0.06 + Math.sin(t * 0.55) * 0.09;
        root.rotation.y = t * 0.16;
        root.rotation.z = Math.sin(t * 0.4) * 0.035;
      },
      frame: 1.0,
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
export function mountDishScene(canvas, sceneName, { reduced = false } = {}) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 100);

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearAlpha(0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const key = new DirectionalLight(0xffffff, 3.0);
  key.position.set(-2.6, 4.2, 2.8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.radius = 3;
  key.shadow.bias = -0.0008;
  scene.add(key);
  const fill = new DirectionalLight(0xffffff, 0.55);
  fill.position.set(3, 1.4, -2);
  scene.add(fill);
  scene.add(new AmbientLight(0xffffff, 1.3));

  const built = (SCENES[sceneName] ?? SCENES.dessert)();
  scene.add(built.root);

  // Each scene composes at its own size, so it says how far back the
  // camera stands. Framing them all alike either crops the wide ones or
  // strands the single dishes in whitespace.
  const dist = 4.6 * (built.frame ?? 1);
  camera.position.set(0, Math.sin(CAMERA_ELEVATION) * dist, Math.cos(CAMERA_ELEVATION) * dist);
  camera.lookAt(0, 0, 0);

  // Catches the shadow and nothing else, so a dish sits on something
  // without a visible surface appearing under it.
  const ground = new Mesh(
    new PlaneGeometry(14, 14),
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.1, depthWrite: false })
  );
  ground.geometry.rotateX(-Math.PI / 2);
  ground.position.y = -0.02;
  ground.visible = false;
  scene.add(ground);

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
          draw(paused ? 9.2 : (performance.now() - start) / 1000);
        })
      : null;
  observer?.observe(canvas);

  fit();
  // Reduced motion still gets the dish, held at a moment where the soup's
  // assembly has finished rather than at its empty first frame.
  draw(reduced ? 9.2 : 0);
  loop();

  return {
    setPaused(next) {
      if (next === paused) return;
      paused = next;
      if (paused) draw(9.2);
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
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
