# Motion

Motion in Meal Diary is deliberately quiet. The app is an archive someone
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
| `--press-scale` | `0.97` | How far a pressed control dips. |
| `--lift` | `-4px` | How far a hovered card rises. |
| `--rise` | `10px` | Travel distance for the `rise-in` entrance. |

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
--press-scale                                          ->  1
--lift, --rise                                         ->  0px
```

`--dur-color` deliberately survives. A colour cross-fade carries no
vestibular risk, and keeping it means hover and focus states stay legible
instead of snapping.

The practical consequence: **a component written against these tokens is
reduced-motion correct for free**, with no per-component media query. Only
reach for an explicit `@media (prefers-reduced-motion: reduce)` when a
component needs to *substitute* one animation for another rather than
flatten it — `OnboardingTour.css` swaps its sideways slide for a plain
cross-fade, because a zero-duration slide would make the step change
invisible.

Motion driven from JavaScript can't read CSS tokens, so it asks
`src/lib/motion.js` instead — `prefersReducedMotion()`,
`onReducedMotionChange()` and `scrollToTop()`. The Rive tour art uses it to
hold its state machine on the first frame.

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

## Adding motion

Before adding an animation, answer: what does it tell the chef that a
static state wouldn't? If the answer is "it looks nice", leave it out.

Then: use the tokens, prefer `transform` and `opacity` over properties
that trigger layout, and check it at `prefers-reduced-motion: reduce`
before considering it done.
