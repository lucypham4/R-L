import {
  BufferGeometry,
  CatmullRomCurve3,
  ExtrudeGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Mesh,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three/webgpu';
import { iceCreamMaterial, soupMaterial, toastMaterial, toy, whiteMaterial } from './dishMaterials';

/**
 * Food, built rather than photographed.
 *
 * Everything here is real geometry: a quenelle is lofted from a rounded
 * triangle, a blackberry is a cluster of drupelets, the scallion oil is a
 * tube swept along a hand-drawn spiral. That is the point -- a
 * photograph lying on a surface holds up only while the camera barely
 * moves, and the moment a dish turns far enough to matter, flatness
 * shows. These pieces have their own silhouettes, so a dish can turn.
 *
 * They are painted like toys (dishMaterials.js): unlit, each coloured by
 * a soft gradient, after the low-poly "tiny treats" cake used as the
 * reference. The colours themselves are sampled from the chef's
 * photographs, so a reconstruction of their cooking is at least their
 * cooking's colour.
 */

// Deterministic, so a dish looks the same every time the tour is opened
// rather than re-scattering its garnish on each mount.
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Collapses a group's small pieces into one mesh per material.
 *
 * Built food is many small meshes -- sixteen drupelets to a blackberry,
 * fifty-odd chives on a soup -- and every mesh is a draw call, twice over
 * once it has an outline, each with the renderer's per-call overhead.
 * Once a group's pieces are placed they never move relative to
 * each other, so they can be baked: geometry transformed into the group's
 * space and concatenated, one mesh per distinct surface.
 *
 * Only pieces whose material carries a `bakeKey` are baked -- toy()
 * materials that shade by normal alone. Anything patterned in its own
 * local space (the quenelle, the toast, the soup) would have that pattern
 * moved by baking, so it is left as it is.
 */
export function bake(group) {
  group.updateMatrixWorld(true);
  const toGroup = new Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const baked = [];
  group.traverse((o) => {
    const key = o.isMesh && !o.isInstancedMesh ? o.material.userData?.bakeKey : null;
    if (!key) return;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: o.material, positions: [], normals: [] };
      buckets.set(key, bucket);
    }
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(new Matrix4().multiplyMatrices(toGroup, o.matrixWorld));
    bucket.positions.push(geo.attributes.position.array);
    bucket.normals.push(geo.attributes.normal.array);
    geo.dispose();
    o.geometry.dispose();
    baked.push(o);
  });
  for (const o of baked) o.removeFromParent();
  for (const { material, positions, normals } of buckets.values()) {
    const join = (parts) => {
      const out = new Float32Array(parts.reduce((n, a) => n + a.length, 0));
      let at = 0;
      for (const a of parts) {
        out.set(a, at);
        at += a.length;
      }
      return out;
    };
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(join(positions), 3));
    geo.setAttribute('normal', new Float32BufferAttribute(join(normals), 3));
    const mesh = new Mesh(geo, material);
    group.add(mesh);
  }
  return group;
}

/** Pushes a mesh's vertices around so no two pieces are identical. */
function rough(geometry, rng, amount = 0.16, squashY = 1) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - amount / 2 + rng() * amount;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * squashY, pos.getZ(i) * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A quenelle: the three-sided oval a scoop takes when it is passed
 * between two warm spoons.
 *
 * An ellipsoid is the obvious primitive and the wrong one -- it has no
 * faces, so it reads as a dumpling. A quenelle's cross-section is a
 * rounded triangle: two faces pressed by the spoons, meeting in a ridge
 * along the top, and a third, flat face it sits on. So it is lofted here
 * from exactly that. Each ring is a triangle with its corners rounded off
 * (the support function of a triangle, pushed out by a radius), let out a
 * little toward an ellipse so the spoon faces are gently convex rather
 * than planar, and the rings shrink toward both tips -- one end blunter
 * than the other, as a hand-made one is.
 *
 * `userData.ridgeAt(t)` returns the top of the ridge at a fraction of the
 * length, so garnish can be set on it.
 */
