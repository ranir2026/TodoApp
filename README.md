# Todo App

**Live demo:** https://ranir2026.github.io/TodoApp

The app works locally with browser storage. To enable cross-device sync:

1. Create a Supabase project.
2. Run `supabase-schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and fill in the project URL, publishable anon key, and public app URL.
4. In Supabase Authentication, enable the Email provider.
5. Start the app with `npm run dev` and create an account.

On the first sign-in, existing local todos and courses are uploaded when the account has no cloud state. Later changes sync automatically across signed-in devices.

## Development

```bash
npm install
npm run dev
```

Create a production build with `npm run build`, check code quality with `npm run lint`, and run the tests with `npm test`.

## Canvas import (admin preview)

Canvas import is still being tested, so it only appears at `/TodoApp/admin/` (the build copies the page there). That's a hidden page, not access control: anyone with the link can open it, and they still sign in and see only their own data.

Students connect their Canvas **calendar feed** link (Canvas, then Calendar, then Calendar Feed). The link is a secret, so it's stored only in the user's own `app_state` row (not in localStorage), is shown masked, and is sent only to the `canvas-feed` Edge Function, which fetches and parses the feed server-side. The design and what Canvas's feed really contains are in `CANVAS_INTEGRATION.md`.

Once connected, the app checks each feed while it's open: after it loads the cloud copy (on load, on focus, and coming back online), at most every 10 minutes per feed, and whenever the user presses refresh. A failed check changes nothing. Imported tasks get a Canvas chip linking to the assignment and a flag when Canvas moves a due date. Courses that show up later (a new semester) get a "match them" notice above the list. The Canvas card in the right column (Profile on mobile) opens settings: the masked link, course mapping, import toggles and Disconnect.

### Deploying the `canvas-feed` function

1. Run the Canvas statements from `supabase-schema.sql` in the Supabase SQL editor: the `canvas` column and the `canvas_feed_requests` rate-limit table and `canvas_feed_allow()` function.
2. Sign in to the Supabase CLI once: `npx supabase login`.
3. Deploy: `npx supabase functions deploy canvas-feed --project-ref <your project ref>` (the ref is the subdomain of your Supabase URL). `supabase/config.toml` sets `verify_jwt = false` for it because the function checks the caller's sign-in itself, which works with both old and new Supabase signing keys.
4. Optional: if the app is served from somewhere other than `https://ranir2026.github.io` or localhost, set the allowed origins: `npx supabase secrets set ALLOWED_ORIGINS=https://your.site --project-ref <ref>`.

The function needs no other secrets: it uses the `SUPABASE_URL` Supabase provides, and the app's own public key from the request. It accepts only `https` links shaped like `/feeds/calendars/*.ics` on public hostnames, never follows redirects, times out after 10 seconds, caps feeds at 3 MB, allows 30 fetches per user per 10 minutes, and returns error codes only, so the link never appears in responses or logs.
