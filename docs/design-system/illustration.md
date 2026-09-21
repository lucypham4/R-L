# Illustration & Rive

The onboarding tour has four art slots. Each one takes an animated Rive
artboard, a static image, or neither — in which case it renders a labelled
placeholder with the size it wants, so an unfinished slot looks
intentional rather than broken.

## Swapping art in

`src/components/onboardingSteps.js` is the only file to touch. Give a step
an `art` entry:

```js
// Static
art: { kind: 'image', src: importedFile, alt: 'A plate of cacio e pepe' }

// Animated
art: {
  kind: 'rive',
  src: catCookRiv,
  artboard: 'Artboard 1',
  stateMachine: 'State Machine 1',
  alt: 'A cat cooking at a stove',
}
```

Leave `art` off entirely and the step falls back to its placeholder,
still showing `artLabel` and `artHint`.

`ratio` controls the slot's aspect ratio. Match it to the art: a character
on empty ground wants something close to square, a scene wants 16:9. The
cover slot uses `4 / 3` because the cat is bounded by height in a wider
box and ends up stranded in side whitespace.

## Rive specifics

Files live in `src/assets/rive/`. `vite.config.js` lists `**/*.riv` under
`assetsInclude`, without which Vite tries to parse the binary as source.

**`artboard` and `stateMachine` must match the names inside the `.riv`
exactly.** Get them wrong and Rive renders nothing and reports nothing —
it fails silently, which is a confusing way to lose an hour. To read the
names out of a file without opening the Rive editor:

```bash
strings -n 5 src/assets/rive/cat-cook.riv | tail -20
```

Artboard, state machine, layer and animation names appear near the end.

### The WASM is self-hosted on purpose

The Rive runtime fetches its WebAssembly renderer from jsDelivr by
default. That quietly turns a local-first app into one that needs a
third-party CDN: the animation simply never appears when the fetch fails,
and it fails permanently inside the Capacitor iOS shell with no network.

`src/components/RiveArt.jsx` therefore points both the primary and
fallback URLs at bundled copies from `@rive-app/canvas` (which is an
explicit dependency for exactly this reason, not just a transitive one).
Two files, because the runtime picks the SIMD build where it can and the
fallback where it can't; self-hosting only the first would send older
browsers back to the CDN.

The trade-off is about 2MB of `.wasm` in `dist/`, fetched only when a Rive
slot actually renders.

### It's code-split

The runtime costs roughly 63KB gzipped of JavaScript on top of the WASM,
for a tour each chef sees once. `OnboardingArt.jsx` pulls `RiveArt.jsx` in
with `React.lazy`, keeping all of it off the first load of the gallery —
the screen chefs actually open every day. The Suspense fallback is an
empty box of the same aspect ratio so the card doesn't reflow when the
chunk lands.

### Reduced motion

`RiveArt.jsx` pauses the state machine when the chef has asked for reduced
motion, holding the illustration on its first frame. The artwork still
shows; it just stops looping. CSS tokens can't reach inside a Rive canvas,
so this has to be handled in JS — see `docs/design-system/motion.md`.

## Dark mode

Rive artwork carries baked-in colours and won't adapt to the theme. Check
new art against both themes before committing. The cat works in both
because it's a white fill with a dark outline, so it reads as a silhouette
on the dark background — line art with no fill would largely disappear.

For a piece that can't work in both, the slot takes a `kind: 'image'`
entry, and a `<picture>` element with a `prefers-color-scheme` source is
the usual way to ship two versions.
