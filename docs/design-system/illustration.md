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

### Painted like toys

The reference for the food is a low-poly cake slice from a "tiny treats"
set: no lighting at all, every part coloured by a soft
gradient — lighter where it faces up, deeper where it turns away — so
form reads from colour alone. `src/lib/dishMaterials.js` does the same:

- **`toy(colour)`** — an unlit material whose colour runs between a lifted
  and a deepened version of the sampled colour, weighted by how much the
  surface faces the key light. The ends are shifted in HSL, not lerped
  toward white, which would wash every colour grey.
- **Ice cream, toast, soup** — the same idea with a gradient of their own:
  the quenelle warms from butter at the ridge to peach at the base; the
  toast's face is paler at its middle inside a darker crust; the soup is
  brightest at its centre.

The food is unlit, but the ceramic is not, so the food still casts
shadows onto it — which is what sits it in the bowl rather than on top
of the picture. The shading direction matches the key light so the two
agree.

An earlier pass went the other way — pitted crumb from Worley noise,
spoon drag as bump — which was the wrong direction for this look, and
also the expensive one.

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

**Nothing moves in clumps.** The soup's timeline is the model: the
empty bowl and plate first, then soup ladled in until it fills, the toast
set down beside the bowl, the oil squeezed on from a bottle as a spiral
drawn from the centre out, then the chives sprinkled on piece by piece,
then the almonds. Every chive and flake is an instance of one
`InstancedMesh` with its own start time, fall and tumble — they must not
arrive as a group.

**Keep things out of each other.** The toast's resting place is computed
from its own vertices: pushed out from the bowl until its nearest point
clears the bowl's rim, so it can drop straight down without passing
through the bowl.

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
- **Cycling**: the mean colour of each cell of a 4x4 grid over the frame
  keeps changing. Coverage does not work here — the heaps keep the same
  silhouettes — and neither does the whole frame's mean: one heap
  swapping moves it by a fraction of a unit, which rounds away.

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
