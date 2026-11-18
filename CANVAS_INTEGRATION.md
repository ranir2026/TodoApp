# Canvas integration: implementation brief (iCal first)

You are implementing a Canvas LMS integration for this todo app. The first version imports assignments from the student's **Canvas calendar feed (iCal URL)**. A later, optional phase adds an API token for submission status. Read this whole file first, then work phase by phase. Do not skip Phase 0. Do not start a phase until the previous one is verified. Ask the user when something here conflicts with what you find in the code or the feed.

## Goal

A student pastes their Canvas calendar feed link once. Their assignments appear as tasks under the right categories, **with no duplicate tasks or duplicate categories**. Priorities: lowest-friction setup, trustworthy dates, no destructive surprises. Other students at various schools will use this app, so nothing may be specific to one school.

## Decisions already made (do not re-litigate)

- **Source for v1: the Canvas iCal "Calendar Feed" URL.** It needs no admin approval, works at every school, and **never expires**. API tokens expire (30 days at the user's school, enforced by the school), so they are an optional upgrade (Phase 7), not the base. OAuth/LTI are out: each school's admin would have to approve.
- **Setup lives in its own modal** ("Connect Canvas"), not in settings. Settings holds ongoing management only.
- **Course matching is a one-time confirmed step**, never silent auto-merge. Suggestions are pre-selected; the user confirms once.
- **Local state wins.** Completion, priority and user edits are never overwritten by a sync. The feed has no submission status, so completion is manual in v1 (say so in the UI).
- **Never match tasks by title.** Identity is the feed `UID`, namespaced by school.
- **Reconcile logic is client-side and pure**, consistent with the existing architecture. The Edge Function only fetches and parses the feed.
- **No background sync.** Sync runs while the app is open.

## Codebase facts (verified)

- Vite + React 19 + Tailwind 4, deployed as a static site to GitHub Pages. Supabase is the only backend. **No Edge Functions exist yet**, so you will set up that tooling (Supabase CLI, function folder, deploy). Secrets live in Supabase secrets, not Vite env vars.
- All user state is one `app_state` row per user (`supabase-schema.sql`): `todos`, `courses` (categories), `quick_links`, `planner`, each a jsonb blob. Clients can read only their own row (RLS).
- `src/useSyncedData.js` syncs these with debounced upsert plus realtime. New `app_state` columns are registered in `OPTIONAL_COLUMNS` so Supabase projects without the latest schema keep working. Follow that pattern for the new `canvas` column. `src/outageRecovery.js` merges edits; check it when state shape changes.
- Todos are created in `addTodo` in `src/App.jsx` with `crypto.randomUUID()` ids. Fields include `id, type, title, courseId, dueDate, startTime, endTime, priority, description, completed, completedAt, createdAt`. In the UI, "courses" are called categories.
- Courses are `{ id, name, color, archived? }`; colors come from `src/courseColors.js`.
- `src/noteLinks.js` already recognizes Canvas hosts for link labels.
- Existing modal and sheet components to reuse: `src/QuickLinkModal.jsx`, `src/EditItemModal.jsx`, `src/BottomSheet.jsx` (bottom sheet on mobile). A toast with undo exists (`showUndo` in `App.jsx`); reuse it.
- There is no test runner. Add Vitest in Phase 3.
- Check `.agents/skills/` for design and animation conventions before building UI.

## Feed format (verified in Phase 0)

Checked on 2026-11-17 against one real student feed (82 items, one `*.instructure.com` school) and Canvas's export code (`CalendarEvent::IcalEvent#to_ics` and `CalendarEventsApiController#public_feed` in instructure/canvas-lms). Item types the sample lacked come from the code; `src/__fixtures__/canvas/README.md` marks which. Each item is a `VEVENT`:

| Field | Actual | Use |
|---|---|---|
| `UID` | `event-assignment-<assignmentId>`. When the student's date comes from a section or per-student override: `event-assignment-override-<overrideId>`, whose number is the override's id, not the assignment's (21 of 82 sample items). `event-calendar-event-<id>` for calendar events, including personal and appointment items. `event-sub-assignment-<id>` for discussion checkpoints. Quizzes and graded discussions are ordinary `event-assignment` items. | Identity: see the open question below |
| `SUMMARY` | `<title> [<course_code>]`. The bracket appears only for course items. `course_code` is whatever the school sets: at the sampled school `SUBJ1234.SECTION.TERM`, `SUBJ1234.MERGED.TERM`, or a non-course name such as `Some.Community.26.27`; other schools use other styles. Overrides read `<title> (<override title>) [<code>]`, where the override title is a section name or "1 student". Sometimes two spaces precede `[`. | Title: strip the trailing bracket, plus the override parenthetical on override items. Course label: the bracket |
| `DTSTART`/`DTEND` | Timed items: UTC `...Z` with seconds zeroed, no TZID, no VTIMEZONE; for assignments `DTEND` = `DTSTART`. All-day items: `DTSTART;VALUE=DATE;VALUE=DATE:<date>` (the `VALUE` parameter is duplicated, a Canvas serializer quirk the parser must tolerate) and no `DTEND`. Canvas makes an assignment all-day when it's due at 11:59 PM in the zone it was edited in, so all-day means "due by the end of that date". No timed sample item fell on 11:59 PM local; 37 of 82 were all-day. | `dueDate` and `startTime`. All-day stays date-only |
| `URL` | Not `/courses/<id>/assignments/<id>`. It is `https://<host>/calendar?include_contexts=<course_N\|user_N\|group_N>&month=MM&year=YYYY#<assignment_N\|calendar_event_N>`. Overrides keep the base assignment's fragment. Sub-assignments carry their parent assignment's id. | Course identity from `include_contexts=course_<id>`. Deep link built as `https://<host>/courses/<courseId>/assignments/<assignmentId>`; Canvas redirects that to the quiz or discussion |
| `DESCRIPTION` | Plain text converted from HTML, with `\n` escapes. Missing or empty on many items (29 of 82); an HTML copy sits in `X-ALT-DESC;FMTTYPE=text/html`. Canvas does not truncate it (the longest sample was about 2.5k characters). | Notes only, never source of truth |
| `LOCATION` | Calendar events only. | Notes |

Other facts:
- **Window:** 30 days back to 366 days ahead (from the code; the sample began exactly 30 days before download). Items roll off after 30 days, so absence from the feed does NOT mean deleted. 48 of the 82 sample items were already past due.
- **Not in the feed:** undated assignments, unpublished assignments, submission status, points, grades and course names. The course appears only as the bracket code and in `include_contexts`.
- **No-course items:** personal (`user_N`) and group (`group_N`) events have no bracket and no course id.
- **Other fields:** `SEQUENCE` is always 0. `DTSTAMP` is the item's last update. `CLASS:PUBLIC`.
- **Encoding:** CRLF, folded at 75 octets on character boundaries; text escapes `\,` `\;` `\n`.
- **Host:** the event `URL` host is the school's Canvas host. Custom domains exist besides `*.instructure.com` (the sample was instructure-hosted). In Phase 2, check that it matches the feed URL's host before namespacing by it.

**Identity key (decided by the user, 2026-11-17).** Keying on the UID breaks for overrides. When a teacher gives a section or one student a different date (an extension, say), that student's item changes from `event-assignment-<A>` to `event-assignment-override-<O>` for the same assignment. A UID key would then add a duplicate task and mark the original "no longer in Canvas". So the key is `assignment-<A>` from the URL fragment for `event-assignment` and `event-assignment-override` items. Sub-assignments keep their UID (minus `event-`), since their fragment is the parent's id and two checkpoints would collide. So do calendar events and anything without a fragment. The task id stays namespaced, `canvas:<domain>:<key>`, and `canvas.uid` keeps the raw UID.

**Defaults (Phase 0 decision):** import assignments only: `event-assignment`, `event-assignment-override` and `event-sub-assignment`. Calendar events, personal and group events included, sit behind `includeNonAssignments`. The first import skips past-due items: a timed item is past due once its instant has passed, an all-day item once its date is before today in local time. An all-day item due today is not past due.

## Data model

New optional jsonb column `canvas` on `app_state`, registered in `OPTIONAL_COLUMNS`:

```
{
  feeds: [{ id, url, domain, label, lastSyncedAt, status }],     // a list: students can have 2 schools
  courseMap: { "<domain>:<canvasCourseId>": "<categoryId>" | null },   // null = skipped ("Don't import")
  dismissedIds: [],            // tombstones: user-deleted imports must not return
  includeNonAssignments: false,   // calendar events etc.; assignments only by default
  includePastDue: false
}
```

An empty `{}` means "never connected", not "cleared" (mirror `hasPlannerData`).

**Imported tasks:** `id: "canvas:<domain>:<key>"` (the identity key under "Feed format") plus `canvas: { domain, uid, key, courseId, url, synced }`, where `synced` is what Canvas last said, used to tell user edits from Canvas changes. **Categories created through Canvas:** `id: "canvas-course:<domain>:<courseId>"`. Deterministic, namespaced ids make two devices importing at once collapse into one task and prevent collisions across schools.

The feed URL is a read-only capability link, so it lives in the user's own RLS-protected `app_state` row (lower stakes than an API token). It must still be masked in the UI, never logged, never in errors, and sent only to the Edge Function.

## Security requirements (apply to every phase)

- The Edge Function requires a valid Supabase user JWT.
- **SSRF protection:** `https` only; the path must look like a Canvas feed (`/feeds/calendars/*.ics`); reject IP literals, `localhost` and internal hostnames; **do not follow redirects**; short timeout; response size cap.
- The feed URL never appears in logs, error messages or analytics.
- Per-user rate limiting on the function.
- No secrets in the repo or in `.env.example` values.

## Phase 0: Verify assumptions with real data

**Never ask for the feed URL in chat and never commit a real feed.** Ask the user to open their feed URL in a browser, save the `.ics` to a path **outside the repo** (for example `C:\Users\radev\Downloads\canvas.ics`), and tell you the path. Read it from there.

Confirm or correct each assumption above. Build scrubbed fixtures under `src/__fixtures__/canvas/` with fake course and assignment names, so no real data is committed. Cover: a timed assignment, an all-day item, a calendar event, an item with no course URL, and a duplicate-looking course (two sections). Decide defaults: assignments only; skip past-due on first import. Report mismatches before continuing.

**Done when:** the assumptions table is confirmed or corrected, and fixtures exist.

## Phase 1: Schema and state

- Add the `canvas` column to `supabase-schema.sql` (`add column if not exists`, default `'{}'::jsonb`).
- Register it in `OPTIONAL_COLUMNS` and thread it through `useSyncedData` (fetch, apply remote, save, diff check) the way `planner` is handled. Add state and a setter in `App.jsx`. Check `outageRecovery.js`.

**Done when:** `canvas` config round-trips across devices, and an old project without the column still syncs everything else.

## Phase 2: Edge Function `canvas-feed`

Set up the Supabase Functions tooling, then build `canvas-feed { url }`:

- Validate per the security requirements, fetch server-side (this also avoids CORS, since Canvas feeds send no CORS headers), parse with a real ICS library (line folding, escaping, TZID). Do not hand-roll parsing.
- Return normalized JSON items `{ uid, title (bracket stripped), courseId, courseLabel, dueDate/dueAt, allDay, url, description, kind }`, plus the `domain`.
- **Time zones are the most trust-sensitive part.** Return UTC instants where the feed gives them, and flag all-day items so they stay date-only (never a fake 12:00 AM). Test 11:59 PM due dates and daylight-saving boundaries.
- Specific error codes: not a URL, not https, not a Canvas feed, feed disabled or 404, timeout, too large, unparseable.
- CORS handling for the GitHub Pages origin. Document deployment in the README.

**Done when:** fixtures parse to the expected JSON, the error codes are tested, and the function works against the user's real feed (the user supplies it through an environment variable or the app, never in chat).

## Phase 3: Reconcile engine (pure and unit-tested; no UI)

`src/canvasSync.js`: `reconcile({ feedItems, todos, courses, canvasState, now, timeZone }) -> { todos, courses, summary, unmappedCourses }`.

Rules:
- Match by id only. Create when absent, update when present.
- Convert UTC due times to the device's local `dueDate` and `startTime`.
- Update an untouched task's title and due date. Flag moved due dates. Never overwrite completion, priority or fields the user edited.
- Skip ids in `dismissedIds`. Hold back items whose course is unmapped (report in `unmappedCourses`); skip courses mapped to `null`. Items with no course go to a clearly labeled "Canvas, no course" prompt in the matching step.
- Assignments only by default; other kinds behind `includeNonAssignments`. First import skips past-due items unless `includePastDue`.
- Item gone from the feed: remove only if untouched and not completed; otherwise mark it "no longer in Canvas". An empty or failed feed result must never delete anything.
- A mapping pointing at a deleted category counts as unmapped.
- Return `summary` `{ added, updated, unchanged, held }`.

Add Vitest. Test: idempotency (reconcile twice = no change), two-device concurrent import, tombstones, user edits preserved, removal rules, empty feed, dangling mapping, multi-school id collisions, time zones.

**Done when:** all tests pass and reconcile is idempotent.

## Phase 4: "Connect Canvas" setup modal

A dedicated modal (bottom sheet on mobile), three steps:

1. **Connect.** Exact steps for finding the feed (open the school's Canvas Calendar, then "Calendar Feed" at the bottom of the right sidebar), a deep link to `https://<school>/calendar`, a one-tap paste-from-clipboard button, and live validation using the Phase 2 error codes with specific messages. Fetches on paste. Say plainly that completion stays manual because the feed doesn't include submission status.
2. **Match courses.** One row per Canvas course found: a dropdown with every existing category, "New category" (name editable, defaults to the cleaned label), or "Don't import". Pre-select a suggestion but apply nothing until the user confirms. Suggestion order: exact or substring match on normalized name, prefix match ("phys" matches Physics), a small department-code table (PHYS to physics, MATH to math, CS to computer science, CHEM, BIOL, and so on), else "New category". Many-to-one is allowed (lecture plus lab to one category).
3. **Review and import.** Preview ("34 assignments across 4 courses"), toggles for non-assignment events and past-due, then Import.

Closing mid-flow imports nothing. On success: close and show a toast "Added N, Undo". Undo must also remove categories the import created.

**Done when:** a user with an existing "Physics" category who connects a feed containing `PHYS1156` sees it pre-selected, confirms, and ends with no duplicate category.

## Phase 5: Ongoing sync and management UX

- Sync on app load, window focus (debounced; coordinate with the focus handling already in `useSyncedData`) and a manual refresh. Show the last-synced time, and tell users the feed itself can lag behind Canvas.
- Canvas badge on imported tasks, linking to the assignment. A visible "due date moved" flag.
- Non-blocking banner "N new Canvas courses, match them" that reopens the modal at step 2 with only the new rows (for example a new semester).
- Settings panel: feeds (URL masked), editable course mapping (changing a mapping moves only Canvas-imported tasks), toggles, and **Disconnect** (asks whether to keep or remove imported tasks). Tombstones survive disconnect and reconnect, and reconnecting reattaches to existing ids instead of duplicating.
- Offline or function failure shows a quiet status in the existing sync pill, never anything destructive.

## Phase 6: Hardening and launch

- Edge cases: deleted-category dangling mapping, reconnect after disconnect, two simultaneous devices, feed disabled or regenerated by the user (old URL stops working: prompt for the new one without losing data), empty feed, Canvas outage.
- A short privacy note: what is stored (feed URL, imported assignment data), how to delete it.
- README section on the sync design and one real bug found and fixed.
- Beta with a few students at different schools before wider release.

## Phase 7 (optional, only on user demand): API token upgrade for submission status

Only build this if users ask for auto-complete. It sits on top of the iCal base; the feed keeps working if the token is missing or expired.

- The token is **encrypted server-side** (a `canvas_connections` table with RLS on and no client policies; AES-GCM with a key in a Supabase secret and a `key_version`). It is never returned to the browser, never stored in `app_state`, never logged.
- Edge Functions use **GET only, to an allowlist of Canvas paths** (`/users/self`, `/courses`, `/planner/items`), with the same SSRF protections and per-user rate limits as above.
- Planner items carry submission flags (`submitted`, `late`, `missing`, `excused`); add a `submitted` signal to reconcile: auto-complete, never auto-uncomplete, and do not re-complete after the user un-completes.
- **Tokens expire (30 days at the user's school, enforced).** Store the connection date and an entered expiry, warn a few days before it lapses, make renewal one tap (domain prefilled, token field focused), and on a 401 mark the connection `needs_reconnect` without deleting any data. A renewed token reattaches to existing ids and does not re-run course matching.
- Tell users plainly what a token can access, recommend an expiry date and the name "Todo app", and explain how to revoke it in Canvas (Settings, Approved Integrations) on disconnect.
- Verify the exact API shapes against real data first. Never ask for a token in chat or put one in the repo; use environment variables in the user's own terminal.

## Out of scope for v1

Background or cron sync, writing anything back to Canvas, grades display, OAuth, a browser extension.

## Ground rules for the implementing agent

- Never delete or overwrite user-created data. Imported data is identified by the `canvas` field and the `canvas:` / `canvas-course:` id prefixes.
- The feed URL (and, in Phase 7, any token) must never appear in the repo, chat, logs, error messages or analytics.
- Match existing code style and the design conventions in `.agents/skills/`. Run `npm run lint` and the tests before reporting a phase done.
- Report at the end of each phase: what was built, how it was verified, and anything that deviated from this brief.
- Do not commit or push unless the user asks.
