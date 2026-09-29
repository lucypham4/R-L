import { Color, MeshBasicNodeMaterial, SRGBColorSpace } from 'three/webgpu';
import { atan, color, float, mix, normalLocal, normalWorld, positionLocal, smoothstep, uniform, vec3 } from 'three/tsl';

/**
 * The food's surfaces, in the style of a hand-painted toy.
 *
 * The reference is a low-poly cake slice from a "tiny treats" set: no
 * lighting at all, every part coloured by a soft gradient -- lighter where
 * it faces up, deeper where it turns away -- so the form reads from the
 * colour alone. Nothing is textured, there is no noise, no pitting, no
 * specular. Food drawn this way reads instantly at thumbnail size and
 * never looks like a failed photograph.
 *
 * So these are unlit materials (MeshBasicNodeMaterial) with the shading
 * painted in: a gradient, multiplied by a soft wrap from one fixed
 * direction. The direction is the key light's, so the food agrees with
 * the shadows it casts on the (lit) ceramic under it.
 *
 * Small pieces -- a drupelet, a chive, a crumb -- shade by their normal
 * alone, which survives bake() merging them. Large pieces also run a
 * gradient up their own height, which is what gives the reference its
 * look; that is keyed to positionLocal and so is only used on meshes
 * that are never baked.
 */

// Matches the key light in dishScene.js (-2.6, 4.2, 2.8).
const LIGHT = vec3(-0.46, 0.74, 0.5).normalize();

/** 0 facing away from the light, 1 facing it. */
const wrap = () => normalWorld.dot(LIGHT).mul(0.5).add(0.5);

/** The painted shade: never black, gently brighter toward the light. */
const shade = () => float(0.72).add(wrap().mul(0.36));

// Lifted and deepened in HSL, as a painter would mix them. Lerping toward
// white instead washes every colour toward grey, and the reference is
// all clear, saturated pastels.
function shift(c, dl, ds) {
  const hsl = {};
  const out = new Color(c);
  out.getHSL(hsl, SRGBColorSpace);
  out.setHSL(hsl.h, Math.min(1, Math.max(0, hsl.s + ds)), Math.min(0.97, Math.max(0, hsl.l + dl)), SRGBColorSpace);
  return out;
}
const lighter = (c, k) => shift(c, k * 0.6, k * 0.15);
const deeper = (c, k) => shift(c, -k * 0.5, k * 0.2);

const cache = new Map();

/**
 * A piece of food in the toy style.
 *
 * `top` and `bottom` default to the colour lifted and deepened. Pass
 * `range: [y0, y1]` to also run the gradient up the piece's own height
 * (not bake-safe). `fade: true` makes it able to fade in and out, via
 * `material.userData.opacity`.
 */
export function toy(colour, { top, bottom, range = null, fade = false } = {}) {
  const key = [colour, top, bottom, range?.join(','), fade].join('|');
  if (!fade && cache.has(key)) return cache.get(key);

  const hi = color(top ? new Color(top) : lighter(colour, 0.16));
  const lo = color(bottom ? new Color(bottom) : deeper(colour, 0.3));
  const t = range
    ? smoothstep(range[0], range[1], positionLocal.y).mul(0.6).add(wrap().mul(0.4))
    : wrap();

  const material = new MeshBasicNodeMaterial();
  material.colorNode = mix(lo, hi, t).mul(range ? float(1) : float(0.9).add(wrap().mul(0.14)));
  if (fade) {
    const opacity = uniform(1);
    material.transparent = true;
    material.opacityNode = opacity;
    material.userData.opacity = opacity;
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
  const base = mix(color(deeper(lighter(cream, 0.1), 0.12).lerp(new Color('#f3c9a2'), 0.35)), color(lighter(cream, 0.4)), up);
  const drag = positionLocal.z.mul(90).sin().mul(0.025).add(1);
  material.colorNode = base.mul(shade()).mul(drag);
  return material;
}

/**
 * A slice of toast: a golden face, paler toward its middle where it
 * browned least, inside a darker crust. Face and crust are told apart by
 * which way the surface points, so there is no seam between them.
 */
export function toastMaterial({ crumb, crust, fade = false }) {
  const material = new MeshBasicNodeMaterial();
  const face = smoothstep(0.55, 0.9, normalLocal.y);
  const centre = smoothstep(0.55, 0.05, positionLocal.xz.length());
  const faceColour = mix(color(new Color(crumb).lerp(new Color(crust), 0.62)), color(new Color(crumb).lerp(new Color(crust), 0.25)), centre);
  const crustColour = mix(color(deeper(crust, 0.35)), color(crust), wrap());
  material.colorNode = mix(crustColour, faceColour, face).mul(shade());
  if (fade) {
    const opacity = uniform(1);
    material.transparent = true;
    material.opacityNode = opacity;
    material.userData.opacity = opacity;
  }
  return material;
}

/**
 * Soup: brightest at the centre, deepening toward the rim, with faint
 * bands spiralling out where it was levelled with a spoon. The disc it
 * sits on has radius 1 and is scaled to the bowl, so these are in units
 * of the soup's own radius.
 */
export function soupMaterial({ soup }) {
  const material = new MeshBasicNodeMaterial();
  const r = positionLocal.xz.length();
  const angle = atan(positionLocal.z, positionLocal.x);
  const bands = r.mul(22).sub(angle).sin().mul(0.5).add(0.5).mul(smoothstep(0.05, 0.25, r));
  const radial = mix(color(lighter(soup, 0.22)), color(deeper(soup, 0.12)), smoothstep(0.1, 1, r));
  material.colorNode = radial.mul(bands.mul(0.05).add(0.97));
  return material;
}
