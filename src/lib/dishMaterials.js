import { BackSide, Color, MeshBasicNodeMaterial, SRGBColorSpace, Vector3 } from 'three/webgpu';
import {
  atan,
  cameraViewMatrix,
  color,
  float,
  max,
  mix,
  modelWorldMatrix,
  normalLocal,
  normalView,
  normalWorld,
  positionLocal,
  positionView,
  smoothstep,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl';

/**
 * The tour's surfaces, painted like a sticker-sheet illustration.
 *
 * The references are a low-poly "tiny treats" cake and a drawn lemon
 * cake on a lavender-white plate. What they share: no lighting at all;
 * every part coloured by a soft gradient, lighter where it faces up and
 * deeper where it turns away, so form reads from colour alone; crisp
 * white "shine balls" -- a highlight dot with a smaller one beside it --
 * on anything round; and, optionally, an outline in a darker shade of
 * each part's own colour (addOutlines, below).
 *
 * So everything here is unlit (MeshBasicNodeMaterial) with the shading
 * painted in. The gradient is weighted by a fixed light direction; the
 * shine balls are a toon highlight -- a hard-edged cut of the half-vector
 * term -- so they sit where a real highlight would and stay put as a dish
 * turns under them.
 */

const LIGHT = vec3(-0.46, 0.74, 0.5).normalize();

/** 0 facing away from the light, 1 facing it. */
const wrap = () => normalWorld.dot(LIGHT).mul(0.5).add(0.5);

/**
 * The shine balls: a round highlight, and a smaller one just below and
 * to the side of it. Hard-edged on purpose -- a soft specular is what a
 * photograph has; a drawn highlight is a white shape.
 */
function shine() {
  const toEye = positionView.negate().normalize();
  const light = cameraViewMatrix.mul(vec4(LIGHT, 0)).xyz.normalize();
  const h = light.add(toEye).normalize();
  const big = smoothstep(0.945, 0.952, normalView.dot(h));
  const h2 = h.add(vec3(0.2, -0.24, 0)).normalize();
  const small = smoothstep(0.985, 0.988, normalView.dot(h2));
  return max(big, small);
}

// Lifted and deepened in HSL, as a painter would mix them. Lerping toward
// white instead washes every colour toward grey, and both references are
// clear, saturated pastels.
function shift(c, dl, ds) {
  const hsl = {};
  const out = new Color(c);
  out.getHSL(hsl, SRGBColorSpace);
  out.setHSL(hsl.h, Math.min(1, Math.max(0, hsl.s + ds)), Math.min(0.97, Math.max(0, hsl.l + dl)), SRGBColorSpace);
  return out;
}
const lighter = (c, k) => shift(c, k * 0.6, k * 0.15);
const deeper = (c, k) => shift(c, -k * 0.5, k * 0.2);
/** The outline: the part's own colour, much darker and a little richer --
 *  gold round a lemon, green round a leaf, violet round a white plate. */
const inked = (c) => shift(c, -0.3, 0.25);

function withFade(material) {
  const opacity = uniform(1);
  material.transparent = true;
  material.opacityNode = opacity;
  material.userData.opacity = opacity;
  return material;
}

const cache = new Map();

/**
 * A piece in the painted style.
 *
 * `top`/`bottom` default to the colour lifted and deepened. `range:
 * [y0, y1]` also runs the gradient up the piece's own height (not
 * bake-safe). `shine: false` for flat pieces, where a highlight would
 * flash across the whole face at once. `outline` overrides the ink
 * colour, or `false` for none; `outlineWidth` fixes its width for a
 * piece whose size says nothing about its thickness -- a long, thin
 * spoke of chocolate would otherwise get the outline of a large piece.
 * `fade: true` exposes `material.userData.opacity`.
 */
export function toy(colour, { top, bottom, range = null, fade = false, shine: shiny = true, outline, outlineWidth } = {}) {
  const key = [colour, top, bottom, range?.join(','), fade, shiny, outline, outlineWidth].join('|');
  if (!fade && cache.has(key)) return cache.get(key);

  const hiColour = top ? new Color(top) : lighter(colour, 0.16);
  const loColour = bottom ? new Color(bottom) : deeper(colour, 0.3);
  const hi = color(hiColour);
  const lo = color(loColour);
  const t = range
    ? smoothstep(range[0], range[1], positionLocal.y).mul(0.6).add(wrap().mul(0.4))
    : wrap();

  const material = new MeshBasicNodeMaterial();
  const base = mix(lo, hi, t).mul(range ? float(1) : float(0.9).add(wrap().mul(0.14)));
  material.colorNode = shiny ? mix(base, color('#ffffff'), shine()) : base;
  material.userData.outline = outline === false ? null : new Color(outline ?? inked(colour));
  material.userData.outlineWidth = outlineWidth ?? null;
  material.userData.paint = { kind: 'toy', hi: hiColour, lo: loColour, range };
  if (fade) {
    withFade(material);
  } else {
    // Merged by bake() only when the shading does not depend on where
    // the piece sits in its own space.
    material.userData.bakeKey = range ? null : key;
    cache.set(key, material);
  }
  return material;
}

/**
 * Ice cream: pale butter at the ridge, warming to a peachy cream where
 * it meets the bowl, with the spoon's drag lines as faint bands along
 * its length.
 */
export function iceCreamMaterial({ cream, height }) {
  const material = new MeshBasicNodeMaterial();
  const up = smoothstep(0, height, positionLocal.y);
  const low = deeper(lighter(cream, 0.1), 0.12).lerp(new Color('#f3c9a2'), 0.35);
  const high = lighter(cream, 0.4);
  const base = mix(color(low), color(high), up);
  const drag = positionLocal.z.mul(90).sin().mul(0.025).add(1);
  material.colorNode = mix(base.mul(float(0.84).add(wrap().mul(0.2))).mul(drag), color('#ffffff'), shine());
  material.userData.outline = new Color('#d9a45a');
  material.userData.paint = { kind: 'iceCream', low, high, height };
  return material;
}

/**
 * A shaved ribbon of courgette: pale, faintly green flesh with a stripe
 * of dark skin down one long edge -- or both, from the outside of the
 * vegetable, or neither, from its middle. Read across the ribbon's width
 * from its UVs (v runs 0 to 1 edge to edge), so the stripe follows every
 * twist of the strip.
 */
export function ribbonMaterial({ flesh, skin, edges = 1 }) {
  const key = `ribbon|${flesh}|${skin}|${edges}`;
  if (cache.has(key)) return cache.get(key);
  const v = uv().y;
  const far = smoothstep(0.84, 0.9, v);
  const near = edges > 1 ? smoothstep(0.16, 0.1, v) : float(0);
  const stripe = edges > 0 ? max(far, near) : float(0);
  const fleshColour = mix(color(deeper(flesh, 0.22)), color(lighter(flesh, 0.22)), wrap());
  const skinColour = mix(color(deeper(skin, 0.25)), color(lighter(skin, 0.12)), wrap());
  const material = new MeshBasicNodeMaterial();
  // No toon highlight: a ribbon is broad and flat, so one flashes across
  // its whole width at once and reads as a hole in the pile.
  material.colorNode = mix(fleshColour, skinColour, stripe);
  material.userData.outline = inked(skin);
  material.userData.outlineWidth = 0.0035;
  material.userData.paint = {
    kind: 'ribbon',
    edges,
    flesh: [deeper(flesh, 0.22), lighter(flesh, 0.22)],
    skin: [deeper(skin, 0.25), lighter(skin, 0.12)],
  };
  cache.set(key, material);
  return material;
}

/**
 * A slice of toast: a golden face, paler toward its middle where it
 * browned least, inside a darker crust. No shine. Face and crust are told apart by
 * which way the surface points, so there is no seam between them.
 */
export function toastMaterial({ crumb, crust, fade = false }) {
  const material = new MeshBasicNodeMaterial();
  const facing = smoothstep(0.55, 0.9, normalLocal.y);
  const centre = smoothstep(0.55, 0.05, positionLocal.xz.length());
  const face = [new Color(crumb).lerp(new Color(crust), 0.62), new Color(crumb).lerp(new Color(crust), 0.25)];
  const edge = [deeper(crust, 0.35), new Color(crust)];
  const faceColour = mix(color(face[0]), color(face[1]), centre);
  const crustColour = mix(color(edge[0]), color(edge[1]), wrap());
  // Matte: bread does not shine, and a highlight on the crust's bevel
  // read as a glazed plastic edge.
  material.colorNode = mix(crustColour, faceColour, facing).mul(float(0.84).add(wrap().mul(0.2)));
  material.userData.outline = inked(crust);
  material.userData.paint = { kind: 'toast', face, edge };
  if (fade) withFade(material);
  return material;
}

/**
 * Soup: brightest at the centre, deepening toward the rim, with faint
 * bands spiralling out where it was levelled with a spoon. The disc has
 * radius 1 and is scaled to the bowl, so these are in units of the
 * soup's own radius. No toon highlight -- the surface is nearly flat, so
 * one would flash across all of it at once; the soup's shine balls are
 * placed as shapes instead (see soup() in dishScene.js).
 */
export function soupMaterial({ soup }) {
  const material = new MeshBasicNodeMaterial();
  const r = positionLocal.xz.length();
  const angle = atan(positionLocal.z, positionLocal.x);
  const bands = r.mul(22).sub(angle).sin().mul(0.5).add(0.5).mul(smoothstep(0.05, 0.25, r));
  const centre = lighter(soup, 0.22);
  const rim = deeper(soup, 0.12);
  const radial = mix(color(centre), color(rim), smoothstep(0.1, 1, r));
  material.colorNode = radial.mul(bands.mul(0.05).add(0.97));
  // Outlined by a ring at its edge rather than a hull -- see addOutlines.
  material.userData.outline = null;
  material.userData.ring = inked(soup);
  material.userData.paint = { kind: 'soup', centre, rim };
  return material;
}

/**
 * A falling stream -- soup from above, oil from above -- that fades out
 * toward its top, so it reads as poured from somewhere out of shot
 * without anything having to be drawn doing the pouring. The stream's
 * geometry runs from y = 0 (top) down to y = -1.
 */
export function streamMaterial(colour) {
  const material = new MeshBasicNodeMaterial();
  material.colorNode = mix(color(deeper(colour, 0.18)), color(colour), wrap());
  material.transparent = true;
  material.opacityNode = smoothstep(0, -0.3, positionLocal.y);
  material.depthWrite = false;
  material.userData.paint = { kind: 'stream' };
  return material;
}

/** Plain white, for a shine ball placed as a shape. */
export function whiteMaterial() {
  const material = new MeshBasicNodeMaterial();
  material.colorNode = color('#ffffff');
  material.userData.outline = null;
  material.userData.paint = { kind: 'white' };
  return material;
}

/** An outline's two ends: deeper round the far side, lighter facing the light. */
const inkEnds = (ink) => [shift(ink, -0.08, 0.06), shift(ink, 0.2, -0.04)];

const hulls = new Map();
const smoothed = new WeakMap();

/**
 * The geometry a hull is pushed out from. A mesh with faceted normals --
 * a crumb, or anything baked, which is unindexed -- has several normals
 * at each corner, so pushing out along them tears the hull apart at every
 * edge and the outline breaks into dark specks. The hull gets a copy
 * whose normals are averaged over every vertex at the same position.
 * Indexed geometry is already smooth and is shared as it is, which also
 * keeps a draw range (the oil drawing itself on) in step with its hull.
 */
function hullGeometry(geometry) {
  if (geometry.index) return geometry;
  if (smoothed.has(geometry)) return smoothed.get(geometry);
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const sums = new Map();
  const keys = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    keys.push(k);
    const acc = sums.get(k) ?? [0, 0, 0];
    acc[0] += nor.getX(i);
    acc[1] += nor.getY(i);
    acc[2] += nor.getZ(i);
    sums.set(k, acc);
  }
  const out = geometry.clone();
  const n = out.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = sums.get(keys[i]);
    const len = Math.hypot(x, y, z) || 1;
    n.setXYZ(i, x / len, y / len, z / len);
  }
  smoothed.set(geometry, out);
  return out;
}

