import {
  CatmullRomCurve3,
  ExtrudeGeometry,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';

/**
 * Food, built rather than photographed.
 *
 * Everything here is real geometry: a quenelle is a tapered ellipsoid, a
 * blackberry is a cluster of drupelets, the scallion oil is a tube swept
 * along an Archimedean spiral. That is the point -- a photograph lying on
 * a surface holds up only while the camera barely moves, and the moment a
 * dish turns far enough to matter, flatness shows. These pieces have
 * their own silhouettes, catch the key light on their own curves, and
 * throw shadows on the plate under them.
 *
 * The colours are sampled from the chef's photographs
 * (`scripts/dish-assets/palettes.py`), so a reconstruction of their
 * cooking is at least their cooking's colour.
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

function matte(colour, { roughness = 0.82, flat = false } = {}) {
  return new MeshStandardMaterial({
    color: new Color(colour),
    roughness,
    metalness: 0,
    flatShading: flat,
  });
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
 * between two warm spoons. An ellipsoid squashed on one axis and tapered
 * toward one end, which is as close as a primitive gets.
 */
export function quenelle(colour, { length = 0.44, width = 0.26, height = 0.24, rng } = {}) {
  const geo = new SphereGeometry(0.5, 40, 28);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Taper toward +x, and flatten the underside so it sits.
    const taper = 1 - 0.42 * (x + 0.5);
    const floor = y < -0.18 ? -0.18 + (y + 0.18) * 0.25 : y;
    pos.setXYZ(i, x * length, floor * height * 2 * taper, z * width * 2 * taper);
  }
  geo.computeVertexNormals();
  if (rng) rough(geo, rng, 0.05);
  const mesh = new Mesh(geo, matte(colour, { roughness: 0.68 }));
  mesh.castShadow = true;
  return mesh;
}

/** A blackberry: an aggregate of drupelets, which is what makes it read
 *  as a blackberry rather than as a dark marble. */
export function blackberry(colour, { radius = 0.075, rng } = {}) {
  const g = new Group();
  const r = rng ?? seeded(3);
  const core = new Mesh(new SphereGeometry(radius * 0.72, 14, 12), matte(colour, { roughness: 0.42 }));
  g.add(core);
  const drupelets = 16;
  for (let i = 0; i < drupelets; i++) {
    // Spread over a sphere, biased to the upper half -- the underside is
    // against the plate and never seen.
    const phi = Math.acos(1 - 1.5 * ((i + 0.5) / drupelets));
    const theta = i * 2.399963;
    const d = new Mesh(
      new SphereGeometry(radius * (0.3 + r() * 0.08), 10, 8),
      matte(colour, { roughness: 0.34 })
    );
    d.position.set(
      Math.sin(phi) * Math.cos(theta) * radius * 0.78,
      Math.cos(phi) * radius * 0.78,
      Math.sin(phi) * Math.sin(theta) * radius * 0.78
    );
    g.add(d);
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
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
      matte(colour, { roughness: 0.38 })
    );
    const rr = radius * 0.8;
    d.position.set(
      Math.sin(phi) * Math.cos(theta) * rr,
      Math.cos(phi) * rr * 0.86,
      Math.sin(phi) * Math.sin(theta) * rr
    );
    g.add(d);
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

/** A tempered-chocolate shard: a thin tapered spike. */
export function shard(colour, { length = 0.3, thickness = 0.011 } = {}) {
  const geo = new CylinderGeometry(thickness * 0.35, thickness, length, 7, 1);
  geo.translate(0, length / 2, 0);
  const mesh = new Mesh(geo, matte(colour, { roughness: 0.34 }));
  mesh.castShadow = true;
  return mesh;
}

/** A crumb of streusel, toasted nut, or anything else granular. */
export function crumb(colour, { size = 0.03, rng } = {}) {
  const r = rng ?? seeded(11);
  const geo = rough(new IcosahedronGeometry(size, 0), r, 0.5, 0.7);
  const mesh = new Mesh(geo, matte(colour, { roughness: 0.9, flat: true }));
  mesh.castShadow = true;
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
  const mesh = new Mesh(geo, matte(colour, { roughness: 0.74 }));
  mesh.castShadow = true;
  return mesh;
}

/** A chopped chive: a short length of hollow green stem. */
export function chive(colour, { length = 0.028, radius = 0.009 } = {}) {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 8, 1), matte(colour, { roughness: 0.6 }));
  mesh.castShadow = true;
  return mesh;
}

