"""Reduce each dish photograph to the handful of numbers a reconstruction
needs: how big the food is relative to the vessel, and what colour it is.

The archive shows nine dishes at once, so hand-modelling all fifteen is
not on. Instead each one is rebuilt from a generic mound of lumps in its
own colours -- which at that size reads as the dish it came from, because
what identifies a dish across a grid is its palette and its spread, not
the shape of any individual piece.
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage


def food_mask(rgb, alpha):
    """Food is what isn't dark ceramic: brighter, or more saturated."""
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    m = (alpha > 40) & ((lum > 88) | (sat > 58))
    m = ndimage.binary_opening(m, np.ones((3, 3)))
    return ndimage.binary_closing(m, np.ones((7, 7)))


def palette(px, k=3, iters=14):
    """A few representative colours, by k-means with a deterministic start
    so the same photograph always yields the same palette."""
    if len(px) > 20000:
        px = px[:: len(px) // 20000]
    order = np.argsort(px.sum(axis=1))
    centres = np.stack([px[order[int(len(px) * q)]] for q in (0.2, 0.55, 0.85)][:k]).astype(float)
    for _ in range(iters):
        d = ((px[:, None, :] - centres[None, :, :]) ** 2).sum(axis=2)
        which = d.argmin(axis=1)
        for i in range(k):
            if (which == i).any():
                centres[i] = px[which == i].mean(axis=0)
    weights = [float((which == i).mean()) for i in range(k)]
    return centres, weights


def hexc(c):
    return '#' + ''.join('%02x' % int(max(0, min(255, v))) for v in c)


def describe(path):
    a = np.asarray(Image.open(path).convert('RGBA')).astype(int)
    rgb, alpha = a[:, :, :3], a[:, :, 3]
    vessel = alpha > 40
    food = food_mask(rgb, alpha)
    ys, xs = np.where(vessel)
    fy, fx = np.where(food)
    if len(fy) < 200:
        food = vessel
        fy, fx = ys, xs
    vw = xs.max() - xs.min()
    centres, weights = palette(rgb[food])
    order = np.argsort(weights)[::-1]
    return {
        # Food width as a fraction of the vessel's, which is what decides
        # whether a dish reads as a heap or as a garnish on a wide plate.
        'spread': round(float((fx.max() - fx.min()) / max(vw, 1)), 3),
        # Where the food sits, as an offset from the vessel's centre.
        'offset': [
            round(float((fx.mean() - xs.mean()) / max(vw, 1)), 3),
            round(float((fy.mean() - ys.mean()) / max(vw, 1)), 3),
        ],
        'colors': [hexc(centres[i]) for i in order],
        'weights': [round(weights[i], 3) for i in order],
    }


if __name__ == '__main__':
    import glob
    import os
    out = {}
    for p in sorted(glob.glob('scripts/dish-assets/cutouts/dish-*.webp')):
        name = os.path.basename(p).replace('.webp', '')
        out[name] = describe(p)
        print(name, out[name])
    with open('src/assets/dishes/palettes.json', 'w') as f:
        json.dump(out, f, indent=1)
    print('\nwrote src/assets/dishes/palettes.json')
