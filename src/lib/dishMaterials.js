import { Color, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import {
  Fn,
  atan,
  color,
  float,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  mx_worley_noise_float,
  normalLocal,
  normalView,
  positionLocal,
  positionView,
  smoothstep,
  vec2,
  vec3,
} from 'three/tsl';

/**
 * Surfaces for the food, written in TSL.
 *
 * The geometry in dishFood.js gets each piece's silhouette right; what a
 * flat colour cannot give it is the surface -- the pits in a slice of
 * toasted crumb, the drag lines a spoon leaves on ice cream. Both are
 * procedural here, computed per pixel from the fragment's position on the
 * piece, so nothing is textured and nothing is downloaded.
 *
 * Every pattern is evaluated in the piece's own space (positionLocal),
 * so it is fixed to the food and turns with it. Keyed to world space it
 * would slide across the surface as the dish rotated, which reads at once
 * as a projection rather than as the thing itself.
 */

/**
 * Bump from a procedural height, after Mikkelsen, "Bump Mapping
 * Unparametrized Surfaces on the GPU" -- the same method as three's own
 * bumpMap node.
 *
 * bumpMap() itself cannot be used for this: it finds the height's slope by
 * re-sampling a texture at nudged UVs, and a noise function ignores UVs,
 * so the slope comes out zero and the bump silently vanishes. Taking the
 * screen-space derivatives of the height directly works for any node.
 */
const proceduralBump = Fn(([height, strength]) => {
  const sigmaX = positionView.dFdx().normalize();
  const sigmaY = positionView.dFdy().normalize();
  const n = normalView;
  const r1 = sigmaY.cross(n);
  const r2 = n.cross(sigmaX);
  const det = sigmaX.dot(r1);
  const dH = vec2(height.dFdx(), height.dFdy()).mul(strength);
  const grad = det.sign().mul(dH.x.mul(r1).add(dH.y.mul(r2)));
  return det.abs().mul(n).sub(grad).normalize();
});

/**
 * A slice of toasted crumb, with its crust.
 *
 * From the chef's soup photograph: the cut face is a dense crumb, golden
 * tan, riddled with small dark air pockets; the crust around it is a
 * deeper, redder brown, charred in patches where it caught the grill.
 *
 * Which is face and which is crust comes from the normal. The slice lies
 * flat, so the face is whatever points up and the crust is the bevel and
 * sides -- one material, no seam between the two.
 */
export function toastMaterial({ crumb, crust, char = '#2c170b' }) {
  const p = positionLocal;

  // Air pockets: Worley F1 is distance to the nearest scattered point, so
  // thresholding it low leaves sparse round pits. Two scales, because a
  // real crumb has a few big holes among many small ones.
  const pitsFine = smoothstep(0.22, 0.05, mx_worley_noise_float(p.mul(46)));
  const pitsCoarse = smoothstep(0.2, 0.04, mx_worley_noise_float(p.mul(17).add(3.1)));
  const pits = pitsFine.max(pitsCoarse.mul(0.9));

  // How toasted a patch is: uneven, as it is under a real grill.
  const browning = mx_fractal_noise_float(p.mul(5.5), 3, 2.0, 0.5).mul(0.5).add(0.5);

  const face = smoothstep(0.55, 0.9, normalLocal.y);

  // The chef's bread is a dark rustic loaf, toasted well: even the
  // lightest patch of its face is well past raw crumb.
  const crumbLit = color(new Color(crumb).lerp(new Color(crust), 0.42));
  const crumbToasted = color(new Color(crumb).lerp(new Color(crust), 0.9));
  const faceColour = mix(crumbLit, crumbToasted, browning.mul(0.9).add(0.15).clamp(0, 1));

  const charAmount = smoothstep(0.55, 0.85, mx_fractal_noise_float(p.mul(7).add(11), 3, 2.0, 0.55).mul(0.5).add(0.5));
  const crustColour = mix(color(crust), color(char), charAmount.mul(0.85));

  const pore = color(new Color(crust).multiplyScalar(0.32));
  const base = mix(crustColour, faceColour, face);

  const material = new MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 });
  material.colorNode = mix(base, pore, pits.mul(face.mul(0.75).add(0.25)));

  // Pits are depressions; the crust gets a coarser, blistered relief.
  const height = pits.negate().add(mx_noise_float(p.mul(22)).mul(mix(float(0.5), float(0.18), face)));
  material.normalNode = proceduralBump(height, float(0.9));
  material.roughnessNode = mix(float(0.97), float(0.88), charAmount);
  return material;
}

