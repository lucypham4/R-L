# Illustration

The onboarding tour has four art slots. Each takes an animated dish
scene, a static image, or neither — in which case it renders a labelled
placeholder, so an unfinished slot looks intentional rather than broken.

All four currently hold the chef's own dishes, rebuilt as 3D objects: a
dessert, a squash soup assembling itself a component at a time, the
archive filling up, and a zucchini dish lifting.

## Swapping art in

`src/components/onboardingSteps.js` is the only file to touch.

```js
art: { kind: 'scene', scene: 'soup', alt: 'A squash soup being assembled' }
art: { kind: 'image', src: importedFile, alt: 'A plate of cacio e pepe' }
```

`scene` is one of the keys of `SCENES` in `src/lib/dishScene.js` —
`dessert`, `soup`, `archive`, `zucchini`. An unknown name falls back to
`dessert` rather than rendering an empty canvas, because a silently blank
slot is a confusing way to lose an hour.

## How a photograph becomes a 3D dish

Each vessel is a **lathe** — a profile curve spun around its axis — and
the photograph is projected straight down onto its inner surface.

That works because of how the dishes were shot. A circular plate
photographed from elevation lands in frame as an ellipse, and the ratio
of that ellipse's axes is the cosine of the camera's elevation.
Measuring it across all seventeen photographs gives a consistent **55
degrees**, and stretching the ellipse back to a circle recovers the
top-down view. `scripts/dish-assets/topdown.py` does the stretching and
reports the angle; `dishScene.js` puts its camera at that same angle, so
a dish at rest matches the photograph it came from and every rotation
moves away from a pose that is already correct.

The result is a real object. It has a silhouette that changes as it
turns, it catches the key light along its rim, and it drops a shadow.

What it is *not* is a reconstruction of the food, which stays a
photograph lying on the surface. That sets the honest limit: the scenes
turn the dishes through tens of degrees, not hundreds. Past that the
flatness shows.

### Two things about the mapping

**Lathe UVs have to be replaced.** A `LatheGeometry`'s own UVs run
around-and-along the profile, which wraps the photograph around the bowl
like a label on a tin. `projectFromAbove()` overwrites them with a planar
projection down the axis.

**A `CircleGeometry`'s UVs are already right**, because a planar
projection from above is exactly what they are. The garnish discs use
them untouched.

## Preparing an asset

`scripts/dish-assets/` holds the extraction.

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

Then erode a couple of pixels before feathering, or the last of the matte
is backdrop-coloured and reads as a dark fringe against a cream page.

### Splitting a dish into layers

The soup assembly needs its garnishes separated from the soup beneath.
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
heavily blurred copy leaves the ridge, which is what a top-hat filter is
for, and the spiral comes out cleanly.

Painting the garnish out for the first beat then needs two different
fills, because thin marks and large craters fail differently:

- **Thin marks** fill by normalised convolution — blur the image and the
  keep-mask together and divide, and the hole averages what surrounds it.
- **Craters** do not. No blur wide enough to span 500px stays numerically
  stable; the weights underflow in the middle and the fill comes back an
  arbitrary colour, which arrived as a brown smear across the plate. Fill
  by nearest valid pixel instead, then smooth.

Two more, each of which cost a rebuild:

**Dilate a mask hard before excluding it as a fill source.** A threshold
finds the bread's core; just outside sits a rim of shadow and soft edge
that is still bread-coloured. Filling from there put the smear back. 30px
of clearance took the share of genuinely-plate source pixels from 9% to
76%.

**Constrain a reconstructed shape to the real object.** The plate needed
a 120px closing to bridge the bite the bread took out of its rim, but
that also bulged it outward wherever the bread sat proud of the plate,
hanging a dark slab off the side. Intersecting with the original
silhouette fixes it.

**Mask a surface tighter than its fitted ellipse.** The soup's own
ellipse catches the bowl's inner wall at its edge, and on a flat disc
that renders as a dark picket fence around the soup. 94% of the fitted
radius is clean.

## Writing a scene

Scenes live in `SCENES` in `dishScene.js`, each returning
`{ root, update(t), frame }`.

**`frame` is the camera distance multiplier**, and each scene needs its
own. A single dish and a nine-dish grid framed identically either crops
the grid or strands the dish in whitespace.

**Compose for the widest moment, not the resting one.** A rotation's
widest silhouette is transient, and a camera crops it silently.

**Dispose is not optional.** Three keeps geometries, materials, textures
and the GL context off the JS heap; browsers cap how many live contexts a
page may have, and the tour creates a new one on every step.

## Prototyping

Three.js runs from a single script tag via an import map, so a scene can
be built in a scratch HTML file and refreshed, without clicking through
the tour to the right step every time.

Add `OrbitControls` first. Drag until the composition looks right, read
`camera.position` out of the console, and paste those numbers in. Finding
a camera angle by editing numbers and reloading is miserable; dragging
takes seconds.

Tools worth knowing, in order of how gentle the on-ramp is:
[Spline](https://spline.design) (friendliest if you come from Figma,
exports `.glb` — export the model, don't ship their runtime),
the [three.js editor](https://threejs.org/editor/) (good for arranging
and lighting), and [Blender](https://blender.org) (what you would use to
actually sculpt a plate; the only thing to learn first is
*File → Export → glTF 2.0*).

If a dish ever needs modelling rather than projecting, a `.glb` drops in
via `GLTFLoader`. Compress it with [gltf-transform](https://gltf-transform.dev),
import it so Vite fingerprints and bundles it rather than fetching from a
CDN, and check it on a phone.

## Verifying a scene actually moves

Motion that silently stops moving still passes a screenshot diff, and the
previous Rive illustration shipped in exactly that state — the timelines
existed, were named correctly, and contained no keyframes, so the cat
never moved.

`tests/onboarding-scenes.spec.js` does all of it in pixels, because
there is no DOM to measure inside a canvas:

- **Moving**: two screenshots a beat apart differ.
- **Not cropped**: no non-background pixel touches the border of the art
  box, sampled repeatedly since the widest moment of a rotation is
  transient.
- **Assembling**: the count of green pixels over one soup cycle both
  rises and falls. Baked into one texture it would never change; sharing
  one keyframe it would never be partial.
- **Cycling**: the archive's mean frame colour keeps changing. Coverage
  does not work here — nine dishes swapping textures keep the same
  silhouettes.

Two things that make this suite awkward, both worth keeping in mind
before adding to it. Screenshots are expensive, so one test taking forty
of them runs past the timeout once workers compete for the GPU — prefer
one test per scene. And wait for a scene to have *drawn* rather than
sleeping a fixed interval; a WebGL context takes noticeably longer to
come up under contention.

The suite also blocks webfonts. They were allowed through on the grounds
that they cost nothing, but Playwright's `screenshot()` waits for fonts
to settle, so a slow font host turned every pixel assertion into a
timeout.
