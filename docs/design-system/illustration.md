# Illustration

The onboarding tour has four art slots. Each one takes an animated dish
scene, a static image, or neither — in which case it renders a labelled
placeholder, so an unfinished slot looks intentional rather than broken.

All four currently hold the chef's own dish photographs, composited and
animated: a dessert, a squash soup assembling itself a component at a
time, the archive filling up, and a zucchini dish lifting.

## Swapping art in

`src/components/onboardingSteps.js` is the only file to touch.

```js
// An animated scene
art: { kind: 'scene', scene: 'soup', alt: 'A squash soup being assembled' }

// A static image
art: { kind: 'image', src: importedFile, alt: 'A plate of cacio e pepe' }
```

`scene` is one of the keys of `SCENES` in `SceneArt.jsx` — `dessert`,
`soup`, `archive`, `zucchini`. An unknown name falls back to `dessert`
rather than rendering an empty box, because a silently blank slot is a
confusing way to lose an hour.

## Why these are elements, not WebGL

An earlier pass built these scenes as three.js geometry, and a pass
before that as a Rive animation. Both were the wrong shape for what this
actually is: the chef's own photographs of their own plating.

- **Sharpness.** A photograph sampled onto a textured plane is softer
  than the same photograph in an `<img>`. These are the one thing in the
  app that should never look second-hand.
- **Cropping.** `object-fit: contain` inside a padded box cannot crop a
  dish. A camera frustum crops whatever falls outside it, which is
  exactly how the WebGL version lost the edges of its scenes.
- **Weight.** three.js is around 130KB gzipped plus a GL context that has
  to be disposed by hand on every step of the tour. The scene module is
  now about 3KB of JavaScript.

The photographs themselves are about 570KB, lazy-loaded with the tour.
That is the content, not overhead.

## Preparing an asset

`scripts/dish-assets/` holds the extraction. Photographs come in shot on
a dark backdrop or already cut out; what the scenes need is a
transparent PNG per element, with every layer of a multi-part scene
cropped to the **same box**, so they stack in register with no
positioning to get wrong.

### Cutting a dish off a dark backdrop

Not with a colour key. The plates are dark ceramic photographed on a dark
backdrop, so any threshold high enough to reject the background also eats
the plate rims — the first attempt produced fifteen dishes with arcs
bitten out of them.

Use **hysteresis**, the way edge detection does. A high threshold seeds
the regions that are unambiguously the dish (the food, which is bright),
then the mask grows through everything above a much lower threshold that
is still connected to a seed. A dark rim is only just above the backdrop,
but it touches the food, so it comes along; backdrop noise of the same
value touches nothing and is dropped.

Then erode a couple of pixels before feathering. The last pixels of the
matte are backdrop-coloured, and against a cream page they read as a dark
fringe around every plate.

### Splitting a dish into layers

The soup assembly needs the garnishes separated from the soup underneath.
Three garnishes needed three different detectors, because they are three
different kinds of thing:

| Element | Found by |
| --- | --- |
| Chives | Absolute colour. They sit on the surface and are genuinely green. |
| Almonds | Luminance. Pale and desaturated against saturated orange. |
| Scallion oil | **Local** contrast. |

The oil is the interesting one. It is a thin film over orange soup, so it
is never green in absolute terms — only greener than the soup immediately
around it. An absolute colour test finds nothing at all. Subtracting a
heavily blurred copy of the image leaves the ridge, which is what a
top-hat filter is for, and the spiral comes out cleanly.

Then the base layer has to have all three painted out, and two different
holes need two different fills:

- **Thin marks** (the garnish) fill by normalised convolution — blur the
  image and the keep-mask together, divide one by the other, and the hole
  averages what surrounds it.
- **Craters** (the region the bread was covering, roughly 500px across)
  do not. No blur wide enough to span that stays numerically stable; the
  weights underflow in the middle and the fill comes back an arbitrary
  colour, which showed up as a brown smear across the plate. Fill by
  nearest valid pixel instead, then smooth.

Two things that cost a rebuild each:

**Dilate a mask hard before excluding it as a fill source.** A threshold
finds the bread's core; just outside it sits a rim of shadow and soft
edge that is still bread-coloured. Filling from there put the warm smear
back. 30px of clearance took the share of genuinely-plate source pixels
from 9% to 76%.

**Constrain a reconstructed shape to the real object.** The plate needed
a 120px morphological closing to bridge the bite the bread took out of
its rim — but that also bulged it outward wherever the bread sat proud of
the plate, hanging a dark slab off the side of the first beat.
Intersecting with the original silhouette is the fix.

## Writing a scene

Scenes live in `SceneArt.jsx` as small components, with their motion in
`SceneArt.css`.

**Stacked layers share one duration.** Every layer of the soup runs an
11-second animation; each one's timing is written into its keyframe
percentages rather than into a delay. Five different durations with five
different delays drift out of step within a couple of loops.

**Size absolutely positioned layers outright.** Setting all four offsets
stretches a `div` to fit, but an `<img>` is a replaced element: with
`width: auto` it takes its intrinsic size and hands the leftover space to
its margins. A 900px source rendered at 900px and overhung the stage by
650. Give the box an explicit `width`/`height` and let `object-fit`
letterbox inside it. Percentage `max-width`/`max-height` resolve against
the stage rather than the inset box, so they also have to go.

**Use `minmax(0, 1fr)` for grid tracks.** A bare `1fr` has an automatic
minimum of its content's size, so one tall dish pushes its row past its
share and the bottom row overhangs.

**Leave headroom for the motion.** The stage carries 8% padding, measured
against the largest excursion any scene makes — the almonds dropping in
at `translateY(-4%) scale(1.04)`. At 4% they overhung by 17px and the art
box's `overflow: hidden` took a bite out of them.

## Prototyping

You do not need the app running, and you shouldn't — clicking through the
tour to the right step on every reload is slow. A scene is an HTML file:
drop the layers into a page, write the keyframes, and refresh.

When it looks right, move the markup into a component in `SceneArt.jsx`
and the keyframes into `SceneArt.css`.

If a scene ever genuinely needs depth — parallax on a moving camera, an
object rotating in three dimensions — that is the point at which WebGL
earns its weight back, and the history above is worth reading first.

## Verifying a scene actually moves

Motion that silently stops moving still passes a screenshot diff, and the
previous Rive illustration shipped in exactly that state — the timelines
existed, were named correctly, and contained no keyframes, so the cat
never moved.

`tests/onboarding-scenes.spec.js` takes two screenshots a beat apart and
compares them. It also asserts what the WebGL version got wrong: that no
layer escapes its stage at any point in its animation, sampled repeatedly
because the peak of a drop or a scale is transient and a single reading
lands between them.

One flake worth knowing about: the archive rewrites its slots' `src`
several times a second, so an image is briefly not `complete` while the
next one decodes. Poll that assertion rather than reading it once.