/**
 * Ice cream, from the dessert photograph: pale and buttery, not white,
 * with a soft sheen rather than a gloss, and scored along its length by
 * the spoons that shaped it.
 *
 * The drag lines are noise stretched hard along the quenelle's long axis
 * (x), which is the direction the spoon travelled. The fine dimpling on
 * top of them is the ice crystal texture that makes ice cream look cold
 * rather than like piped buttercream.
 */
export function iceCreamMaterial({ cream }) {
  const p = positionLocal;

  const drag = mx_noise_float(vec3(p.x.mul(3.2), p.y.mul(46), p.z.mul(46)));
  const crystals = mx_worley_noise_float(p.mul(70));
  const dimples = smoothstep(0.32, 0.0, crystals);

  const tone = mx_fractal_noise_float(p.mul(4), 2, 2.0, 0.5).mul(0.5).add(0.5);
  const creamLight = color(new Color(cream).lerp(new Color('#fff7e0'), 0.35));
  const creamShade = color(new Color(cream).multiplyScalar(0.9));

  const material = new MeshPhysicalNodeMaterial({ roughness: 0.52, metalness: 0 });
  material.colorNode = mix(creamShade, creamLight, tone.mul(0.7).add(drag.mul(0.12)).add(0.2).clamp(0, 1));
  material.normalNode = proceduralBump(drag.mul(0.6).sub(dimples.mul(0.5)), float(0.35));
  // Sheen is the soft bloom at grazing angles that fabrics, skin and
  // cold cream all have and a plain standard material does not.
  material.sheen = 0.6;
  material.sheenRoughness = 0.55;
  material.sheenColor = new Color('#fff6e4');
  return material;
}

/**
 * Squash soup, from the photograph: glossy, and never quite smooth --
 * the ladle and the spoon that levelled it leave soft ridges swirling out
 * from the centre, which catch the light in arcs.
 *
 * The ridges are a spiral (phase = radius minus angle), wobbled by a
 * little low-frequency noise so they meander the way a hand-drawn swirl
 * does rather than running as a machined groove.
 */
export function soupMaterial({ soup }) {
  const p = positionLocal;
  const r = p.xz.length();
  const angle = atan(p.z, p.x);
  const wobble = mx_noise_float(p.mul(3.4)).mul(3.2);
  const ridges = r.mul(21).sub(angle).add(wobble).sin().mul(0.5).add(0.5);
  // Soft at the centre, where the ladle poured, and at the rim.
  const swirl = ridges.mul(smoothstep(0.03, 0.14, r)).mul(smoothstep(0.7, 0.5, r));

  const trough = color(new Color(soup).multiplyScalar(0.9));
  const crest = color(new Color(soup).lerp(new Color('#f7cf62'), 0.35));

  const material = new MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.02 });
  // Kept faint on purpose. The oil is the spiral the eye should follow;
  // these are texture under it, and at full strength the two spirals
  // compete and the bowl reads as a cinnamon roll.
  material.colorNode = mix(trough, crest, swirl.mul(0.3).add(mx_noise_float(p.mul(9)).mul(0.08)).add(0.35).clamp(0, 1));
  material.normalNode = proceduralBump(swirl, float(0.3));
  return material;
}
