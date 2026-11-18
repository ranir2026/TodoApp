// Turns a Canvas calendar feed (.ics text) into normalized items. Parsing (line folding,
// escaping, time zones) is ical.js; this file only applies what Phase 0 found about Canvas's
// format (see CANVAS_INTEGRATION.md, "Feed format").
import ICAL from "ical.js";
import { FeedError } from "./canvasFeedErrors.js";
import { isPublicHostname } from "./canvasFeedUrl.js";

const MAX_ITEMS = 5000;
const MAX_TITLE = 300;
const MAX_DESCRIPTION = 4000;

const UID_PATTERN = /^event-(assignment-override|sub-assignment|assignment|calendar-event)-(\d+)$/;
const KIND_BY_UID_TYPE = {
  assignment: "assignment",
  "assignment-override": "assignment",
  "sub-assignment": "checkpoint",
  "calendar-event": "event",
};

function text(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

// The item's Canvas link: https://<host>/calendar?include_contexts=course_N&...#assignment_N
function parseItemLink(raw) {
  let url;
  try {
    url = new URL(text(raw).trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !isPublicHostname(host)) return null;
  const contexts = (url.searchParams.get("include_contexts") ?? "").split(",");
  const context = contexts.map((value) => value.match(/^([a-z_]+?)_(\d+)$/)).find(Boolean);
  const fragment = url.hash.slice(1).match(/^([a-z_]+)_(\d+)$/);
  return {
    host,
    href: url.href,
    contextType: context?.[1] ?? null,
    contextId: context?.[2] ?? null,
    fragmentType: fragment?.[1] ?? null,
    fragmentId: fragment?.[2] ?? null,
  };
}

// Identity that survives Canvas swapping an assignment's UID for an override's (an extension
// for a section or one student). Checkpoints keep their own UID: their link names the parent.
function identityKey(uid, uidMatch, link) {
  const type = uidMatch?.[1];
  if (type === "assignment" || type === "assignment-override") {
    if (link?.fragmentType === "assignment" && link.fragmentId) return `assignment-${link.fragmentId}`;
    if (type === "assignment") return `assignment-${uidMatch[2]}`;
  }
  return uid.replace(/^event-/, "").slice(0, 200);
}

function splitTitle(summary, { takesCourseLabel, isOverride }) {
  let title = summary.replace(/\s+/g, " ").trim();
  let courseLabel = null;
  if (takesCourseLabel) {
    const match = title.match(/^(.*?)\s*\[([^[\]]*)\]$/);
    if (match && match[1].trim()) {
      title = match[1].trim();
      courseLabel = match[2].trim() || null;
    }
  }
  // Canvas names overrides "Title (section or '1 student')"
  if (isOverride) {
    const match = title.match(/^(.*\S)\s*\([^()]*\)$/);
    if (match) title = match[1];
  }
  return { title: title.slice(0, MAX_TITLE), courseLabel };
}

function cleanDescription(value) {
  const cleaned = text(value)
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_DESCRIPTION ? `${cleaned.slice(0, MAX_DESCRIPTION - 1)}…` : cleaned;
}

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Offset of `timeZone` from UTC at a given instant, in ms
function zoneOffset(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - instant;
}

// A wall-clock time in a named zone, as a UTC instant
function wallTimeToUtc(time, timeZone) {
  const wall = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
  let guess = wall;
  for (let i = 0; i < 3; i += 1) {
    const next = wall - zoneOffset(guess, timeZone);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

// UTC instant (ISO string) for a timed value. Canvas always sends UTC; TZID with a VTIMEZONE,
// or a bare IANA TZID, are handled for other producers. A floating time is read as UTC.
function toUtcIso(time, property) {
  const tzid = property.getParameter("tzid");
  const zone = time.zone?.tzid;
  if (zone && zone !== "floating") return time.toJSDate().toISOString();
  if (tzid && isValidTimeZone(tzid)) return new Date(wallTimeToUtc(time, tzid)).toISOString();
  return new Date(Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second)).toISOString();
}

function normalizeEvent(event) {
  const uid = text(event.getFirstPropertyValue("uid")).trim();
  const startProperty = event.getFirstProperty("dtstart");
  if (!uid || !startProperty) return null;
  const start = startProperty.getFirstValue();
  if (!start || typeof start.isDate !== "boolean") return null;

  const uidMatch = uid.match(UID_PATTERN);
  const link = parseItemLink(event.getFirstPropertyValue("url"));
  const kind = KIND_BY_UID_TYPE[uidMatch?.[1]] ?? "other";
  const contextType = link?.contextType ?? null;
  const courseId = contextType === "course" ? link.contextId : null;
  // Canvas appends " [course code]" only for course items; with no link, assume it might
  const { title, courseLabel } = splitTitle(text(event.getFirstPropertyValue("summary")), {
    takesCourseLabel: link ? contextType === "course" : true,
    isOverride: uidMatch?.[1] === "assignment-override",
  });

  const item = {
    uid,
    key: identityKey(uid, uidMatch, link),
    kind,
    title: title || "Untitled",
    courseId,
    courseLabel,
    contextType,
    allDay: start.isDate,
    dueDate: null,
    dueAt: null,
    endDate: null,
    endAt: null,
    url: null,
    description: cleanDescription(event.getFirstPropertyValue("description")),
    location: text(event.getFirstPropertyValue("location")).trim() || null,
  };

  const endProperty = event.getFirstProperty("dtend");
  const end = endProperty?.getFirstValue();
  if (start.isDate) {
    item.dueDate = start.toString();
    // iCal all-day ends are exclusive; keep an inclusive end only for multi-day items
    if (end?.isDate) {
      const last = end.clone();
      last.adjust(-1, 0, 0, 0);
      if (last.compare(start) > 0) item.endDate = last.toString();
    }
  } else {
    item.dueAt = toUtcIso(start, startProperty);
    if (end && !end.isDate) {
      const endAt = toUtcIso(end, endProperty);
      if (endAt > item.dueAt) item.endAt = endAt;
    }
  }

  const assignmentId = link?.fragmentType === "assignment" ? link.fragmentId : uidMatch?.[1] === "assignment" ? uidMatch[2] : null;
  if ((kind === "assignment" || kind === "checkpoint") && courseId && assignmentId && link) {
    item.url = `https://${link.host}/courses/${courseId}/assignments/${assignmentId}`;
  } else if (link) {
    item.url = link.href;
  }
  return item;
}

// Registers the feed's own VTIMEZONEs only for the length of one synchronous parse, so one
// feed's zone definitions can never leak into another request handled by the same server.
function withFeedTimeZones(root, run) {
  const added = [];
  for (const component of root.getAllSubcomponents("vtimezone")) {
    const tzid = text(component.getFirstPropertyValue("tzid"));
    if (!tzid || ICAL.TimezoneService.has(tzid)) continue;
    ICAL.TimezoneService.register(component);
    added.push(tzid);
  }
  try {
    return run();
  } finally {
    for (const tzid of added) ICAL.TimezoneService.remove(tzid);
  }
}

// Returns the feed's items in feed order, one per identity key. Throws FeedError.
export function parseCanvasFeed(source) {
  const body = text(source).replace(/^﻿/, "");
  if (!/^\s*BEGIN:VCALENDAR/i.test(body)) throw new FeedError("unparseable");
  let root;
  try {
    const parsed = ICAL.parse(body);
    root = new ICAL.Component(Array.isArray(parsed[0]) ? parsed[0] : parsed);
  } catch {
    throw new FeedError("unparseable");
  }
  if (root.name !== "vcalendar") throw new FeedError("unparseable");

  return withFeedTimeZones(root, () => {
    const events = root.getAllSubcomponents("vevent");
    if (events.length > MAX_ITEMS) throw new FeedError("too_large");
    const seen = new Set();
    const items = [];
    for (const event of events) {
      let item;
      try {
        item = normalizeEvent(event);
      } catch {
        item = null; // one malformed event shouldn't sink the whole feed
      }
      if (!item || seen.has(item.key)) continue;
      seen.add(item.key);
      items.push(item);
    }
    return items;
  });
}
