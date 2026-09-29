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
(`filter-sheet-rise`, `onboarding-slide`, `filter-dot-pop`).

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
flatten it — `OnboardingTour.css` swaps its sideways slide for a plain
cross-fade, because a zero-duration slide would make the step change
invisible.

Motion driven from JavaScript can't read CSS tokens, so it asks
`src/lib/motion.js` instead — `prefersReducedMotion()`,
`onReducedMotionChange()` and `scrollToTop()`. The tour's 3D art uses it to
hold its render loop on the first frame.

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

**Step transitions** (onboarding, add-meal wizard). The incoming panel
animates; there's no paired exit. A proper cross-fade needs both panels
absolutely positioned and a fixed container height, which these flows
don't have — their steps hold deliberately different amounts of copy.

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
3. *The photo doesn't move.* It's the fixed point the other two happen
   around. On mobile the card is anchored to the top of the overlay
   (`align-self: flex-start`) precisely so a shorter dish can't slide it.

`--ease-focus` exists for 1 and 2. The app's other curves are front-loaded,
which is right for something arriving or leaving and wrong here: a
fast-out dissolve spends most of its duration nearly finished, so the
moment worth seeing flashes past in 90ms of 500.

Don't reach for the cross-dissolve on a paragraph. Two overlapping lines of
display type read as one title becoming another; two overlapping
paragraphs read as a rendering bug.

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
