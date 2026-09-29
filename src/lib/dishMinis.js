import {
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  Path,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three/webgpu';
import { bake, chive, crumb, drizzle, flake, liquid, quenelle, seeded, toast, vessel } from './dishFood';
import { toastMaterial, toy } from './dishMaterials';

/**
 * The archive's dishes: the chef's own plates, in miniature.
 *
 * The archive scene riffles nine cells through the collection and
 * settles each on one dish, after the loading screen of the app that
 * inspired it. At that size a heap in the right colours was enough to
 * tell one dish from another; these go further, and build each one --
 * scallops with their crust on a pool of purée, a rib on its grilled
 * pineapple, a lace tuile leaning on a quenelle -- in the same painted
 * style as the tour's large dishes.
 *
 * Every builder returns a Group at plate scale (a plate has radius 1),
 * already baked, so the archive can copy it into each cell cheaply:
 * clone() shares geometry and materials, and only the placement is new.
 * Colours are read off the chef's photographs.
 */

const P = {
  greens: '#6aa33e',
  greensLight: '#86bb4f',
  redLeaf: '#7b3a4a',
  chives: '#5f9d30',
  rice: '#f4f0e6',
  bokLeaf: '#3f7030',
  bokStem: '#e1ead0',
  peanut: '#e6cf9f',
};

/** A soft, irregular pool -- purée, sauce -- closed underneath so its
 *  outline runs all the way round. */
function pool(colour, { rx = 0.5, rz = 0.4, h = 0.05, seed = 1 } = {}) {
  const r = seeded(seed);
  const ph = [r() * 6, r() * 6, r() * 6];
  const geo = new SphereGeometry(1, 40, 16);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const w = 1 + 0.1 * Math.sin(3 * a + ph[0]) + 0.06 * Math.sin(5 * a + ph[1]) + 0.04 * Math.sin(8 * a + ph[2]);
    pos.setXYZ(i, x * rx * w, y > 0 ? y * h : y * h * 0.25, z * rz * w);
  }
  geo.computeVertexNormals();
  return new Mesh(geo, toy(colour, { shine: false }));
}

/** A mound of rice: a white dome, grains scattered over its surface. */
function rice({ r = 0.34, h = 0.17, grains = 70, seed = 2 } = {}) {
  const rng = seeded(seed);
  const g = new Group();
  const mound = new Mesh(new SphereGeometry(1, 28, 14), toy(P.rice, { bottom: '#d9d3c4', shine: false }));
  mound.scale.set(r, h, r);
  g.add(mound);
  const grain = new SphereGeometry(1, 8, 6);
  for (let i = 0; i < grains; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * r * 0.95;
    const y = h * Math.sqrt(Math.max(0, 1 - (d / r) ** 2));
    const m = new Mesh(grain, toy(P.rice, { bottom: '#e2dccd' }));
    m.scale.set(0.028, 0.012, 0.013);
    m.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    g.add(m);
  }
  return g;
}

/** A leaf -- salad, bok choy -- a flattened, rippled oval. */
function leaf(colour, { length = 0.26, width = 0.14, seed = 1 } = {}) {
  const r = seeded(seed);
  const ph = r() * 6;
  const geo = new SphereGeometry(1, 16, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const ripple = 0.25 * Math.sin(x * 9 + ph) * Math.abs(z);
    pos.setXYZ(i, x * length, pos.getY(i) * 0.05 + ripple * 0.12 + x * x * 0.08, z * width);
  }
  geo.computeVertexNormals();
  return new Mesh(geo, toy(colour));
}

/** Bok choy: pale stems fanned under dark leaves. */
function bokChoy({ seed = 3 } = {}) {
  const rng = seeded(seed);
  const g = new Group();
  for (let i = 0; i < 3; i++) {
    const stem = new Mesh(new CylinderGeometry(0.045, 0.06, 0.34, 10), toy(P.bokStem, { bottom: '#b9c9a0' }));
    stem.scale.z = 0.55;
    stem.rotation.set(Math.PI / 2 - 0.15, 0, (i - 1) * 0.35);
    stem.position.set((i - 1) * 0.07, 0.05, 0.05);
    g.add(stem);
  }
  for (let i = 0; i < 3; i++) {
    const l = leaf(P.bokLeaf, { length: 0.22, width: 0.14, seed: seed * 7 + i });
    l.rotation.set(0.25, Math.PI / 2 + (i - 1) * 0.5 + (rng() - 0.5) * 0.2, 0.1);
    l.position.set((i - 1) * 0.09, 0.1 + rng() * 0.03, -0.14);
    g.add(l);
  }
  return g;
}

