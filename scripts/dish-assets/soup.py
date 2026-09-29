"""Decompose the squash-soup photograph into the layers the assembly
animation needs: plate+bowl+plain soup, bread, oil swirl, chives, almonds.

The three garnishes need three different detectors, because they are three
different kinds of thing:

  chives   chopped scallion sitting on the surface, so genuinely green --
           an absolute colour test finds them.
  almonds  pale and desaturated against saturated orange -- a luminance
           test finds them.
  swirl    a thin film of oil over orange soup. It is NEVER green in
           absolute terms, only greener than the soup immediately around
           it, so an absolute test finds nothing at all. Subtracting a
           heavily blurred copy leaves the ridge, which is what a
           top-hat filter is for.

The base layer then has to have all three painted out, plus the plate
restored where the bread was covering it, or the first beat of the
animation shows a bowl of finished soup with a bite out of its plate.
"""
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage


def disc(radius):
    y, x = np.mgrid[-radius:radius + 1, -radius:radius + 1]
    return x * x + y * y <= radius * radius


def close_edt(mask, radius):
    """Morphological closing via distance transforms. Linear in pixels, so
    the radius needed to bridge the bite the bread takes out of the plate
    -- around 120px, far too large for a structuring element -- is free."""
    grown = ndimage.distance_transform_edt(~mask) <= radius
    return ndimage.distance_transform_edt(grown) > radius


def fill_from_neighbours(rgb, keep, sigma):
    """Normalised convolution: average only the pixels worth keeping, so a
    hole fills with what surrounds it instead of with black. Fine for the
    garnish, whose marks are thin enough for a blur to reach across."""
    w = np.maximum(ndimage.gaussian_filter(keep.astype(float), sigma), 1e-6)
    return np.stack([ndimage.gaussian_filter(rgb[:, :, c] * keep, sigma) / w for c in range(3)], axis=2)


def fill_nearest(rgb, keep, hole, smooth=28):
    """Fill by nearest valid pixel, then smooth inside the hole.

    The bread hides a region roughly 500px across. No blur wide enough to
    span that stays stable -- the weights underflow in the middle and the
    fill comes back an arbitrary colour, which showed up as a brown smear
    across the plate. Taking each hole pixel from the nearest kept pixel
    has no such failure mode, and the plate is a smooth dark gradient, so
    a light blur afterwards hides the seams the nearest-neighbour step
    leaves behind."""
    _, (iy, ix) = ndimage.distance_transform_edt(~keep, return_indices=True)
    filled = rgb[iy, ix]
    blurred = np.stack([ndimage.gaussian_filter(filled[:, :, c], smooth) for c in range(3)], axis=2)
    # Pull the fill most of the way to the median kept colour as well. The
    # plate is nearly flat in value, so this costs no detail that was
    # there, and it kills the warm cast the nearest-neighbour step drags
    # in from around the bread.
    median = np.median(rgb[keep], axis=0)
    blended = 0.35 * blurred + 0.65 * median
    return np.where(hole[..., None], blended, rgb)


