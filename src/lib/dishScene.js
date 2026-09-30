import {
  CylinderGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import {
  bake,
  vessel,
  blackberry,
  chive,
  crumb,
  courgetteRibbon,
  curd,
  drizzle,
  flake,
  liquid,
  quenelle,
  raspberry,
  seeded,
  starburst,
  toast,
} from './dishFood';
import { addOutlines, streamMaterial, toy, whiteMaterial } from './dishMaterials';
import { MINIS } from './dishMinis';

/**
 * The tour's dishes, built rather than photographed.
 *
 * Every vessel is a lathe -- a profile curve spun around its axis -- and
 * everything in it is geometry too: a quenelle is lofted from a rounded
 * triangle, a blackberry is a cluster of drupelets, the scallion oil is a
 * tube swept along a hand-drawn spiral. See dishFood.js for the kit, and
 * dishMaterials.js for the surfaces.
 *
 * An earlier pass projected the photographs onto the vessels instead.
 * That reads well from the angle the photograph was taken at and falls
 * apart either side of it, because a picture of food has no silhouette of
 * its own -- so the scenes could only turn through a few degrees. Built
 * food has a silhouette of its own and can be looked at from anywhere.
 *
 * The photographs are still the reference. Every colour here was sampled
 * from them, the proportions were measured off them, and the camera sits
 * at the 55 degrees of elevation they were consistently shot from.
 */

const CAMERA_ELEVATION = (55 * Math.PI) / 180;

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

export const SCENES = {
  /**
   * The dessert: a quenelle of ice cream with chopped nuts on its ridge,
   * berries round it, and two starbursts of piped chocolate.
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

    // Two starbursts of piped chocolate, as in the photograph: one
    // standing up behind the quenelle, fanned upward; one laid across
    // its front, spokes all the way round and sagging over its sides.
    const behind = starburst(FOOD.chocolate, { spokes: 9, length: 0.42, arc: Math.PI * 1.05, thickness: 0.0065, seed: 4 });
    behind.position.set(0.04, 0.44, -0.16);
    behind.rotation.set(-0.3, -0.1, 0);
    plated.add(behind);
    const across = starburst(FOOD.chocolate, { spokes: 9, length: 0.3, arc: Math.PI * 1.8, droop: 0.5, thickness: 0.006, seed: 9 });
    across.position.set(-0.22, 0.34, 0.2);
    // Laid nearly flat, its droop (local -Z) pointing down, on the
    // quenelle's front slope rather than over its middle.
    across.rotation.set(-Math.PI / 2 + 0.5, 0, 0.5);
    plated.add(across);
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
   *   an empty bowl on its plate; soup poured in until it fills; the
   *   toast set down on the plate beside the bowl; the scallion oil
   *   squeezed on in a loose, hand-drawn spiral from the centre out; the
   *   chives sprinkled on piece by piece; then the almonds.
   *
   * No utensils are drawn. The soup and the oil each fall as a stream
   * from out of shot, fading out toward the top.
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

    // Everything poured or sprinkled happens in the bowl's own space;
    // SURFACE is where the soup finishes, in that space.
    const SURFACE = 0.3;
    // Inverts vessel()'s floor curve: how wide the soup is at a depth.
    const widthAt = (y) => BOWL_R * Math.pow(Math.max(0, y) / BOWL_DEPTH, 1 / 2.1) * 0.99;

    const soupTop = liquid(FOOD.soup, { radius: 1, dome: 0.014 });
    bowl.add(soupTop);
    // Shine balls on the soup, placed as shapes: its surface is too flat
    // for a toon highlight, which would flash across all of it at once.
    // In the disc's unit space, toward the light, so they scale with it.
    for (const [x, z, rx, rz] of [
      [-0.36, -0.34, 0.1, 0.06],
      [-0.2, -0.47, 0.045, 0.03],
    ]) {
      const dot = new Mesh(new SphereGeometry(1, 16, 8), whiteMaterial());
      dot.scale.set(rx, 0.004, rz);
      dot.position.set(x, 0.014, z);
      soupTop.add(dot);
    }

    // The soup's stream: from out of shot, straight down to the surface.
    const FROM = new Vector3(0.1, 1.05, 0.02);
    const pour = new Mesh(new CylinderGeometry(1, 0.8, 1, 14, 1, true), streamMaterial(FOOD.soup));
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

    // --- The scallion oil, drawn on as it is squeezed, with a thread of
    // oil falling onto its tip from out of shot, and a few stray drops
    // flicked off as the hand circles.
    const OIL_Y = SURFACE + 0.012;
    const oil = drizzle(FOOD.oil, { innerRadius: 0.05, outerRadius: 0.55, turns: 2.2, thickness: 0.017, seed: 5 });
    oil.position.y = OIL_Y;
    bowl.add(oil);
    const thread = new Mesh(new CylinderGeometry(1, 1, 1, 8, 1, true), streamMaterial(FOOD.oil));
    thread.geometry.translate(0, -0.5, 0);
    bowl.add(thread);
    const THREAD_UP = 0.6;
    const drops = [];
    for (let i = 0; i < 7; i++) {
      const u = 0.12 + (i / 7) * 0.8 + rng() * 0.05;
      const at = oil.userData.curve.getPointAt(u);
      const away = new Vector3(at.x, 0, at.z).normalize().multiplyScalar(0.04 + rng() * 0.05);
      const drop = new Mesh(new SphereGeometry(0.014 + rng() * 0.008, 12, 8), toy(FOOD.oil));
      drop.scale.y = 0.45;
      drop.position.set(at.x + away.x, OIL_Y, at.z + away.z);
      drop.userData.u = u;
      bowl.add(drop);
      drops.push(drop);
    }

    // --- Chives and almonds: one InstancedMesh each, every instance
    // falling on its own.
    function sprinkle(mesh, count, place, window, fall) {
      const inst = new InstancedMesh(mesh.geometry, mesh.material, count);
      // Its bounds would be computed while every instance is hidden and
      // then never again, culling pieces that have since landed.
      inst.frustumCulled = false;
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
      pour: [0.8, 3.0],
      tail: 0.3,
      fill: [0.95, 3.2],
      toast: [3.9, 4.9],
      squeeze: [5.4, 8.4],
    };
    const CYCLE = 16;
    const span = (t, [a, b]) => Math.min(1, Math.max(0, (t - a) / (b - a)));

    return {
      root,
      update(time) {
        const t = time % CYCLE;

        // Soup rising in the bowl.
        const fill = 1 - Math.pow(1 - span(t, T.fill), 2);
        const level = 0.012 + (SURFACE - 0.012) * fill;
        soupTop.visible = fill > 0;
        soupTop.position.y = level;
        const w = widthAt(level);
        soupTop.scale.set(w, 1, w);

        // The stream: its head falls to the soup, it runs while pouring,
        // and its tail follows it down.
        const head = Math.max(level, FROM.y - Math.max(0, t - T.pour[0]) * 3.4);
        const tail = t < T.pour[1] ? FROM.y : FROM.y - ((t - T.pour[1]) / T.tail) * (FROM.y - level);
        const length = tail - head;
        pour.visible = t > T.pour[0] && length > 0.005;
        pour.position.set(FROM.x, tail, FROM.z);
        pour.scale.set(0.042, Math.max(0.001, length), 0.042);

        // Toast: down from above onto the plate, with a little settle.
        const drop = span(t, T.toast);
        slice.visible = drop > 0;
        slice.children[0].material.userData.opacity.value = Math.min(1, drop / 0.25);
        const fallK = Math.min(1, drop / 0.72);
        const bounce = drop > 0.72 ? Math.sin(((drop - 0.72) / 0.28) * Math.PI) * 0.025 * (1 - drop) * 3 : 0;
        slice.position.set(rest.x, rest.y + 0.6 * (1 - fallK * fallK) + bounce, rest.z);

        // Oil, drawn out from the centre, a thread falling onto its tip.
        const squeeze = span(t, T.squeeze);
        oil.userData.drawTo(squeeze);
        const tip = oil.userData.curve.getPointAt(Math.max(0.001, squeeze));
        thread.visible = t > T.squeeze[0] && t < T.squeeze[1];
        thread.position.set(tip.x, OIL_Y + tip.y + THREAD_UP, tip.z);
        thread.scale.set(0.012, THREAD_UP, 0.012);
        for (const d of drops) d.visible = squeeze > d.userData.u;

        settle(chives, t);
        settle(almonds, t);

        root.rotation.y = Math.sin(time * 0.18) * 0.1;
      },
      frame: 1.22,
      // Reduced motion holds here: the dish assembled, before the cut.
      still: 14.5,
    };
  },

  /**
   * The archive filling up: nine cells riffling through the chef's
   * dishes and settling one at a time, after the loading screen that
   * inspired it -- each on a different dish, so the grid ends as the
   * whole collection.
   *
   * Every dish is built once (dishMinis.js) and copied into each cell;
   * clone() shares geometry and materials, so nine cells of nine dishes
   * cost nine dishes' worth of geometry. Riffling is a visibility flip.
   */
  archive() {
    const protos = MINIS.map((build) => build());
    const root = new Group();
    const COLS = 3;
    const ROWS = 3;
    const STEP = 0.98;
    const SCALE = 0.43;
    const cells = [];

    for (let i = 0; i < COLS * ROWS; i++) {
      const cell = new Group();
      cell.position.set(
        ((i % COLS) - (COLS - 1) / 2) * STEP,
        0,
        (Math.floor(i / COLS) - (ROWS - 1) / 2) * STEP
      );
      const dishes = protos.map((proto) => {
        const copy = proto.clone();
        copy.scale.setScalar(SCALE);
        copy.visible = false;
        cell.add(copy);
        return copy;
      });
      root.add(cell);
      cells.push({ cell, dishes, seed: (i * 4) % dishes.length, final: i % dishes.length, settleAt: 1.1 + i * 0.42, shown: -1 });
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
          const idx = settled ? c.final : (c.seed + Math.floor(p / SWAP)) % c.dishes.length;
          if (idx !== c.shown) {
            if (c.shown >= 0) c.dishes[c.shown].visible = false;
            c.dishes[idx].visible = true;
            c.shown = idx;
          }
          const rise = Math.min(1, Math.max(0, (p - c.settleAt + 0.35) / 0.35));
          c.cell.position.y = (1 - rise * rise * (3 - 2 * rise)) * 0.12;
          c.cell.rotation.y = settled ? 0 : p * 0.7;
        }
      },
      frame: 1.3,
    };
  },

  /**
   * Shaved courgette, piled high, with goat cheese, almonds and herbs,
   * lifting -- from the chef's photograph: wide, thin ribbons, each with
   * its stripe of dark skin, looping up and folding back over one
   * another into a mound about as tall as it is wide.
   *
   * The ribbons are laid in rings, one layer on the last, each ring
   * narrower and higher -- that is where the height comes from. Every
   * ribbon arches up and over along its run round the pile, some throwing
   * a loop partway, and turns about its own length as it goes.
   */
  zucchini() {
    const rng = seeded(43);
    const root = new Group();
    const bowl = vessel(1, 0.4);
    root.add(bowl);

    const plated = new Group();
    plated.position.y = 0.03;
    bowl.add(plated);

    const FLESH = '#d9e3a0';
    const SKIN = '#2f5a24';
    const LAYERS = [
      { count: 8, radius: 0.42, base: 0.02, arch: 0.16 },
      { count: 7, radius: 0.34, base: 0.15, arch: 0.18 },
      { count: 6, radius: 0.25, base: 0.29, arch: 0.18 },
      { count: 4, radius: 0.15, base: 0.43, arch: 0.18 },
    ];
    const along = []; // points on the pile's surface, for the toppings
    LAYERS.forEach((layer, li) => {
      for (let k = 0; k < layer.count; k++) {
        const a0 = (k / layer.count) * Math.PI * 2 + li * 0.7 + rng() * 0.4;
        const sweep = (1.5 + rng() * 1.1) * (rng() > 0.5 ? 1 : -1);
        const loop = rng() < 0.4;
        const pts = [];
        for (let n = 0; n <= 16; n++) {
          const t = n / 16;
          const a = a0 + sweep * t;
          // Tucks in toward the middle of its run, the way a ribbon
          // pressed onto a pile bows over it.
          const r = layer.radius * (1 - 0.18 * Math.sin(Math.PI * t)) + (rng() - 0.5) * 0.02;
          let y = layer.base + layer.arch * Math.pow(Math.sin(Math.PI * t), 0.8);
          let x = Math.cos(a) * r;
          let z = Math.sin(a) * r;
          if (loop && t > 0.3 && t < 0.75) {
            // A loop thrown partway: up and out, over, and back in.
            const u = (t - 0.3) / 0.45;
            const lr = 0.065;
            y += lr * (1 - Math.cos(u * Math.PI * 2));
            x += Math.cos(a) * lr * Math.sin(u * Math.PI * 2);
            z += Math.sin(a) * lr * Math.sin(u * Math.PI * 2);
          }
          pts.push(new Vector3(x, y, z));
        }
        const tw0 = (rng() - 0.5) * 1.1;
        const tw1 = (rng() - 0.5) * 2.4;
        const roll = rng();
        const rb = courgetteRibbon(pts, {
          width: 0.1 + rng() * 0.04,
          thickness: 0.011,
          twist: (t) => tw0 + tw1 * t,
          edges: roll < 0.65 ? 1 : roll < 0.85 ? 2 : 0,
          flesh: FLESH,
          skin: SKIN,
        });
        plated.add(rb);
        along.push(pts[8]);
      }
    });

    // Ribbons thrown right over the top, crossing the middle -- without
    // them the rings leave a hollow at the centre and the pile reads as a
    // wreath rather than a mound. Each is faced up at its crest: its
    // face is taken looking away from a point off to one side of its run,
    // then turned a quarter.
    for (let k = 0; k < 8; k++) {
      const dir = (k / 8) * Math.PI + rng() * 0.3;
      const across = new Vector3(Math.cos(dir), 0, Math.sin(dir));
      const offset = new Vector3(-across.z, 0, across.x).multiplyScalar((rng() - 0.5) * 0.14);
      const pts = [];
      for (let n = 0; n <= 16; n++) {
        const t = n / 16;
        const d = (t - 0.5) * 0.62;
        const y = 0.2 + 0.52 * Math.pow(Math.cos((t - 0.5) * Math.PI), 1.3) + (rng() - 0.5) * 0.01;
        pts.push(new Vector3(across.x * d + offset.x, y, across.z * d + offset.z));
      }
      const side = new Vector3(-across.z, 0, across.x).multiplyScalar(5);
      const tw = (rng() - 0.5) * 1.4;
      const rb = courgetteRibbon(pts, {
        width: 0.11 + rng() * 0.03,
        thickness: 0.011,
        axis: side,
        twist: (t) => Math.PI / 2 + tw * (t - 0.5),
        edges: rng() < 0.7 ? 1 : 2,
        flesh: FLESH,
        skin: SKIN,
      });
      plated.add(rb);
      along.push(pts[5], pts[11]);
    }

    // Goat cheese: soft crumbles tucked into the pile, and a few fallen,
    // inked a cool grey rather than the gold its cream colour would give.
    for (let i = 0; i < 9; i++) {
      const at = along[Math.floor(rng() * along.length)];
      const c = curd('#f6f4ec', { size: 0.045 + rng() * 0.035, rng, outline: '#aeb8c4' });
      c.position.set(at.x * 1.12, at.y + 0.03, at.z * 1.12);
      plated.add(c);
    }
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.52 + rng() * 0.12;
      const c = curd('#f6f4ec', { size: 0.05 + rng() * 0.02, rng, outline: '#aeb8c4' });
      c.position.set(Math.cos(a) * r, bowl.userData.floorAt(r) + 0.02, Math.sin(a) * r);
      plated.add(c);
    }

    // Almonds: slivers on the pile, halves in the bowl round it.
    for (let i = 0; i < 12; i++) {
      const at = along[Math.floor(rng() * along.length)];
      const f = flake(FOOD.almond, { length: 0.07 + rng() * 0.03, rng });
      f.position.set(at.x * 1.1, at.y + 0.04, at.z * 1.1);
      f.rotation.set((rng() - 0.5) * 1.4, rng() * Math.PI, (rng() - 0.5) * 1.4);
      plated.add(f);
    }
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.5 + rng() * 0.16;
      const half = new Mesh(new SphereGeometry(1, 16, 10), toy('#9e5b38', { top: '#c98458', bottom: '#6a361c' }));
      half.scale.set(0.07, 0.022, 0.042);
      half.position.set(Math.cos(a) * r, bowl.userData.floorAt(r) + 0.02, Math.sin(a) * r);
      half.rotation.y = rng() * 3;
      plated.add(half);
    }

    // Herbs cut in a fine chiffonade, and lemon zest, over the top.
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 0.22;
      const pts = [];
      const dir = rng() * Math.PI * 2;
      for (let n = 0; n <= 4; n++) {
        const t = n / 4;
        pts.push(new Vector3(Math.cos(dir) * t * 0.1, Math.sin(t * 3) * 0.012, Math.sin(dir) * t * 0.1));
      }
      // A quarter turn lays the strip flat: its face would otherwise look
      // out from the pile's axis, standing it on edge.
      const strip = courgetteRibbon(pts, { width: 0.012, thickness: 0.005, edges: 0, flesh: '#3b6a26', skin: '#2a4c1a', twist: () => Math.PI / 2 });
      const top = 0.72 - (r / 0.22) * 0.2;
      strip.position.set(Math.cos(a) * r, top + rng() * 0.04, Math.sin(a) * r);
      plated.add(strip);
    }
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 0.2;
      const z = crumb('#f2d24a', { size: 0.01, rng });
      z.position.set(Math.cos(a) * r, 0.7 - (r / 0.2) * 0.15, Math.sin(a) * r);
      plated.add(z);
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
 * `outline` draws the toon outline round every piece (see addOutlines in
 * dishMaterials.js); without it the pieces are held by their gradients
 * and shine alone.
 *
 * `dispose()` is not optional. Three keeps geometries, materials and the
 * GL context off the JS heap, browsers cap how many live contexts a page
 * may have, and the tour creates a new one on every step.
 */
