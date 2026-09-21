# Static export is removed, not gated

The app used to offer "Download copy": `staticSite.js` generated a
self-contained HTML file of a chef's whole diary, and `PublishModal`
handed it over as a download. [ADR 0002](0002-export-requires-an-account.md)
decided to gate that behind an account rather than offer it to guests.

The feature is now removed outright — `staticSite.js`, `PublishModal`, and
the Settings section that reached them are all gone.

## Why

Export solved a problem the app had before accounts existed: a chef's
meals lived in one browser, and a downloaded HTML file was the only way
to get them out. Two things have since replaced it.

A Chef's public page at `/<slug>` is already a shareable, always-current
view of their diary, and it is the thing they actually hand to clients —
a stale HTML file is strictly worse for that purpose. And Local Import
(ADR 0001) plus a cloud-backed account is now the answer to "don't lose
my data", which is what the download was really being used for.

That left export as a second, divergent renderer of every meal — one that
had to be kept in step with the real UI by hand, and silently drifted
whenever the app's markup changed. It was the most maintenance per unit
of use of anything in the app.

## Consequences

There is no way to get a file of your diary out of the app. A chef who
wants their data outside it has their public page, and their meals in
Supabase where they can be queried directly.

ADR 0002 is superseded: the account gate it describes is moot now that
there is nothing to gate. It stays in the repo as the record of why that
gate existed while the feature did.

If export ever returns it should render from the same components as the
app rather than a parallel HTML generator, which is what made the
original version expensive to keep.
