# R-L

Interactive meal diary gallery — a React + Vite app implementing the Meal
Diary design system, backed by Supabase (data) and Cloudinary (photos).

## Local development

```bash
npm install
npm run dev
```

Without any environment variables set, the app runs on local demo data and
newly added meals live only in memory for that session — a banner at the
top of the page says so.

## Wiring up Supabase and Cloudinary

1. Copy `.env.example` to `.env` and fill in the four values (see below).
2. In your Supabase project's SQL editor, run `supabase/schema.sql` once to
   create the `meals` table and its (intentionally open, Phase-1) policies.
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

### Sign-in (Phase 2)

Once Supabase is configured, "+ Add meal" and "Publish site" are gated
behind sign-in — this app has exactly two intended users (Lucy and her
partner), not open registration, so there's no sign-up form.

1. In Supabase → Authentication → Users → Add user, create an account for
   each person (email + password).
2. Run `supabase/phase2-auth-policies.sql` once to restrict inserts to
   signed-in users (reads stay public — the gallery is still meant to be
   browsed by anyone with the link).
3. Click "Sign in" in the app's top bar and use those credentials.

Without Supabase configured, the app stays in demo mode and editing is
open to everyone, same as before.

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
- `supabase/schema.sql`'s policies allow anyone with the anon key to read
  and insert meals, matching this project's Phase 1 (no accounts yet).
  Tighten them once the brief's password login (or Phase 2 per-user auth)
  is wired up.
