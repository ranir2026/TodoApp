# Canvas calendar-feed fixtures

Scrubbed stand-ins for real Canvas iCal feeds. Every name, id, host and person here is fake. Never put a real feed in the repo: the feed URL is a secret link, and a downloaded feed is named after its secret token (`user_<token>.ics`). The root `.gitignore` ignores `*.ics` outside this folder.

The format mirrors one real student feed checked in Phase 0 (an `*.instructure.com` school, 82 items), plus item types that sample didn't contain, built from Canvas's export code (`CalendarEvent::IcalEvent#to_ics` in instructure/canvas-lms). Provenance per item:

- **O**: observed in the real feed
- **C**: built from Canvas's code, not yet seen in real data
- **R**: robustness only; Canvas doesn't emit this

Expected times below are for `America/New_York` with `now = 2026-11-17T17:00:00Z` (noon local), the values the tests use.

## Files

| File | What it is |
|---|---|
| `school-a.ics` | The main feed. Matches the real format exactly: CRLF, lines folded at 75 octets, `PRODID:icalendar-ruby`, properties in Canvas's order, `CODE.SECTION.TERM` course codes. |
| `school-b.ics` | A second school on a custom domain, with other schools' course-code styles, LF line endings and deliberate id collisions with school A. |
| `empty.ics` | A valid calendar with no events. An empty feed must never delete anything. |

`.gitattributes` keeps these byte-exact (`-text`), so git won't rewrite the CRLF/LF difference. If you edit one by hand, keep every physical line within 75 octets.

## school-a.ics (host `example.instructure.com`)

Courses: `course_501` PHYS1153 lecture and `course_502` PHYS1156 lab (lecture plus lab, many-to-one; the Phase 4 check is an existing "Physics" category plus PHYS1156); `course_503` MATH2010; `course_504` and `course_505`, two sections of CHEM1211 (duplicate-looking course); `course_506` ENGL1010 merged sections; `course_507` a non-course "community" shell; `course_508` CS2100.

| UID | Context | URL fragment | Due (local) | Src | Tests |
|---|---|---|---|---|---|
| `event-assignment-1001` | course_501 | assignment_1001 | Nov 19, 11:00 PM | O | UTC date (Nov 20) differs from the local date |
| `event-assignment-1002` | course_501 | assignment_1002 | Nov 22, all day | O | `VALUE=DATE;VALUE=DATE`, no `DTEND`; two spaces before `[`; multi-line description with a no-break space and an emoji across folds; `\;` in `X-ALT-DESC` |
| `event-assignment-1003` | course_502 | assignment_1003 | Nov 24, 12:00 PM | O | Empty `DESCRIPTION` and `X-ALT-DESC` |
| `event-assignment-1004` | course_502 | assignment_1004 | Oct 29, 11:00 PM EDT | O | Past due; before the DST change; no description at all |
| `event-assignment-1005` | course_503 | assignment_1005 | Nov 16, all day | O | All-day and past due (yesterday) |
| `event-assignment-1006` | course_503 | assignment_1006 | Nov 1, 1:30 AM EDT | O | DST fall-back: the first 1:30 AM |
| `event-assignment-1007` | course_503 | assignment_1007 | Nov 1, 1:30 AM EST | O | DST fall-back: the second 1:30 AM, one hour after 1006 |
| `event-assignment-1008` | course_503 | assignment_1008 | Dec 7, 11:59 PM | O | Timed 11:59 PM (seconds zeroed, as Canvas does) must stay Dec 7 |
| `event-assignment-1009` | course_504 | assignment_1009 | Nov 19, 8:00 AM | O | Same title and time as 1010 in the other CHEM section |
| `event-assignment-1010` | course_505 | assignment_1010 | Nov 19, 8:00 AM | O | Must stay a separate task from 1009 (never match by title) |
| `event-assignment-override-7001` | course_506 | assignment_1011 | Nov 18, 2:00 PM | O | Override: the UID number is the override id; the URL holds the assignment id; section name in parentheses; `MERGED` code |
| `event-assignment-override-7002` | course_506 | assignment_1012 | Nov 24, 7:00 PM | C | Per-student override ("1 student") |
| `event-assignment-1013` | course_508 | assignment_1013 | Dec 3, 12:00 PM | O | Description links to a non-Canvas host |
| `event-calendar-event-4001` | course_508 | calendar_event_4001 | Dec 2, 6:00–7:30 PM | C | Calendar event: `DTEND` after `DTSTART`, `LOCATION` with `\,` |
| `event-calendar-event-4002` | user_9001 | calendar_event_4002 | Nov 19, 2:30–3:00 PM | C | Personal event: `user_N` context and no course bracket ("no course") |
| `event-calendar-event-4003` | course_501 | calendar_event_4003 | Nov 26, all day | C | All-day non-assignment |
| `event-assignment-1014` | course_507 | assignment_1014 | Mar 10 2027, all day | O | Non-course code label; far future (the window reaches 366 days) |
| `event-sub-assignment-5001` | course_503 | assignment_1015 | Nov 19, 10:00 PM | C | Discussion checkpoint: its fragment is the parent assignment's id |
| `event-sub-assignment-5002` | course_503 | assignment_1015 | Nov 21, 10:00 PM | C | Second checkpoint of the same discussion (same fragment, different UID). Title wording is a guess |
| `event-assignment-1016` | course_501 | assignment_1016 | Oct 19, 11:00 PM EDT | O | Past due, near the start of the 30-day window |

Past due at `now`: 1004, 1005, 1006, 1007, 1016.

## school-b.ics (host `canvas.example.edu`)

Course-code styles: `BIOL 110` (code only), `HIST-205-02` (code and section), `PSY 101 Fall 2026` (code and term). Line endings are LF (R).

| UID | Context | URL fragment | Due (local) | Src | Tests |
|---|---|---|---|---|---|
| `event-assignment-1001` | course_501 | assignment_1001 | Nov 20, 11:59 PM | O | Same UID and course id as school A on another host: must be a separate task in a separate course |
| `event-assignment-1020` | course_502 | assignment_1020 | Nov 19, 5:00 PM | C | Escaped `\,` and `\;` in `SUMMARY` |
| `event-assignment-1021` | course_501 | assignment_1021 | Nov 23, all day | R | Brackets inside the title; only the trailing one is the course |
| `event-calendar-event-4101` | course_503 | calendar_event_4101 | Dec 3, 3:00–4:30 PM EST | R | `TZID=America/Chicago` with a `VTIMEZONE` (2:00 PM CST) |
| `event-calendar-event-4102` | group_77 | calendar_event_4102 | Nov 20, 3:00–4:00 PM | C | Group event: `group_N` context, no bracket |
| `event-assignment-1022` | none | none | Dec 1, 12:00 PM | R | No `URL` at all: has a course label but no course id |
| `event-assignment-1024` | course_501 | assignment_1024 | Mar 14 2027, 3:30 AM EDT | O | Just after the spring-forward gap |
| `event-assignment-1025` | course_502 | assignment_1025 | Dec 11, all day | O | All-day |

Nothing in school B is past due at `now`.
