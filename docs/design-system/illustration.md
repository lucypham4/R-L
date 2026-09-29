# Illustration & 3D

The onboarding tour has four art slots. Each one takes an animated 3D
scene, a static image, or neither — in which case it renders a labelled
placeholder with the size it wants, so an unfinished slot looks
intentional rather than broken.

All four currently hold 3D scenes: a plate, a bowl, a ring of plates, and
a plate lifting away from a stack.

## Swapping art in

`src/components/onboardingSteps.js` is the only file to touch.

```js
// A 3D scene
art: { kind: 'scene', scene: 'plate', alt: 'A plated dish turning slowly' }

// A static image
art: { kind: 'image', src: importedFile, alt: 'A plate of cacio e pepe' }
```

`scene` is one of the names in `src/lib/dishScene.js` — `plate`, `bowl`,
`archive`, `share`. An unknown name falls back to `plate` rather than
rendering an empty canvas, because a silently blank box is a confusing
way to lose an hour.

Leave `art` off entirely and the step falls back to its placeholder.

`ratio` controls the slot's aspect ratio. The scenes are objects on empty
ground rather than wide vistas, so they use `4 / 3` — a 16:9 box bounds
them by height and strands them in side whitespace.

## Why the scenes are built from code, not model files

`src/lib/dishScene.js` builds its plates and food out of three.js
geometry rather than loading a `.glb`. Three reasons, in order of how
much they matter:

1. **Nothing to fetch.** The previous Rive illustration had to be rescued
   from a CDN dependency that failed silently inside the Capacitor iOS
   shell with no network. Geometry built in JS can't fail that way.
2. **Weight.** The scenes cost a few hundred bytes of code on top of
   three.js itself. A sculpted plate with a baked texture is a few
   hundred kilobytes, per scene.
3. **Theme.** The shapes read their colours from the app's own CSS
   tokens, so they follow light and dark. A baked model is one palette
   forever, and looks wrong in the other theme.

The trade is that a plate here is a profile curve, not something modelled
by hand. When a scene needs more than that, see **Bringing in a sculpted
model** below.

## How the pieces fit

| File | Job |
| --- | --- |
| `src/lib/dishScene.js` | The scenes. No React, no DOM beyond the canvas. |
| `src/components/SceneArt.jsx` | Owns the canvas element's lifetime and the two reasons to stop drawing. |
| `src/components/OnboardingArt.jsx` | Picks scene, image or placeholder. Lazy-loads the first. |

three.js is around 130KB gzipped and the only thing using it is a tour
each chef sees once, so `SceneArt` is loaded with `React.lazy` and stays
off the first load of the gallery — the screen chefs actually open every
day.

### Two rules that aren't optional

**Dispose on unmount.** three keeps geometries, materials and the GL
context off the JS heap, so letting a canvas go out of scope leaks GPU
memory. Browsers cap how many live contexts a page may have (commonly
16), and the tour creates a new one on every step. `mountDishScene`
returns a `dispose()` that walks the scene and frees everything;
`SceneArt` calls it in its effect cleanup.

**Stop drawing when nothing is watching.** A render loop that keeps
running in a background tab is a battery cost with nothing to show for
it. `SceneArt` pauses on `visibilitychange`, and on
`prefers-reduced-motion`.

### Reduced motion

A three.js loop is movement the CSS tokens in `tokens.css` can't reach,
so the preference is honoured in JS instead, via `src/lib/motion.js`.
The scene still renders — it is held on its first frame. Removing the
illustration entirely would be a worse answer than holding it still: the
point is to lose the motion, not the picture.

## Tuning the existing scenes

Everything worth changing is a number near the top of a scene function in
`dishScene.js`.

| Want | Change |
| --- | --- |
| More or less food | `food:` count in the `plated()` call |
| Food clustered tighter | `spread` in `foodCluster` |
| A deeper bowl | `rimHeight` and `depth` in `ceramicGeometry` |
| Slower rotation | the multiplier on `t` in that scene's `update` |
| Different food colours | `colours.food` in `mountDishScene` |
| Camera closer | `camera.position` in `mountDishScene` |

Two things were tuned by trial and are worth not undoing:

**Food density and facet count.** The first pass scattered undivided
icosahedra evenly across the plate and it read as gravel, or as scattered
gems. What fixed it was subdividing once (so the lumps are rounder) while
keeping `flatShading` (so they stay illustrations rather than a failed
attempt at a photograph), and biasing placement into a mound with a
minority of pieces allowed to stray. Real plating is a mound with a few
things fallen away from it, never an even sprinkle.

**The food palette is not `--color-accent`.** That red is a signal
colour sized for a button. At this scale on a pale plate it reads as
plastic. The food colours are cooked-food colours — herb, olive,
terracotta, cream, mushroom, and a beet red dark enough to look edible.

