import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCanvasFeed } from "../supabase/functions/_shared/canvasFeedParse.js";
import { canvasCourseKey, canvasTaskId, isUserTouched, localDateTime, reconcile } from "./canvasSync";

const fixture = (name) => readFileSync(new URL(`./__fixtures__/canvas/${name}`, import.meta.url), "utf8");
const NOW = new Date("2026-11-17T17:00:00Z"); // noon in New York
const TZ = "America/New_York";
const A = "example.instructure.com";
const B = "canvas.example.edu";
const itemsA = parseCanvasFeed(fixture("school-a.ics"));
const itemsB = parseCanvasFeed(fixture("school-b.ics"));
const COURSES = [{ id: "c1", name: "General", color: "#6366f1" }, { id: "phys", name: "Physics", color: "#f59e0b" }];

// Every course in the feed (and "no course") mapped to one category
function mapAll(domain, items, categoryId = "c1") {
  return Object.fromEntries(items.map((item) => [canvasCourseKey(domain, item.courseId), categoryId]));
}

function run({ domain = A, items = itemsA, todos = [], courses = COURSES, canvasState, now = NOW, timeZone = TZ } = {}) {
  return reconcile({ domain, feedItems: items, todos, courses, canvasState: canvasState ?? { courseMap: mapAll(domain, items) }, now, timeZone });
}

const byId = (todos) => Object.fromEntries(todos.map((todo) => [todo.id, todo]));
const idA = (key) => canvasTaskId(A, key);

describe("first import", () => {
  const { todos, summary, unmappedCourses } = run();

  it("adds upcoming assignments and checkpoints only, by default", () => {
    expect(summary).toMatchObject({ added: 12, updated: 0, unchanged: 0, held: 0, skipped: 8, removed: 0, flagged: 0 });
    expect(unmappedCourses).toEqual([]);
    expect(todos.every((todo) => todo.type === "task" && todo.id.startsWith(`canvas:${A}:`))).toBe(true);
    // Past due on Nov 17 (and the three calendar events) stay out
    for (const key of ["assignment-1004", "assignment-1005", "assignment-1006", "assignment-1007", "assignment-1016", "calendar-event-4001"]) {
      expect(byId(todos)[idA(key)]).toBeUndefined();
    }
  });

  it("creates tasks that look like the app's own, tagged with their Canvas origin", () => {
    expect(byId(todos)[idA("assignment-1001")]).toMatchObject({
      type: "task",
      title: "Problem Set 7",
      courseId: "c1",
      dueDate: "2026-11-19",
      startTime: "23:00",
      endTime: null,
      priority: "normal",
      completed: false,
      createdAt: NOW.toISOString(),
      canvas: { domain: A, uid: "event-assignment-1001", key: "assignment-1001", courseId: "501", url: `https://${A}/courses/501/assignments/1001` },
    });
  });

  it("keeps an override under its assignment id", () => {
    expect(byId(todos)[idA("assignment-1011")]).toMatchObject({ title: "Essay 3 Draft", canvas: { uid: "event-assignment-override-7001" } });
  });
});

describe("time zones", () => {
  it("converts UTC due times to the device's local date and time", () => {
    const ny = byId(run().todos);
    expect(ny[idA("assignment-1001")]).toMatchObject({ dueDate: "2026-11-19", startTime: "23:00" });
    expect(ny[idA("assignment-1008")]).toMatchObject({ dueDate: "2026-12-07", startTime: "23:59" });
    const tokyo = byId(run({ timeZone: "Asia/Tokyo" }).todos);
    expect(tokyo[idA("assignment-1001")]).toMatchObject({ dueDate: "2026-11-20", startTime: "13:00" });
  });

  it("keeps all-day items date-only, never a made-up 12:00 AM", () => {
    for (const timeZone of [TZ, "Asia/Tokyo", "Pacific/Honolulu"]) {
      expect(byId(run({ timeZone }).todos)[idA("assignment-1002")]).toMatchObject({ dueDate: "2026-11-22", startTime: null });
    }
  });

  it("handles both 1:30 AMs on the night clocks go back", () => {
    const todos = byId(run({ canvasState: { courseMap: mapAll(A, itemsA), includePastDue: true } }).todos);
    expect(todos[idA("assignment-1006")]).toMatchObject({ dueDate: "2026-11-01", startTime: "01:30" });
    expect(todos[idA("assignment-1007")]).toMatchObject({ dueDate: "2026-11-01", startTime: "01:30" });
    expect(localDateTime("2027-03-14T07:30:00.000Z", TZ)).toEqual({ date: "2027-03-14", time: "03:30" });
  });

  it("moves local times with the device without flagging a moved due date", () => {
    const first = run();
    const again = run({ todos: first.todos, timeZone: "Asia/Tokyo" });
    const task = byId(again.todos)[idA("assignment-1001")];
    expect(task).toMatchObject({ dueDate: "2026-11-20", startTime: "13:00" });
    expect(task.canvas.dueMoved).toBeUndefined();
  });
});

