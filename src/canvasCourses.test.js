import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCanvasFeed } from "../supabase/functions/_shared/canvasFeedParse.js";
import { NO_COURSE_LABEL, applyCourseMatches, cleanCourseLabel, listFeedCourses, suggestCategory } from "./canvasCourses";
import { canvasCourseKey, reconcile } from "./canvasSync";

const fixture = (name) => readFileSync(new URL(`./__fixtures__/canvas/${name}`, import.meta.url), "utf8");
const NOW = new Date("2026-11-17T17:00:00Z");
const TZ = "America/New_York";
const A = "example.instructure.com";
const itemsA = parseCanvasFeed(fixture("school-a.ics"));

describe("cleanCourseLabel", () => {
  it.each([
    ["PHYS1156.30002.202710", "PHYS 1156"],
    ["ENGL1010.MERGED.202710", "ENGL 1010"],
    ["HIST-205-02", "HIST 205"],
    ["BIOL 110", "BIOL 110"],
    ["PSY 101 Fall 2026", "PSY 101"],
    ["Peer.Mentoring.Community.26.27", "Peer Mentoring Community"],
    ["Intro to Psychology", "Intro to Psychology"],
    ["", "Canvas"],
  ])("%s -> %s", (label, cleaned) => {
    expect(cleanCourseLabel(label)).toBe(cleaned);
  });
});

describe("suggestCategory", () => {
  const categories = [
    { id: "gen", name: "General" },
    { id: "phys", name: "Physics" },
    { id: "cs", name: "Computer Science" },
    { id: "math", name: "MATH 2010" },
    { id: "old", name: "Chemistry", archived: true },
  ];
  it.each([
    ["PHYS1156.30002.202710", { type: "existing", categoryId: "phys" }], // prefix
    ["PHYS1153.30001.202710", { type: "existing", categoryId: "phys" }], // lecture and lab, many-to-one
    ["MATH2010.30003.202710", { type: "existing", categoryId: "math" }], // exact
    ["CS2100.30008.202710", { type: "existing", categoryId: "cs" }], // department table
    ["GE1234.MERGED.202710", { type: "new", name: "GE 1234" }], // not "General"
    ["CHEM1211.30004.202710", { type: "new", name: "CHEM 1211" }], // archived categories aren't offered
  ])("%s", (label, expected) => {
    expect(suggestCategory(label, categories)).toEqual(expected);
  });

  it("suggests a new 'Canvas' category for items with no course", () => {
    expect(suggestCategory(null, categories)).toEqual({ type: "new", name: "Canvas" });
  });
});

describe("listFeedCourses", () => {
  it("lists each Canvas course once, plus a no-course row, with upcoming counts", () => {
    const rows = listFeedCourses(itemsA, A, NOW, TZ);
    expect(rows).toHaveLength(9);
    expect(rows.at(-1)).toMatchObject({ courseId: null, name: NO_COURSE_LABEL, events: 1, assignments: 0 });
    expect(rows.find((row) => row.courseId === "502")).toMatchObject({ name: "PHYS 1156", label: "PHYS1156.30002.202710", assignments: 2, upcoming: 1 });
  });
});

describe("applyCourseMatches", () => {
  it("creates one category for two sections that get the same new name", () => {
    const matches = ["504", "505"].map((courseId) => ({ key: canvasCourseKey(A, courseId), courseId, choice: { type: "new", name: "CHEM 1211" } }));
    const { courses, canvasState, createdCategoryIds } = applyCourseMatches({ domain: A, matches, courses: [{ id: "gen", name: "General" }] });
    expect(createdCategoryIds).toEqual([`canvas-course:${A}:504`]);
    expect(courses.filter((course) => course.name === "CHEM 1211")).toHaveLength(1);
    expect(canvasState.courseMap).toEqual({ [canvasCourseKey(A, "504")]: `canvas-course:${A}:504`, [canvasCourseKey(A, "505")]: `canvas-course:${A}:504` });
  });

  it("reuses an existing category when a new name matches it", () => {
    const { courses, createdCategoryIds, canvasState } = applyCourseMatches({ domain: A, matches: [{ key: canvasCourseKey(A, "501"), courseId: "501", choice: { type: "new", name: "physics" } }], courses: [{ id: "phys", name: "Physics" }] });
    expect(createdCategoryIds).toEqual([]);
    expect(courses).toHaveLength(1);
    expect(canvasState.courseMap[canvasCourseKey(A, "501")]).toBe("phys");
  });

  it("records Don't import as null", () => {
    const { canvasState } = applyCourseMatches({ domain: A, matches: [{ key: canvasCourseKey(A, "507"), courseId: "507", choice: { type: "skip" } }], courses: [] });
    expect(canvasState.courseMap[canvasCourseKey(A, "507")]).toBeNull();
  });
});

// The brief's Phase 4 check: an existing "Physics" category plus a feed with PHYS1156 ends with
// PHYS1156 pre-selected to Physics and no duplicate category after import.
describe("connect flow: existing Physics category", () => {
  it("pre-selects Physics, imports into it, and adds no duplicate category", () => {
    const existing = [{ id: "c1", name: "General" }, { id: "phys", name: "Physics" }];
    const rows = listFeedCourses(itemsA, A, NOW, TZ);
    const matches = rows.map((row) => ({ key: row.key, courseId: row.courseId, choice: suggestCategory(row.courseId ? row.label : null, existing) }));
    expect(matches.find((match) => match.courseId === "502").choice).toEqual({ type: "existing", categoryId: "phys" });

    const applied = applyCourseMatches({ domain: A, matches, courses: existing });
    expect(applied.courses.filter((course) => /phys/i.test(course.name))).toEqual([{ id: "phys", name: "Physics" }]);
    const names = applied.courses.map((course) => course.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);

    const result = reconcile({ domain: A, feedItems: itemsA, todos: [], courses: applied.courses, canvasState: applied.canvasState, now: NOW, timeZone: TZ });
    expect(result.todos.filter((todo) => ["501", "502"].includes(todo.canvas.courseId)).every((todo) => todo.courseId === "phys")).toBe(true);
    expect(result.unmappedCourses).toEqual([]);
  });
});
