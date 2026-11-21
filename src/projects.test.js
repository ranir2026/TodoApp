import { describe, expect, it } from "vitest";
import { withMilestoneStatus } from "./milestones";
import { resolveTask } from "./occurrences";
import { normalizePlanner } from "./planner";
import {
  checkOffProject,
  deletedUntil,
  doneProjectDates,
  forgetDeleted,
  hasExpiredDeleted,
  isProjectDone,
  markProjectDone,
  moveToDeleted,
  openProjectTasks,
  putBackDeleted,
  recentlyDeleted,
  reopenProject,
  restoreDeleted,
  restoredTodos,
  withoutExpiredDeleted,
} from "./projects";

const now = new Date(2026, 10, 20, 9, 0);
const task = (fields) => ({ type: "task", completed: false, completedAt: null, repeat: "none", projectId: "p1", ...fields });

const todos = [
  task({ id: "m1", type: "milestone", title: "Draft due", dueDate: "2026-11-27" }),
  task({ id: "m2", type: "milestone", title: "Final due", dueDate: "2026-12-04" }),
  task({ id: "t1", title: "Read", dueDate: "2026-11-21", milestoneId: "m1" }),
  task({ id: "t2", title: "Outline", dueDate: "2026-11-22", milestoneId: "m1", completed: true, completedAt: "2026-11-19T10:00:00.000Z" }),
  task({ id: "t3", title: "Check in", dueDate: "2026-11-23", repeat: "weekly" }),
  task({ id: "other", title: "Not in it", projectId: "p2", dueDate: "2026-11-21" }),
];
const planner = { days: {}, projects: [{ id: "p1", name: "Essay", collapsed: false }, { id: "p2", name: "Lab", collapsed: false }] };

describe("checkOffProject", () => {
  it("checks off every open task in the project, and nothing outside it", () => {
    expect(openProjectTasks(todos, "p1").map((todo) => todo.id)).toEqual(["t1", "t3"]);
    const next = checkOffProject(todos, "p1", now);
    expect(openProjectTasks(next, "p1")).toEqual([]);
    expect(next.find((todo) => todo.id === "t1")).toMatchObject({ completed: true, completedAt: now.toISOString() });
    // Already done keeps when it was done
    expect(next.find((todo) => todo.id === "t2").completedAt).toBe("2026-11-19T10:00:00.000Z");
    expect(next.find((todo) => todo.id === "other")).toBe(todos.find((todo) => todo.id === "other"));
  });

  it("ends a repeating task at its current date, checked off", () => {
    const repeat = checkOffProject(todos, "p1", now).find((todo) => todo.id === "t3");
    expect(repeat.repeatUntil).toBe("2026-11-23");
    expect(repeat.completions).toEqual({ "2026-11-23": now.toISOString() });
    expect(resolveTask(repeat).completed).toBe(true);
  });

  it("returns the same list when there's nothing left to check off", () => {
    const done = checkOffProject(todos, "p1", now);
    expect(checkOffProject(done, "p1", now)).toBe(done);
  });
});

describe("markProjectDone and reopenProject", () => {
  it("marks one project done and collapses it, then reopens it expanded", () => {
    const done = markProjectDone(planner, "p1", now);
    expect(done.projects[0]).toMatchObject({ completedAt: now.toISOString(), collapsed: true });
    expect(isProjectDone(done.projects[0])).toBe(true);
    expect(done.projects[1]).toBe(planner.projects[1]);
    expect(doneProjectDates(done.projects)).toEqual({ p1: now.toISOString() });
    const reopened = reopenProject(done, "p1");
    expect(reopened.projects[0]).toMatchObject({ completedAt: null, collapsed: false });
    expect(isProjectDone(reopened.projects[0])).toBe(false);
    expect(doneProjectDates(reopened.projects)).toEqual({});
  });
});

describe("withMilestoneStatus with done projects", () => {
  it("counts a done project's milestones as reached, even one with no tasks", () => {
    const before = withMilestoneStatus(todos);
    expect(before.find((todo) => todo.id === "m2").completed).toBe(false);
    const after = withMilestoneStatus(todos, { p1: now.toISOString() });
    expect(after.find((todo) => todo.id === "m2")).toMatchObject({ completed: true, completedAt: now.toISOString() });
    expect(after.find((todo) => todo.id === "m1").completed).toBe(true);
    // A project that isn't done still goes by its tasks
    expect(withMilestoneStatus(todos, { p2: now.toISOString() }).find((todo) => todo.id === "m1").completed).toBe(false);
  });
});