/** A rounded block -- braised beef, a rib -- extruded from a rounded
 *  rectangle, height up. */
function block(colour, { length = 0.4, width = 0.28, height = 0.18, round = 0.06, top, bottom } = {}) {
  const l = length / 2 - round;
  const w = width / 2 - round;
  const s = new Shape();
  s.moveTo(-l, -w - round);
  s.lineTo(l, -w - round);
  s.quadraticCurveTo(l + round, -w - round, l + round, -w);
  s.lineTo(l + round, w);
  s.quadraticCurveTo(l + round, w + round, l, w + round);
  s.lineTo(-l, w + round);
  s.quadraticCurveTo(-l - round, w + round, -l - round, w);
  s.lineTo(-l - round, -w);
  s.quadraticCurveTo(-l - round, -w - round, -l, -w - round);
  const geo = new ExtrudeGeometry(s, {
    depth: Math.max(0.01, height - round * 2),
    bevelEnabled: true,
    bevelThickness: round,
    bevelSize: round * 0.9,
    bevelSegments: 4,
    curveSegments: 8,
  });
  geo.center();
  geo.rotateX(-Math.PI / 2);
  return new Mesh(geo, toy(colour, { top, bottom }));
}

/** A prawn: a curled, tapering tube. */
function prawn(colour, { size = 1 } = {}) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 1.35;
    pts.push(new Vector3(Math.cos(a) * 0.07 * size, 0, Math.sin(a) * 0.07 * size));
  }
  const geo = new TubeGeometry(new CatmullRomCurve3(pts), 24, 0.034 * size, 10, false);
  // Taper toward the tail.
  const pos = geo.attributes.position;
  const c = new Vector3();
  const curve = new CatmullRomCurve3(pts);
  for (let i = 0; i <= 24; i++) {
    curve.getPointAt(i / 24, c);
    const k = 1 - 0.55 * (i / 24);
    for (let j = 0; j <= 10; j++) {
      const idx = i * 11 + j;
      pos.setXYZ(idx, c.x + (pos.getX(idx) - c.x) * k, c.y + (pos.getY(idx) - c.y) * k, c.z + (pos.getZ(idx) - c.z) * k);
    }
  }
  geo.computeVertexNormals();
  return new Mesh(geo, toy(colour, { bottom: '#e39a7f' }));
}

/** Half a Brussels sprout, roasted: a green dome and its pale cut face. */
function sprout({ r = 0.1, faceUp = true } = {}) {
  const g = new Group();
  const dome = new Mesh(new SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toy('#5b8b2f', { top: '#8fb356', bottom: '#2f4418' }));
  const face = new Mesh(new CircleGeometry(r, 16), toy('#c8d67e', { top: '#e2e9a6', bottom: '#a3b35a', shine: false, outline: false }));
  face.rotation.x = Math.PI / 2;
  g.add(dome, face);
  if (faceUp) g.rotation.x = Math.PI;
  return g;
}

/** A baguette crostini: a long, pointed oval slice, toasted. */
function crostini({ length = 0.9, width = 0.24 } = {}) {
  const s = new Shape();
  s.moveTo(-length / 2, 0);
  s.quadraticCurveTo(0, width, length / 2, 0);
  s.quadraticCurveTo(0, -width, -length / 2, 0);
  const geo = new ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.018, bevelSegments: 3, curveSegments: 16 });
  geo.center();
  geo.rotateX(-Math.PI / 2);
  return new Mesh(geo, toastMaterial({ crumb: '#f3e0b0', crust: '#c7883c' }));
}

/** A lace tuile: a thin, curled sheet shot through with holes. Extruded
 *  (not a flat shape) so the outline can run round it and its holes. */
