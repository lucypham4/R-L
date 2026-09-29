import {
  AmbientLight,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import {
  bake,
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
import { toy } from './dishMaterials';
import PALETTES from '../assets/dishes/palettes.json';

/**
 * The tour's dishes, built rather than photographed.
 *
 * Every vessel is a lathe -- a profile curve spun around its axis -- and
 * everything in it is geometry too: a quenelle is lofted from a rounded
 * triangle, a blackberry is a cluster of drupelets, the scallion oil is a
 * tube swept along an Archimedean spiral. See dishFood.js for the kit, and
 * dishMaterials.js for the surfaces.
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

    // The quenelle sits straight on the bowl; its base is at y = 0.
    // Measured off the photograph: the quenelle runs about 0.47 of the
    // bowl's diameter and is a little over half as wide as it is long.
    const scoop = quenelle(FOOD.iceCream, { length: 0.9, width: 0.5, height: 0.38, rng });
    scoop.position.set(-0.02, 0.012, 0.02);
    scoop.rotation.y = -0.5;
    plated.add(scoop);

    // In the photograph the chopped nuts are heaped along the quenelle's
    // ridge, not spread under it -- the one place a spoon cannot reach to
    // press them in. Parented to the scoop so they ride on it.
    for (let i = 0; i < 38; i++) {
      const at = scoop.userData.ridgeAt(0.22 + rng() * 0.5);
      const c = crumb(rng() > 0.6 ? FOOD.almond : FOOD.crumble, { size: 0.018 + rng() * 0.02, rng });
      c.position.set(at.x, at.y + rng() * 0.02, (rng() - 0.5) * 0.12);
      c.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      scoop.add(c);
    }
    // And a few that fell into the bowl.
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.36 + rng() * 0.18;
      const c = crumb(FOOD.almond, { size: 0.018 + rng() * 0.014, rng });
      c.position.set(Math.cos(a) * r, bowl.userData.floorAt(r) + 0.01, Math.sin(a) * r);
      c.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      plated.add(c);
    }

    // Berries tucked around the base, where they sit in the photograph.
    const berries = [
      [raspberry(FOOD.raspberry, { radius: 0.115, rng }), -0.42, 0.26],
      [raspberry(FOOD.raspberry, { radius: 0.105, rng }), 0.52, 0.3],
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
    fan.position.set(0, 0.38, -0.02);
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
    bake(plated);

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
   * The squash soup, assembled the way it is in the kitchen, one
   * component at a time and each piece on its own:
   *
   *   an empty bowl on its plate; soup ladled in until it fills; the
   *   toast set down on the plate beside the bowl; the scallion oil
   *   squeezed on from a bottle as a spiral, drawn from the centre out;
   *   the chives sprinkled on piece by piece; then the almonds.
   *
   * Nothing arrives as a clump. Every chive and every almond flake falls
   * on its own, at its own moment, from its own spot, tumbling as it
   * goes -- they are one InstancedMesh each, but every instance has its
   * own trajectory.
   */
  soup() {
    const rng = seeded(7);
    const root = new Group();

    const plate = vessel(1.32, 0.06);
    root.add(plate);

    const BOWL_R = 0.86;
    const BOWL_DEPTH = 0.52;
    const bowl = vessel(BOWL_R, BOWL_DEPTH);
    bowl.position.set(-0.3, 0.055, -0.2);
    root.add(bowl);
    // The bowl's widest point, at its rim, plus clearance.
    const BOWL_CLEAR = BOWL_R * 1.035 + 0.03;

    // Everything poured, squeezed or sprinkled happens in the bowl's own
    // space; SURFACE is where the soup finishes, in that space.
    const SURFACE = 0.3;
    // Inverts vessel()'s floor curve: how wide the soup is at a depth.
    const widthAt = (y) => BOWL_R * Math.pow(Math.max(0, y) / BOWL_DEPTH, 1 / 2.1) * 0.99;

    const soupTop = liquid(FOOD.soup, { radius: 1, dome: 0.014 });
    bowl.add(soupTop);

    // --- The ladle, and the stream from its lip. The ladle turns about
    // its lip, so the stream always leaves from the same point.
    const LIP = new Vector3(0.1, 0.74, 0.02);
    const steel = toy('#b9bdc3', { top: '#e6e8eb', bottom: '#8d9298', fade: true });
    steel.side = DoubleSide;
    const ladle = new Group();
    ladle.position.copy(LIP);
    const cup = new Mesh(new SphereGeometry(0.15, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steel);
    cup.position.x = 0.15;
    const handle = new Mesh(new CylinderGeometry(0.014, 0.014, 0.5, 8), steel);
    handle.position.set(0.3 + Math.sin(0.75) * 0.25, Math.cos(0.75) * 0.25, 0);
    handle.rotation.z = -0.75;
    const ladleSoup = new Mesh(new CylinderGeometry(0.13, 0.13, 0.01, 28), toy(FOOD.soup, { fade: true }));
    ladleSoup.position.set(0.15, -0.035, 0);
    ladle.add(cup, handle, ladleSoup);
    bowl.add(ladle);

    const pour = new Mesh(new CylinderGeometry(1, 0.72, 1, 14, 1, true), toy(FOOD.soup));
    pour.geometry.translate(0, -0.5, 0);
    bowl.add(pour);

    // --- The toast. Set down clear of the bowl: its footprint is worked
    // out from its actual vertices, so it rests against the bowl's wall
    // at most, and a vertical drop onto that spot never passes through
    // the bowl on the way down.
    const slice = toast(FOOD.crust, FOOD.crumb, { length: 0.98, width: 0.72, depth: 0.17, fade: true });
    const out = new Vector2(1, 0.62).normalize();
    // Long side along the bowl, cut edge facing away from it.
    slice.rotation.y = Math.atan2(out.x, out.y);
    slice.updateMatrixWorld(true);
    let toward = 0;
    let floor = Infinity;
    const v = new Vector3();
    slice.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        toward = Math.max(toward, -(v.x * out.x + v.z * out.y));
        floor = Math.min(floor, v.y);
      }
    });
    const reach = BOWL_CLEAR + toward;
    const rest = new Vector3(bowl.position.x + out.x * reach, 0, bowl.position.z + out.y * reach);
    rest.y = plate.userData.floorAt(Math.hypot(rest.x, rest.z)) - floor + 0.004;
    root.add(slice);

    // --- The scallion oil, the bottle it is squeezed from, and the
    // thread of oil between the two.
    const OIL_Y = SURFACE + 0.012;
    const oil = spiral(FOOD.oil, { innerRadius: 0.05, outerRadius: 0.55, turns: 2.4, thickness: 0.016 });
    oil.position.y = OIL_Y;
    bowl.add(oil);

    const bottleBody = toy('#cfdca6', { top: '#eef3d6', bottom: '#9fb06e', fade: true });
    const bottleCap = toy('#f1ede4', { top: '#ffffff', bottom: '#c9c3b6', fade: true });
    const bottle = new Group();
    const tilt = new Group();
    tilt.rotation.z = 0.32;
    const nozzle = new Mesh(new ConeGeometry(0.02, 0.08, 12), bottleCap);
    nozzle.rotation.z = Math.PI;
    nozzle.position.y = 0.04;
    const shoulder = new Mesh(new CylinderGeometry(0.03, 0.075, 0.06, 20), bottleCap);
    shoulder.position.y = 0.11;
    const body = new Mesh(new CylinderGeometry(0.075, 0.075, 0.26, 20), bottleBody);
    body.position.y = 0.27;
    tilt.add(nozzle, shoulder, body);
    bottle.add(tilt);
    bowl.add(bottle);
    const NOZZLE_UP = 0.3;

    const thread = new Mesh(new CylinderGeometry(1, 1, 1, 8, 1, true), toy(FOOD.oil));
    thread.geometry.translate(0, -0.5, 0);
    bowl.add(thread);

    // --- Chives and almonds: one InstancedMesh each, every instance
    // falling on its own.
    function sprinkle(mesh, count, place, window, fall) {
      const inst = new InstancedMesh(mesh.geometry, mesh.material, count);
      inst.castShadow = true;
      const pieces = [];
      for (let i = 0; i < count; i++) {
        const { position, rotation, scale } = place(i);
        pieces.push({
          land: position,
          landQ: new Quaternion().setFromEuler(rotation),
          fromQ: new Quaternion().setFromEuler(new Euler(rng() * 6, rng() * 6, rng() * 6)),
          scale,
          drift: new Vector3((rng() - 0.5) * 0.1, 0, (rng() - 0.5) * 0.1),
          // Spread through the window in a shuffled order, so they land
          // all over the bowl rather than sweeping across it.
          at: window[0] + (window[1] - window[0] - fall) * ((i * 0.618034) % 1) + rng() * 0.06,
        });
      }
      bowl.add(inst);
      return { inst, pieces, fall };
    }

    const chives = sprinkle(
      chive(FOOD.chive, { length: 0.05, radius: 0.012 }),
      54,
      () => {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * 0.58;
        return {
          position: new Vector3(Math.cos(a) * r, OIL_Y + 0.006 + rng() * 0.004, Math.sin(a) * r),
          // Lying down, not standing up -- they were scattered, not planted.
          rotation: new Euler(Math.PI / 2 + (rng() - 0.5) * 0.4, rng() * Math.PI, (rng() - 0.5) * 0.3),
          scale: 0.75 + rng() * 0.5,
        };
      },
      [9.2, 11.2],
      0.5
    );
    const almonds = sprinkle(
      flake(FOOD.almond, { length: 0.085, rng }),
      16,
      () => {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * 0.19;
        return {
          position: new Vector3(Math.cos(a) * r, OIL_Y + 0.012 + rng() * 0.02, Math.sin(a) * r),
          rotation: new Euler((rng() - 0.5) * 0.7, rng() * Math.PI, (rng() - 0.5) * 0.7),
          scale: 0.8 + rng() * 0.45,
        };
      },
      [11.5, 12.9],
      0.6
    );

    const m = new Matrix4();
    const q = new Quaternion();
    const pos = new Vector3();
    const size = new Vector3();
    const HIDDEN = new Matrix4().makeScale(0, 0, 0);
    function settle({ inst, pieces, fall }, t) {
      for (let i = 0; i < pieces.length; i++) {
        const pc = pieces[i];
        const u = (t - pc.at) / fall;
        if (u < 0) {
          inst.setMatrixAt(i, HIDDEN);
          continue;
        }
        const k = Math.min(1, u);
        // Falling under gravity: slow off the fingers, fastest at the end.
        pos.copy(pc.land).addScaledVector(pc.drift, 1 - k);
        pos.y += 0.46 * (1 - k * k);
        q.slerpQuaternions(pc.fromQ, pc.landQ, 1 - (1 - k) * (1 - k));
        size.setScalar(pc.scale);
        inst.setMatrixAt(i, m.compose(pos, q, size));
      }
      inst.instanceMatrix.needsUpdate = true;
    }

    const T = {
      ladleIn: [0.5, 0.95],
      tipIn: [0.95, 1.35],
      pour: [1.25, 3.4],
      tail: 0.28,
      tipOut: [3.5, 3.9],
      ladleOut: [3.9, 4.35],
      fill: [1.4, 3.6],
      toast: [4.5, 5.5],
      bottleIn: [5.7, 6.0],
      squeeze: [6.05, 8.7],
      bottleOut: [8.75, 9.1],
    };
    const CYCLE = 16;
    const span = (t, [a, b]) => Math.min(1, Math.max(0, (t - a) / (b - a)));
    const smooth = (x) => x * x * (3 - 2 * x);

    return {
      root,
      update(time) {
        const t = time % CYCLE;

        // Ladle: in, tip, hold while pouring, tip back, away.
        const inAmt = smooth(span(t, T.ladleIn));
        const outAmt = smooth(span(t, T.ladleOut));
        steel.userData.opacity.value = inAmt * (1 - outAmt);
        ladle.visible = inAmt > 0 && outAmt < 1;
        ladle.position.set(LIP.x, LIP.y + (1 - inAmt) * 0.12 + outAmt * 0.12, LIP.z);
        ladle.rotation.z = 1.05 * smooth(span(t, T.tipIn)) * (1 - smooth(span(t, T.tipOut)));
        ladleSoup.material.userData.opacity.value = steel.userData.opacity.value;
        ladleSoup.scale.setScalar(Math.max(0.001, 1 - span(t, T.pour)));

        // Soup rising in the bowl.
        const fill = 1 - Math.pow(1 - span(t, T.fill), 2);
        const level = 0.012 + (SURFACE - 0.012) * fill;
        soupTop.visible = fill > 0;
        soupTop.position.y = level;
        const w = widthAt(level);
        soupTop.scale.set(w, 1, w);

        // The stream: its head falls from the lip to the soup, it runs
        // while the ladle is tipped, and its tail follows it down.
        const head = Math.max(level, LIP.y - Math.max(0, t - T.pour[0]) * 3.2);
        const tail = t < T.pour[1] ? LIP.y : LIP.y - ((t - T.pour[1]) / T.tail) * (LIP.y - level);
        const length = tail - head;
        pour.visible = t > T.pour[0] && length > 0.005;
        pour.position.set(LIP.x, tail, LIP.z);
        pour.scale.set(0.03, Math.max(0.001, length), 0.03);

        // Toast: down from above onto the plate, with a little settle.
        const drop = span(t, T.toast);
        slice.visible = drop > 0;
        slice.children[0].material.userData.opacity.value = Math.min(1, drop / 0.25);
        const fallK = Math.min(1, drop / 0.72);
        const bounce = drop > 0.72 ? Math.sin(((drop - 0.72) / 0.28) * Math.PI) * 0.025 * (1 - drop) * 3 : 0;
        slice.position.set(rest.x, rest.y + 0.6 * (1 - fallK * fallK) + bounce, rest.z);

        // Oil, drawn out from the centre as the bottle travels over it.
        const squeeze = span(t, T.squeeze);
        oil.userData.drawTo(squeeze);
        const bIn = smooth(span(t, T.bottleIn));
        const bOut = smooth(span(t, T.bottleOut));
        const bottleOpacity = bIn * (1 - bOut);
        bottleBody.userData.opacity.value = bottleOpacity;
        bottleCap.userData.opacity.value = bottleOpacity;
        bottle.visible = bottleOpacity > 0;
        const tip = oil.userData.curve.getPointAt(Math.max(0.001, squeeze));
        bottle.position.set(tip.x, OIL_Y + tip.y + NOZZLE_UP + (1 - bIn) * 0.1 + bOut * 0.12, tip.z);
        const flowing = t > T.squeeze[0] && t < T.squeeze[1];
        thread.visible = flowing;
        // The nozzle's tip is the bottle's origin (the tilt turns about
        // it), so the thread runs straight down from there to the tip.
        const nozzleY = bottle.position.y;
        thread.position.set(tip.x, nozzleY, tip.z);
        thread.scale.set(0.009, nozzleY - (OIL_Y + tip.y), 0.009);

        settle(chives, t);
        settle(almonds, t);

        root.rotation.y = Math.sin(time * 0.18) * 0.1;
      },
      frame: 1.28,
      // Reduced motion holds here: the dish assembled, before the cut.
      still: 14.5,
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
        bake(h);
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
    bake(plated);

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

  // WebGPU where the browser has it, WebGL 2 where it does not -- older
  // iOS, and WebViews that have not enabled it. The node materials in
  // dishMaterials.js compile to either, so the fallback is invisible.
  const renderer = new WebGPURenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearAlpha(0);
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap is WebGL-only; under this renderer PCF with a filter
  // radius (key.shadow.radius, below) gives the same soft edge.
  renderer.shadowMap.type = PCFShadowMap;

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
  // Unlike WebGLRenderer, this one has to be initialised -- it may be
  // negotiating a GPU device -- and it cannot draw until that finishes.
  let ready = false;
  const start = performance.now();
  // Where a held (reduced-motion) frame sits in the scene's timeline.
  const STILL = built.still ?? 9.2;
  const now = () => (paused ? STILL : (performance.now() - start) / 1000);

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
    if (!ready) return;
    built.update(seconds);
    renderer.render(scene, camera);
  }

  function loop() {
    if (disposed) return;
    frame = requestAnimationFrame(loop);
    if (paused) return;
    draw(now());
  }

  const observer =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          fit();
          draw(now());
        })
      : null;
  observer?.observe(canvas);

  // A GPU can be lost from under a page -- a driver reset, the OS
  // reclaiming memory from a backgrounded app. The tour is decoration and
  // the next step mounts a fresh renderer, so the honest response is to
  // stop drawing into a dead context rather than to throw every frame.
  renderer.onDeviceLost = () => {
    ready = false;
  };

  renderer
    .init()
    .then(() => {
      if (disposed) return;
      ready = true;
      fit();
      // Reduced motion still gets the dish, held at a moment where the
      // soup's assembly has finished rather than at its empty first frame.
      draw(now());
    })
    .catch(() => {
      // Neither WebGPU nor WebGL 2. The slot keeps its aria-label and its
      // background; there is nothing more useful to do.
    });
  loop();

  return {
    setPaused(next) {
      if (next === paused) return;
      paused = next;
      if (paused) draw(STILL);
    },
    dispose() {
      disposed = true;
      ready = false;
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      scene.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
      // Browsers cap live GL contexts per page and the tour makes one per
      // step, so the fallback's context is given back explicitly rather
      // than left for the garbage collector.
      const gl = renderer.backend?.gl;
      renderer.dispose();
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
