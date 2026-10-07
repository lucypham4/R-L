# Staj

A meal-logging app for any chef, a React + Vite app implementing the Staj
design system, backed by Supabase (data + auth) and Cloudinary
(photos).

Staj is for any chef, in any kitchen. Moving into private chef work is one
use case, not the audience. Nothing in the app assumes it, and a chef
doesn't have to say what they're using it for.

**An account is entirely optional.** Open the app and you're straight into
your own diary, meals persist to that browser via `localStorage`, no
sign-up required. Creating an account is an opt-in upgrade for two things:
a live, public, read-only page at `/<your-page-name>` you can hand to
clients, and access to your diary from more than one device. Meals logged
before you sign up can be copied into the new account (see
[Local Import](#signing-in-optional)).

## What's in the app

The app has two tabs, **Home** and **Add**. Everything else opens from
those, or from the round profile picture at the top right of Home, which
goes to your profile.

- **Home**: your dishes as a grid of cards, each with a photo, a name and
  a one-line summary. Search covers names, cuisine, category, summary,
  description and ingredients. Filters cover cuisine, category and year.
  Edit mode puts a × on each card to delete that dish.
- **A dish**: tapping a card opens it as a pull-up sheet that rests in
  three positions (peek, open, collapsed). Swipe, use the arrows or use
  the arrow keys to step to the next dish; the shelf loops, so the oldest
  is one step from the newest. The dish has up to 6 photos, the recipe
  (ingredients, method, note), how many it serves, and a **Share** button
  that makes an image of the dish to send or save.
- **Add**: a three-step wizard. Step 1 takes photos (up to 6, each
  cropped to square or 4:5) or a sketch drawn in the app. Step 2 takes
  spoken or typed notes, which AI can tidy and use to fill in the rest
  (see [Photo → speak → AI fill](#photo--speak--ai-fill)). Step 3 is where
  a chef checks and edits everything: name, date, serves, description,
  summary, category, cuisine, ingredients, method and note.
- **Profile**: your picture beside your name (as "Chef <name>"), your
  page's link, icons for your Instagram, TikTok, YouTube and website,
  and a **View public page** button beside them; then your short bio and
  your specialties, each in a card of its own, the way clients see them.
  Three icons top right: the pencil edits all of it (nothing is saved
  until Save or thrown away until Cancel, so there's no Back while
  editing), share hands your public page's link to the phone's share
  sheet or copies it, and the gear opens Settings. A guest has a picture
  but no name, bio or page: where the bio would be, and behind share,
  is the offer to sign up (see [First launch](#first-launch)).
- **Settings**: Appearance (System, Light or Dark),
  Public page theme, account (sign in or out, change password, link to
  your public page) and, once there is an account, a retry for any local
  meals that didn't import.
- **Public page** at `/<your-page-name>`: a read-only version of Home for
  clients. At the top, centred: your picture and name, your links, your
  bio and your specialties. As the page scrolls, your picture and name
  shrink and slide into a bar at the top left, and stay there with the
  dishes fading out beneath. The same
  dish sheet and the same swiping, in the light or dark theme the chef
  picked. A link like `/<your-page-name>?meal=<id>`
  opens one dish.

There is no router library. `/` is the private app, a single path segment
is a chef's public page, and `?meal=<id>` opens one dish.

**No export.** The app used to download a copy of the diary as an HTML
file. That was removed in favour of the public page and Local Import; see
[ADR 0003](docs/adr/0003-no-static-export.md).

For what the words Chef, Local meal and Local Import mean here, see
[`CONTEXT.md`](CONTEXT.md). Decisions that shaped the app are in
[`docs/adr/`](docs/adr/).

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

The suite has a spec per area that is easy to break without noticing:

- the add-meal wizard's AI-fill failure paths (a failing Edge Function
  must never cost a chef their notes or their way forward), serves, and
  the dish summary: `add-meal-ai-failure`, `serves`, `dish-summary`
- the dish sheet and stepping between dishes: `dish-sheet-motion`,
  `dish-step-motion`, `dish-swipe`
- deleting a meal, password reset, and the Settings profile picture:
  `meal-delete`, `password-reset`, `settings-profile`
- the two-tab nav's balance, and the no-straight-corners rule on every
  screen: `bottom-nav`, `corners`
- a first launch landing on Home with no tour: `first-launch`

They live in `tests/`.

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
   page), then `supabase/avatar-migration.sql` once (adds the
   `avatar_url` column for the profile picture set on the profile), then
   `supabase/summary-migration.sql` once (adds each meal's one-sentence
   `summary`, and the policy that lets a chef update their own meals so an
   older meal's summary can be saved; see below), then
   `supabase/meal-delete-migration.sql` once (lets a chef delete their own
   meals; without it a delete looks as if it worked and changes nothing),
   then `supabase/bio-migration.sql` once (adds the `bio` column for the
   short bio a chef writes on their profile; until it has run, saving a
   bio fails and says so), then `supabase/profile-details-migration.sql`
   once (adds the `specialties` and `links` columns, likewise).
3. In Cloudinary, create an **unsigned** upload preset (Settings → Upload →
   Upload presets → Add upload preset, signing mode "Unsigned"). Unsigned
   presets are what let the browser upload directly without exposing your
   API secret; restrict it to image formats and a folder from the same
   dashboard if you want.
4. Restart `npm run dev`, the notice banner disappears once both are
   configured, and the **Add** tab persists real rows with real photo
   URLs.

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

### Photo → notes → AI fill

Filling in a meal by hand is the biggest source of friction in "Add a
meal", so the form leads with the two low-effort inputs and lets AI do the
rest. Adding a meal is three steps:

1. **Add a photo** (or a sketch).
2. **Tell us about it.** Write as much as you like about the dish, with no
   limit: its name, when you cooked it, the cuisine, what went in. The
   **Speak** button next to the box uses the browser's own Web Speech API,
   no account or key needed; it just won't appear in browsers that don't
   support it.
3. **Your recipe card.** **Next** on step 2 goes straight here, and the card
   fills itself in: the photo and your notes go to Gemini, which writes the
   description, summary, name, date, category, cuisine, ingredients, method
   and note it can infer. (How many the dish served is yours; the AI is
   never asked.) While it works, each of those fields shows a shimmer (the
   same glint that crosses "Staj" on the first screen), takes no typing, and
   **Save meal** waits. A field stops shimmering as its content arrives, and
   everything it writes is yours to edit, since it's a starting point, not a
   final answer. **Back** during the wait drops the answer and returns you to
   your notes.

**Clean up**, beside Description on step 3, tidies the description:
fixes grammar and punctuation, drops filler words ("um", "like"), keeps your
own words and every detail you gave.

The fill is an enrichment, never a gate. If it fails (the function isn't
deployed, the key is missing, the network drops) or takes longer than 30
seconds (`AI_FILL_TIMEOUT_MS` in `src/lib/aiFill.js`), the shimmers stop and a
notice on step 3 says why. Your notes are carried across as the description
and every other field is left empty, so you can finish the card by hand and
save it normally. Without Supabase configured at all there is no fill: step 3
opens with your notes as the description.

The fill and **Clean up** only run once Supabase is configured (above),
since they need a place to run a server-side call that keeps the API key off
the client. They call Google's Gemini API rather than a paid provider so
they run on the free tier of [Google AI Studio](https://aistudio.google.com/apikey)
with no billing required:

1. `supabase functions deploy ai-fill`,
   `supabase functions deploy clean-description` and
   `supabase functions deploy summarize-dish` (from
   `supabase/functions/`; all three import from `supabase/functions/_shared/`,
   which the CLI bundles in).
2. `supabase secrets set GEMINI_API_KEY=...` on the same project (a free
   key from [Google AI Studio](https://aistudio.google.com/apikey), shared
   by both functions; an optional `GEMINI_MODEL` secret overrides the
   default model, currently `gemini-3.6-flash`). An optional
   `GEMINI_FALLBACK_MODEL` secret names a second model for all three
   functions to try when the first answers 503 or 429 (see "If AI fill
   fails" below). The functions share `supabase/functions/_shared/gemini.ts`
   for that, and `supabase/functions/_shared/summary.ts` for the summary.
3. Reload the app. **Next** on step 2 now fills the card, and **Clean up**
   shows under Description once there is a description to work from.

**The line on a dish's card** is a one-sentence summary written to fit
two lines, never the description cut off. The AI fill writes one for each
new meal, shown in step 3 as **Summary** for the chef to change or clear.
A meal logged before that gets one from `summarize-dish` the first time
its chef opens it, saved once. Until then — or without the function, the
migration, or AI at all — the card uses the description's first sentence
if that fits, or a line made from the ingredients ("Leek with brown
butter and hazelnut."). Public pages never ask for one: their readers
can't save it.

The free tier has per-minute/per-day rate limits, comfortably enough for
one app's personal use, but worth knowing about if it starts erroring
under heavier use.

Without the `ai-fill` function deployed, the fill fails like any other
failure: the notice on step 3 says what's missing rather than the card
silently staying empty.

**If AI fill fails, the wizard carries on.** A failing Edge Function used
to strand a chef on step 2 with "Edge Function returned a non-2xx status
code", which is what `supabase-js` reports for *any* non-2xx and says
nothing about the cause. The wizard now opens step 3 straight away and,
when the fill fails, stops the shimmer, carries the notes over as the
description, and says "The AI couldn't fill this in", with a **Try again**
button that re-runs the fill for the same photo and notes and fills only
what the chef hasn't edited since. A 503 or 429 from the model is tried up
to three times, with a pause that doubles (1.5 seconds, then 3) before the
notice shows at all; nothing else is retried (the card keeps shimmering
through the retries, and the whole fill still ends at 30 seconds). If
`GEMINI_FALLBACK_MODEL` is set, each of those tries also asks that model,
straight away, when the first one is busy. **Clean up** and the summary
written for an older dish do the same (`clean-description` and
`summarize-dish`): up to three tries, and the fallback model. When Clean up
still fails, a plain line says so under the description ("The AI couldn't
clean this up. Still busy. Try again in a minute." for a 503 or 429, "Your
description is unchanged." otherwise) with the model's own words behind its
own **Details** toggle, closed by default, as here; the dish summary just
leaves the card as it was. If Try again
fails too, a line under the button says why it's worth another go or not:
"Still busy. Try again in a minute." for a 503 or 429, "That didn't work.
You can fill it in below." for anything else. It goes when the chef presses
Try again again or edits the card.

The Edge Function's own message is the one worth reading, so it isn't
thrown away: it's logged with `console.error` and sits under the notice's
**Details** toggle, closed by default:

| What it says | What to do |
| --- | --- |
| `GEMINI_API_KEY is not configured on this project.` | `supabase secrets set GEMINI_API_KEY=...` |
| `AI request failed (404): ...` | The model in `GEMINI_MODEL` doesn't exist for your key; set it to one that does |
| `AI request failed (429): ...` | Free-tier rate limit; it was already tried three times, so wait a bit longer and press Try again |
| `AI request failed (503): ...` | The model is overloaded ("high demand"); it was already tried three times (and the fallback model, if set), so press Try again in a minute |
| `Couldn't reach the AI just now.` | No response body from our handler, so the function isn't deployed or the request never reached it |
| `The AI took too long to answer.` | Nothing came back within 30 seconds; try again, or check the function's logs |

### Testing AI failures

To see the automatic retries, the Try again button and the notice without
waiting for the model to really be busy, `scripts/ai-stub.mjs` stands in
for Supabase and answers `ai-fill` the way the real Edge Function does when
Gemini is overloaded: HTTP 502 with `AI request failed (503): ...` in the
body. Two terminals:

```bash
# 1: the stub
FAIL=3 node scripts/ai-stub.mjs

# 2: the app, pointed at it
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=stub npm run dev
```

Open the app, tap Add, add a photo, write some notes and press Next.
`FAIL` is how many `ai-fill` requests fail before the stub starts
succeeding:

| `FAIL` | What you should see |
| --- | --- |
| `3` (default) | You land on step 3 as soon as you press Next, its fields shimmering. The stub logs three 503s, the second 1.5 seconds after the first and the third 3 seconds after that (the shimmer carries on through the retries; a screen reader is told "Trying again…"), then the shimmer stops and the card says "The AI couldn't fill this in". Try again says "Trying again…", then fills the card and dismisses the notice. |
| `1` or `2` | The automatic retries rescue it, so there is no notice. |
| `99` | Every request fails. Try again returns to "Try again" with "Still busy. Try again in a minute." under it, and Details shows the raw 503 text. |

To see the other line, "That didn't work. You can fill it in below.", reach
step 3 with `FAIL=99`, then stop the stub and press Try again: nothing
answers, which isn't the model being busy.

To check that hand edits survive, change the meal name on step 3 before
pressing Try again: it stays, and the empty fields fill in. The stub's log
timestamps each request, and `FAIL` counts requests since it started, so
restart it between runs. If `supabase start` already has port 54321, set
`PORT` on the stub and in `VITE_SUPABASE_URL`. The Playwright suite doesn't
use the stub: it intercepts the network itself, per test.

### Signing in (optional)

Settings → Account has a **Sign in** button whenever Supabase is
configured, nothing forces you through it. Sign-up is open from there
("New chef? Create an account"), no admin approval step.

1. First sign-in (or right after signing up, if your Supabase project
   doesn't require email confirmation) prompts for a name and a page name.
   The page name becomes the `/<slug>` in your public URL and can't be
   changed later, so choose deliberately.
2. From then on, signing in goes straight to your own cloud-backed
   gallery, separate from whatever's in that browser's local storage.
   "View public page ↗" in Settings → Account opens your `/<slug>` page,
   that's the link to actually share.
3. Settings → Theme → **Public page** sets whether that page renders light
   or dark for everyone you send it to. It's stored on your profile, not
   in the visitor's browser, so the page looks the same to every client,
   and you can change it at any time after the page is live. It's separate
   from **Appearance** directly above it, which is your own per-device
   preference for the private app and follows your OS by default.

**Local Import.** Right after a new account is created, if that browser
has meals in local storage, the app offers to copy them into the account.
It asks first, runs once, and clears each meal from local storage only
after it has been copied; any that fail stay where they are, and
Settings → This device offers a retry. It never merges into an account
that already has meals, so a second browser's local meals aren't pulled
in. The reasoning is in
[ADR 0001](docs/adr/0001-local-import-never-merges.md) and the code in
`src/lib/localImport.js`.

If your Supabase project has "Confirm email" turned on (Authentication →
Settings), new sign-ups won't get a session until they click the link in
their inbox. The sign-in screen tells them to check their email and
switches back to the sign-in form.

**Forgot password?** under the password field emails a reset link
(Supabase's own "Reset Password" email). The link signs the chef in and
lands on a screen to choose a new password before anything else. For the
link to come back to the right place, the address it's requested from
has to be allowed in Supabase → Authentication → URL Configuration:
- **Site URL**: the deployed app. Links requested from the iOS app, and
  from any address not in the list below, come back here.
- **Redirect URLs**: add any other address chefs reset from, e.g.
  `http://localhost:5173/**` for local work, or the Vercel preview
  domain with a `**` wildcard.

A link that has expired (after an hour) or was already used, sometimes by
a mail scanner opening it first, lands on the sign-in screen saying so,
with both ways to ask for another email right below.

### First launch

There's no welcome tour. A first launch lands straight on Home, whose
empty state says what the app is for and offers **Add your first dish**,
which opens Add.

The one thing worth asking a guest is whether they want an account, and
only at the moment it matters: when they try to share a page they don't
have yet. Share on their profile then opens a sheet, "Sign up with your
email to make your page live.", that leads into sign-up or sign-in and
can be dismissed with Not now. The same offer sits on a guest's profile
where a chef's bio would be. Nothing else in the app asks.

The app doesn't ask what a chef plans to use Staj for. That is deferred
until research shows the answer would change what they see. See
[ADR 0004](docs/adr/0004-no-welcome-tour.md).

### Design system

`src/styles/tokens.css` holds the colour, type, space and motion tokens,
in a light theme, a dark theme, and a reduced-motion variant. Two notes
worth reading before adding UI:

- [`docs/design-system/motion.md`](docs/design-system/motion.md) — the
  motion tokens, the shared keyframes, and why a component written
  against the tokens is reduced-motion correct without its own media
  query; the sliding toggles and the sheen on fields the AI is filling in.
- [`docs/design-system/shape.md`](docs/design-system/shape.md) — the
  no-straight-corners rule, the four radius tokens that carry it, and why
  photos get a hairline outline rather than a shadow; what the three
  button colours mean (red is one button) and how buttons are set in type.

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
   placeholder in `capacitor.config.json` is `com.staj.app`, change
   it to match your account before submitting), and run on a simulator or
   device to test.
5. Archive and submit through App Store Connect once it looks right.

### Security notes

- The anon key and the Cloudinary cloud name/preset are public-by-design.
  They're meant to ship in client bundles. Never put a Cloudinary API
  secret or a Supabase service-role key in this app.
- `GEMINI_API_KEY` is a Supabase Edge Function secret, not a
  `VITE_`-prefixed client variable, it must never end up in the browser
  bundle. The `ai-fill`, `clean-description` and `summarize-dish`
  functions are the only things that read it.
- Run `supabase/multi-chef-migration.sql`, not `phase2-auth-policies.sql`
  (superseded, kept only for history). The migration makes meal reads
  public again (needed for public chef pages) and scopes every write to
  `auth.uid() = user_id`, so one chef's account can never read or write
  another chef's rows even though the table is shared.
- `vercel.json` rewrites every path to `/index.html`, required for a
  direct hit on `/<slug>` to work, since routing happens client-side.