function tuile(colour, { rx = 0.3, rz = 0.22, seed = 5 } = {}) {
  const rng = seeded(seed);
  const s = new Shape();
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const w = 1 + 0.08 * Math.sin(a * 5 + 1) + 0.05 * Math.sin(a * 9);
    const x = Math.cos(a) * rx * w;
    const y = Math.sin(a) * rz * w;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const holes = [
    [-0.16, 0.05, 0.05, 0.03],
    [-0.05, 0.1, 0.035, 0.025],
    [0.06, 0.06, 0.05, 0.03],
    [0.17, 0.0, 0.04, 0.035],
    [-0.12, -0.08, 0.04, 0.03],
    [0.0, -0.06, 0.05, 0.028],
    [0.12, -0.11, 0.035, 0.025],
  ];
  for (const [x, y, hx, hy] of holes) {
    const h = new Path();
    const tilt = rng() * Math.PI;
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const px = Math.cos(a) * hx;
      const py = Math.sin(a) * hy;
      const qx = x + px * Math.cos(tilt) - py * Math.sin(tilt);
      const qy = y + px * Math.sin(tilt) + py * Math.cos(tilt);
      if (i === 0) h.moveTo(qx, qy);
      else h.lineTo(qx, qy);
    }
    s.holes.push(h);
  }
  const geo = new ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 6 });
  // Curl it, the way a tuile sets over a rolling pin.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, pos.getZ(i) - 1.4 * x * x);
  }
  geo.computeVertexNormals();
  return new Mesh(geo, toy(colour, { shine: false, outlineWidth: 0.004 }));
}

/** Loose bits scattered on a surface -- chives, peanuts, zest. */
function scatter(g, count, make, { r = 0.3, cx = 0, cz = 0, y = 0, lift = 0.01, seed = 9 } = {}) {
  const rng = seeded(seed);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * r;
    const m = make(rng, i);
    m.position.set(cx + Math.cos(a) * d, y + rng() * lift, cz + Math.sin(a) * d);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    g.add(m);
  }
}

const chop = (colour) => (rng) => {
  const c = chive(colour, { length: 0.03 + rng() * 0.015, radius: 0.009 });
  return c;
};
const nut = (colour) => (rng) => crumb(colour, { size: 0.018 + rng() * 0.012, rng });

function plated(dish, food) {
  const g = new Group();
  g.add(dish, bake(food));
  return g;
}

/** Green soup with prawns and a pepper garnish, crostini on the side. */
function greenSoup() {
  const plate = vessel(1, 0.07);
  const bowl = vessel(0.64, 0.42);
  bowl.position.set(-0.24, 0.06, -0.2);
  plate.add(bowl);
  const food = new Group();
  const soup = liquid('#a8c23e', { radius: 0.53, dome: 0.012 });
  soup.position.set(-0.24, 0.06 + 0.28, -0.2);
  food.add(soup);
  const rng = seeded(12);
  for (let i = 0; i < 8; i++) {
    const p = prawn('#f1c7b2', { size: 0.85 + rng() * 0.3 });
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * 0.12;
    p.position.set(-0.24 + Math.cos(a) * d, 0.37 + rng() * 0.05 + (i > 5 ? 0.05 : 0), -0.2 + Math.sin(a) * d);
    p.rotation.set((rng() - 0.5) * 1.2, rng() * 6, (rng() - 0.5) * 1.2);
    food.add(p);
  }
  const garnish = pool('#f3b21c', { rx: 0.07, rz: 0.05, h: 0.03, seed: 4 });
  garnish.position.set(-0.26, 0.47, -0.22);
  food.add(garnish);
  // Two crostini, laid along the bowl on the plate, clear of it.
  for (const [x, z] of [
    [0.5, 0.36],
    [0.66, 0.1],
  ]) {
    const c = crostini();
    c.rotation.y = -2.2;
    c.position.set(x, 0.07, z);
    food.add(c);
  }
  return plated(plate, food);
}