describe("idempotency and concurrency", () => {
  it("changes nothing when run twice", () => {
    const first = run();
    const second = run({ todos: first.todos });
    expect(second.summary).toMatchObject({ added: 0, updated: 0, unchanged: 12 });
    expect(second.todos).toEqual(first.todos);
  });

  it("gives two devices importing at once identical tasks, so either save wins cleanly", () => {
    const existing = [{ id: "mine", title: "Laundry", courseId: "c1", completed: false }];
    const laptop = run({ todos: existing });
    const phone = run({ todos: existing });
    expect(JSON.stringify(phone.todos)).toBe(JSON.stringify(laptop.todos));
    // Even a merge that unions both copies by id ends up with one task per assignment
    const union = [...new Map([...laptop.todos, ...phone.todos].map((todo) => [todo.id, todo])).values()];
    expect(union).toHaveLength(laptop.todos.length);
    expect(run({ todos: union }).summary.added).toBe(0);
  });
});

describe("user changes win", () => {
  function editedFeed(changes) {
    return itemsA.map((item) => (changes[item.key] ? { ...item, ...changes[item.key] } : item));
  }

  it("never overwrites completion, priority or edited fields, but still flags a moved due date", () => {
    const first = run();
    const todos = first.todos.map((todo) => (todo.id === idA("assignment-1001")
      ? { ...todo, title: "PS7 (start early)", priority: "urgent", completed: true, completedAt: "2026-11-17T16:00:00.000Z", dueDate: "2026-11-18", startTime: "09:00" }
      : todo));
    const feed = editedFeed({ "assignment-1001": { title: "Problem Set 7 (revised)", dueAt: "2026-11-21T04:00:00.000Z" } });
    const result = run({ items: feed, todos });
    const task = byId(result.todos)[idA("assignment-1001")];
    expect(task).toMatchObject({ title: "PS7 (start early)", priority: "urgent", completed: true, completedAt: "2026-11-17T16:00:00.000Z", dueDate: "2026-11-18", startTime: "09:00" });
    expect(task.canvas.dueMoved).toEqual({ from: "2026-11-20T04:00:00.000Z", to: "2026-11-21T04:00:00.000Z", at: NOW.toISOString() });
    expect(result.summary.updated).toBe(1);
  });

  it("updates an untouched task's title and due date, and flags the move", () => {
    const first = run();
    const feed = editedFeed({ "assignment-1003": { title: "Lab 6 Report (final)", dueAt: "2026-11-26T17:00:00.000Z" } });
    const task = byId(run({ items: feed, todos: first.todos }).todos)[idA("assignment-1003")];
    expect(task).toMatchObject({ title: "Lab 6 Report (final)", dueDate: "2026-11-26", startTime: "12:00" });
    expect(task.canvas.dueMoved).toMatchObject({ from: "2026-11-24T17:00:00.000Z", to: "2026-11-26T17:00:00.000Z" });
  });

  it("moves only untouched Canvas tasks when a course mapping changes", () => {
    const first = run();
    const moved = first.todos.map((todo) => (todo.id === idA("assignment-1001") ? { ...todo, courseId: "c1-renamed" } : todo));
    const courses = [...COURSES, { id: "c1-renamed", name: "Other" }];
    const courseMap = { ...mapAll(A, itemsA), [canvasCourseKey(A, "501")]: "phys" };
    const result = byId(run({ todos: [...moved, { id: "mine", title: "Mine", courseId: "c1" }], courses, canvasState: { courseMap } }).todos);
    expect(result[idA("assignment-1002")].courseId).toBe("phys"); // untouched, same course
    expect(result[idA("assignment-1001")].courseId).toBe("c1-renamed"); // the user moved it
    expect(result.mine.courseId).toBe("c1"); // not a Canvas task
  });
});

describe("tombstones", () => {
  it("never brings back an import the user deleted", () => {
    const first = run();
    const deleted = first.todos.filter((todo) => todo.id !== idA("assignment-1001"));
    const result = run({ todos: deleted, canvasState: { courseMap: mapAll(A, itemsA), dismissedIds: [idA("assignment-1001")] } });
    expect(byId(result.todos)[idA("assignment-1001")]).toBeUndefined();
    expect(result.summary.added).toBe(0);
  });
});

