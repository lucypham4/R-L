# Export requires signing in, even though it's technically backend-free

> **Superseded by [ADR 0003](0003-no-static-export.md).** Static export was
> removed from the app entirely, so there is no longer anything to gate.
> Kept for the record of why the gate existed while the feature did.

`staticSite.js` was deliberately built dependency-free and backend-free — no server calls, survives iOS Quick Look, uploadable anywhere — which on its own would suggest it's meant to work for any guest. We gate it behind an account anyway (when Supabase is configured) because export is a stronger incentive toward account creation than anything else in the app, and Local Import (ADR 0001) means a guest loses nothing by signing up first: their local meals come with them, then become exportable.

## Consequences

A guest with local meals genuinely cannot get their data out of the browser without creating an account first, when Supabase is configured. If Supabase isn't configured at all, this gate doesn't apply and export stays available to everyone, matching today's behavior — there's no account to create.
