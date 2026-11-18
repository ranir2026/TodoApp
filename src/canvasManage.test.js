import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCanvasFeed } from "../supabase/functions/_shared/canvasFeedParse.js";
import { applyCourseMatches, listFeedCourses, suggestCategory } from "./canvasCourses";
import { planCanvasImport } from "./canvasImport";
import {
  AUTO_SYNC_INTERVAL_MS,
  applyFeedSync,
  disconnectFeed,
  hasCanvasDates,
  markFeedStatus,
  remapCanvasCourse,
  settingsCourseRows,
  shouldAutoSync,
  withoutDueMoved,
} from "./canvasManage";
import { canvasCourseKey, reconcile } from "./canvasSync";

const fixture = (name) => readFileSync(new URL(`./__fixtures__/canvas/${name}`, import.meta.url), "utf8");
const NOW = new Date("2026-11-17T17:00:00Z");
const TZ = "America/New_York";
const A = "example.instructure.com";
const B = "canvas.example.edu";
const itemsA = parseCanvasFeed(fixture("school-a.ics"));
const itemsB = parseCanvasFeed(fixture("school-b.ics"));
const FEED_A = `https://${A}/feeds/calendars/user_FAKEtoken0123456789abcdef.ics`;
const FEED_B = `https://${B}/feeds/calendars/user_FAKEtokenBBBBBBBBBBBBBBBB.ics`;

// A user with their own category and task, connected to school A with every course matched
function connected({ items = itemsA, domain = A, url = FEED_A, todos = [{ id: "mine", title: "My own task", courseId: "gen", dueDate: "2026-11-20" }], courses = [{ id: "gen", name: "General" }], canvas = {} } = {}) {
  const rows = listFeedCourses(items, domain, NOW, TZ);
  const choices = Object.fromEntries(rows.map((row) => [row.key, suggestCategory(row.courseId ? row.label : null, courses)]));
  return planCanvasImport({ feed: { domain, url, items }, rows, choices, options: { includeNonAssignments: true }, todos, courses, canvas, now: NOW, timeZone: TZ });
}

const imported = (todos, domain = A) => todos.filter((todo) => todo.canvas?.domain === domain);

