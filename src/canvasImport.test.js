import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCanvasFeed } from "../supabase/functions/_shared/canvasFeedParse.js";
import { listFeedCourses, suggestCategory } from "./canvasCourses";
import { planCanvasImport, settingsBeforeImport } from "./canvasImport";

const fixture = (name) => readFileSync(new URL(`./__fixtures__/canvas/${name}`, import.meta.url), "utf8");
const NOW = new Date("2026-11-17T17:00:00Z");
const TZ = "America/New_York";
const A = "example.instructure.com";
const URL_A = `https://${A}/feeds/calendars/user_FAKEtoken0123456789abcdef.ics`;
const feed = { domain: A, url: URL_A, items: parseCanvasFeed(fixture("school-a.ics")) };
const courses = [{ id: "c1", name: "General" }, { id: "phys", name: "Physics" }];
const rows = listFeedCourses(feed.items, A, NOW, TZ);
const suggested = Object.fromEntries(rows.map((row) => [row.key, suggestCategory(row.courseId ? row.label : null, courses)]));
const plan = (overrides = {}) => planCanvasImport({ feed, rows, choices: suggested, options: {}, todos: [], courses, canvas: {}, now: NOW, timeZone: TZ, ...overrides });

describe("planCanvasImport", () => {
  it("previews and produces the same import", () => {
    const result = plan();
    expect(result.summary.added).toBe(12);
    expect(result.addedIds).toHaveLength(12);
    expect(result.todos).toHaveLength(12);
    expect(result.canvas.feeds).toEqual([{ id: `feed:${A}`, url: URL_A, domain: A, label: A, lastSyncedAt: NOW.toISOString(), status: "ok" }]);
    expect(result.canvas).toMatchObject({ includeNonAssignments: false, includePastDue: false, dismissedIds: [] });
  });

  it("doesn't create a category that nothing would go into", () => {
    const result = plan();
    // The no-course row only holds a personal event, which isn't imported by default
    expect(result.courses.some((course) => course.name === "Canvas")).toBe(false);
    expect(result.deferredCount).toBe(1);
    expect(Object.values(result.canvas.courseMap)).not.toContain(`canvas-course:${A}:none`);
    // With events on, it gets created and used
    const withEvents = plan({ options: { includeNonAssignments: true } });
    expect(withEvents.courses.some((course) => course.name === "Canvas")).toBe(true);
  });

  it("creates no duplicate categories", () => {
    const names = plan().courses.map((course) => course.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(plan().createdCategoryIds.every((id) => id.startsWith(`canvas-course:${A}:`))).toBe(true);
  });

  it("reconnecting reattaches to the same tasks instead of duplicating them", () => {
    const first = plan();
    const again = planCanvasImport({ feed, rows, choices: suggested, options: {}, todos: first.todos, courses: first.courses, canvas: first.canvas, now: NOW, timeZone: TZ });
    expect(again.addedIds).toEqual([]);
    expect(again.todos).toHaveLength(first.todos.length);
    expect(again.createdCategoryIds).toEqual([]);
    expect(again.courses).toEqual(first.courses);
  });

  it("keeps the user's tombstones", () => {
    const first = plan();
    const result = plan({ canvas: { ...first.canvas, dismissedIds: [first.addedIds[0]] } });
    expect(result.addedIds).not.toContain(first.addedIds[0]);
    expect(result.canvas.dismissedIds).toEqual([first.addedIds[0]]);
  });
});

describe("settingsBeforeImport", () => {
  it("restores earlier settings, or a saveable 'not connected'", () => {
    expect(settingsBeforeImport({})).toEqual({ feeds: [] });
    const earlier = { feeds: [], dismissedIds: ["x"] };
    expect(settingsBeforeImport(earlier)).toBe(earlier);
  });
});