export function quenelle(colour, { length = 0.62, width = 0.42, height = 0.36, rng } = {}) {
  const RINGS = 56;
  const SIDES = 72;
  const ROUND = Math.min(width, height) * 0.2;
  // The triangle as [y, z] corners, inset by the rounding radius so the
  // rounded outline comes out at the requested width and height, with its
  // base on y = 0 and the ridge on top.
  const corners = [
    [height - ROUND, 0],
    [ROUND, -(width / 2 - ROUND)],
    [ROUND, width / 2 - ROUND],
  ];
  // Rings shrink about this height, so the tips come to a point partway
  // up rather than down at the plate.
  const PIVOT = height * 0.34;

  function outline(angle) {
    // angle 0 points straight up, toward the ridge.
    const dy = Math.cos(angle);
    const dz = Math.sin(angle);
    let best = corners[0];
    let bestDot = -Infinity;
    for (const c of corners) {
      const d = c[0] * dy + c[1] * dz;
      if (d > bestDot) {
        bestDot = d;
        best = c;
      }
    }
    const y = best[0] + ROUND * dy;
    const z = best[1] + ROUND * dz;
    // Toward an ellipse through the same extents: convex spoon faces.
    const ey = PIVOT + dy * (dy > 0 ? height - PIVOT : PIVOT);
    const ez = dz * width * 0.5;
    return [y + (ey - y) * 0.22, z + (ez - z) * 0.22];
  }

  function taper(t) {
    // 0 at both tips; the +x end is the pointier one.
    return Math.pow(Math.sin(Math.PI * t), 0.62) * (1 - 0.18 * t);
  }

  const positions = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    const x = (t - 0.5) * length;
    const s = taper(t);
    for (let j = 0; j < SIDES; j++) {
      const [y, z] = outline((j / SIDES) * Math.PI * 2);
      positions.push(x, PIVOT + (y - PIVOT) * s, z * s);
    }
  }
  const index = [];
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SIDES; j++) {
      const a = i * SIDES + j;
      const b = i * SIDES + ((j + 1) % SIDES);
      const c = a + SIDES;
      const d = b + SIDES;
      // Wound so the face normal is (b - a) x (c - a): around, then along,
      // which points outward.
      index.push(a, b, c, b, d, c);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  if (rng) rough(geo, rng, 0.03);

  const mesh = new Mesh(geo, iceCreamMaterial({ cream: colour, height }));
  mesh.userData.ridgeAt = (t) => {
    const [y] = outline(0);
    return new Vector3((t - 0.5) * length, PIVOT + (y - PIVOT) * taper(t), 0);
  };
  return mesh;
}

/** A blackberry: an aggregate of drupelets, which is what makes it read
 *  as a blackberry rather than as a dark marble. */
export function blackberry(colour, { radius = 0.075, rng } = {}) {
  const g = new Group();
  const r = rng ?? seeded(3);
  const core = new Mesh(new SphereGeometry(radius * 0.72, 14, 12), toy(colour, { top: '#5d3d4f', bottom: '#140e11' }));
  g.add(core);
  const drupelets = 16;
  for (let i = 0; i < drupelets; i++) {
    // Spread over a sphere, biased to the upper half -- the underside is
    // against the plate and never seen.
    const phi = Math.acos(1 - 1.5 * ((i + 0.5) / drupelets));
    const theta = i * 2.399963;
    const d = new Mesh(
      new SphereGeometry(radius * (0.3 + r() * 0.08), 10, 8),
      toy(colour, { top: '#6a4659', bottom: '#1a1216' })
    );
    d.position.set(
      Math.sin(phi) * Math.cos(theta) * radius * 0.78,
      Math.cos(phi) * radius * 0.78,
      Math.sin(phi) * Math.sin(theta) * radius * 0.78
    );
    g.add(d);
  }
  return g;
}

/** A raspberry: the same construction, hollow-topped and finer grained. */
export function raspberry(colour, { radius = 0.07, rng } = {}) {
  const g = new Group();
  const r = rng ?? seeded(5);
  const drupelets = 22;
  for (let i = 0; i < drupelets; i++) {
    const phi = Math.acos(1 - 1.7 * ((i + 0.5) / drupelets));
    const theta = i * 2.399963;
    const d = new Mesh(
      new SphereGeometry(radius * (0.26 + r() * 0.07), 10, 8),
      toy(colour)
    );
    const rr = radius * 0.8;
    d.position.set(
      Math.sin(phi) * Math.cos(theta) * rr,
      Math.cos(phi) * rr * 0.86,
      Math.sin(phi) * Math.sin(theta) * rr
    );
    g.add(d);
  }
  return g;
}

