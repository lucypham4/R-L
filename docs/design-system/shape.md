# Shape

Nothing in Staj has a straight corner. Every box you can see — a button,
a field, a toggle, a sheet, a photo, the share image's photo — has its
corners rounded, and always by one of four tokens, so the curves agree
with each other instead of each component inventing its own.

The app used to be square-cornered, with rounding as the exception for
things that floated. That made the page itself read as hard and the
floating things as soft, and the two sat badly together once most of what
a chef touches (sheets, photos, the nav pill, the bubbles) was already
round. So the default went the other way.

`tests/corners.spec.js` holds the rule: it visits every screen the app
can show and measures each visible box for a square corner.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--radius` | `12px` | Fields — text inputs, the search bar, the filter select — the dropzone, and anything else in the page that isn't a button. |
| `--radius-media` | `12px` | Photographs and illustrations, and the frames that stand in for them (the crop viewport, the sketch canvas, a meal card). |
| `--radius-surface` | `18px` | Surfaces that float above the page: modals, cards, sheets, the empty gallery's card. |
| `--radius-pill` | `999px` | Every button, the ingredient bubbles, the segmented toggles, the floating nav pill. |

`--radius` and `--radius-media` share a value but not a meaning: one is
the interface's corner, the other the photo's. Keep them as two tokens so
either can move without dragging the other along.

## Buttons are pills

Every button is fully rounded, the same shape as the ingredient bubbles:
Save and Cancel, the action sheet's rows, the filter sheet's close, a
button as small as Done or Share. Fields keep `--radius`, and the
difference is deliberate — a pill says "press me", a rounded rectangle
says "type here" — so the two read apart at a glance on a form that has
both.

The pill is set on the global `button` rule, not per class, so a button
with no box of its own (an icon, a text link) still gets a round focus
ring, and a new one is a pill before anyone has styled it. The two kinds
of button that aren't pills are shaped as what they show, and say so
where they're styled: a meal card, and a photo thumbnail in the add-meal
carousel, both take `--radius-media`.

A button that wants a rule beside it draws the rule as a separate line
(`.signin-switch::before`), never as a one-sided border: on a pill, a
lone `border-top` curls down at both ends.

`tests/corners.spec.js` checks this too: on every screen, each button
that draws a box has corners of at least half its height.

## Button colour: red is one button

A button's colour says what it is, and there are three:

| Role | Look | Used for |
| --- | --- | --- |
| Primary (`.btn-primary`) | filled `--color-ink`, label in `--color-bg` | the forward action: Next, Sign in, Save changes, Use photo |
| Secondary (`.btn-secondary`) | gray outline (`--color-line-strong`), ink label | the way out or back: Cancel, Back, and the Settings buttons |
| Final (`.btn-final`) | filled `--color-accent`, the app's only red | the button that finishes adding a meal: **Save meal**, the last step of the add-meal wizard |

`--color-accent` is that one button's colour, and the required-field `*`'s,
and nothing else's. It used to be the general primary colour, and a screen
with three red things on it has no way to say which one matters. Now when a
control is red it is the end of the wizard.

"Ink" is the theme-aware token, so a primary is black in the light theme
and off-white in the dark one, with the label flipping to match. A literal
black fill would disappear on the dark page.

What the rule rules out:

- Active and pressed states are ink, not red: the nav's active tab, the
  dictation button while it's listening, the dot on the filter button, the
  wizard's progress bar, the zoom slider.
- So is the keyboard focus ring (`--focus-ring`, and a field's focus border
  and `--color-ink-ring`). Otherwise every focused button flashes red.
- Destructive buttons aren't red either. The action sheet's Delete is plain
  until you're asked to confirm, and the confirm is the sheet's one filled
  button (`.action-sheet-btn-confirm`), which keeps it apart from the Cancel
  under it; the small × badges that delete a meal, an ingredient or a photo
  are ink circles. What says "this can't be undone" is the sentence above
  the button, not its colour.
- Text that isn't a warning isn't red: the sign-in eyebrow is gray, the link
  to your public page in Settings is ink and underlined, the address on your
  profile goes to ink on hover, and the AI notice's rule is gray.
- Red is kept for what has to be noticed: `--color-danger` for errors (the
  message under a field, the invalid field's border, a failed save), and
  `--color-accent` for the `*` that marks a field required.

A button that isn't one of the three roles is a text link (Adjust crop,
Change photo, Clear, Forgot password?) and takes the type below and no fill.

## Button type

Buttons are set in sentence case, in the system face:

```
--font-button: -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif;
--text-button:    500 0.875rem/1 var(--font-button);   /* .btn */
--text-button-sm: 500 0.8125rem/1 var(--font-button);  /* inline and small */
```

San Francisco on iOS and Mac (`-apple-system` in Safari and Firefox,
`BlinkMacSystemFont` in Chrome), Inter everywhere else. No `text-transform`
and no `letter-spacing`: both faces space themselves, and a button that says
"Save meal" shouldn't be shouting it.

Inter is a web font, requested with the rest in `index.html`. A browser only
fetches a web font's files when it renders something with it, so an Apple
device, which resolves the stack at its first name, never downloads Inter;
it reads the small stylesheet and stops. A new button takes `--text-button`
(or `-sm`), never its own `font:`.

Everything else is still Instrument Sans for reading and IBM Plex Mono for
the small labels (a field's label, the step counter, the count of meals).
Those sit beside buttons in a different face. They haven't been moved:
whether labels and body should follow the buttons into the system face is a
separate call, and not one the case rule below depends on.

## Sentence case

Nothing in Staj is set in capitals. A label reads "Step 1 of 3", "0 of 0
meals", "Date cooked", "Cuisine"; a date reads "26 Sept 2026"; a button reads
"Save meal". The labels used to be small uppercase mono, tracked out so the
capitals had room, and beside buttons that had gone to sentence case the two
read as different voices.

- **No `text-transform`, no `font-variant-caps`, no small caps.** If text needs
  to be in a case, the string in the source is in that case. The date
  formatter used to call `.toUpperCase()`; it doesn't now.
- **No tracking added to space out capitals.** The small mono labels have no
  `letter-spacing`: lowercase mono is already open, and tracking it makes the
  text look loose. (Display type keeps its slight negative tracking.)
- **Acronyms are the only exception**: "AI", "PNG". They are typed in
  capitals because that is how they are written, and no style does it for them.
- **The wordmark is "Staj"**, in the splash, the gallery title, the sign-in
  eyebrow and the byline on the share image. Not "STAJ", and not "staj". Where
  it is the mark of the thing rather than a label, as at the foot of the
  share image, it is set in the face it has on the first frame: Tinos, regular
  weight, tightened by `-0.02em`, at 28px: a mark, not fine print.
- **A marker beside a label goes in parentheses, at regular weight.**
  "Summary (optional)": the `(optional)` is 400 where the label is 500, so it
  reads as a side note and doesn't run on as one phrase with the label. It is
  written that way in the source, so a screen reader hears it. It is
  `--color-muted`, the label's own colour: text a chef has to read must clear
  4.5:1, and `--color-muted` does (5.1:1 on the light card, 6.4:1 on the dark;
  4.6:1 on the light profile page's surface), where `--color-disabled`, which
  it used to take, is 2.2:1. A lighter text colour would clear 4.5:1 on the
  dark card but not on the light profile page, so there is no one lighter token
  to take. `--color-disabled` is for what isn't meant to be read as text.
  A required field has no word at all, just a red `*` (with the word
  "required" visually hidden for a screen reader).
- **A chef's own words are theirs.** A dish called "BBQ ribs" is shown as
  typed. The rule is about what the app does to text, never about what a chef
  writes.

`tests/sentence-case.spec.js` measures the "(optional)" contrast in both themes.
`tests/support/caps.js` holds the rule: `corners.spec.js` already visits every
screen the app can show, and on each it finds any text whose computed style
draws capitals (`text-transform` of uppercase or capitalize, any
`font-variant-caps` but normal). It reads style, never letters, so a chef's
capitals can't fail it; and `tests/sentence-case.spec.js` pins the strings
that matter, as rendered.

## Which corners count

A corner counts if you can see it: both its edges are drawn, by a fill
that differs from what's behind it, a border, a shadow, or an image.

- **A corner that is the screen's own corner doesn't.** A sheet flush with
  the bottom of the viewport has no bottom corners to round: the device
  supplies them. The two bottom sheets therefore round their **top
  corners only** (`var(--radius-surface) var(--radius-surface) 0 0`) —
  their top corners *do* count, even though their sides are flush,
  because the top edge meets the side of the screen in a corner you see.
- **An edge that fades out has no corner.** The dish header's backdrop
  runs on into a gradient below it, so there's no hard bottom edge to
  meet the screen's side.
- **The share card's edges are the image's edges.** It's drawn off-screen
  and saved as a JPEG, which can't have transparent corners, so its own
  corners are the picture's frame, as the screen's are for the app. The
  photo *inside* it is inset and rounded, and MealDetailModal clips the
  photo it draws onto the canvas to the same rounded box.

## Nested corners

Something inset inside a rounded box takes the box's radius minus the
inset, so the two curves run parallel — unless it's a button, which is a
pill wherever it sits: the filter button is a circle inside the search
field.

Where a fill would meet a divider, there's no divider. The segmented
toggles (photo or sketch, 1:1 or 4:5) used to be boxes split by rules,
with the chosen side filled in: that fill met the rule in two square
corners. Now they're built like the nav pill — the chosen option is a pill
of its own, inset inside the toggle's pill, and it slides between options
(`motion.md`). Segments are all one width, as on an iOS segmented control,
so the pill's travel is just its own width and the gap.

## The dish sheet

The dish view's sheet rests as a card lying on the page — inset from the
sides and the bottom by `--space-md`, rounded on all four corners, since
it doesn't touch an edge. Pulled up, it becomes a bottom sheet: flush with
the sides and the bottom, its top corners still rounded. The lower
corners flatten into the screen's own across the whole drag rather than
at the end, so there's no moment where they visibly snap. The top corners
never flatten.

## Why media is rounded

A photograph is content sitting *on* the page. Rounding it makes the dish
read as an object placed there, and it does practical work — a sketch on
a white canvas, or a background-removed PNG, has edges that otherwise
dissolve into the cream background with nothing to say where the image
stops.

Anything rounded that contains an image also needs `overflow: hidden`.
`object-fit: cover` paints right over a parent's `border-radius` and
squares the corners back off.

## Media gets a hairline outline, never a shadow

`.meal-card-image` used to grow a `--shadow-md` drop shadow on hover.
That was wrong on touch, where `:hover` latches onto the last element
tapped and never clears, leaving a grey blur around a thumbnail with no
way to dismiss it. Media is outlined with `1px solid var(--color-line)`
instead: it is always on, costs nothing on touch, and states the image's
bounds honestly.

More generally: **gate hover-only effects behind `@media (hover: hover)`**.
An un-gated `:hover` rule is a latent stuck-state bug on every phone.

The dish view's photo is outlined with an inset `outline` rather than a
`border`, for a reason specific to it: it shrinks into a thumbnail by
`transform: scale()`, which would scale a 12px corner down to 3px and the
hairline to a quarter of a pixel. The stylesheet divides both back out of
the scale (`--dish-photo-scale`), so the thumbnail's corner and hairline
are the same as every other photo's. An outline can change width without
triggering layout, which a border can't.

## Dividers, and why the black ones went

The dish modal used to be cut up by 2px `--color-ink` rules: under the
plate header, between the photo and the text, and between the ingredients
and the method. At that weight a divider isn't a separator, it's a
structural claim — it says these are different documents, when they are
four parts of one card. Three of them also landed within a few hundred
pixels of each other, which turned a recipe into a form.

They're gone, and the spacing that was already there does the work.
A gap of 22px separates two blocks perfectly well; a black bar separates
them *and* shouts about it. Two hairlines survive, both at
`--color-line`, and each has a real job. The share card's footer rule
marks where the recipe stops and the app's byline starts, on an image
that leaves the app entirely. The dish sheet's rule between ingredients
and method separates two different kinds of list — a set and a sequence
— where, at the size the ingredient bubbles run to, space alone left the
first step reading as one more ingredient.

If you reach for a divider, ask what it's separating and whether space
would say the same thing. If it genuinely needs a line, use `--divider`
(a hairline at `--color-line`), never ink.

## Photos are never letterboxed

`.photo-carousel-main` used to be a fixed 4:5 box with a
`--color-surface` background and an `object-fit: contain` photo inside,
which framed every photo that wasn't 4:5 in beige bars. The container now
has no `aspect-ratio` and a transparent background, so it hugs whatever
shape the photo is and there is no leftover area to fill.

If you need to bound a photo, bound it with `max-height` on the image
rather than a fixed ratio on its container. A fixed ratio always produces
bars for some input; a max-height only ever clips the extreme case.