describe("items that leave the feed", () => {
  const first = run();
  const without = (...keys) => itemsA.filter((item) => !keys.includes(item.key));

  it("removes an untouched, open task", () => {
    const result = run({ items: without("assignment-1003"), todos: first.todos });
    expect(byId(result.todos)[idA("assignment-1003")]).toBeUndefined();
    expect(result.summary.removed).toBe(1);
  });

  it("keeps completed or edited tasks and marks them no longer in Canvas", () => {
    const todos = first.todos.map((todo) => {
      if (todo.id === idA("assignment-1003")) return { ...todo, completed: true };
      if (todo.id === idA("assignment-1009")) return { ...todo, description: "my notes" };
      return todo;
    });
    const result = run({ items: without("assignment-1003", "assignment-1009"), todos });
    expect(byId(result.todos)[idA("assignment-1003")].canvas.missing).toBe(NOW.toISOString());
    expect(byId(result.todos)[idA("assignment-1009")].canvas.missing).toBe(NOW.toISOString());
    expect(result.summary).toMatchObject({ removed: 0, flagged: 2 });
    // Back in the feed: the flag goes away
    const back = run({ todos: result.todos });
    expect(byId(back.todos)[idA("assignment-1003")].canvas.missing).toBeUndefined();
  });

  it("leaves alone tasks older than the feed's 30-day window", () => {
    const old = run({ now: new Date("2026-11-01T17:00:00Z"), canvasState: { courseMap: mapAll(A, itemsA), includePastDue: true } }).todos;
    // Six weeks on, Problem Set 5 (Oct 19) has aged out of the feed
    const result = run({ items: without("assignment-1016"), todos: old, now: new Date("2026-12-05T17:00:00Z") });
    expect(byId(result.todos)[idA("assignment-1016")]).toBeDefined();
    expect(result.summary.removed).toBe(0);
  });

  it("deletes nothing when the feed comes back empty", () => {
    const result = run({ items: [], todos: first.todos });
    expect(result.todos).toEqual(first.todos);
    expect(result.summary).toMatchObject({ added: 0, removed: 0, flagged: 0 });
  });

  it("pauses removal when most of a school's tasks vanish at once (a Canvas outage)", () => {
    const result = run({ items: itemsA.slice(0, 1), todos: first.todos });
    expect(result.summary.removalPaused).toBe(true);
    expect(result.todos).toHaveLength(first.todos.length);
  });
});

describe("course mapping", () => {
  it("holds items from courses the user hasn't matched yet, and reports them", () => {
    const courseMap = mapAll(A, itemsA);
    delete courseMap[canvasCourseKey(A, "502")];
    const result = run({ canvasState: { courseMap } });
    expect(result.summary.held).toBe(1); // Lab 6 Report (Lab 5 is past due)
    expect(result.unmappedCourses).toEqual([{ key: canvasCourseKey(A, "502"), domain: A, courseId: "502", label: "PHYS1156.30002.202710", dangling: false, count: 1 }]);
  });

  it("skips courses set to Don't import", () => {
    const courseMap = { ...mapAll(A, itemsA), [canvasCourseKey(A, "503")]: null };
    const result = run({ canvasState: { courseMap } });
    expect(result.todos.some((todo) => todo.canvas.courseId === "503")).toBe(false);
    expect(result.summary.held).toBe(0);
  });

  it("treats a mapping to a deleted category as unmapped", () => {
    const courseMap = { ...mapAll(A, itemsA), [canvasCourseKey(A, "508")]: "deleted-category" };
    const result = run({ canvasState: { courseMap } });
    expect(result.unmappedCourses).toEqual([expect.objectContaining({ courseId: "508", dangling: true })]);
    expect(result.todos.every((todo) => todo.courseId !== "deleted-category")).toBe(true);
  });

  it("puts items with no course under a 'no course' entry until matched", () => {
    const courseMap = mapAll(A, itemsA.filter((item) => item.courseId));
    const result = run({ canvasState: { courseMap, includeNonAssignments: true } });
    expect(result.unmappedCourses).toEqual([expect.objectContaining({ key: canvasCourseKey(A, null), courseId: null })]);
  });
});

describe("options", () => {
  it("imports calendar events as events when asked, with their times", () => {
    const result = run({ canvasState: { courseMap: mapAll(A, itemsA), includeNonAssignments: true } });
    expect(byId(result.todos)[idA("calendar-event-4001")]).toMatchObject({ type: "event", dueDate: "2026-12-02", startTime: "18:00", endTime: "19:30", endDate: null, description: "Location: Room 101, Science Hall\n\nBring questions from the practice exam." });
    expect(byId(result.todos)[idA("calendar-event-4003")]).toMatchObject({ type: "event", dueDate: "2026-11-26", startTime: null });
  });

  it("imports past-due work when asked", () => {
    const result = run({ canvasState: { courseMap: mapAll(A, itemsA), includePastDue: true } });
    expect(result.summary.added).toBe(17);
  });
});

describe("two schools", () => {
  it("keeps the same Canvas ids at different schools apart", () => {
    const fromA = run();
    const both = run({ domain: B, items: itemsB, todos: fromA.todos, canvasState: { courseMap: { ...mapAll(A, itemsA), ...mapAll(B, itemsB) } } });
    expect(byId(both.todos)[canvasTaskId(A, "assignment-1001")].title).toBe("Problem Set 7");
    expect(byId(both.todos)[canvasTaskId(B, "assignment-1001")].title).toBe("Lab Notebook Check");
    // School B's sync doesn't touch school A's tasks
    expect(both.summary.removed).toBe(0);
    expect(both.todos.filter((todo) => todo.canvas?.domain === A)).toEqual(fromA.todos);
  });
});

describe("isUserTouched", () => {
  it("is false right after import and true after any edit", () => {
    const [task] = run().todos;
    expect(isUserTouched(task)).toBe(false);
    expect(isUserTouched({ ...task, priority: "urgent" })).toBe(true);
    expect(isUserTouched({ ...task, title: "x" })).toBe(true);
    expect(isUserTouched({ ...task, projectId: "p1" })).toBe(true);
  });
});