/** A crumb of streusel, toasted nut, or anything else granular. */
export function crumb(colour, { size = 0.03, rng } = {}) {
  const r = rng ?? seeded(11);
  const geo = rough(new IcosahedronGeometry(size, 0), r, 0.5, 0.7);
  const mesh = new Mesh(geo, toy(colour));
  return mesh;
}

/** A flaked almond: a thin, flat oval. */
export function flake(colour, { length = 0.075, rng } = {}) {
  const geo = new SphereGeometry(1, 12, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * length, pos.getY(i) * length * 0.07, pos.getZ(i) * length * 0.52);
  }
  geo.computeVertexNormals();
  if (rng) rough(geo, rng, 0.2);
  // Flat: a highlight would flash across the whole face at once.
  const mesh = new Mesh(geo, toy(colour, { shine: false }));
  return mesh;
}

/** A chopped chive: a short length of hollow green stem. */
export function chive(colour, { length = 0.028, radius = 0.009 } = {}) {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 8, 1), toy(colour, { shine: false }));
  return mesh;
}

/**
 * The scallion oil, as it comes out of a squeezed bottle: a spiral, but a
 * hand-drawn one.
 *
 * A mathematically clean Archimedean spiral reads as a graphic, not as
 * oil. A hand squeezing a bottle while circling it lays down something
 * looser -- the rings unevenly spaced, the centre drifting, the circle
 * slightly egg-shaped, the line swelling where the hand paused and
 * thinning where it hurried, and trailing off at the end. All of that is
 * here, seeded so the same hand draws it every time.
 *
 * It can be drawn on a length at a time, the way it is squeezed out
 * (`userData.drawTo(u)`); `userData.curve.getPointAt(u)` is the tip.
 */
