import { describe, expect, it } from "vitest";
import { daysBetween, normalizePlanner } from "./planner";
import { withMilestoneStatus } from "./milestones";
import {
  DEFAULT_COURSES,
  EXAMPLE_PROJECT,
  exampleProject,
  exampleTasks,
  startingExamplesOpen,
  withExamplePlannerItems,
  withExampleProject,
  withExampleTasks,
} from "./starterData";

const now = new Date(2026, 10, 20, 9, 0);

describe("DEFAULT_COURSES", () => {
  it("starts with Personal, then Work", () => {
    expect(DEFAULT_COURSES.map((course) => course.name)).toEqual(["Personal", "Work"]);
    expect(new Set(DEFAULT_COURSES.map((course) => course.color)).size).toBe(2);
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

describe("startingExamplesOpen", () => {
  it("is true while either starting example is left to check off", () => {
    const [first, second] = exampleTasks(DEFAULT_COURSES, now);
    expect(startingExamplesOpen([first, second])).toBe(true);
    expect(startingExamplesOpen([{ ...first, completed: true }, second])).toBe(true);
    expect(startingExamplesOpen([{ ...first, completed: true }, { ...second, completed: true }])).toBe(false);
    // Deleted counts the same as done, and the project's examples don't count
    expect(startingExamplesOpen(exampleProject(DEFAULT_COURSES, now).todos)).toBe(false);
  });
});

describe("exampleProject", () => {
  const { project, todos } = exampleProject(DEFAULT_COURSES, now);
  const milestones = todos.filter((todo) => todo.type === "milestone");
  const tasks = todos.filter((todo) => todo.type === "task");

  it("is a project in Work spanning from today to its last milestone, with no phases", () => {
    expect(project).toMatchObject({ id: EXAMPLE_PROJECT, name: "Research paper", courseId: "work", startDate: "2026-11-20", example: true });
    expect(project.endDate).toBe(milestones.at(-1).dueDate);
    expect("phases" in project).toBe(false);
    expect(todos.every((todo) => todo.projectId === EXAMPLE_PROJECT && todo.courseId === "work" && todo.example)).toBe(true);
  });

  it("has two milestones with three tasks each, each task due before its milestone", () => {
    expect(milestones.map((milestone) => milestone.title)).toEqual(["Outline due", "Paper due"]);
    for (const milestone of milestones) {
      const own = tasks.filter((task) => task.milestoneId === milestone.id);
      expect(own).toHaveLength(3);
      expect(own.every((task) => task.dueDate < milestone.dueDate && task.dueDate >= project.startDate)).toBe(true);
    }
    expect(tasks).toHaveLength(6);
  });

  it("puts two of one milestone's tasks on the same day", () => {
    const sameDay = milestones.filter((milestone) => {
      const dates = tasks.filter((task) => task.milestoneId === milestone.id).map((task) => task.dueDate);
      return new Set(dates).size === dates.length - 1;
    });
    expect(sameDay).toHaveLength(1);
  });

  it("has its first milestone within a week, so it shows in the list, and the second two days after", () => {
    expect(milestones[0].dueDate <= "2026-11-27").toBe(true);
    expect(daysBetween(milestones[0].dueDate, milestones[1].dueDate)).toBe(2);
  });

  it("starts with no milestone reached", () => {
    expect(withMilestoneStatus(todos).filter((todo) => todo.type === "milestone").every((milestone) => !milestone.completed)).toBe(true);
  });
});

describe("withExampleTasks", () => {
  it("puts the examples first, the project's too, and never twice", () => {
    const mine = [{ id: "t1", title: "Mine" }];
    const once = withExampleTasks(mine, DEFAULT_COURSES, now);
    expect(once.slice(0, 2).map((todo) => todo.id)).toEqual(["example-check-off", "example-note"]);
    expect(once).toHaveLength(2 + 8 + 1);
    expect(once.at(-1).id).toBe("t1");
    expect(new Set(once.map((todo) => todo.id)).size).toBe(once.length);
    expect(withExampleTasks(once, DEFAULT_COURSES, now)).toBe(once);
  });
});

describe("withExampleProject", () => {
  it("adds the project once, after any that are already there", () => {
    const planner = normalizePlanner({ projects: [{ id: "p1", name: "Mine" }] });
    const once = withExampleProject(planner, DEFAULT_COURSES, now);
    expect(once.projects.map((project) => project.id)).toEqual(["p1", EXAMPLE_PROJECT]);
    expect(withExampleProject(once, DEFAULT_COURSES, now)).toBe(once);
  });
});

describe("withExamplePlannerItems", () => {
  it("puts two things in the day's tray, without a time", () => {
    const planner = withExamplePlannerItems(normalizePlanner({}), "2026-11-20");
    expect(planner.days["2026-11-20"]).toEqual({
      blocks: [],
      inbox: [{ id: "example-plan-laundry", title: "Laundry", done: false }, { id: "example-plan-walk", title: "Go for a walk", done: false }],
    });
  });

  it("leaves a day that already has something planned or waiting", () => {
    const planned = normalizePlanner({ days: { "2026-11-20": { blocks: [{ id: "b1" }], inbox: [] } } });
    const waiting = normalizePlanner({ days: { "2026-11-20": { blocks: [], inbox: [{ id: "i1", title: "Mine" }] } } });
    expect(withExamplePlannerItems(planned, "2026-11-20")).toBe(planned);
    expect(withExamplePlannerItems(waiting, "2026-11-20")).toBe(waiting);
  });
});

describe("normalizePlanner", () => {
  it("drops the phases projects used to have, and leaves projects without them as they are", () => {
    const projects = [{ id: "p1", name: "Essay", phases: [{ id: "ph1", name: "Research" }] }, { id: "p2", name: "Lab" }];
    expect(normalizePlanner({ projects }).projects).toEqual([{ id: "p1", name: "Essay" }, { id: "p2", name: "Lab" }]);
    const clean = [{ id: "p2", name: "Lab" }];
    expect(normalizePlanner({ projects: clean }).projects).toBe(clean);
  });
});