/** Seared scallops, crusted, on a pool of purée; chilli rings, chives. */
function scallops() {
  const plate = vessel(1, 0.08);
  const food = new Group();
  const puree = pool('#efc04c', { rx: 0.7, rz: 0.6, h: 0.05, seed: 6 });
  puree.position.y = 0.03;
  food.add(puree);
  const rng = seeded(13);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const g = new Group();
    const body = new Mesh(new CylinderGeometry(0.13, 0.14, 0.1, 20), toy('#f3e7d6', { bottom: '#d9c6ad' }));
    body.position.y = 0.05;
    const crust = new Mesh(new IcosahedronGeometry(0.14, 2), toy('#b06d2c', { top: '#d79a4e', bottom: '#7a4516' }));
    crust.scale.y = 0.42;
    crust.position.y = 0.1;
    g.add(body, crust);
    // The shredded-pastry crust: a few curls standing up off it.
    scatter(g, 7, nut('#c98a3c'), { r: 0.1, y: 0.15, lift: 0.02, seed: 20 + i });
    g.position.set(Math.cos(a) * 0.4, 0.05, Math.sin(a) * 0.36);
    food.add(g);
  }
  for (let i = 0; i < 3; i++) {
    const ring = new Mesh(new TorusGeometry(0.045, 0.014, 8, 20), toy('#dc3a1e'));
    ring.rotation.set(Math.PI / 2 + (rng() - 0.5) * 0.5, 0, 0);
    ring.position.set((i - 1) * 0.05, 0.1, (rng() - 0.5) * 0.05);
    food.add(ring);
  }
  scatter(food, 22, chop(P.chives), { r: 0.62, y: 0.08, seed: 14 });
  return plated(plate, food);
}

/** Ice cream on crumble, a lace tuile leaning on it. */
function tuileIceCream() {
  const bowl = vessel(0.85, 0.46);
  const food = new Group();
  scatter(food, 70, (rng) => crumb(rng() > 0.5 ? '#c9a263' : '#b58a4c', { size: 0.022 + rng() * 0.014, rng }), {
    r: 0.3,
    cz: 0.06,
    y: 0.02,
    lift: 0.03,
    seed: 15,
  });
  const scoop = quenelle('#dcd1b3', { length: 0.66, width: 0.4, height: 0.3 });
  scoop.position.set(0, 0.05, 0.02);
  scoop.rotation.y = -0.6;
  food.add(scoop);
  const lace = tuile('#b97a48');
  lace.position.set(0.14, 0.32, -0.06);
  lace.rotation.set(-1.0, -0.4, 0.3);
  food.add(lace);
  return plated(bowl, food);
}

/** Braised beef on celeriac purée, sauce, bacon, and roasted sprouts. */
function braisedBeef() {
  const plate = vessel(1, 0.08);
  const food = new Group();
  const puree = pool('#eee1c3', { rx: 0.56, rz: 0.46, h: 0.06, seed: 7 });
  puree.position.set(-0.2, 0.03, -0.02);
  food.add(puree);
  const beef = block('#5d3119', { length: 0.36, width: 0.28, height: 0.2, round: 0.07, top: '#8a4f2b', bottom: '#3a1d0d' });
  beef.position.set(-0.2, 0.17, -0.08);
  beef.rotation.y = 0.3;
  food.add(beef);
  const glaze = pool('#8b5327', { rx: 0.2, rz: 0.16, h: 0.03, seed: 8 });
  glaze.position.set(-0.2, 0.27, -0.08);
  food.add(glaze);
  const spill = pool('#8b5327', { rx: 0.2, rz: 0.12, h: 0.02, seed: 9 });
  spill.position.set(-0.24, 0.07, 0.16);
  food.add(spill);
  scatter(food, 9, (rng) => {
    const b = block('#a3423a', { length: 0.05, width: 0.04, height: 0.035, round: 0.01 });
    b.rotation.y = rng() * 3;
    return b;
  }, { r: 0.1, cx: -0.2, cz: -0.08, y: 0.3, lift: 0.02, seed: 16 });
  scatter(food, 16, chop(P.chives), { r: 0.45, cx: -0.2, y: 0.1, seed: 17 });
  const rng = seeded(18);
  for (let i = 0; i < 8; i++) {
    const s = sprout({ r: 0.09 + rng() * 0.03, faceUp: rng() > 0.45 });
    s.position.set(0.42 + (rng() - 0.5) * 0.36, 0.08 + (i > 5 ? 0.07 : 0), 0.1 + (rng() - 0.5) * 0.44);
    s.rotation.y = rng() * 6;
    s.rotation.z = (rng() - 0.5) * 0.6;
    food.add(s);
  }
  return plated(plate, food);
}