export function drizzle(colour, { innerRadius = 0.05, outerRadius = 0.55, turns = 2.2, thickness = 0.016, seed = 3 } = {}) {
  const r = seeded(seed);
  const phase = Array.from({ length: 6 }, () => r() * Math.PI * 2);
  const points = [];
  const steps = 240;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Uneven pace round the circle: the hand speeds up and slows down.
    const angle = t * Math.PI * 2 * turns + 0.45 * Math.sin(t * 7.3 + phase[0]);
    const radius =
      innerRadius +
      (outerRadius - innerRadius) * Math.pow(t, 0.85) +
      0.03 * Math.sin(t * 19 + phase[1]) +
      0.014 * Math.sin(t * 43 + phase[2]);
    // The centre wanders a little as the hand circles.
    const cx = 0.05 * Math.sin(t * 3.1 + phase[3]);
    const cz = 0.04 * Math.sin(t * 2.3 + phase[4]);
    points.push(
      new Vector3(cx + Math.cos(angle) * radius * 1.06, Math.sin(t * 9 + phase[5]) * 0.003, cz + Math.sin(angle) * radius * 0.94)
    );
  }
  const curve = new CatmullRomCurve3(points);
  const SEGMENTS = 260;
  const RADIAL = 8;
  const geo = new TubeGeometry(curve, SEGMENTS, thickness, RADIAL, false);

  // Swell and thin along the length: TubeGeometry lays out one ring of
  // RADIAL + 1 vertices per segment, round curve.getPointAt(i / SEGMENTS),
  // so each ring can be scaled about its own centre.
  const pos = geo.attributes.position;
  const centre = new Vector3();
  const v = new Vector3();
  for (let i = 0; i <= SEGMENTS; i++) {
    const u = i / SEGMENTS;
    const flow = 0.8 + 0.35 * Math.sin(u * 31 + phase[0]) * Math.sin(u * 11 + phase[2]);
    // A blob where the squeeze began; thinning to a tail where it let go.
    const ends = 1 + 0.5 * Math.exp(-u * 40) - 0.6 * Math.pow(u, 6);
    const k = Math.max(0.3, flow * ends);
    curve.getPointAt(u, centre);
    for (let j = 0; j <= RADIAL; j++) {
      const idx = i * (RADIAL + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(centre).multiplyScalar(k).add(centre);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();

  const mesh = new Mesh(geo, toy(colour, { outlineWidth: thickness * 0.4 }));
  mesh.userData.curve = curve;
  // TubeGeometry lays its indices down the path in order, RADIAL * 6 per
  // segment, so a draw range over the first n segments is the first n
  // pieces of the drizzle.
  mesh.userData.drawTo = (u) => {
    const n = Math.round(Math.min(1, Math.max(0, u)) * SEGMENTS);
    mesh.geometry.setDrawRange(0, n * RADIAL * 6);
    mesh.visible = n > 0;
  };
  return mesh;
}

/**
 * A starburst of piped chocolate, from the dessert photograph: thin
 * lines radiating from a knot at the centre, each ending in a small bead
 * where the piping bag lifted off.
 *
 * Built in its own XY plane, spokes spread across `arc` radians centred
 * on +Y. `droop` bends each spoke's far end along -Z as it goes, so a
 * burst laid across the ice cream can sag over its sides.
 */
export function starburst(colour, { spokes = 9, length = 0.34, arc = Math.PI * 1.1, droop = 0, thickness = 0.009, seed = 1 } = {}) {
  const r = seeded(seed);
  const g = new Group();
  // A hairline: the spokes are long but barely thicker than the line
  // drawn round them.
  const material = toy(colour, { outlineWidth: thickness * 0.35 });
  const knot = new Mesh(new SphereGeometry(thickness * 2.1, 12, 10), material);
  g.add(knot);
  for (let i = 0; i < spokes; i++) {
    const a = -arc / 2 + (arc * (i + 0.5)) / spokes + (r() - 0.5) * 0.12;
    const len = length * (0.72 + r() * 0.4);
    const dir = new Vector3(Math.sin(a), Math.cos(a), 0);
    const side = new Vector3(Math.cos(a), -Math.sin(a), 0);
    const wobble = (r() - 0.5) * 0.05;
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      pts.push(
        dir
          .clone()
          .multiplyScalar(t * len)
          .addScaledVector(side, Math.sin(t * Math.PI) * wobble)
          .add(new Vector3(0, 0, -droop * t * t * len))
      );
    }
    const curve = new CatmullRomCurve3(pts);
    g.add(new Mesh(new TubeGeometry(curve, 16, thickness, 6, false), material));
    const bead = new Mesh(new SphereGeometry(thickness * 1.5, 10, 8), material);
    bead.position.copy(curve.getPointAt(1));
    g.add(bead);
  }
  return g;
}

/** A ribbon of shaved courgette, swept along a curve and twisted. */
export function ribbon(colour, { length = 0.5, width = 0.09, rng, seed = 1 } = {}) {
  const r = rng ?? seeded(seed);
  const points = [];
  const steps = 7;
  const swing = 0.4 + r() * 0.5;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(
      new Vector3(
        Math.sin(t * Math.PI * swing * 2) * length * 0.42,
        Math.sin(t * Math.PI * 1.6) * 0.07 + t * 0.03,
        (t - 0.5) * length
      )
    );
  }
  // A very flat tube is a ribbon; scaling one axis after the fact keeps
  // the sweep's twist without needing a custom extrusion.
  const geo = new TubeGeometry(new CatmullRomCurve3(points), 44, width * 0.5, 6, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) * 0.22);
  geo.computeVertexNormals();
  const mesh = new Mesh(geo, toy(colour));
  return mesh;
}

/** A spoonful of ricotta: a soft irregular blob. */
export function curd(colour, { size = 0.055, rng } = {}) {
  const r = rng ?? seeded(17);
  const geo = rough(new IcosahedronGeometry(size, 1), r, 0.42, 0.78);
  const mesh = new Mesh(geo, toy(colour));
  return mesh;
}

/**
 * A slice of toast.
 *
 * Extruded from an outline rather than squashed out of a sphere, because
 * the silhouette is the whole thing: a slice of sourdough is flat along
 * the cut edge and domed over the crust, and a squashed sphere is just an
 * oval -- which is what the first attempt looked like, a large brown
 * pebble on the plate. A 2D shape run through ExtrudeGeometry gives the
 * flat edge, the dome, real thickness and a bevelled crust in one.
 *
 * The toasting -- pitted crumb on the face, charred crust round the edge
 * -- is the material's job, in dishMaterials.js.
 */
