# Motion

Motion in Staj is deliberately quiet. The app is an archive someone
opens most days, and an animation that delights on the first viewing is an
obstacle by the fiftieth. The rule of thumb: motion earns its place when it
explains something — where a thing came from, that an action registered,
how far through a flow you are — and not otherwise.

## Tokens

Every moving thing reads from `src/styles/tokens.css`. Don't hard-code a
duration, easing curve or travel distance in a component stylesheet.

| Token | Value | Use |
| --- | --- | --- |
| `--ease` | `cubic-bezier(0.2, 0.7, 0.3, 1)` | Default. Colour and state changes. |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Entrances: things arriving on screen. |
| `--ease-spring` | `cubic-bezier(0.34, 1.4, 0.64, 1)` | Press release and anything that should feel physical. Slight overshoot. |
| `--dur-press` | `90ms` | Finger-tracking press feedback. |
| `--dur-color` | `200ms` | Colour, background, border. |
| `--dur-move` | `240ms` | Position and scale changes on existing elements. |
| `--dur-enter` | `380ms` | Entrances of newly mounted elements. |
| `--stagger-step` | `36ms` | Per-item delay in a list entrance. |
| `--ease-focus` | `cubic-bezier(0.45, 0, 0.55, 1)` | Symmetric. The focus pull and the cross-dissolve only. |
| `--press-scale` | `0.97` | How far a pressed control dips. |
| `--lift` | `-4px` | How far a hovered card rises. |
| `--rise` | `10px` | Travel distance for the `rise-in` entrance. |
| `--dur-defocus` | `70ms` | How fast content drops out of focus. |
| `--dur-refocus` | `350ms` | How slowly it comes back. |
| `--blur-defocus` | `4px` | How soft out-of-focus content goes. |
| `--opacity-defocus` | `0.55` | How dim it goes with it. |
| `--dur-dissolve` | `500ms` | One cross-dissolve, start to finish. |
| `--dof-blur` / `--dof-scale` / `--dof-opacity` | `6px` / `0.985` / `0.6` | How far a surface recedes behind something in focus. |

## Shared keyframes

Defined once in `src/styles/global.css`, because more than one component
uses each:

- `modal-fade` — opacity only, for scrims and overlays.
- `modal-rise` — the modal/sheet entrance.
- `rise-in` — the app's one entrance gesture: fade up over `--rise`.

Component-specific keyframes stay in that component's stylesheet
(`filter-sheet-rise`, `filter-dot-pop`, `dish-sheet-enter`).

A keyframe used by two components belongs in `global.css`. `modal-rise`
previously lived in `MealDetailModal.css` while `MealActionSheet.css` also
animated with it, so the action sheet only slid up as long as the bundler
happened to include the modal's stylesheet — the kind of bug that survives
review because it looks fine until someone code-splits.

## Reduced motion

`tokens.css` ends with a `prefers-reduced-motion: reduce` block that
**redefines the movement tokens** rather than blanket-disabling animation:

```css
--dur-press, --dur-move, --dur-enter, --stagger-step  ->  0ms
--press-scale, --dof-scale                             ->  1
--lift, --rise                                         ->  0px
--dur-dissolve, --dur-refocus                          ->  --dur-color
```

`--dur-color` deliberately survives. A colour cross-fade carries no
vestibular risk, and keeping it means hover and focus states stay legible
instead of snapping.

So does the blur. Softening and sharpening carry no vestibular risk — it's
the scaling and the sliding that do — so the focus pull and the depth of
field stay, and only `--dof-scale` flattens. What does change is the
*dwell*: with `--dur-dissolve` and `--dur-refocus` cut to `--dur-color`,
stepping between dishes still reads as a change without holding a reader
who asked for less motion in soft focus for the better part of a second.

The practical consequence: **a component written against these tokens is
reduced-motion correct for free**, with no per-component media query. Only
reach for an explicit `@media (prefers-reduced-motion: reduce)` when a
component needs to *substitute* one animation for another rather than
flatten it: for example, a sideways slide that would become invisible at
zero duration should become a plain cross-fade instead.

Motion driven from JavaScript can't read CSS tokens, so it asks
`src/lib/motion.js` instead — `prefersReducedMotion()`,
`onReducedMotionChange()`, `scrollToTop()` and `scrollElementTo()`, and
`tokenMs()` for a timer or Web Animation that has to last as long as a
token says. The public page's header uses it to jump between its rests
instead of travelling.

## Patterns in use

**Press feedback** (`.btn`, `.meal-card`, nav tabs, inline buttons). Scale
to `--press-scale` over `--dur-press`, spring back via `--ease-spring`.
This is the one piece of motion that appears nearly everywhere, because on
touch there's no hover state to confirm a tap landed.

**List entrance** (`Gallery.css`). Cards fade up in sequence, but only
inside a window right after the first cards render — `Gallery.jsx` drops
the `gallery-grid-intro` class once it closes. Without that gate the
cascade replays on every search keystroke, since filtering remounts the
surviving cards. Delay is capped at `STAGGER_CAP` items so a 200-meal
archive still finishes in about a second.