/** A glazed rib on grilled pineapple, with rice and bok choy. */
function rib() {
  const plate = vessel(1, 0.08);
  const food = new Group();
  const mound = rice({ seed: 21 });
  mound.position.set(-0.22, 0.03, -0.24);
  food.add(mound);
  const pineapple = new Mesh(new CylinderGeometry(0.3, 0.3, 0.06, 28), toy('#e2a73f', { top: '#f3c86a', bottom: '#b9782a' }));
  pineapple.position.set(0.1, 0.06, 0.12);
  food.add(pineapple);
  const meat = block('#6a2418', { length: 0.62, width: 0.26, height: 0.18, round: 0.07, top: '#9b3a26', bottom: '#3d120b' });
  meat.position.set(0.02, 0.19, 0.04);
  meat.rotation.set(0, -0.65, 0.1);
  food.add(meat);
  scatter(food, 12, nut(P.peanut), { r: 0.14, cx: 0.0, cz: 0.05, y: 0.3, lift: 0.02, seed: 22 });
  const greens = bokChoy({ seed: 4 });
  greens.position.set(0.42, 0.05, -0.2);
  greens.rotation.y = -0.6;
  food.add(greens);
  return plated(plate, food);
}

/** Ice cream on peanut crumble, golden pearls and lime zest on top. */
function pearlIceCream() {
  const bowl = vessel(0.85, 0.46);
  const food = new Group();
  scatter(food, 90, (rng) => crumb(rng() > 0.5 ? '#e4cd9e' : '#d3b67e', { size: 0.024 + rng() * 0.016, rng }), {
    r: 0.34,
    cz: 0.05,
    y: 0.02,
    lift: 0.04,
    seed: 23,
  });
  const scoop = quenelle('#f3ebd0', { length: 0.6, width: 0.4, height: 0.32 });
  scoop.position.set(0, 0.06, 0);
  scoop.rotation.y = -0.4;
  food.add(scoop);
  const rng = seeded(24);
  for (let i = 0; i < 18; i++) {
    const at = scoop.userData.ridgeAt(0.3 + rng() * 0.35);
    const pearl = new Mesh(new SphereGeometry(0.024, 12, 10), toy('#f0a62c', { top: '#ffd27a', bottom: '#c97a12' }));
    pearl.position.set(at.x + (rng() - 0.5) * 0.04, at.y + 0.015 + rng() * 0.02, (rng() - 0.5) * 0.1);
    scoop.add(pearl);
  }
  scatter(scoop, 8, chop('#8cc03a'), { r: 0.12, y: 0.32, seed: 25 });
  return plated(bowl, food);
}

/** Seared beef over mixed leaves, crisp shallots and herbs. */
function beefSalad() {
  const bowl = vessel(0.85, 0.5);
  const food = new Group();
  const rng = seeded(26);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rng() * 0.3;
    const d = 0.28 + rng() * 0.2;
    const colour = i % 5 === 0 ? P.redLeaf : rng() > 0.5 ? P.greens : P.greensLight;
    const l = leaf(colour, { length: 0.22, width: 0.13, seed: 30 + i });
    l.position.set(Math.cos(a) * d, 0.1 + d * 0.3, Math.sin(a) * d);
    l.rotation.set(0, -a, -0.5);
    food.add(l);
  }
  for (let i = 0; i < 10; i++) {
    const slice = new Mesh(new SphereGeometry(1, 16, 10), toy('#8a5646', { top: '#b07564', bottom: '#5a3228' }));
    slice.scale.set(0.13, 0.03, 0.085);
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * 0.2;
    slice.position.set(Math.cos(a) * d, 0.2 + rng() * 0.08, Math.sin(a) * d);
    slice.rotation.set((rng() - 0.5) * 0.6, rng() * 6, (rng() - 0.5) * 0.6);
    food.add(slice);
  }
  scatter(food, 14, (r) => {
    const curl = new Mesh(new TorusGeometry(0.022, 0.008, 6, 10, Math.PI * 1.3), toy('#a64a2a'));
    curl.scale.setScalar(0.9 + r() * 0.4);
    return curl;
  }, { r: 0.2, y: 0.29, lift: 0.04, seed: 27 });
  scatter(food, 12, chop('#4f8f2a'), { r: 0.22, y: 0.3, lift: 0.03, seed: 28 });
  scatter(food, 8, nut('#d9c07a'), { r: 0.18, y: 0.3, lift: 0.03, seed: 29 });
  return plated(bowl, food);
}

