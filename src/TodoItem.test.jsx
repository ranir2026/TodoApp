// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TodoItem, { MilestoneCard } from "./TodoItem";

afterEach(cleanup);

const work = { id: "work", name: "Work", color: "#0071e3" };
const project = { id: "p1", name: "Launch", courseId: "work", accentColor: "#ec4899" };
const milestone = { id: "m1", type: "milestone", title: "Ready", courseId: "work", projectId: "p1", dueDate: "2026-11-25", completed: false };
const task = { id: "t1", type: "task", title: "Write it", courseId: "work", projectId: "p1", milestoneId: "m1", dueDate: "2026-11-24", completed: false };
const noop = () => {};
const stripe = (container) => container.querySelector("li").style.borderLeftColor;

describe("milestone accent", () => {
  it("is the project's color on a milestone's card", () => {
    const { container } = render(<ul><MilestoneCard milestone={milestone} tasks={[task]} course={work} project={project} onToggle={noop} onDelete={noop} onEdit={noop} /></ul>);
    expect(stripe(container)).toBe("rgb(236, 72, 153)");
  });

  it("is the project's color on a milestone's own row, and the category's on a task", () => {
    const row = (todo) => render(<ul><TodoItem todo={todo} course={work} project={project} onToggle={noop} onDelete={noop} onEdit={noop} /></ul>).container;
    expect(stripe(row(milestone))).toBe("rgb(236, 72, 153)");
    cleanup();
    expect(stripe(row(task))).toBe("rgb(0, 113, 227)");
  });

  it("outlines the diamond in the project's color until it's reached", () => {
    const card = (fields) => render(<ul><MilestoneCard milestone={{ ...milestone, ...fields }} tasks={[task]} course={work} project={project} onToggle={noop} onDelete={noop} onEdit={noop} /></ul>).container;
    const diamond = (container) => container.querySelector(".rotate-45");
    expect(diamond(card({})).style.borderColor).toBe("rgb(236, 72, 153)");
    cleanup();
    const reached = diamond(card({ completed: true }));
    expect(reached.style.borderColor).toBe("");
    expect(reached.className).toContain("bg-success-500");
  });

  it("falls back to the category's color without a project", () => {
    const { container } = render(<ul><MilestoneCard milestone={{ ...milestone, projectId: null }} tasks={[task]} course={work} onToggle={noop} onDelete={noop} onEdit={noop} /></ul>);
    expect(stripe(container)).toBe("rgb(0, 113, 227)");
  });
});