**Step transitions** (add-meal wizard). The incoming panel
animates; there's no paired exit. A proper cross-fade needs both panels
absolutely positioned and a fixed container height, which the wizard
doesn't have — its steps hold deliberately different amounts of content.

**Progress** (add-meal wizard). `scaleX` on a fixed-width track, not an
animated `width`, so growth is composited instead of triggering layout.

**Stepping between dishes** (`MealDetailModal`). The one place the app
spends real time on a transition, because it's the one place where the
transition carries the meaning: you are moving along a shelf, and the
dishes either side are part of the archive you're reading.

Three things happen at once, and the layering is the point — only one
thing is ever sharp, so the eye is never asked to choose:

1. *The name cross-dissolves in place.* Outgoing and incoming overlap for
   the full `--dur-dissolve`, absolutely positioned on the same baseline,
   neither moving. Half-way through both are legible at once. That overlap
   is the effect; fading one out and then the other in reads as a glitch
   instead.
2. *Everything below focus-pulls.* The block arrives at `--blur-defocus`,
   holds there while the name resolves, then comes into focus over
   `--dur-refocus`. The asymmetry is deliberate and measured: focus is lost
   almost instantly and regained slowly. Losing it fast says *stop reading
   this*; regaining it slowly says *start reading here*.
3. *The photo slides along the shelf.* It's the thing under your finger
   when you swipe, so it goes where the finger takes it, and a step taken
   any other way moves it the same way. See below.

The name is on screen twice — large over the resting sheet, small in the
header — and both copies dissolve together, so the step reads the same
whichever state the sheet is in.

**Swiping between dishes** (`MealDetailModal`, `src/lib/dishSwipe.js`). A
horizontal drag carries the photo sideways under the finger while the
neighbour's photo comes in from the side you're heading, a photo-width and
a gap behind it. The text below drops out of focus over `--dur-defocus` as
soon as the drag is recognised. Let go past a third of the way
(`COMMIT_FRACTION`), or with a flick (`FLING_VELOCITY`), and the step
finishes: the two photos carry on over `--dur-move` while the name
dissolves and the new text focus-pulls in. Short of that, both photos
settle back on `--ease-spring` and the text comes back over
`--dur-refocus` — lost fast, regained slowly, as in the focus pull.

- *One way dishes move.* The step arrows and the arrow keys take the same
  slide as a swipe, just from a standing start, so the shelf has one
  direction whichever way you ask to move along it.
- *The ends resist.* Past the first or last dish the drag follows the
  finger less and less (`rubberBand`) instead of stopping dead, which
  reads as "that's the end" rather than as the app not listening.
- *A pause cancels a flick.* Velocity is measured at release, and a finger
  that stopped before lifting has none: it was placed, not thrown.
- *Collapsed, the photo stays put.* It's a thumbnail in the header there,
  and a thumbnail sliding off the side reads as the header breaking; the
  text still defocuses and the step still happens. A step taken from
  part-way down a recipe opens the next dish at the top of its own recipe
  rather than at the same depth in a different one.
- *Vertical is the sheet's.* A drag has to be clearly more horizontal than
  vertical before it counts as a swipe; anything else is left to the
  sheet's scroll.
- *The ghost.* A second photo element, `.dish-ghost`, stands in for
  whichever photo isn't the current dish's: the neighbour arriving during
  a drag, the outgoing dish leaving during a step. Offsets use the
  `translate` property rather than `transform`, so they compose with the
  transform the sheet writes instead of replacing it.

Under reduced motion `--dur-move` is zero, so the slide collapses to a swap
and a step is the dissolve and the focus pull alone. The photo still
follows a finger while it's down: that is direct manipulation, like
scrolling, not animation.

`--ease-focus` exists for 1 and 2. The app's other curves are front-loaded,
which is right for something arriving or leaving and wrong here: a
fast-out dissolve spends most of its duration nearly finished, so the
moment worth seeing flashes past in 90ms of 500.

Don't reach for the cross-dissolve on a paragraph. Two overlapping lines of
display type read as one title becoming another; two overlapping
paragraphs read as a rendering bug.

**The dish sheet** (`MealDetailModal`, `src/lib/dishSheet.js`). The dish
view has three rests: *resting* (the name and photo large, a card peeking
up from the bottom with the meta line, a two-line summary, the date and
the serves), *open* (the card has become the page; a smaller name and
photo at its top, the recipe below) and *collapsed* (the photo a
thumbnail beside a left-aligned name, the recipe scrolling under).

One scroll position drives all of it. There's no animation to fire and
nothing to time: every piece that appears in more than one rest is a
single element whose position is a function of how far the sheet has
been pulled, so a drag stopped half-way leaves everything half-way, and
reversing the drag reverses the change. That's the whole reason it feels
connected to the finger.

- *Layout lives in CSS; the script only interpolates.* Each rest is laid
  out by the stylesheet — the resting boxes are the elements' own, the
  collapsed ones are the header's own, the open photo box is an invisible
  slot — and `dishSheet.js` measures those boxes and moves pieces between
  them. To change what a rest looks like, change the CSS; the motion
  follows.
