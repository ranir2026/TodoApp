// Canvas sync: merges one parsed Canvas feed into the user's tasks. Pure: everything comes in as
// arguments (including `now`), so two devices reconciling the same feed produce identical tasks
// under identical ids, and running it twice changes nothing the second time.
//
// Rules (CANVAS_INTEGRATION.md, Phase 3): match by id only; never overwrite completion, priority
// or anything the user edited; never re-add what the user deleted; and never delete on an
// empty or failed feed.

export const NO_COURSE = "none";
// A feed lists items from 30 days back; an older task's absence just means it aged out
const FEED_LOOKBACK_DAYS = 29;
// A feed that would remove more than this share of a school's recent tasks looks like a Canvas
// outage, not real deletions, so nothing is removed that round
const MAX_REMOVAL_SHARE = 0.5;
const MIN_REMOVALS_TO_DOUBT = 5;
const DAY_MS = 86400000;

// Canvas settings default to {} for rows that predate them, which means "never connected" (or,
// on a device, "not loaded yet"), never "cleared"
export function hasCanvasData(canvas) {
  return Boolean(canvas) && typeof canvas === "object" && !Array.isArray(canvas) && Object.keys(canvas).length > 0;
}

export function canvasTaskId(domain, key) {
  return `canvas:${domain}:${key}`;
}

export function canvasCategoryId(domain, courseId) {
  return `canvas-course:${domain}:${courseId ?? NO_COURSE}`;
}

export function canvasCourseKey(domain, courseId) {
  return `${domain}:${courseId ?? NO_COURSE}`;
}