/** A roast chicken leg in cream sauce, with rice and bok choy. */
function chickenLeg() {
  const plate = vessel(1, 0.08);
  const food = new Group();
  const mound = rice({ seed: 31 });
  mound.position.set(-0.3, 0.03, -0.18);
  food.add(mound);
  const sauce = pool('#e7ddbb', { rx: 0.42, rz: 0.24, h: 0.02, seed: 10 });
  sauce.position.set(-0.05, 0.05, 0.3);
  food.add(sauce);
  const thigh = new Mesh(new SphereGeometry(1, 24, 16), toy('#b8672b', { top: '#dc9346', bottom: '#7a3d14' }));
  thigh.scale.set(0.3, 0.14, 0.22);
  thigh.position.set(0.02, 0.15, 0.1);
  thigh.rotation.y = -0.5;
  food.add(thigh);
  const drum = new Mesh(new CylinderGeometry(0.05, 0.1, 0.42, 16), toy('#c07030', { top: '#e29a50', bottom: '#80421a' }));
  drum.position.set(0.14, 0.2, -0.24);
  drum.rotation.set(-1.1, -0.35, 0);
  food.add(drum);
  const knuckle = new Mesh(new SphereGeometry(0.05, 14, 10), toy('#e9dbbd'));
  knuckle.position.set(0.2, 0.28, -0.42);
  food.add(knuckle);
  const drape = pool('#e4d9b2', { rx: 0.2, rz: 0.15, h: 0.03, seed: 11 });
  drape.position.set(0.02, 0.28, 0.1);
  food.add(drape);
  scatter(food, 14, chop('#4f9a2e'), { r: 0.14, cx: 0.02, cz: 0.08, y: 0.31, lift: 0.02, seed: 32 });
  scatter(food, 6, nut(P.peanut), { r: 0.14, cx: 0.02, cz: 0.08, y: 0.31, lift: 0.02, seed: 33 });
  const greens = bokChoy({ seed: 6 });
  greens.position.set(0.5, 0.05, -0.05);
  greens.rotation.y = -1.3;
  food.add(greens);
  return plated(plate, food);
}

/** The squash soup from the tour, finished: oil, chives, almonds, toast. */
function squashSoup() {
  const plate = vessel(1, 0.07);
  const bowl = vessel(0.64, 0.42);
  bowl.position.set(-0.24, 0.06, -0.2);
  plate.add(bowl);
  const food = new Group();
  const soup = liquid('#e8a835', { radius: 0.53, dome: 0.012 });
  soup.position.set(-0.24, 0.34, -0.2);
  food.add(soup);
  const oil = drizzle('#9e9c2c', { innerRadius: 0.03, outerRadius: 0.4, turns: 2, thickness: 0.014, seed: 8 });
  oil.position.set(-0.24, 0.352, -0.2);
  food.add(oil);
  scatter(food, 18, chop('#6d761d'), { r: 0.4, cx: -0.24, cz: -0.2, y: 0.36, seed: 34 });
  scatter(food, 6, (rng) => flake('#e9c592', { length: 0.06, rng }), { r: 0.1, cx: -0.24, cz: -0.2, y: 0.37, seed: 35 });
  const slice = toast('#94582f', '#e3b487', { length: 0.66, width: 0.5, depth: 0.12 });
  slice.rotation.y = 1.0;
  slice.position.set(0.56, 0.14, 0.34);
  food.add(slice);
  return plated(plate, food);
}

/** In the order the archive settles them, left to right, top to bottom. */
export const MINIS = [greenSoup, scallops, tuileIceCream, braisedBeef, rib, pearlIceCream, beefSalad, chickenLeg, squashSoup];
