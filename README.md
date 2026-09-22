# R-L

A meal-logging app for any chef, a React + Vite app implementing the Meal
Diary design system, backed by Supabase (data + auth) and Cloudinary
(photos).

**An account is entirely optional.** Open the app and you're straight into
your own diary, meals persist to that browser via `localStorage`, no
sign-up required. Creating an account is an opt-in upgrade for two things:
a live, public, read-only page at `/<your-page-name>` you can hand to
clients, and access to your diary from more than one device (local-only
data stays on that one browser).

## Local development

```bash
npm install
npm run dev
```

### Tests

```bash
npm test
```

Playwright drives the built app (not the dev server, so it exercises what
actually ships) against fake Supabase credentials, intercepting every
Supabase request. No test reaches a real project.

The browser is expected to be already installed. If Playwright reports a
missing browser, run `npx playwright install chromium` once.

The suite currently pins the add-meal wizard's AI-fill failure paths: a
failing Edge Function must never cost a chef their notes or their way
forward. See `tests/add-meal-ai-failure.spec.js`.

Works immediately with no environment variables, meals persist to that
browser's `localStorage` and photos fall back to local blob URLs (see
below). Configuring Supabase and Cloudinary makes signing in for a public
page and cross-device access possible on top of that.

## Wiring up Supabase and Cloudinary

1. Copy `.env.example` to `.env` and fill in the four values (see below).
2. In your Supabase project's SQL editor, run `supabase/schema.sql` once
   (creates the `meals` table), then `supabase/multi-chef-migration.sql`
   once (adds the `chefs` table, scopes every meal to its own chef, and
   sets the row-level security policies this app actually relies on today.
   See Security notes below), then `supabase/photos-array-migration.sql`
   once (adds the `photos` column meals now use for up to 6 photos each),
   then `supabase/page-theme-migration.sql` once (adds the `page_theme`
   column that stores each chef's light/dark choice for their public
   page).
3. In Cloudinary, create an **unsigned** upload preset (Settings → Upload →
   Upload presets → Add upload preset, signing mode "Unsigned"). Unsigned
   presets are what let the browser upload directly without exposing your
   API secret; restrict it to image formats and a folder from the same
   dashboard if you want.
4. Restart `npm run dev`, the notice banner disappears once both are
   configured, and "+ Add meal" persists real rows with real photo URLs.

### Environment variables

| Variable | Where to find it |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key |
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloudinary → Dashboard |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Cloudinary → Settings → Upload → your unsigned preset's name |

Without Cloudinary, photos still work locally (a blob URL) but won't
survive a page reload, even though the meal itself does. Without Supabase,
the app just stays in local-only mode permanently, signing in for a
public page or multi-device access needs it configured.

Note: every chef on a given deployment shares the same Cloudinary account
and upload quota, there's no per-chef Cloudinary isolation yet.

### Photo → speak → AI fill

Filling in a meal by hand is the biggest source of friction in "Add a
meal", so the form leads with the two low-effort inputs and lets AI do the
rest:

1. Add a photo (or sketch) and speak or type a one-sentence description.
   The **Speak** button next to Description uses the browser's own Web
   Speech API, no account or key needed, it just won't appear in browsers
   that don't support it.
2. **Clean up** tidies that description up: fixes grammar/punctuation,
   drops filler words ("um", "like"), keeps the chef's own words and every
   detail they gave.
3. **Fill in details** sends the photo and description to Gemini and fills
   in the name, cuisine, category, ingredients, method, and note fields it
   can infer, without overwriting anything already typed. Everything it
   fills in stays editable, it's a starting point, not a final answer.