- *Two rests snap, the recipe doesn't.* `scroll-snap-type: y mandatory`
  with snap points at resting and open. The sheet is taller than the
  view, so once it's open the recipe scrolls freely; only a release
  between the two settles on the nearer one. There is a third snap point
  at the very end of the recipe, and it isn't optional: Chrome decides
  whether the sheet covers the view at the *requested* position, before
  clamping, so without it a wheel tick, the End key or a fling asking for
  anywhere past the end snapped the reader all the way back to rest.
- *Things attached to the scroll are scrolled; only things that morph
  are scripted.* A scroll handler lands a frame behind the compositor, so
  anything the script positions lags the content by that frame. The card
  and its contents are ordinary scrolled content for that reason, and so
  is the recipe. The card's lower edge has to hold still while the sheet
  scrolls up through it, and nothing inside a scroller can, so that edge
  is drawn from outside: `.dish-frame` paints the page colour everywhere
  but a card-shaped hole.
- *Pieces that would cross don't travel.* The meta line starts below the
  photo and ends above the name, so any path between the two goes through
  both. The card has its own copy, which rides up with it and fades, and
  the header's copy arrives in place.
- *The name hands over, briefly.* The large name and the small one travel
  together and cross between 45% and 55% of the drag — much shorter than
  a step's dissolve, because the large name wraps and the small one
  doesn't, and a long overlap reads as three lines of ghosted type.
- *The photo arcs into its thumbnail*, across first and then up, because
  the straight line runs through the end of the name as it slides left.
- *The card's corners flatten across the whole drag.* It rests as a card
  on the page and ends as the page; see `shape.md`.

Under reduced motion the travelling pieces — the names, the meta line,
the photo, the arrows — stop travelling. They hold their rest position
until the half-way mark, then jump to the next one and fade in where they
land, over `--dur-color`. What only fades or changes shape stays
continuous. The scroll itself is untouched: moving content under a
finger is scrolling, not animation.

`tests/dish-sheet-motion.spec.js` samples the whole journey and asserts
it numerically — the photo only ever shrinks, never by a jump, and
passes through sizes that are neither rest — and drives it with real
touch points, since `Input.synthesizeScrollGesture` does nothing in
headless Chromium.

**The chef's header** (`PublicChefPage`, `src/lib/chefHeader.js`). The
dish sheet's collapse, on the window's own scroll: the chef's picture and
name travel from the top of their public page, large and centred, into the
bar pinned at the top left, and they move by the dish sheet's rules.

- *One scroll position drives it*, so a page left half-way leaves them
  half-way and scrolling back reverses it. It draws straight from the
  scroll event, not a frame later.
- *Two rests snap, the dishes don't.* `scroll-snap-type: y mandatory` on
  the page, with the top at one rest and, at the other, an area that runs
  from where the name sits in the bar to the end of the page. That area is
  taller than the view, so past the collapse the dishes scroll freely, as
  the recipe does inside the sheet; only a release between the two rests
  settles on the nearer one. And a last snap point at the very end, for
  the same Chrome reason the sheet has one.
- *The name hands over*: a large copy and a small one travel together,
  each scaled to stand in for the other, crossing between 45% and 55%.
- *It's unhurried.* The collapse takes twice the name's own rise of
  scroll (229px on a phone), so the name rises at half the page's speed,
  near the dish name's rate (its hand-over takes the sheet's ~500px).
- *What scrolls on slides under the header*, as the recipe slides under
  the dish's: the backdrop's lower edge follows the header up, with the
  dish's soft `--space-xl` edge, and the links, bio and specialties pass
  under it.
- *The picture arcs into place*, across first and then up, as the photo
  does into its thumbnail. Here the name starts under the picture and
  rises into the bar, so the picture makes its arc in the first 55% of
  the journey and is out of the name's way before it arrives.
  `tests/profile.spec.js` samples the journey and checks the two never
  overlap.

Under reduced motion the picture and name hold their rest until
half-way, then jump to the bar and fade in where they land, over
`--dur-color`. The Figma file's Chef profile v1 section has the journey
at 0–100% and a frame that plays it, all computed from
`lib/chefHeader.js`.

**The fade under the nav** (`.bottom-nav-fade`). Not motion, but what the
page does as it moves: a full-width veil of the page's own colour under
the pill, translucent even at the bottom edge (70%) so the dishes still
show through, thinning along an eased curve to clear above the pill. A
mask carries the fade, so the same stops serve light and dark.

**Depth of field** (`.app-stage`). The gallery behind an open dish blurs,
dims and scales back a hair. It does the work a heavy scrim would, without
draining the colour out of the food photography behind it. Applied once on
open — never per scroll frame, which is what makes a filter this size
affordable.

## Adding motion

Before adding an animation, answer: what does it tell the chef that a
static state wouldn't? If the answer is "it looks nice", leave it out.

Then: use the tokens, prefer `transform` and `opacity` over properties
that trigger layout, and check it at `prefers-reduced-motion: reduce`
before considering it done.
