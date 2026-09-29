# dish-assets

Two stages. `cutouts/` holds the intermediate: each dish separated from
its backdrop, which is worth keeping so the top-down textures can be
regenerated at a different size without redoing the matte. Only
`src/assets/dishes/` ships.


How `src/assets/dishes/*.webp` were made. Kept so a new photograph can be
brought in the same way, and so the decisions behind the awkward bits are
not lost — see `docs/design-system/illustration.md` for the reasoning.

Needs `pillow`, `numpy` and `scipy`.

## `cutout.py` — a dish off a dark backdrop

```python
from cutout import cut
for i, (piece, area, pos) in enumerate(cut('gallery.webp'), 1):
    piece.thumbnail((320, 320))
    piece.save(f'dish-{i:02d}.webp', quality=88, method=6)
```

Hysteresis, not a single threshold: the plates are dark ceramic on a dark
backdrop, and any threshold that rejects the backdrop also eats the rims.

## What is no longer here

`palettes.py` reduced each gallery photograph to a spread and three
k-means colours, for an archive of generic heaps. The archive now models
each of the chef's dishes (`src/lib/dishMinis.js`), so the script and its
`palettes.json` are gone.

`topdown.py` un-projected a dish's foreshortened ellipse into a top-down
texture, back when the photographs were mapped onto the geometry. `soup.py`
split the soup into layers so those could be revealed one at a time. Both
are gone with the textures: the food is geometry now, so the photographs
are a colour reference rather than a source. `git log` has them if the
technique is ever wanted again.
