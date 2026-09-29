"""Cut objects off a near-uniform dark backdrop.

A single distance threshold does not work here: the plates are dark
ceramic photographed on a dark backdrop, so any threshold high enough to
reject the background also eats the plate rims, and the dishes come out
with arcs bitten off them.

Hysteresis fixes it the way it fixes edge detection. A high threshold
seeds regions that are unambiguously the dish (the food, which is bright),
then the mask is grown through everything above a much lower threshold
that is still connected to a seed. A dark rim is only just above the
backdrop, but it touches the food, so it comes along; backdrop noise of
the same value does not touch anything and is dropped.
"""
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage


def cut(path, high=90, low=8, min_area=4000, pad=8, erode=2, feather=1.2):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(int)
    corners = np.vstack([a[:20, :20].reshape(-1, 3), a[-20:, :20].reshape(-1, 3),
                         a[:20, -20:].reshape(-1, 3), a[-20:, -20:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    d = np.abs(a - bg).sum(axis=2)

    seeds = ndimage.binary_opening(d > high, np.ones((5, 5)))
    loose = ndimage.binary_opening(d > low, np.ones((3, 3)))
    lbl, n = ndimage.label(loose)
    keep = np.unique(lbl[seeds & (lbl > 0)])
    mask = np.isin(lbl, keep[keep > 0])
    mask = ndimage.binary_closing(mask, np.ones((11, 11)))
    mask = ndimage.binary_fill_holes(mask)

    lbl2, n2 = ndimage.label(mask)
    sizes = ndimage.sum(mask, lbl2, range(1, n2 + 1))
    out = []
    for i in range(n2):
        if sizes[i] < min_area:
            continue
        comp = ndimage.binary_erosion(lbl2 == (i + 1), np.ones((erode * 2 + 1, erode * 2 + 1)))
        if not comp.any():
            continue
        ys, xs = np.where(comp)
        x0, x1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad + 1)
        y0, y1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad + 1)
        alpha = Image.fromarray((comp[y0:y1, x0:x1] * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(feather))
        piece = im.crop((x0, y0, x1, y1)).convert('RGBA')
        piece.putalpha(alpha)
        out.append((piece, int(sizes[i]), (x0, y0)))
    return out
