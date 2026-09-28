# Shape

Staj is a square-cornered system. `--radius: 0` is the default for
buttons, text fields and anything sitting *in* the page, and that is
deliberate — the hard corners are what make the app read as an editorial
archive rather than a generic consumer app. Don't round something just
because it looks friendlier in isolation.

The exceptions are all tokens, so they get used consistently instead of
being reinvented as magic numbers in each component.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--radius` | `0` | The default. Buttons, fields, anything in the page. |
| `--radius-media` | `12px` | Photographs and illustrations. |
| `--radius-surface` | `18px` | Surfaces that float above the page: modals, cards, sheets. |
| `--radius-pill` | `999px` | Fully-rounded controls: bubble pickers, the floating nav pill. |

## Why a floating surface is rounded

The rule isn't "square" so much as "square where the page is". A square
corner reads as a panel welded to the viewport. That is right for the
gallery, which *is* the page, and wrong for a modal, which is a card
resting on top of one — the corner is the main thing telling you which of
the two you are looking at.

Everything that floats takes `--radius-surface`: the dish modal, the
add-meal card, the photo crop card, the action sheet and the filter
sheet.

The two bottom sheets round their **top corners only**
(`var(--radius-surface) var(--radius-surface) 0 0`). They sit flush
against the bottom of the viewport, so rounding all four would leave a
sliver of scrim showing under each bottom corner — the radius is there to
say "this rests on top of the page", and the edge it rests against has no
corner to round.

## Why media is rounded

A photograph is content sitting *on* the page, not a piece of the page's
chrome. Rounding it separates the two: the sharp corners stay a property
of the interface, while the dish reads as an object placed on it. It also
does practical work — a sketch on a white canvas, or a background-removed
PNG, has edges that otherwise dissolve into the cream background with
nothing to say where the image stops.

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

## Dividers, and why the black ones went

The dish modal used to be cut up by 2px `--color-ink` rules: under the
plate header, between the photo and the text, and between the ingredients
and the method. At that weight a divider isn't a separator, it's a
structural claim — it says these are different documents, when they are
four parts of one card. Three of them also landed within a few hundred
pixels of each other, which turned a recipe into a form.

They're gone, and the spacing that was already there does the work.
A gap of 22px separates two blocks perfectly well; a black bar separates
them *and* shouts about it. The one surviving rule is the share card's
footer hairline, at `--color-line`, which has a real job: it marks where
the recipe stops and the app's byline starts on an image that leaves the
app entirely.

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