function hullMaterial(ink, width, opacity) {
  const key = `${ink.getHexString()}|${width.toFixed(4)}`;
  if (!opacity && hulls.has(key)) return hulls.get(key);
  const material = new MeshBasicNodeMaterial();
  material.side = BackSide;
  // A gradient, not a flat line -- lighter where the outline faces the
  // light, deepening round the far side, as the inked line round the
  // lemons in the reference runs from gold to orange. Taken from the
  // geometry's own normal in world space: the hull is drawn back faces
  // only, and the view-facing normal nodes flip for those.
  const outward = modelWorldMatrix.mul(vec4(normalLocal, 0)).xyz.normalize();
  const lit = outward.dot(LIGHT).mul(0.5).add(0.5);
  const ends = inkEnds(ink);
  material.colorNode = mix(color(ends[0]), color(ends[1]), smoothstep(0.25, 0.85, lit));
  material.positionNode = positionLocal.add(normalLocal.mul(width));
  material.userData.paint = { kind: 'hull', ends, width };
  if (opacity) {
    material.transparent = true;
    material.opacityNode = opacity;
  } else {
    hulls.set(key, material);
  }
  return material;
}

/**
 * The toon outline, as an inverted hull: each outlined mesh gets a copy
 * of itself pushed out along its normals, drawn back faces only, in its
 * ink colour. Where the copy shows past the original is the outline.
 *
 * It is a pass over a finished scene, not part of building one, so a
 * scene reads the same with or without it, and the choice is one flag.
 * The hull is a child of its mesh, so it follows every move, fade and
 * visibility change the mesh makes; instanced meshes share their
 * instance matrices with theirs, so every sprinkled chive gets its own
 * outline as it falls.
 */
