import { describe, expect, it } from "vitest";
import { DEFAULT_COURSES, exampleTasks, isStartingCourse, withExampleTasks } from "./starterData";

const now = new Date(2026, 10, 20, 9, 0);

describe("DEFAULT_COURSES", () => {
  it("starts with Personal, then Work", () => {
    expect(DEFAULT_COURSES.map((course) => course.name)).toEqual(["Personal", "Work"]);
    expect(new Set(DEFAULT_COURSES.map((course) => course.color)).size).toBe(2);
    expect(DEFAULT_COURSES.every(isStartingCourse)).toBe(true);
    expect(isStartingCourse({ id: "c1", name: "General" })).toBe(true);
    expect(isStartingCourse({ id: "personal", name: "Home" })).toBe(false);
  });
});

describe("exampleTasks", () => {
  it("makes two tasks, one in each starting category, due today and tomorrow", () => {
    const [first, second] = exampleTasks(DEFAULT_COURSES, now);
    expect(first).toMatchObject({ title: "Check off this task", courseId: "personal", dueDate: "2026-11-20", completed: false, example: true });
    expect(second).toMatchObject({ courseId: "work", dueDate: "2026-11-21", example: true });
    expect(second.description).toBeTruthy();
  });

  it("uses the account's own categories when Personal and Work aren't there", () => {
    const [first, second] = exampleTasks([{ id: "c1", name: "General" }], now);
    expect(first.courseId).toBe("c1");
    expect(second.courseId).toBe("c1");
    expect(exampleTasks([], now)[0].courseId).toBeNull();
  });
});

describe("withExampleTasks", () => {
  it("puts them first, and never twice", () => {
    const mine = [{ id: "t1", title: "Mine" }];
    const once = withExampleTasks(mine, DEFAULT_COURSES, now);
    expect(once.map((todo) => todo.id)).toEqual(["example-check-off", "example-note", "t1"]);
    expect(withExampleTasks(once, DEFAULT_COURSES, now)).toBe(once);
  });
});
