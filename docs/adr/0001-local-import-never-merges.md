# Local Import never merges into an existing account

Local Import (see `CONTEXT.md`) runs automatically only once, immediately after a fresh sign-up, at the one moment a new Chef's cloud account is guaranteed empty; its manual retry surface in Settings only ever touches local meals that were never successfully imported. We deliberately did not build merge or dedup logic to reconcile a browser's local meals against an account that already holds cloud meals from elsewhere (e.g. a different device). Every import is collision-free by construction — there's never an existing row to conflict with — at the cost of not solving "I built up local meals on two different browsers and want them combined into one account."

## Consequences

A chef who accumulates local meals on more than one browser before creating an account only ever gets the browser they signed up from imported. The rest stay stranded as local-only data on their original browsers, recoverable only by using the app signed out there.
