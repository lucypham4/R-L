# Illustration

The onboarding tour has four art slots. Each takes an animated dish
scene, a static image, or neither — in which case it renders a labelled
placeholder, so an unfinished slot looks intentional rather than broken.

All four currently hold the chef's dishes, rebuilt as 3D geometry: a
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

## Everything is geometry

`src/lib/dishFood.js` is a kit of food shapes and `dishScene.js` plates
them. A quenelle is lofted from a rounded-triangle cross-section — two
spoon faces meeting in a ridge, and a flat face to sit on — because an
ellipsoid has no faces and reads as a dumpling. A blackberry is a cluster
of drupelets, which is what makes it read as a blackberry rather than as
a dark marble. The scallion oil is a tube swept along an Archimedean
spiral. Toast is extruded from an outline, because its silhouette is the
whole thing.

Nothing is textured, and the tour ships **no images at all** — only
`palettes.json`, a few hundred bytes.

### Surfaces are procedural

Geometry gets a piece's silhouette right; what a flat colour cannot give
it is the surface. `src/lib/dishMaterials.js` writes those in TSL (see
the `webgpu-threejs-tsl` skill in `.claude/skills/`):

- **Toast** — Worley noise at two scales for the air pockets in the
  crumb, fractal noise for uneven browning, charred patches on the crust.
  Face and crust are one material, told apart by which way the surface
  faces, so there is no seam.
- **Ice cream** — noise stretched along the quenelle's length for the
  spoon's drag lines, fine Worley dimpling for ice crystals, and sheen for
  the soft bloom cold cream has at a grazing angle.
- **Soup** — faint swirl ridges spiralling out from the centre, kept
  subtle so the oil stays the spiral the eye follows.

Every pattern is keyed to the piece's own space (`positionLocal`), so it
turns with the food. Keyed to world space it would slide across the
surface as the dish rotated.

Relief comes from `proceduralBump()` rather than three's `bumpMap()`.
`bumpMap()` finds a height's slope by re-sampling a *texture* at nudged
UVs; a noise function ignores UVs, so the slope comes out zero and the
bump silently disappears.

### The renderer

`WebGPURenderer`, which uses WebGPU where the browser has it and falls
back to WebGL 2 where it does not — older iOS, and WebViews that have
not enabled it. Node materials compile to either. Two consequences:

- It initialises asynchronously, so `mountDishScene` draws nothing until
  `renderer.init()` resolves.
- `three/webgpu` is heavier than `three`: the tour's lazy chunk is about
  260KB gzipped against 147KB before. It still loads only when the tour
  opens, never with the gallery.

### Why not the photographs

Two earlier passes tried. Compositing them as elements is sharp and
cheap, but they are pictures of dishes rather than dishes. Projecting
them onto the geometry reads well from the angle the photograph was taken
at and falls apart either side of it, because a picture of food has no
silhouette of its own — so those scenes could only turn through a few
degrees before the flatness showed.

Built food can be lit, can cast shadows on the plate under it, and can be
looked at from anywhere.

The photographs remain the reference:

- **Colours** are sampled from them by `scripts/dish-assets/palettes.py`.
  Where a sampled mean sat in shadow, `FOOD` in `dishScene.js` uses the
  lit quartile instead — a mean taken across a photograph's own shading
  is darker than the thing itself.
- **Proportions** are measured off them. The toast is 0.71 of the soup
  surface across; getting that wrong by reading it against the radius
  rather than the diameter produced a slab longer than the plate.
- **The camera** sits at 55 degrees of elevation, which is what the
  dishes were consistently shot from — measured from the ellipse a
  circular plate projects to.

## Writing a scene

Scenes live in `SCENES` in `dishScene.js`, each returning
`{ root, update(t), frame }`.

**`frame` is the camera distance multiplier**, and each scene needs its
own. A single dish and a nine-dish grid framed identically either crop
the grid or strand the dish in whitespace.

**Set food down, don't float it.** `vessel()` returns a `floorAt(radius)`
alongside the meshes, so a berry can be placed on the curve of the bowl
rather than at a guessed height.

**Seed the randomness.** `seeded()` in `dishFood.js` gives a dish the same
scatter every time the tour opens, rather than re-plating itself on each
mount.

**Build variants once and hide them.** The archive riffles through fifteen
heaps by flipping `visible`, not by rebuilding meshes five times a second.

**Bake what has settled.** Built food is hundreds of small meshes, and
each is a draw call — twice, with shadows. Once a group's pieces are
placed, `bake()` merges them into one mesh per surface. It leaves node
materials alone: they pattern themselves in their own local space, which
merging would move.

**Compose for the widest moment.** A rotation's widest silhouette is
transient, and a camera crops it silently.

**Dispose is not optional.** Three keeps geometries, materials and the GL
context off the JS heap; browsers cap how many live contexts a page may
have, and the tour creates a new one on every step.

## Prototyping

Three.js runs from a single script tag via an import map, so a scene can
be built in a scratch HTML file and refreshed, without clicking through
the tour to the right step every time.

Add `OrbitControls` first. Drag until the composition looks right, read
`camera.position` out of the console, and paste those numbers in.

If a dish ever outgrows primitives, a `.glb` drops in via `GLTFLoader`.
Compress it with [gltf-transform](https://gltf-transform.dev), import it
so Vite fingerprints and bundles it rather than fetching from a CDN, and
check it on a phone.

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

The suite renders the scenes at 1x. Headless Chromium has no GPU, and on
SwiftShader the renderer's multisampled antialiasing makes a 2x frame
take seconds. Nothing the suite asserts depends on resolution, and on a
phone's GPU the antialiasing is close to free, so the app keeps it.

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