describe("Recently deleted", () => {
  const essayTodos = todos.filter((todo) => todo.projectId === "p1");
  const base = normalizePlanner(planner);
  const deleted = moveToDeleted(base, "p1", essayTodos, now);

  it("takes the project off the timeline and keeps it, with its todos, newest first", () => {
    expect(deleted.projects.map((project) => project.id)).toEqual(["p2"]);
    expect(recentlyDeleted(deleted, now)).toEqual([{ project: planner.projects[0], todos: essayTodos, deletedAt: now.toISOString() }]);
    const later = new Date(2026, 10, 21, 9, 0);
    const both = moveToDeleted(deleted, "p2", [], later);
    expect(recentlyDeleted(both, later).map((entry) => entry.project.id)).toEqual(["p2", "p1"]);
    expect(moveToDeleted(base, "missing", [], now)).toBe(base);
  });

  it("keeps them 30 days", () => {
    const entry = recentlyDeleted(deleted, now)[0];
    expect(deletedUntil(entry)).toEqual(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));
    const day29 = new Date(2026, 11, 19, 9, 0);
    const day31 = new Date(2026, 11, 21, 9, 0);
    expect(recentlyDeleted(deleted, day29)).toHaveLength(1);
    expect(hasExpiredDeleted(deleted, day29)).toBe(false);
    expect(withoutExpiredDeleted(deleted, day29)).toBe(deleted);
    expect(recentlyDeleted(deleted, day31)).toEqual([]);
    expect(hasExpiredDeleted(deleted, day31)).toBe(true);
    expect(withoutExpiredDeleted(deleted, day31).deleted).toEqual([]);
  });

  it("ignores entries it can't read", () => {
    const odd = { ...base, deleted: [null, { project: {} }, { project: { id: "x" }, todos: [], deletedAt: now.toISOString() }] };
    expect(recentlyDeleted(odd, now).map((entry) => entry.project.id)).toEqual(["x"]);
    expect(withoutExpiredDeleted(odd, now).deleted).toHaveLength(1);
  });

  it("restores the project where it's asked to, and its todos without doubling any", () => {
    const back = restoreDeleted(deleted, "p1", 0);
    expect(back.projects.map((project) => project.id)).toEqual(["p1", "p2"]);
    expect(back.deleted).toEqual([]);
    expect(restoreDeleted(deleted, "p1").projects.map((project) => project.id)).toEqual(["p2", "p1"]);
    expect(restoreDeleted(deleted, "missing")).toBe(deleted);
    const entry = deleted.deleted[0];
    const list = todos.filter((todo) => todo.projectId !== "p1");
    expect(restoredTodos(list, entry).map((todo) => todo.id).sort()).toEqual(todos.map((todo) => todo.id).sort());
    const already = [...list, essayTodos[0]];
    expect(restoredTodos(already, entry)).toHaveLength(todos.length);
    expect(restoredTodos(todos, entry)).toBe(todos);
  });

  it("deletes one for good, and puts it back in its place when that's undone", () => {
    const later = new Date(2026, 10, 21, 9, 0);
    const both = moveToDeleted(deleted, "p2", [], later);
    const entry = both.deleted[1];
    const forgotten = forgetDeleted(both, "p1");
    expect(forgotten.deleted.map((item) => item.project.id)).toEqual(["p2"]);
    expect(forgetDeleted(forgotten, "p1")).toBe(forgotten);
    expect(putBackDeleted(forgotten, entry).deleted.map((item) => item.project.id)).toEqual(["p2", "p1"]);
  });

  it("survives normalizing, and starts empty", () => {
    expect(normalizePlanner(deleted).deleted).toBe(deleted.deleted);
    expect(normalizePlanner({}).deleted).toEqual([]);
    expect(normalizePlanner({ deleted: "nope" }).deleted).toEqual([]);
  });
});
