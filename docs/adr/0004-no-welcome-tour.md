# No welcome tour; sign-up is asked for at the point of publishing

The app used to open, on first launch, a four-step welcome tour
(`OnboardingTour`) explaining what it does. It is removed outright, along
with its Rive illustration and the Rive runtime that only it used. A
first launch now lands on Home, and Home's empty state does the teaching:
one line about what the app is for, and **Add your first dish**, which
opens Add.

## Why

The app is self-explanatory: two tabs, and an empty Home that says what
to do. The tour told a chef things they would find out in the first ten
seconds anyway, at the one moment they most wanted to start. It had also
gone stale: its last step promised a guest they could "export a copy",
which stopped being true when export was removed (ADR 0003). Copy that
lives outside the screens it describes drifts like that.

## Sign-up is asked for once, where it matters

An account adds exactly one thing a guest can't do locally: a live public
page (Local meals cover everything else on one device; see `CONTEXT.md`).
So that is the only moment the app asks. When a guest taps Share on their
profile, a sheet says "Sign up with your email to make your page live."
and leads into the existing sign-up or sign-in flow. The same offer sits
on a guest's profile where a chef's bio would be. It's dismissable, it
isn't remembered or repeated anywhere else, and nothing local waits on
it.

The alternative was a sign-up step at the end of a tour, or on first
launch. That asks before a guest has a reason to care, and reads as a
gate on an app that deliberately has none.

## No onboarding questionnaire, yet

We considered asking new chefs what they're using Staj for (plating
inspiration, other kitchens' work, showing off their own) and shaping the
first screens around the answer. It is deferred until user research shows
the answers would actually change the experience. Until then it would be
questions with nothing behind them.

## Consequences

Browsers that saw the tour still hold an `onboarding-seen-local` or
`onboarding-seen-<user id>` key in `localStorage`. Nothing reads them, and
they are left in place rather than cleaned up: they are a few bytes,
invisible, and a cleanup would be code kept forever for no gain.
