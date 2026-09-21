# Shape

Meal Diary is a square-cornered system. `--radius: 0` is the default for
buttons, text fields, cards, modals and sheets, and that is deliberate —
the hard corners are what make the app read as an editorial archive
rather than a generic consumer app. Don't round something just because it
looks friendlier in isolation.

There are exactly two exceptions, and both are tokens so they get used
consistently instead of being reinvented as magic numbers.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--radius` | `0` | The default. Buttons, fields, cards, modals, sheets. |
| `--radius-media` | `12px` | Photographs and illustrations. |
| `--radius-pill` | `999px` | Fully-rounded controls: bubble pickers, the floating nav pill. |

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

## Photos are never letterboxed

`.photo-carousel-main` used to be a fixed 4:5 box with a
`--color-surface` background and an `object-fit: contain` photo inside,
which framed every photo that wasn't 4:5 in beige bars. The container now
has no `aspect-ratio` and a transparent background, so it hugs whatever
shape the photo is and there is no leftover area to fill.

If you need to bound a photo, bound it with `max-height` on the image
rather than a fixed ratio on its container. A fixed ratio always produces
bars for some input; a max-height only ever clips the extreme case.
