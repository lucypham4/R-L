# scripts

## `capture-preview.mjs`

Records the app's motion as video, so a change to a transition can be
reviewed by watching it rather than by reading a diff. Screenshots can't
show a focus pull, and a test that asserts one still doesn't tell you
whether it *looks* right.

```sh
npm run build
npm run preview -- --port 4173 --strictPort &
npm run preview:capture -- preview-out
```

Writes one `.webm` per scene to the output directory, plus stills:

| Scene | What it shows |
| --- | --- |
| `1-open` | Opening a dish; the gallery blurs and recedes behind it. |
| `2-step` | Stepping between dishes: the name cross-dissolving in place, the body focus-pulling. |
| `3-step-reduced` | The same step under `prefers-reduced-motion: reduce`. |
| `4-sheet` | The sheet under a real touch drag: a short pull settling back, a longer one settling open, on into the recipe as the header collapses, then all the way back down. |
| `5-sheet-reduced` | The same drags under reduced motion, where the travelling pieces swap between rests instead. |
| `6-swipe` | Swiping between dishes: a short drag that settles back, one past a third of the way that moves on, and back again. |
| `still-sheet-open.png`, `still-sheet-collapsed.png` | The sheet's other two rests. |
| `still-mid-dissolve.png` | Frozen mid-transition, with both titles up at once. |

To get something playable outside a browser:

```sh
ffmpeg -i 2-step.webm -vf format=yuv420p -c:v libx264 -crf 20 2-step.mp4
```

Build with `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET`
set to anything, or the unconfigured-Cloudinary banner sits across the top
of every frame.

### The plates

`preview-assets/*.png` are generated stand-ins, not photographs — a pale
plate and a few arranged shapes. They exist so each dish is visually
distinct enough that a transition between two of them is legible. Don't
put real client photography in here; it ends up in the repo forever.