**Ceramic colour flips on theme.** `--color-surface` is right in light: a
plate a shade off the paper. In dark it is `#211f1c` against a `#141311`
background, and a plate that close to the page disappears — the scene
becomes food floating in a void. Dark takes `--color-line-strong`
instead, so the ceramic stands *off* the page. The choice is made from
the background's luminance rather than a `data-theme` attribute, because
the theme can also come from the OS preference.

## Prototyping a new scene

You do not need the app running to work on a scene, and you shouldn't —
the edit-reload loop through the tour is slow and you have to click
through to the right step every time.

### The fastest loop: a scratch HTML page

Three.js runs from a single script tag. Make a file anywhere, open it in
a browser, and iterate:

```html
<!doctype html>
<meta charset="utf-8" />
<body style="margin:0;background:#faf9f6">
<script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.186/build/three.module.js",
                 "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186/examples/jsm/" } }
</script>
<script type="module">
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 1.85, 3.1);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(innerWidth, innerHeight);
  document.body.append(renderer.domElement);
  new OrbitControls(camera, renderer.domElement);   // drag to find the angle

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-2.4, 4, 2.6);
  scene.add(key);

  // ---- your scene here ----
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: '#8a9a63', flatShading: true, roughness: 0.88 })
  );
  scene.add(mesh);

  renderer.setAnimationLoop((ms) => {
    mesh.rotation.y = ms / 4000;
    renderer.render(scene, camera);
  });
</script>
```

`OrbitControls` is the thing to add first. Drag until the composition
looks right, then read `camera.position` out of the console and paste
those numbers into the scene. Finding a camera angle by editing numbers
and reloading is miserable; finding it by dragging takes seconds.

When it looks right, move the scene body into a new function in `SCENES`
in `dishScene.js`, returning `{ root, update(t) }`, and add its name to a
step in `onboardingSteps.js`.

### Tools worth knowing about

**[three.js editor](https://threejs.org/editor/)** — official, free, in
the browser. Build a scene by hand, then *File → Export Object* to get a
`.json` or a `.glb`. Good for arranging and lighting, less good for
modelling shapes.

**[Spline](https://spline.design)** — the friendliest of these by a wide
margin if you're coming from Figma. Drag-and-drop 3D with real materials
and simple interactions, and it exports `.glb`. The free tier is enough
to prototype. Its own runtime is heavy — export the model and render it
with three.js rather than shipping Spline's player.

**[Blender](https://blender.org)** — free, no limits, and what you'd use
to actually sculpt a plate of food rather than approximate one. The
learning curve is real. If you go here, the only thing you need to learn
first is *File → Export → glTF 2.0 (.glb)*.

**[Poly Haven](https://polyhaven.com)** and **[Sketchfab](https://sketchfab.com)**
— existing models, much of it CC0. Faster than modelling, but check the
licence and the polygon count before shipping one in a phone app.

### Bringing in a sculpted model

When a scene outgrows procedural geometry, a `.glb` drops in without
disturbing anything above:

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import dishUrl from '../assets/scenes/dish.glb?url';

const gltf = await new GLTFLoader().loadAsync(dishUrl);
root.add(gltf.scene);
```

Four things to get right before shipping one:

1. **Compress it.** Run it through
   [gltf-transform](https://gltf-transform.dev) — `gltf-transform optimize
   in.glb out.glb` typically takes a model to a fraction of its size.
   An uncompressed export is routinely 10MB.
2. **Bundle it, don't fetch it.** Import it so Vite fingerprints and
   copies it, exactly as above. A URL pointing at someone else's CDN is
   how the Rive illustration ended up broken offline.
3. **Keep the theme working.** A baked texture won't follow light and
   dark. Either replace the material after load
   (`gltf.scene.traverse(...)`, setting colours from tokens as the
   procedural scenes do) or accept that the model looks the same in both.
4. **Check it on a phone.** A model that's fine on a laptop can drop a
   phone to single-digit frame rates. `npm run preview:capture` records
   the tour, so you can watch it back rather than guess.

## Verifying a scene actually moves

Motion that silently stops moving still passes a screenshot diff, and the
previous Rive illustration shipped in exactly that state — the timelines
existed, were named correctly, and contained no keyframes, so the cat
never moved.

Note that **reading pixels back off a WebGL canvas from JS does not
work** for this. The drawing buffer is cleared after compositing unless
`preserveDrawingBuffer: true`, so `drawImage(canvas)` outside the render
loop returns a blank image and every scene looks broken whether or not it
is. Take two screenshots through the browser's compositor instead and
compare them — `tests/onboarding-scenes.spec.js` does this, and asserts
both that the scenes move and that reduced motion holds them still.
