"""Turn a photograph of a dish into a texture that can be mapped onto 3D
geometry.

The dishes were all shot from the same sort of elevation, so a circular
plate lands in the frame as an ellipse. Measuring that ellipse gives two
things: the camera elevation the photograph was taken at (about 55
degrees, consistently), and the stretch needed to put the plate back to a
circle.

A circle is what the geometry wants. The scenes build each vessel as a
lathe and project this texture straight down onto its inner surface, so
the photograph lands back on the shape it was taken off -- which is what
makes the dish read as an object rather than as a picture of one.
"""
from PIL import Image
import numpy as np


def ellipse_of(alpha):
    """Centre and semi-axes of the ellipse a silhouette is equivalent to."""
    ys, xs = np.where(alpha > 40)
    cy, cx = ys.mean(), xs.mean()
    ev, _ = np.linalg.eigh(np.cov(np.stack([xs - cx, ys - cy])))
    return cx, cy, 2 * np.sqrt(ev[1]), 2 * np.sqrt(ev[0])  # major, minor


def top_down(path, out, size=512, pad=1.02, ellipse=None):
    """Stretch a dish back to circular and crop it square.

    `ellipse` overrides the measured one, for layers that have to share
    the geometry of another layer -- a scatter of chives has no silhouette
    worth fitting, but it has to land on the soup surface that does.

    Returns (foreshortening, elevation_degrees) so the scene can point its
    camera where the photographer was standing.
    """
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im)
    cx, cy, major, minor = ellipse if ellipse else ellipse_of(a[:, :, 3])
    foreshortening = minor / major

    # Stretching vertically about the ellipse's centre is all the
    # un-projection a circle needs.
    scale = major / minor
    tall = im.resize((im.width, round(im.height * scale)), Image.LANCZOS)
    cy_t = cy * scale

    r = major * pad
    box = (round(cx - r), round(cy_t - r), round(cx + r), round(cy_t + r))
    sq = Image.new('RGBA', (box[2] - box[0], box[3] - box[1]), (0, 0, 0, 0))
    # Paste with an explicit offset so a box running off the source edge
    # lands in the right place rather than being clamped.
    sq.paste(tall.crop(box), (0, 0))
    sq.resize((size, size), Image.LANCZOS).save(out)
    return foreshortening, float(np.degrees(np.arcsin(min(1.0, foreshortening))))


def surface_ellipse(path, warm=60, bright=70):
    """The ellipse of a soup's surface -- the saturated region inside the
    bowl, rather than the whole dish's silhouette."""
    from scipy import ndimage
    a = np.asarray(Image.open(path).convert('RGBA')).astype(int)
    rgb, al = a[:, :, :3], a[:, :, 3]
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    m = (al > 40) & (r - b > warm) & (lum > bright)
    lbl, n = ndimage.label(m)
    sizes = ndimage.sum(m, lbl, range(1, n + 1))
    big = lbl == (np.argmax(sizes) + 1)
    ys, xs = np.where(big)
    return xs.mean(), ys.mean(), (xs.max() - xs.min()) / 2, (ys.max() - ys.min()) / 2