/**
 * The scallion oil, swept along an Archimedean spiral.
 *
 * This is the piece that most repays being built rather than painted: it
 * is a raised bead of oil sitting on the soup, so it catches a highlight
 * along its length and lays a soft shadow beside itself. Flat on a
 * texture it is a green line; here it is a drizzle.
 */
export function spiral(colour, { innerRadius = 0.1, outerRadius = 0.62, turns = 2.6, thickness = 0.016 } = {}) {
  const points = [];
  const steps = 200;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * Math.PI * 2 * turns;
    const r = innerRadius + (outerRadius - innerRadius) * t;
    points.push(new Vector3(Math.cos(angle) * r, Math.sin(t * 9) * 0.004, Math.sin(angle) * r));
  }
  const mesh = new Mesh(
    new TubeGeometry(new CatmullRomCurve3(points), 220, thickness, 8, false),
    matte(colour, { roughness: 0.28 })
  );
  mesh.castShadow = true;
  return mesh;
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
  const mesh = new Mesh(geo, matte(colour, { roughness: 0.55 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A spoonful of ricotta: a soft irregular blob. */
export function curd(colour, { size = 0.055, rng } = {}) {
  const r = rng ?? seeded(17);
  const geo = rough(new IcosahedronGeometry(size, 1), r, 0.42, 0.78);
  const mesh = new Mesh(geo, matte(colour, { roughness: 0.86 }));
  mesh.castShadow = true;
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
 */
export function toast(crustColour, crumbColour, { length = 1.3, width = 0.95, depth = 0.17 } = {}) {
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

  const slab = new Mesh(geo, matte(crustColour, { roughness: 0.94 }));
  slab.castShadow = true;
  slab.receiveShadow = true;
  g.add(slab);

  // The pale crumb, showing along the cut edge only.
  const cutShape = new Shape();
  cutShape.moveTo(-half * 0.92, -width * 0.235);
  cutShape.quadraticCurveTo(0, -width * 0.325, half * 0.92, -width * 0.25);
  cutShape.quadraticCurveTo(0, -width * 0.20, -half * 0.92, -width * 0.235);
  const cutGeo = new ExtrudeGeometry(cutShape, {
    depth: depth * 0.92,
    bevelEnabled: true,
    bevelThickness: depth * 0.3,
    bevelSize: depth * 0.22,
    bevelSegments: 3,
    curveSegments: 20,
  });
  cutGeo.center();
  cutGeo.rotateX(-Math.PI / 2);
  const cut = new Mesh(cutGeo, matte(crumbColour, { roughness: 0.96 }));
  cut.position.set(0, 0, -width * 0.265);
  cut.castShadow = true;
  g.add(cut);

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
  const mesh = new Mesh(
    geo,
    new MeshStandardMaterial({ color: new Color(colour), roughness: 0.34, metalness: 0.02 })
  );
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A generic heap, for the archive's fifteen dishes -- which cannot each
 * be modelled by hand, and do not need to be. At nine-in-a-grid size what
 * identifies a dish is its palette and how far its food spreads, both of
 * which come from the photograph via palettes.json.
 */
export function heap(colours, { radius = 0.3, count = 26, seed = 1, scale = 1 } = {}) {
  const rng = seeded(seed);
  const g = new Group();
  for (let i = 0; i < count; i++) {
    const colour = colours[i % colours.length];
    const angle = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng()) * radius;
    const size = (0.028 + rng() * 0.03) * scale;
    const piece = crumb(colour, { size, rng });
    const mound = Math.max(0, 1 - rad / radius) * 0.055 * scale;
    piece.position.set(Math.cos(angle) * rad, mound * (0.4 + rng() * 0.6), Math.sin(angle) * rad);
    piece.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    g.add(piece);
  }
  return g;
}