// The Canvas course with the most imported tasks
function busiestCourse(todos) {
  const counts = {};
  for (const todo of imported(todos)) counts[todo.canvas.courseId] = (counts[todo.canvas.courseId] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

describe("shouldAutoSync", () => {
  const recent = new Date(NOW.getTime() - AUTO_SYNC_INTERVAL_MS + 1000).toISOString();
  const old = new Date(NOW.getTime() - AUTO_SYNC_INTERVAL_MS - 1000).toISOString();
  it.each([
    ["never checked", {}, undefined, true],
    ["checked long ago", { lastSyncedAt: old }, undefined, true],
    ["another device checked recently", { lastSyncedAt: recent }, undefined, false],
    ["this device tried recently (and failed)", { lastSyncedAt: old }, NOW.getTime() - 1000, false],
  ])("%s", (_name, feed, lastAttemptAt, expected) => {
    expect(shouldAutoSync({ feed, lastAttemptAt, now: NOW })).toBe(expected);
  });
});

describe("applyFeedSync", () => {
  it("records the check, learns course labels, and keeps the same todos when nothing changed", () => {
    const plan = connected();
    const later = new Date(NOW.getTime() + 3600000);
    const result = applyFeedSync({ domain: A, items: itemsA, todos: plan.todos, courses: plan.courses, canvas: plan.canvas, now: later, timeZone: TZ });
    expect(result.todos).toBe(plan.todos);
    expect(result.summary.added).toBe(0);
    expect(result.canvas.feeds[0]).toMatchObject({ domain: A, url: FEED_A, lastSyncedAt: later.toISOString(), status: "ok" });
    expect(result.canvas.courseLabels[canvasCourseKey(A, "502")]).toBe("PHYS1156.30002.202710");
  });

  it("clears a broken-link status once the feed works again", () => {
    const plan = connected();
    const broken = markFeedStatus(plan.canvas, A, "feed_not_found");
    expect(broken.feeds[0].status).toBe("feed_not_found");
    expect(markFeedStatus(broken, A, "feed_not_found")).toBe(broken);
    expect(applyFeedSync({ domain: A, items: itemsA, todos: plan.todos, courses: plan.courses, canvas: broken, now: NOW, timeZone: TZ }).canvas.feeds[0].status).toBe("ok");
  });
});

describe("remapCanvasCourse", () => {
  it("moves only that course's imported tasks that are still where Canvas put them", () => {
    const plan = connected();
    const courseId = busiestCourse(plan.todos);
    const tasks = imported(plan.todos).filter((todo) => todo.canvas.courseId === courseId);
    expect(tasks.length).toBeGreaterThan(1);
    // The user moved one of them to their own category by hand
    const handMoved = tasks[0].id;
    const todos = plan.todos.map((todo) => (todo.id === handMoved ? { ...todo, courseId: "gen" } : todo));

    const { todos: next, moved } = remapCanvasCourse({ todos, domain: A, courseId, categoryId: "elsewhere" });
    expect(moved).toBe(tasks.length - 1);
    expect(next.find((todo) => todo.id === handMoved).courseId).toBe("gen");
    expect(next.filter((todo) => todo.canvas?.courseId === courseId && todo.id !== handMoved).every((todo) => todo.courseId === "elsewhere" && todo.canvas.synced.courseId === "elsewhere")).toBe(true);
    // Other courses and the user's own task are untouched
    expect(next.find((todo) => todo.id === "mine")).toBe(todos.find((todo) => todo.id === "mine"));
    expect(next.filter((todo) => todo.canvas && todo.canvas.courseId !== courseId)).toEqual(todos.filter((todo) => todo.canvas && todo.canvas.courseId !== courseId));
  });

  it("leaves tasks where they are for Don't import", () => {
    const plan = connected();
    expect(remapCanvasCourse({ todos: plan.todos, domain: A, courseId: "502", categoryId: null })).toEqual({ todos: plan.todos, moved: 0 });
  });

  it("stays put on the next sync (the move isn't mistaken for a user edit or undone)", () => {
    const plan = connected();
    const courseId = busiestCourse(plan.todos);
    const mapped = applyCourseMatches({ domain: A, matches: [{ key: canvasCourseKey(A, courseId), courseId, choice: { type: "existing", categoryId: "gen" } }], courses: plan.courses, canvasState: plan.canvas });
    const { todos, moved } = remapCanvasCourse({ todos: plan.todos, domain: A, courseId, categoryId: "gen" });
    expect(moved).toBeGreaterThan(1);
    const again = reconcile({ domain: A, feedItems: itemsA, todos, courses: mapped.courses, canvasState: mapped.canvasState, now: NOW, timeZone: TZ });
    expect(again.summary.updated).toBe(0);
    expect(again.todos.filter((todo) => todo.canvas?.courseId === courseId).every((todo) => todo.courseId === "gen")).toBe(true);
  });
});

describe("settingsCourseRows", () => {
  it("names each mapped course from the saved labels and counts its tasks", () => {
    const plan = connected();
    const canvas = applyFeedSync({ domain: A, items: itemsA, todos: plan.todos, courses: plan.courses, canvas: plan.canvas, now: NOW, timeZone: TZ }).canvas;
    const rows = settingsCourseRows({ canvas, todos: plan.todos, domain: A });
    const physics = rows.find((row) => row.courseId === "502");
    expect(physics).toMatchObject({ name: "PHYS 1156", key: canvasCourseKey(A, "502") });
    expect(physics.count).toBe(imported(plan.todos).filter((todo) => todo.canvas.courseId === "502").length);
    expect(rows.at(-1).courseId).toBeNull();
  });
});

describe("disconnectFeed", () => {
  it("keeps tasks, the course mapping and deleted-task list when asked to keep tasks", () => {
    const plan = connected();
    const canvas = { ...plan.canvas, dismissedIds: ["canvas:x"] };
    const result = disconnectFeed({ canvas, todos: plan.todos, courses: plan.courses, domain: A, removeTasks: false });
    expect(result.canvas.feeds).toEqual([]);
    expect(result.canvas.courseMap).toEqual(canvas.courseMap);
    expect(result.canvas.dismissedIds).toEqual(["canvas:x"]);
    expect(result.todos).toBe(plan.todos);
    expect(result.feed.domain).toBe(A);
  });

  it("removes only that school's imports and the empty categories they created", () => {
    const first = connected();
    const both = connected({ items: itemsB, domain: B, url: FEED_B, todos: first.todos, courses: first.courses, canvas: first.canvas });
    // The user filed one of their own tasks under a category Canvas created
    const canvasCategory = both.courses.find((course) => course.id.startsWith(`canvas-course:${A}:`));
    const todos = [...both.todos, { id: "mine-2", title: "Study group", courseId: canvasCategory.id }];

    const result = disconnectFeed({ canvas: both.canvas, todos, courses: both.courses, domain: A, removeTasks: true });
    expect(imported(result.todos, A)).toEqual([]);
    expect(imported(result.todos, B)).toEqual(imported(todos, B));
    expect(result.todos.map((todo) => todo.id)).toEqual(expect.arrayContaining(["mine", "mine-2"]));
    expect(result.removedTodos).toHaveLength(imported(todos, A).length);
    expect(result.courses.some((course) => course.id === canvasCategory.id)).toBe(true);
    expect(result.courses.some((course) => course.id === "gen")).toBe(true);
    // School A's categories that stay are the ones still holding something (school B's no-course
    // items share the "Canvas" category by name); the rest are gone
    const used = new Set(result.todos.map((todo) => todo.courseId));
    const kept = result.courses.filter((course) => course.id.startsWith(`canvas-course:${A}:`));
    expect(kept.every((course) => used.has(course.id))).toBe(true);
    expect(result.removedCourses.length).toBeGreaterThan(0);
    expect(result.removedCourses.every((course) => !used.has(course.id))).toBe(true);
    expect(result.canvas.feeds.map((feed) => feed.domain)).toEqual([B]);
  });

  it("reattaches to the same tasks when the school is connected again", () => {
    const plan = connected();
    const off = disconnectFeed({ canvas: plan.canvas, todos: plan.todos, courses: plan.courses, domain: A, removeTasks: false });
    const again = connected({ todos: off.todos, courses: off.courses, canvas: off.canvas });
    expect(again.summary.added).toBe(0);
    expect(again.todos).toHaveLength(plan.todos.length);
    expect(again.courses).toHaveLength(plan.courses.length);
  });

  it("doesn't bring back a task deleted before disconnecting", () => {
    const plan = connected();
    const deleted = imported(plan.todos)[0].id;
    const canvas = { ...plan.canvas, dismissedIds: [deleted] };
    const off = disconnectFeed({ canvas, todos: plan.todos.filter((todo) => todo.id !== deleted), courses: plan.courses, domain: A, removeTasks: false });
    const again = connected({ todos: off.todos, courses: off.courses, canvas: off.canvas });
    expect(again.todos.some((todo) => todo.id === deleted)).toBe(false);
  });
});

describe("due date flags", () => {
  it("withoutDueMoved drops only the flag, and hasCanvasDates tells whether Canvas's date was applied", () => {
    const todo = { id: "t", dueDate: "2026-11-20", startTime: null, endDate: null, endTime: null, canvas: { domain: A, synced: { dueDate: "2026-11-20", startTime: null, endDate: null, endTime: null }, dueMoved: { from: "2026-11-19", to: "2026-11-20" } } };
    expect(withoutDueMoved(todo).canvas).toEqual({ domain: A, synced: todo.canvas.synced });
    expect(hasCanvasDates(todo)).toBe(true);
    expect(hasCanvasDates({ ...todo, dueDate: "2026-11-25" })).toBe(false);
  });
});