export function toast(crustColour, crumbColour, { length = 1.3, width = 0.95, depth = 0.17, fade = false } = {}) {
  const g = new Group();

  const half = length / 2;
  const shape = new Shape();
  shape.moveTo(-half, -width * 0.24);
  // The cut edge: nearly straight, with the slight sag a hand-cut slice has.
  shape.quadraticCurveTo(0, -width * 0.34, half, -width * 0.26);
  // Up over the crust and back, the dome the loaf rose into.
  shape.bezierCurveTo(half + width * 0.3, width * 0.1, half * 0.5, width * 0.5, 0, width * 0.5);
  shape.bezierCurveTo(-half * 0.55, width * 0.5, -half - width * 0.28, width * 0.12, -half, -width * 0.24);

  const geo = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.42,
    bevelSize: depth * 0.34,
    bevelSegments: 4,
    curveSegments: 28,
  });
  geo.center();
  // Extrude builds along +Z; lay the slice flat so its thickness is Y.
  geo.rotateX(-Math.PI / 2);

  // One material for face and crust alike -- it tells them apart by which
  // way the surface faces (see toastMaterial), so there is no seam.
  const slab = new Mesh(geo, toastMaterial({ crumb: crumbColour, crust: crustColour, fade }));
  g.add(slab);

  return g;
}

/** Soup: a disc with a slight dome, so its surface catches the light the
 *  way a liquid does rather than reading as a flat lid. */
export function liquid(colour, { radius = 0.62, dome = 0.012 } = {}) {
  const geo = new SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * radius, pos.getY(i) * dome, pos.getZ(i) * radius);
  }
  geo.computeVertexNormals();
  const mesh = new Mesh(geo, soupMaterial({ soup: colour }));
  // For the toon outline: a band round the rim of the disc (see
  // addOutlines -- a hull cannot outline an open dome).
  const ring = new TorusGeometry(radius, 0.016, 6, 96);
  ring.rotateX(Math.PI / 2);
  // On the geometry, which copies share; clone() would mangle userData.
  geo.userData.ringGeometry = ring;
  return mesh;
}


// Dishware in a cool, pale blue -- the palette runs #F5FBFF, #E5F3FD,
// #D1E5F4, #BDD5E7, #AECCE4, #9ABDDC -- lightest where it faces the
// light, and inked a deeper blue from the same family. The inside of a
// vessel carries no outline; only its outer silhouette does.
const PLATE = {
  outside: { top: '#e5f3fd', bottom: '#aecce4' },
  inside: { top: '#f5fbff', bottom: '#d1e5f4' },
  ink: '#7fa4cc',
};
// No toon highlight on dishware, inside or out: the wall below the far rim
// faces up at the camera and caught a white patch the size of the food.
// The rim's placed shine balls are the dishware's shine.
const plateOutside = () => toy('#d1e5f4', { ...PLATE.outside, outline: PLATE.ink, shine: false });
const plateInside = () => toy('#e5f3fd', { ...PLATE.inside, outline: false, shine: false });

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
export function vessel(radius, depth) {
  const group = new Group();
  const inner = new Mesh(new LatheGeometry(innerProfile(radius, depth), 128), plateInside());
  const outer = new Mesh(new LatheGeometry(outerProfile(radius, depth), 128), plateOutside());
  group.add(inner, outer);

  // Shine balls on the rim, as on the plate in the reference: a dash and
  // a dot, back-left toward the light. They are fixed to the light, not
  // to the dish -- mountDishScene turns this group against the dish's own
  // rotation every frame -- and a round rim looks the same from any
  // angle, so they stay put while the dish turns under them.
  const sparkle = new Group();
  for (const [a, length, width] of [
    [3.5, 0.075, 0.018],
    [3.86, 0.022, 0.016],
  ]) {
    const dot = new Mesh(new SphereGeometry(1, 16, 8), whiteMaterial());
    dot.scale.set(length * radius, 0.004, width * radius);
    dot.position.set(Math.cos(a) * radius * 0.975, depth + 0.006, Math.sin(a) * radius * 0.975);
    // Long axis along the rim.
    dot.rotation.y = -a - Math.PI / 2;
    sparkle.add(dot);
  }
  // Flagged on itself rather than referenced from the vessel's userData:
  // clone() copies userData through JSON, which would mangle a reference.
  sparkle.userData.isSparkle = true;
  group.add(sparkle);

  group.userData.floorAt = (r) => depth * Math.pow(Math.min(1, r / radius), 2.1);
  return group;
}
