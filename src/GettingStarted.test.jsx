// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GettingStarted from "./GettingStarted";
import { checklistSteps, skipStep, startPrefs } from "./prefs";
import { DEFAULT_COURSES } from "./starterData";

afterEach(cleanup);

const active = startPrefs({}, { todos: [], now: new Date("2026-11-19T15:00:00Z") });
const context = { canvasAvailable: true, desktop: true, todos: [], courses: DEFAULT_COURSES };
const setup = (steps, props = {}) => {
  const handlers = { onAction: vi.fn(), onSkip: vi.fn(), onClose: vi.fn(), onShowGuide: vi.fn() };
  render(<GettingStarted steps={steps} {...handlers} {...props} />);
  return handlers;
};

describe("GettingStarted", () => {
  it("shows progress, and a button for each step that does it", () => {
    const handlers = setup(checklistSteps(active, { ...context, todos: [{ id: "t1" }] }));
    const section = screen.getByRole("region", { name: /Getting started/ });
    expect(section.textContent).toContain("1 of 6");
    expect(screen.getByText("Add your first task").textContent).toContain("(done)");
    expect(screen.queryByRole("button", { name: "Try it" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add one" }));
    expect(handlers.onAction).toHaveBeenCalledWith("category");
  });

  it("lets Canvas be skipped, and counts it toward finishing", () => {
    const handlers = setup(checklistSteps(active, context));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(handlers.onSkip).toHaveBeenCalledWith("canvas");
    cleanup();
    setup(checklistSteps(skipStep(active, "canvas"), context));
    expect(screen.getByRole("region", { name: /Getting started/ }).textContent).toContain("1 of 6");
    const canvas = screen.getByText("Connect Canvas").closest("li");
    expect(within(canvas).getByText("Skipped")).toBeTruthy();
    expect(within(canvas).getByRole("button", { name: "Connect" })).toBeTruthy();
  });

  it("has no button for checking off, since the task's own circle does it", () => {
    setup(checklistSteps(active, context));
    const step = screen.getByText("Check off a task").closest("li");
    expect(within(step).queryByRole("button")).toBeNull();
  });

  it("can be hidden before it's finished", () => {
    const handlers = setup(checklistSteps(active, context));
    fireEvent.click(screen.getByRole("button", { name: "Hide Getting started" }));
    expect(handlers.onClose).toHaveBeenCalledWith(false);
  });

  it("says so when every step is done, and points to What you can do", () => {
    const steps = checklistSteps(active, context).map((step) => ({ ...step, done: true }));
    const handlers = setup(steps);
    expect(screen.getByRole("region", { name: /You're set up/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "What you can do" }));
    expect(handlers.onShowGuide).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(handlers.onClose).toHaveBeenCalledWith(true);
  });

  it("gives each copy its own heading id, since the phone and computer layouts are both on the page", () => {
    const steps = checklistSteps(active, context);
    const handlers = { onAction: vi.fn(), onSkip: vi.fn(), onClose: vi.fn(), onShowGuide: vi.fn() };
    render(<><GettingStarted steps={steps} {...handlers} /><GettingStarted steps={steps} mobile {...handlers} /></>);
    const [first, second] = screen.getAllByRole("region", { name: /Getting started/ });
    expect(first.getAttribute("aria-labelledby")).not.toBe(second.getAttribute("aria-labelledby"));
  });
});