Both AI buttons only appear once Supabase is configured (above), since
they need a place to run a server-side call that keeps the API key off the
client. They call Google's Gemini API rather than a paid provider so they
run on the free tier of [Google AI Studio](https://aistudio.google.com/apikey)
with no billing required:

1. `supabase functions deploy ai-fill` and
   `supabase functions deploy clean-description` (from
   `supabase/functions/`).
2. `supabase secrets set GEMINI_API_KEY=...` on the same project (a free
   key from [Google AI Studio](https://aistudio.google.com/apikey), shared
   by both functions; an optional `GEMINI_MODEL` secret overrides the
   default model, currently `gemini-3.6-flash`).
3. Reload the app, **Clean up** and **Fill in details** show up under
   Description once there's a photo and a description to work from.

The free tier has per-minute/per-day rate limits, comfortably enough for
one app's personal use, but worth knowing about if it starts erroring
under heavier use.

Without that function deployed, the button still shows (Supabase is
configured) but errors clearly on click rather than silently doing
nothing, so it's obvious what's missing.

**If AI fill fails, the wizard carries on.** A failing Edge Function used
to strand a chef on step 2 with "Edge Function returned a non-2xx status
code", which is what `supabase-js` reports for *any* non-2xx and says
nothing about the cause. The wizard now moves to step 3 regardless,
carries the notes over as the description, and shows the Edge Function's
own message, which is the one worth reading:

| What you see | What to do |
| --- | --- |
| `GEMINI_API_KEY is not configured on this project.` | `supabase secrets set GEMINI_API_KEY=...` |
| `AI request failed (404): ...` | The model in `GEMINI_MODEL` doesn't exist for your key; set it to one that does |
| `AI request failed (429): ...` | Free-tier rate limit, wait and retry |
| `Couldn't reach the AI just now.` | No response body from our handler, so the function isn't deployed or the request never reached it |

### Signing in (optional)

A "Sign in for multi-device access" link sits in the top bar whenever
Supabase is configured, nothing forces you through it. Sign-up is open
from there ("New chef? Create an account"), no admin approval step.

1. First sign-in (or right after signing up, if your Supabase project
   doesn't require email confirmation) prompts for a name and a page name.
   The page name becomes the `/<slug>` in your public URL and can't be
   changed later, so choose deliberately.
2. From then on, signing in goes straight to your own cloud-backed
   gallery, separate from whatever's in that browser's local storage.
   "View public page ↗" in the top bar opens your `/<slug>` page, that's
   the link to actually share.
3. Settings → Theme → **Public page** sets whether that page renders light
   or dark for everyone you send it to. It's stored on your profile, not
   in the visitor's browser, so the page looks the same to every client,
   and you can change it at any time after the page is live. It's separate
   from **Appearance** directly above it, which is your own per-device
   preference for the private app and follows your OS by default.

There's currently no way to import your local-only meals into an account
you create afterward, they're two separate stores. If your Supabase
project has "Confirm email" turned on (Authentication → Settings), new
sign-ups won't get a session until they click the link in their inbox.
The sign-in screen tells them to check their email and switches back to
the sign-in form.

### Onboarding

A short, skippable welcome tour (`src/components/OnboardingTour.jsx`) runs
once per browser (or once per account, if signed in). Its four art slots
each take an animated Rive artboard, a static image, or neither, in which
case they fall back to a labelled placeholder showing the size that slot
wants. The cover slot currently holds an animated Rive illustration; the
other three are still placeholders.

Swapping art in is a one-entry change in
`src/components/onboardingSteps.js`. See
[`docs/design-system/illustration.md`](docs/design-system/illustration.md)
for the details, including how to read artboard and state-machine names
out of a `.riv` file and why the Rive WebAssembly is self-hosted rather
than pulled from a CDN.

### Design system

`src/styles/tokens.css` holds the colour, type, space and motion tokens,
in a light theme, a dark theme, and a reduced-motion variant. Two notes
worth reading before adding UI:

- [`docs/design-system/motion.md`](docs/design-system/motion.md) — the
  motion tokens, the shared keyframes, and why a component written
  against the tokens is reduced-motion correct without its own media
  query.
- [`docs/design-system/illustration.md`](docs/design-system/illustration.md)
  — the art slots and the Rive setup.
- [`docs/design-system/shape.md`](docs/design-system/shape.md) — why the
  app is square-cornered, the two radius tokens that are exceptions, and
  why photos get a hairline outline rather than a shadow.

Theme follows the operating system by default. The Appearance control in
Settings cycles System → Light → Dark and remembers the choice.

### iOS App Store transition

The `ios/` folder is a Capacitor-wrapped native shell around this same web
app, `npx cap add ios` already scaffolded it, so the JS-side setup is
done. Everything past this point needs a Mac, which this environment
doesn't have:

1. On a Mac, install Xcode and CocoaPods, then `git pull` this repo.
2. `npm install && npm run cap:sync` (builds the web app and copies it
   into the native shell).
3. `npm run cap:open:ios` to open the project in Xcode.
4. In Xcode: sign in with an Apple Developer Program account ($99/year),
   set a real bundle identifier under Signing & Capabilities (the
   placeholder in `capacitor.config.json` is `com.mealdiary.app`, change
   it to match your account before submitting), and run on a simulator or
   device to test.
5. Archive and submit through App Store Connect once it looks right.

### Security notes

- The anon key and the Cloudinary cloud name/preset are public-by-design.
  They're meant to ship in client bundles. Never put a Cloudinary API
  secret or a Supabase service-role key in this app.
- `GEMINI_API_KEY` is a Supabase Edge Function secret, not a
  `VITE_`-prefixed client variable, it must never end up in the browser
  bundle. The `ai-fill` and `clean-description` functions are the only
  things that read it.
- Run `supabase/multi-chef-migration.sql`, not `phase2-auth-policies.sql`
  (superseded, kept only for history). The migration makes meal reads
  public again (needed for public chef pages) and scopes every write to
  `auth.uid() = user_id`, so one chef's account can never read or write
  another chef's rows even though the table is shared.
- `vercel.json` rewrites every path to `/index.html`, required for a
  direct hit on `/<slug>` to work, since routing happens client-side.