export function addOutlines(root) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.isHull) meshes.push(o);
  });
  for (const mesh of meshes) {
    const { outline, outlineWidth, ring, opacity } = mesh.material.userData;
    if (ring) {
      mesh.add(ringFor(mesh, ring));
      continue;
    }
    if (!outline) continue;
    mesh.geometry.computeBoundingSphere();
    // Thicker on big pieces, never so thick a chive disappears into it.
    const width = outlineWidth ?? Math.min(0.016, Math.max(0.0045, mesh.geometry.boundingSphere.radius * 0.07));
    const material = hullMaterial(outline, width, opacity);
    const shell = hullGeometry(mesh.geometry);
    const hull = mesh.isInstancedMesh
      ? Object.assign(new mesh.constructor(shell, material, mesh.count), { instanceMatrix: mesh.instanceMatrix })
      : new mesh.constructor(shell, material);
    hull.userData.isHull = true;
    hull.frustumCulled = false;
    hull.renderOrder = -1;
    mesh.add(hull);
  }
}

function ringFor(mesh, ink) {
  // A band round the edge of the soup's unit disc (liquid() supplies the
  // geometry): the line where the soup meets the bowl. As the disc's
  // child it scales with it as the soup rises.
  const material = new MeshBasicNodeMaterial();
  const ends = inkEnds(ink);
  material.colorNode = mix(color(ends[0]), color(ends[1]), smoothstep(0.25, 0.85, wrap()));
  material.userData.paint = { kind: 'ring', ends };
  const ring = new mesh.constructor(mesh.geometry.userData.ringGeometry, material);
  ring.userData.isHull = true;
  return ring;
}