export function mountDishScene(canvas, sceneName, { reduced = false, outline = true } = {}) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 100);

  // WebGPU where the browser has it, WebGL 2 where it does not -- older
  // iOS, and WebViews that have not enabled it. The node materials in
  // dishMaterials.js compile to either, so the fallback is invisible.
  //
  // No lights and no shadows: every surface is painted (unlit), after
  // the reference illustrations, so there is nothing for either to do.
  const renderer = new WebGPURenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearAlpha(0);

  const built = (SCENES[sceneName] ?? SCENES.dessert)();
  if (outline) addOutlines(built.root);
  scene.add(built.root);

  // Each scene composes at its own size, so it says how far back the
  // camera stands. Framing them all alike either crops the wide ones or
  // strands the single dishes in whitespace.
  const dist = 4.6 * (built.frame ?? 1);
  camera.position.set(0, Math.sin(CAMERA_ELEVATION) * dist, Math.cos(CAMERA_ELEVATION) * dist);
  camera.lookAt(0, 0, 0);

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

  // Every vessel's rim shine, turned against the dish's yaw each frame so
  // it stays toward the light (see vessel()).
  const sparkles = [];
  built.root.traverse((o) => {
    if (o.userData.isSparkle) sparkles.push(o);
  });
  const yaw = new Euler();
  const turn = new Quaternion();

  function draw(seconds) {
    if (!ready) return;
    built.update(seconds);
    built.root.updateMatrixWorld(true);
    for (const sp of sparkles) {
      sp.parent.getWorldQuaternion(turn);
      yaw.setFromQuaternion(turn, 'YXZ');
      sp.rotation.y = -yaw.y;
    }
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