export function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// A UTC instant as the local date and 24-hour time in `timeZone`
export function localDateTime(iso, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function isAssignmentKind(item) {
  return item.kind === "assignment" || item.kind === "checkpoint";
}

function isIncludedKind(item, includeNonAssignments) {
  return isAssignmentKind(item) || includeNonAssignments;
}

// Due (or, for events, over) before `now`. An all-day item due today is not past due yet.
export function isPastDue(item, now, timeZone) {
  if (item.allDay) return (item.endDate ?? item.dueDate) < localDateTime(now.toISOString(), timeZone).date;
  return new Date(item.endAt ?? item.dueAt) < now;
}

// The task fields a feed item maps to, in the device's time zone. All-day items stay date-only.
export function taskFieldsFor(item, timeZone) {
  const type = isAssignmentKind(item) ? "task" : "event";
  const description = [item.location && `Location: ${item.location}`, item.description].filter(Boolean).join("\n\n") || null;
  if (item.allDay) {
    return { type, title: item.title, dueDate: item.dueDate, endDate: type === "event" ? item.endDate ?? null : null, startTime: null, endTime: null, description };
  }
  const start = localDateTime(item.dueAt, timeZone);
  let endDate = null;
  let endTime = null;
  if (type === "event" && item.endAt) {
    const end = localDateTime(item.endAt, timeZone);
    endTime = end.time;
    if (end.date !== start.date) endDate = end.date;
  }
  return { type, title: item.title, dueDate: start.date, endDate, startTime: start.time, endTime, description };
}

// What Canvas said last time, in a fixed key order (so unchanged tasks serialize identically).
// The local fields tell user edits apart; `canvasDue`/`canvasEnd` (UTC instants or dates) tell
// a real Canvas change apart from the device simply moving to another time zone.
function snapshot(fields, item, categoryId) {
  return {
    title: fields.title,
    description: fields.description,
    courseId: categoryId,
    dueDate: fields.dueDate,
    startTime: fields.startTime,
    endDate: fields.endDate,
    endTime: fields.endTime,
    canvasDue: item.allDay ? item.dueDate : item.dueAt,
    canvasEnd: item.allDay ? item.endDate ?? null : item.endAt ?? null,
  };
}

function meta({ domain, item, synced, dueMoved, missing }) {
  const canvas = { domain, uid: item.uid, key: item.key, courseId: item.courseId ?? null, url: item.url ?? null, synced };
  if (dueMoved) canvas.dueMoved = dueMoved;
  if (missing) canvas.missing = missing;
  return canvas;
}

const same = (a, b) => (a ?? null) === (b ?? null);
const DUE_FIELDS = ["dueDate", "startTime", "endDate", "endTime"];

// Whether the user has changed the task since Canvas last set it. Used to decide whether a
// task that left the feed can be removed.
export function isUserTouched(todo) {
  const synced = todo.canvas?.synced;
  if (!synced) return true;
  return ["title", "description", "courseId", ...DUE_FIELDS].some((field) => !same(todo[field], synced[field]))
    || (todo.priority ?? "normal") !== "normal"
    || (todo.repeat ?? "none") !== "none"
    || Boolean(todo.projectId || todo.milestoneId || todo.skipDates?.length);
}

function newTask({ id, item, fields, categoryId, domain, nowIso }) {
  return {
    id,
    type: fields.type,
    title: fields.title,
    courseId: categoryId,
    dueDate: fields.dueDate,
    endDate: fields.endDate,
    startTime: fields.startTime,
    endTime: fields.endTime,
    priority: "normal",
    description: fields.description,
    repeat: "none",
    repeatDays: null,
    repeatUntil: null,
    repeatCount: null,
    completed: false,
    createdAt: nowIso,
    canvas: meta({ domain, item, synced: snapshot(fields, item, categoryId) }),
  };
}

// Applies Canvas's latest version of an item to a task it imported earlier. Returns the same
// object when nothing changed.
function updateTask({ todo, item, fields, category, domain, nowIso }) {
  const previous = todo.canvas?.synced ?? {};
  const untouched = (field) => same(todo[field], previous[field]);
  const patch = {};

  if (!same(fields.title, previous.title) && untouched("title")) patch.title = fields.title;
  if (!same(fields.description, previous.description) && untouched("description")) patch.description = fields.description;

  const mappedId = category.status === "mapped" ? category.categoryId : null;
  const syncedCourseId = mappedId ?? previous.courseId ?? null;
  if (mappedId && !same(mappedId, previous.courseId) && untouched("courseId")) patch.courseId = mappedId;

  // Local due fields change either because Canvas moved the date or because the device is in a
  // new time zone; both are applied to an untouched task, but only the first is flagged
  const dueFieldsChanged = DUE_FIELDS.some((field) => !same(fields[field], previous[field]));
  if (dueFieldsChanged && DUE_FIELDS.every(untouched)) {
    for (const field of DUE_FIELDS) patch[field] = fields[field];
  }
  const next = snapshot(fields, item, syncedCourseId);
  const canvasMoved = previous.canvasDue !== undefined && (!same(next.canvasDue, previous.canvasDue) || !same(next.canvasEnd, previous.canvasEnd));
  const dueMoved = canvasMoved
    ? { from: previous.canvasDue ?? null, to: next.canvasDue, at: nowIso }
    : todo.canvas?.dueMoved;

  const canvas = meta({ domain, item, synced: next, dueMoved });
  const updated = { ...todo, ...patch, canvas };
  return JSON.stringify(updated) === JSON.stringify(todo) ? todo : updated;
}

function resolveCategory(item, domain, courseMap, categoryIds) {
  const key = canvasCourseKey(domain, item.courseId);
  if (!Object.hasOwn(courseMap, key)) return { status: "unmapped", key };
  const target = courseMap[key];
  if (target === null) return { status: "skipped", key };
  // A mapping to a category the user has since deleted counts as unmapped
  if (!categoryIds.has(target)) return { status: "unmapped", key, dangling: true };
  return { status: "mapped", key, categoryId: target };
}

// Canvas's due value for a task as an instant, for the feed-window check
function syncedDueTime(todo) {
  const due = todo.canvas?.synced?.canvasDue;
  if (!due) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(due) ? Date.parse(`${due}T23:59:59Z`) : Date.parse(due);
}

/**
 * Merges one school's feed into the user's tasks.
 * @returns {{ todos, courses, summary, unmappedCourses }} where summary counts
 *   added / updated / unchanged / held (course not matched yet) / skipped (filtered out,
 *   deleted before, or course set to "Don't import") / removed / flagged ("no longer in Canvas").
 */
export function reconcile({ domain, feedItems, todos, courses, canvasState = {}, now, timeZone = deviceTimeZone() }) {
  const nowDate = new Date(now);
  const nowIso = nowDate.toISOString();
  const courseMap = canvasState.courseMap ?? {};
  const categoryIds = new Set(courses.map((course) => course.id));
  const dismissed = new Set(canvasState.dismissedIds ?? []);
  const summary = { added: 0, updated: 0, unchanged: 0, held: 0, skipped: 0, removed: 0, flagged: 0 };
  const unmapped = new Map();
  const indexById = new Map(todos.map((todo, index) => [todo.id, index]));
  const nextTodos = [...todos];
  const additions = [];
  const seen = new Set();

  for (const item of feedItems) {
    const id = canvasTaskId(domain, item.key);
    if (seen.has(id)) continue;
    seen.add(id);
    const fields = taskFieldsFor(item, timeZone);
    const category = resolveCategory(item, domain, courseMap, categoryIds);

    if (indexById.has(id)) {
      const index = indexById.get(id);
      const updated = updateTask({ todo: nextTodos[index], item, fields, category, domain, nowIso });
      if (updated === nextTodos[index]) summary.unchanged += 1;
      else {
        nextTodos[index] = updated;
        summary.updated += 1;
      }
      continue;
    }

    if (dismissed.has(id) || !isIncludedKind(item, canvasState.includeNonAssignments) || category.status === "skipped") {
      summary.skipped += 1;
      continue;
    }
    // Past-due work is never added unless asked for, on the first import or later
    if (!canvasState.includePastDue && isPastDue(item, nowDate, timeZone)) {
      summary.skipped += 1;
      continue;
    }
    if (category.status === "unmapped") {
      summary.held += 1;
      const entry = unmapped.get(category.key) ?? { key: category.key, domain, courseId: item.courseId ?? null, label: item.courseLabel ?? null, dangling: Boolean(category.dangling), count: 0 };
      entry.count += 1;
      if (!entry.label && item.courseLabel) entry.label = item.courseLabel;
      unmapped.set(category.key, entry);
      continue;
    }
    additions.push(newTask({ id, item, fields, categoryId: category.categoryId, domain, nowIso }));
    summary.added += 1;
  }

  // Tasks this school's feed no longer lists. An empty feed result proves nothing, and items
  // older than the feed's window drop out on their own.
  let result = nextTodos;
  if (feedItems.length > 0) {
    const windowStart = nowDate.getTime() - FEED_LOOKBACK_DAYS * DAY_MS;
    const gone = nextTodos.filter((todo) => todo.canvas?.domain === domain && !seen.has(todo.id) && (syncedDueTime(todo) ?? -Infinity) >= windowStart);
    const recent = nextTodos.filter((todo) => todo.canvas?.domain === domain && (syncedDueTime(todo) ?? -Infinity) >= windowStart).length;
    const looksLikeOutage = gone.length >= MIN_REMOVALS_TO_DOUBT && gone.length > recent * MAX_REMOVAL_SHARE;
    if (!looksLikeOutage && gone.length) {
      const goneIds = new Set(gone.map((todo) => todo.id));
      result = [];
      for (const todo of nextTodos) {
        if (!goneIds.has(todo.id)) {
          result.push(todo);
        } else if (!todo.completed && !isUserTouched(todo)) {
          summary.removed += 1;
        } else if (todo.canvas.missing) {
          result.push(todo);
        } else {
          summary.flagged += 1;
          result.push({ ...todo, canvas: { ...todo.canvas, missing: nowIso } });
        }
      }
    }
    if (looksLikeOutage) summary.removalPaused = true;
  }

  // Items back in the feed lose their "no longer in Canvas" flag (meta() rebuilds without it)
  return { todos: [...result, ...additions], courses, summary, unmappedCourses: [...unmapped.values()] };
}