// The same painting, worked out on the CPU for one vertex -- for
// scripts/dish-assets/export-glb.mjs, which saves the dishes as .glb files
// with these colours baked in, since a 3D file cannot carry a shader.
// Without the shine balls: they depend on where the camera stands.
const LIGHT_CPU = new Vector3(-0.46, 0.74, 0.5).normalize();
const step = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const between = (out, a, b, t) => out.copy(a).lerp(b, t);

/**
 * A vertex's colour, in linear space, under the material whose
 * `userData.paint` is given. `normalWorld` and `normalLocal` are unit
 * vectors; `uv` may be null. Returns null for a stream, which is only
 * ever seen mid-pour.
 */
export function paintAt(paint, { normalWorld, normalLocal, positionLocal, uv }, out = new Color()) {
  const wrapped = normalWorld.dot(LIGHT_CPU) * 0.5 + 0.5;
  switch (paint.kind) {
    case 'toy': {
      const { range } = paint;
      const t = range ? step(range[0], range[1], positionLocal.y) * 0.6 + wrapped * 0.4 : wrapped;
      return between(out, paint.lo, paint.hi, t).multiplyScalar(range ? 1 : 0.9 + wrapped * 0.14);
    }
    case 'iceCream': {
      between(out, paint.low, paint.high, step(0, paint.height, positionLocal.y));
      return out.multiplyScalar((0.84 + wrapped * 0.2) * (Math.sin(positionLocal.z * 90) * 0.025 + 1));
    }
    case 'ribbon': {
      const v = uv ? uv.y : 0.5;
      const far = step(0.84, 0.9, v);
      const near = paint.edges > 1 ? step(0.16, 0.1, v) : 0;
      const stripe = paint.edges > 0 ? Math.max(far, near) : 0;
      const skin = between(new Color(), paint.skin[0], paint.skin[1], wrapped);
      return between(out, paint.flesh[0], paint.flesh[1], wrapped).lerp(skin, stripe);
    }
    case 'toast': {
      const facing = step(0.55, 0.9, normalLocal.y);
      const centre = step(0.55, 0.05, Math.hypot(positionLocal.x, positionLocal.z));
      const face = between(new Color(), paint.face[0], paint.face[1], centre);
      return between(out, paint.edge[0], paint.edge[1], wrapped).lerp(face, facing).multiplyScalar(0.84 + wrapped * 0.2);
    }
    case 'soup':
      return between(out, paint.centre, paint.rim, step(0.1, 1, Math.hypot(positionLocal.x, positionLocal.z)));
    case 'hull':
    case 'ring':
      return between(out, paint.ends[0], paint.ends[1], step(0.25, 0.85, wrapped));
    case 'white':
      return out.setRGB(1, 1, 1);
    default:
      return null;
  }
}
