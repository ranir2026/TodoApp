// Ongoing Canvas management (Phase 5): applying a fresh feed, changing a course's category,
// disconnecting. Pure, like the reconcile engine, so each rule is unit-tested on its own.
import { cleanCourseLabel, listFeedCourses, NO_COURSE_LABEL } from "./canvasCourses";
import { canvasCourseKey, reconcile } from "./canvasSync";

// The app checks a feed by itself at most this often (per device, and not when another device
// checked it recently). Canvas's feed is cached on its side too, so more often buys nothing.
export const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000;

// Errors that mean the saved link no longer works (the user reset it in Canvas, or it now
// leads somewhere else). They're saved on the feed so every device asks for a new link.
export const LINK_BROKEN_CODES = new Set(["feed_not_found", "redirected"]);

export function shouldAutoSync({ feed, lastAttemptAt, now }) {
  const time = new Date(now).getTime();
  const synced = feed.lastSyncedAt ? Date.parse(feed.lastSyncedAt) : 0;
  return time - synced >= AUTO_SYNC_INTERVAL_MS && time - (lastAttemptAt ?? 0) >= AUTO_SYNC_INTERVAL_MS;
}

function withFeed(canvas, domain, patch) {
  return { ...canvas, feeds: (canvas.feeds ?? []).map((feed) => (feed.domain === domain ? { ...feed, ...patch } : feed)) };
}

export function markFeedStatus(canvas, domain, status) {
  const feed = canvas.feeds?.find((item) => item.domain === domain);
  return !feed || feed.status === status ? canvas : withFeed(canvas, domain, { status });
}

// Course labels the feed gave, so settings can name courses (even ones never matched) without
// refetching the feed
export function withCourseLabels(canvas, rows) {
  const labels = { ...(canvas.courseLabels ?? {}) };
  let changed = false;
  for (const row of rows) {
    // A course without a label (personal events, say) is still recorded, as null
    const label = row.label ?? null;
    if (!Object.hasOwn(labels, row.key) || (label && labels[row.key] !== label)) {
      labels[row.key] = label;
      changed = true;
    }
  }
  return changed ? { ...canvas, courseLabels: labels } : canvas;
}

/**
 * Merges a freshly fetched feed into the user's data and records the check on the feed.
 * Returns the same `todos` array when no task changed, so an uneventful check doesn't
 * re-render the list.
 */
export function applyFeedSync({ domain, items, todos, courses, canvas, now, timeZone, fetchedAt = now }) {
  const result = reconcile({ domain, feedItems: items, todos, courses, canvasState: canvas, now, timeZone });
  const { added, updated, removed, flagged } = result.summary;
  const nextTodos = added || updated || removed || flagged ? result.todos : todos;
  let nextCanvas = withFeed(canvas, domain, { lastSyncedAt: new Date(fetchedAt).toISOString(), status: "ok" });
  nextCanvas = withCourseLabels(nextCanvas, listFeedCourses(items, domain, new Date(now), timeZone));
  return { todos: nextTodos, courses: result.courses, canvas: nextCanvas, summary: result.summary, unmappedCourses: result.unmappedCourses };
}

/**
 * Points one Canvas course at another category. Moves only that course's imported tasks that
 * are still where Canvas put them; a task the user moved by hand stays put, and nothing the
 * user created is touched. "Don't import" (null) stops new tasks and leaves existing ones.
 */
export function remapCanvasCourse({ todos, domain, courseId, categoryId }) {
  if (!categoryId) return { todos, moved: 0 };
  let moved = 0;
  const next = todos.map((todo) => {
    const meta = todo.canvas;
    if (!meta || meta.domain !== domain || (meta.courseId ?? null) !== (courseId ?? null)) return todo;
    if (!meta.synced || todo.courseId !== meta.synced.courseId || todo.courseId === categoryId) return todo;
    moved += 1;
    return { ...todo, courseId: categoryId, canvas: { ...meta, synced: { ...meta.synced, courseId: categoryId } } };
  });
  return { todos: moved ? next : todos, moved };
}

/**
 * One row per course this school has shown, for the settings panel: the matched ones, and the
 * ones never given a category (say, only past-due work at setup), so no course silently vanishes.
 * `state` is "mapped", "skipped" ("Don't import"), "deleted" (its category was deleted) or
 * "unmatched". With the feed's items, `feed` says what the course has right now.
 */
