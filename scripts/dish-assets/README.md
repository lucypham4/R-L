# dish-assets

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

## `soup.py` — one dish into stacked layers

```python
from soup import build
build('soup.webp', 'src/assets/dishes')
```

Writes `soup-base`, `-bread`, `-swirl`, `-chives`, `-almonds`, all cropped
to the same box so they stack in register.

Retuning it for a different photograph means the thresholds near the top
of `build()`. The one that is not obvious is the swirl: it is found by
local contrast, because a film of oil over orange soup is never green in
absolute terms.
