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
| `--radius` | `12px` | The default. Buttons, fields, the search bar, the dropzone, anything in the page. |
| `--radius-media` | `12px` | Photographs and illustrations, and the frames that stand in for them (the crop viewport, the sketch canvas). |
| `--radius-surface` | `18px` | Surfaces that float above the page: modals, cards, sheets, the empty gallery's card. |
| `--radius-pill` | `999px` | Fully-rounded controls: bubble pickers, the segmented toggles, the floating nav pill. |

`--radius` and `--radius-media` share a value but not a meaning: one is
the interface's corner, the other the photo's. Keep them as two tokens so
either can move without dragging the other along.

A button's radius comes from the global `button` rule, so a small one
(the edit bar's Done, the share button) reaches a pill once it's
shorter than 24px: the corner simply can't be larger than half the side.
That's intended.

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
inset, so the two curves run parallel: the filter button sits 4px inside
the search field at `calc(var(--radius) - 4px)`.

Where a fill would meet a divider, there's no divider. The segmented
toggles (photo or sketch, 1:1 or 4:5) used to be boxes split by rules,
with the chosen side filled in: that fill met the rule in two square
corners. Now they're built like the nav pill — the chosen option is a pill
of its own, inset inside the toggle's pill.

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
