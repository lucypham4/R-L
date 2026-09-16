# R-L

A meal-logging platform for any chef — a React + Vite app implementing the
Meal Diary design system, backed by Supabase (data + auth) and Cloudinary
(photos).

Any chef can create an account. Signing in at the root URL is your private
admin view — only you can see and add your own meals there. Every chef also
gets a live, public, read-only page at `/<your-page-name>` that anyone can
browse with no account — that's what you share with clients, and it updates
the moment you add a meal.

## Local development

```bash
npm install
npm run dev
```

Without any environment variables set, the app runs on local demo data and
newly added meals live only in memory for that session — a banner at the
top of the page says so, and there's no sign-in screen in this mode.

## Wiring up Supabase and Cloudinary

1. Copy `.env.example` to `.env` and fill in the four values (see below).
2. In your Supabase project's SQL editor, run `supabase/schema.sql` once
   (creates the `meals` table), then `supabase/multi-chef-migration.sql`
   once (adds the `chefs` table, scopes every meal to its own chef, and
   sets the row-level security policies this app actually relies on today
   — see Security notes).
3. In Cloudinary, create an **unsigned** upload preset (Settings → Upload →
   Upload presets → Add upload preset, signing mode "Unsigned"). Unsigned
   presets are what let the browser upload directly without exposing your
   API secret; restrict it to image formats and a folder from the same
   dashboard if you want.
4. Restart `npm run dev` — the notice banner disappears once both are
   configured, and "+ Add meal" persists real rows with real photo URLs.

### Environment variables

| Variable | Where to find it |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key |
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloudinary → Dashboard |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Cloudinary → Settings → Upload → your unsigned preset's name |

Both integrations degrade independently: if only Supabase is configured,
photos stay as local blob URLs for the session; if only Cloudinary is
configured, uploads go live but meals aren't persisted.

Note: every chef on a given deployment shares the same Cloudinary account
and upload quota — there's no per-chef Cloudinary isolation yet.

### Accounts and public pages

Sign-up is open — anyone can create an account from the sign-in screen's
"New chef? Create an account" link. There's no admin approval step.

1. First sign-in (or right after signing up, if your Supabase project
   doesn't require email confirmation) prompts for a name and a page name
   — the page name becomes the `/<slug>` in your public URL and can't be
   changed later, so choose deliberately.
2. After that, a short skippable welcome tour runs once
   (`src/components/OnboardingTour.jsx`), with placeholder art slots you
   can swap for real illustrations whenever they're ready.
3. From then on, signing in goes straight to your own gallery. "View
   public page ↗" in the top bar opens your `/<slug>` page — that's the
   link to actually share.

If your Supabase project has "Confirm email" turned on (Authentication →
Settings), new sign-ups won't get a session until they click the link in
their inbox — the sign-in screen tells them to check their email and
switches back to the sign-in form.

### iOS App Store transition

The `ios/` folder is a Capacitor-wrapped native shell around this same web
app — `npx cap add ios` already scaffolded it, so the JS-side setup is
done. Everything past this point needs a Mac, which this environment
doesn't have:

1. On a Mac, install Xcode and CocoaPods, then `git pull` this repo.
2. `npm install && npm run cap:sync` (builds the web app and copies it
   into the native shell).
3. `npm run cap:open:ios` to open the project in Xcode.
4. In Xcode: sign in with an Apple Developer Program account ($99/year),
   set a real bundle identifier under Signing & Capabilities (the
   placeholder in `capacitor.config.json` is `com.mealdiary.app` — change
   it to match your account before submitting), and run on a simulator or
   device to test.
5. Archive and submit through App Store Connect once it looks right.

### Security notes

- The anon key and the Cloudinary cloud name/preset are public-by-design —
  they're meant to ship in client bundles. Never put a Cloudinary API
  secret or a Supabase service-role key in this app.
- Run `supabase/multi-chef-migration.sql`, not `phase2-auth-policies.sql`
  (superseded — kept only for history). The migration makes meal reads
  public again (needed for public chef pages) and scopes every write to
  `auth.uid() = user_id`, so one chef's account can never read or write
  another chef's rows even though the table is shared.
- `vercel.json` rewrites every path to `/index.html` — required for a
  direct hit on `/<slug>` to work, since routing happens client-side.