export function settingsCourseRows({ canvas, todos, courses = null, domain, items = null, now = new Date(), timeZone }) {
  const prefix = `${domain}:`;
  const counts = {};
  for (const todo of todos) {
    if (todo.canvas?.domain !== domain) continue;
    const key = canvasCourseKey(domain, todo.canvas.courseId);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const feedRows = items ? Object.fromEntries(listFeedCourses(items, domain, new Date(now), timeZone).map((row) => [row.key, row])) : {};
  const courseMap = canvas.courseMap ?? {};
  const categoryIds = courses ? new Set(courses.map((course) => course.id)) : null;
  const keys = new Set([...Object.keys(courseMap), ...Object.keys(canvas.courseLabels ?? {}), ...Object.keys(feedRows)].filter((key) => key.startsWith(prefix)));
  return [...keys]
    .map((key) => {
      const courseId = key.slice(prefix.length);
      const label = canvas.courseLabels?.[key] ?? feedRows[key]?.label ?? null;
      const name = courseId === "none" ? NO_COURSE_LABEL : cleanCourseLabel(label ?? `Course ${courseId}`);
      const categoryId = Object.hasOwn(courseMap, key) ? courseMap[key] : undefined;
      const state = categoryId === undefined ? "unmatched" : categoryId === null ? "skipped" : categoryIds && !categoryIds.has(categoryId) ? "deleted" : "mapped";
      const feed = feedRows[key] ? { assignments: feedRows[key].assignments, upcoming: feedRows[key].upcoming, events: feedRows[key].events } : null;
      return { key, courseId: courseId === "none" ? null : courseId, label, name, categoryId: categoryId ?? null, state, count: counts[key] ?? 0, feed };
    })
    .sort((a, b) => (a.courseId === null) - (b.courseId === null) || a.name.localeCompare(b.name));
}

/**
 * Moves a task to another category because its category is going away. A Canvas task's record
 * of where Canvas put it moves too, so it still counts as untouched and follows the course when
 * the course is matched again.
 */
export function reassignCategory(todo, fromId, toId) {
  if (todo.courseId !== fromId) return todo;
  const synced = todo.canvas?.synced;
  if (!synced || synced.courseId !== fromId) return { ...todo, courseId: toId };
  return { ...todo, courseId: toId, canvas: { ...todo.canvas, synced: { ...synced, courseId: toId } } };
}

export function isCanvasCategory(course, domain) {
  return course.id.startsWith(`canvas-course:${domain}:`);
}

/**
 * Disconnects one school. The course mapping and deleted-task list stay, so reconnecting later
 * reattaches to the same tasks and asks nothing twice. With removeTasks, that school's imported
 * tasks go, and so do categories the import created that are left empty.
 */
export function disconnectFeed({ canvas, todos, courses, domain, removeTasks }) {
  const feed = canvas.feeds?.find((item) => item.domain === domain) ?? null;
  const nextCanvas = { ...canvas, feeds: (canvas.feeds ?? []).filter((item) => item.domain !== domain) };
  if (!removeTasks) return { canvas: nextCanvas, todos, courses, feed, removedTodos: [], removedCourses: [] };

  const removedTodos = todos.filter((todo) => todo.canvas?.domain === domain);
  const nextTodos = todos.filter((todo) => todo.canvas?.domain !== domain);
  const used = new Set(nextTodos.map((todo) => todo.courseId));
  const removedCourses = courses.filter((course) => isCanvasCategory(course, domain) && !used.has(course.id));
  // At least one category always remains, as everywhere else in the app
  const keep = removedCourses.length === courses.length ? removedCourses.slice(0, 1) : [];
  const dropped = removedCourses.filter((course) => !keep.includes(course));
  const droppedIds = new Set(dropped.map((course) => course.id));
  return {
    canvas: nextCanvas,
    todos: nextTodos,
    courses: courses.filter((course) => !droppedIds.has(course.id)),
    feed,
    removedTodos,
    removedCourses: dropped,
  };
}

export function withoutDueMoved(todo) {
  if (!todo.canvas?.dueMoved) return todo;
  const { dueMoved: _seen, ...meta } = todo.canvas;
  return { ...todo, canvas: meta };
}

// Whether the task still has the dates Canvas last set (so a "moved" flag means it was updated)
export function hasCanvasDates(todo) {
  const synced = todo.canvas?.synced;
  if (!synced) return false;
  return ["dueDate", "startTime", "endDate", "endTime"].every((field) => (todo[field] ?? null) === (synced[field] ?? null));
}
