# Todo App

**Live demo:** https://ranir2026.github.io/TodoApp

The app works locally with browser storage. To enable cross-device sync:

1. Create a Supabase project.
2. Run `supabase-schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and fill in the project URL, publishable anon key, and public app URL.
4. In Supabase Authentication, enable the Email provider.
5. Start the app with `npm run dev` and create an account.

On the first sign-in, existing local todos and courses are uploaded when the account has no cloud state. Later changes sync automatically across signed-in devices.

## Before going public

1. **Database.** On a project set up before November 2026, run `supabase/launch-2026-11.sql` in the SQL editor. It adds the `prefs` column (onboarding progress) and `delete_my_account()`. A new project gets both from `supabase-schema.sql`. The last three queries in the file are read-only checks that every table has row-level security and that only signed-in accounts can call the functions, with the expected result beside each.
2. **Email, for now: off.** Supabase's built-in sender is for testing: it sends a few emails an hour and may only reach your Supabase team. So for a small launch, email confirmation is off (Authentication, Sign In / Providers, Email, "Confirm email") and new accounts are signed in straight away. Password reset needs email too, so "Forgot password?" is hidden until `VITE_PASSWORD_RESET=on` is in `.env.local`.
3. **Test on a fresh address:** create an account and the app opens signed in. Sign out, and sign back in with the same password.

When the app is shared more widely, turn email on:

1. **Email sender.** In Authentication, Emails, SMTP Settings, add a provider (Resend, Brevo, Postmark, Amazon SES or similar), with "Todo" as the sender name. Most need a domain you own to send from.
2. **Email wording.** In Authentication, Emails, Templates, paste `supabase/templates/confirm-signup.html` into "Confirm signup" and `supabase/templates/reset-password.html` into "Reset password". The subject line is at the top of each file.
3. **Links.** In Authentication, URL Configuration, the Site URL is the app's public address (the same as `VITE_APP_URL`), and it's in Redirect URLs. Password reset links come back to the same address as confirmation links, so nothing else is needed.
4. **Switch it on.** Turn "Confirm email" back on, add `VITE_PASSWORD_RESET=on` to `.env.local`, and deploy.
5. **Test on a fresh address:** create an account, open the email, the link lands on "Email confirmed", "Open Todo" opens the app signed in, and signing in before confirming offers "Send the link again". Then "Forgot password?", open that email, choose a new password, and sign in with it.

Privacy and your data (under the account box on a computer, Profile then Help on a phone) says what's stored, why, and who can see it, and has Delete account. Until step 1 is run, Delete account says it isn't switched on yet.

### New accounts and What's new

A new account starts with the categories Personal and Work, a Getting started checklist, and examples for it to point at: two tasks and a project on the timeline (`src/starterData.js`). An account that already has tasks gets a "What's new" note once instead. Both, and the one-time tips, are remembered in the account's `prefs` (see `src/prefs.js`), so they don't come back on another device. For a new note, change `RELEASE` in `src/prefs.js` and the items in `src/WhatsNew.jsx`. The User Guide lists features from `src/features.js` and hides any the account can't use, such as Canvas when the app runs without an account.

## Development

```bash
npm install
npm run dev
```

Create a production build with `npm run build`, check code quality with `npm run lint`, and run the tests with `npm test`.

## Canvas import

Signed-in users can connect Canvas from the Canvas card in the right column (Profile on mobile). It was first tested at `/TodoApp/admin/`; the build still copies the page there so old links keep working, but that copy is now the same as the main page.

Students connect their Canvas **calendar feed** link (Canvas, then Calendar, then Calendar Feed). The link is a secret, so it's stored only in the user's own `app_state` row (not in localStorage), is shown masked, and is sent only to the `canvas-feed` Edge Function, which fetches and parses the feed server-side. The design and what Canvas's feed really contains are in `CANVAS_INTEGRATION.md`.

Once connected, the app checks each feed while it's open: after it loads the cloud copy (on load, on focus, and coming back online), at most every 10 minutes per feed, and whenever the user presses refresh. A failed check changes nothing. Imported tasks get a Canvas chip linking to the assignment and a flag when Canvas moves a due date. Courses that show up later (a new semester) get a "match them" notice above the list. The Canvas card in the right column (Profile on mobile) opens settings: the masked link, course mapping, import toggles and Disconnect.

### How sync works

- **Identity.** An imported task's id is `canvas:<school>:<key>`. For assignments the key is the assignment id from the item's link, because Canvas changes an item's UID when a section gets its own due date but keeps the link. Two devices importing the same feed make the same ids, so their tasks merge instead of duplicating, and two schools can't collide.
- **Merging.** Every check runs the pure `reconcile` in `src/canvasSync.js`. Each task keeps what Canvas last said (`canvas.synced`), so a field changes only when Canvas changed it and the user didn't. Completion and priority are never touched. Canvas's own due value (a date or a UTC instant) is kept too, so a device in another time zone shows local times without marking every task as moved. A real change sets the "Date moved" flag.
- **Removals.** Deleting an imported task records its id, so it never comes back. When Canvas drops an item, the task is removed only if it was never edited or completed; otherwise it stays, marked "Not in Canvas". An empty feed removes nothing. A feed that would remove more than half of a school's recent tasks is treated as a Canvas outage, and nothing is removed that round.
- **Courses.** Each course is matched to a category once. Settings lists every course the feed has shown, including ones never given a category (for example, all past due at setup) and why. A course that later gets work shows a "match them" notice.
- **Missing courses.** Canvas's feed only includes courses the student is enrolled in right now, and only their published work with a due date, from 30 days ago to a year ahead. A course outside that never reaches the app.
- **Broken links.** If Canvas stops recognizing a saved link (the student reset it, say), the error is saved on the feed so every device asks for the new link. The new link reattaches to the same tasks and skips matching when every course is already matched.

A bug this design caught: deleting a category moved its Canvas tasks to another category, but they still recorded the deleted one as where Canvas had put them. The app then treated the move as the student's own edit, so the tasks never followed the course when it was matched to a new category. Deleting a category now updates that record too (`reassignCategory` in `src/canvasManage.js`), and a test covers re-matching from both settings and setup.

### Privacy

The feed link, course choices and imported assignments are stored only in the student's own `app_state` row, which only they can read (RLS), and never in localStorage. The link is shown masked, is sent only to the `canvas-feed` function, and never appears in responses or logs. Disconnecting deletes the link. Choosing "Remove tasks" also deletes the imported assignments. Course choices and the ids of deleted tasks stay, so reconnecting doesn't ask again or bring deleted tasks back. Settings says this in the app.

### Deploying the `canvas-feed` function

1. Run the Canvas statements from `supabase-schema.sql` in the Supabase SQL editor: the `canvas` column and the `canvas_feed_requests` rate-limit table and `canvas_feed_allow()` function.
2. Sign in to the Supabase CLI once: `npx supabase login`.
3. Deploy: `npx supabase functions deploy canvas-feed --project-ref <your project ref>` (the ref is the subdomain of your Supabase URL). `supabase/config.toml` sets `verify_jwt = false` for it because the function checks the caller's sign-in itself, which works with both old and new Supabase signing keys.
4. Optional: if the app is served from somewhere other than `https://ranir2026.github.io` or localhost, set the allowed origins: `npx supabase secrets set ALLOWED_ORIGINS=https://your.site --project-ref <ref>`.

The function needs no other secrets: it uses the `SUPABASE_URL` Supabase provides, and the app's own public key from the request. It accepts only `https` links shaped like `/feeds/calendars/*.ics` on public hostnames, never follows redirects, times out after 10 seconds, caps feeds at 3 MB, allows 30 fetches per user per 10 minutes, and returns error codes only, so the link never appears in responses or logs.