def build(src_path, out_dir, width=900):
    src = Image.open(src_path).convert('RGBA')
    a = np.asarray(src).astype(float)
    rgb, alpha = a[:, :, :3], a[:, :, 3]
    obj = alpha > 40
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

    # The soup surface, found as the largest strongly-orange blob, then
    # described as an ellipse so "inside the bowl" is a cheap test.
    seed = obj & (r - b > 60) & (lum > 70)
    lbl, n = ndimage.label(seed)
    sizes = ndimage.sum(seed, lbl, range(1, n + 1))
    surface = lbl == (np.argmax(sizes) + 1)
    ys, xs = np.where(surface)
    cx, cy = xs.mean(), ys.mean()
    rx, ry = (xs.max() - xs.min()) / 2, (ys.max() - ys.min()) / 2
    Y, X = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    rad = np.sqrt(((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2)
    soup = obj & (rad < 0.97)

    almonds = ndimage.binary_closing(
        soup & (lum > 135) & (np.abs(r - g) < 55) & (r - b < 95), np.ones((5, 5)))
    al, an = ndimage.label(almonds)
    asz = ndimage.sum(almonds, al, range(1, an + 1))
    almonds = ndimage.binary_fill_holes(
        np.isin(al, [i + 1 for i, s in enumerate(asz) if s > 400]))

    chives = ndimage.binary_closing(soup & (g - r > 4) & (lum > 45) & ~almonds, np.ones((3, 3)))

    greenness = g - r
    local = fill_from_neighbours(np.stack([greenness] * 3, axis=2), soup, 26)[:, :, 0]
    ridge = np.where(soup, greenness - local, 0)
    swirl = soup & (ridge > 7) & (rad < 0.93) & ~ndimage.binary_dilation(chives | almonds, np.ones((9, 9)))
    swirl = ndimage.binary_closing(ndimage.binary_opening(swirl, np.ones((3, 3))), np.ones((7, 7)))

    bread = obj & (rad > 1.0) & (lum > 75) & (r - b > 25)
    bl, bn = ndimage.label(ndimage.binary_opening(bread, np.ones((7, 7))))
    bsz = ndimage.sum(bread, bl, range(1, bn + 1))
    bread = ndimage.binary_closing(
        ndimage.binary_fill_holes(bl == (np.argmax(bsz) + 1)), np.ones((9, 9)))

    # The plate's own silhouette, with the concavity the bread was
    # covering closed back up. The bread hides a wide arc of the rim, so
    # this needs a radius no structuring element would want to be.
    # Intersected with the dish's real footprint. A 120px closing bridges
    # the bite the bread takes out of the rim, but it also bulges the
    # plate outward wherever the bread sat proud of it -- which showed up
    # as a dark slab hanging off the right of the first beat. `obj` is the
    # whole dish including the bread, so it is exactly the boundary the
    # reconstructed plate must not cross.
    plate = ndimage.binary_fill_holes(close_edt(obj & ~bread, 120)) & ndimage.binary_dilation(obj, disc(4))

    # Dilated, because each detector finds a garnish's core and leaves its
    # soft edge behind. Without this the "plain soup" beat still shows a
    # ghost of the swirl.
    # Two different holes, two different fills. The garnish leaves thin
    # marks a blur can average across; the bread leaves a crater.
    garnish = ndimage.binary_dilation(swirl | chives | almonds, disc(7))
    degarnished = np.where(garnish[..., None], fill_from_neighbours(rgb, plate & ~garnish, 34), rgb)
    # Dilated hard before being excluded. A threshold finds the bread's
    # core, and just outside it sits a rim of shadow and soft edge that is
    # still bread-coloured -- fill from there and the plate comes back a
    # warm brown smear, which is exactly what happened. 30px of clearance
    # takes the share of genuinely-plate source pixels from 9% to 76%.
    wide_bread = ndimage.binary_dilation(bread, disc(30))
    base_rgb = fill_nearest(degarnished,
                            keep=plate & ~garnish & ~wide_bread,
                            hole=plate & wide_bread)

    def layer(mask, colours, feather):
        img = np.zeros(a.shape, np.uint8)
        img[..., :3] = np.clip(colours, 0, 255).astype(np.uint8)
        out = Image.fromarray(img).convert('RGBA')
        out.putalpha(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather)))
        return out

    layers = {
        'base': layer(plate, base_rgb, 1.2),
        'bread': layer(bread, rgb, 1.2),
        'swirl': layer(swirl, rgb, 0.9),
        'chives': layer(chives, rgb, 0.7),
        'almonds': layer(almonds, rgb, 0.9),
    }
    # One shared crop, so the layers stack in register with no offsets.
    ys, xs = np.where(obj | plate)
    box = (max(0, xs.min() - 8), max(0, ys.min() - 8),
           min(a.shape[1], xs.max() + 9), min(a.shape[0], ys.max() + 9))
    for name, im in layers.items():
        c = im.crop(box)
        c = c.resize((width, round(width * c.height / c.width)), Image.LANCZOS)
        c.save(f'{out_dir}/soup-{name}.webp', quality=92, method=6)
    return {k: v.crop(box).size for k, v in layers.items()}
