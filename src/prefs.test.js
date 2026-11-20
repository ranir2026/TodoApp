import { describe, expect, it } from "vitest";
import {
  RELEASE,
  checklistShown,
  checklistSteps,
  closeChecklist,
  countManualAdd,
  markStep,
  markTipSeen,
  markWhatsNewSeen,
  normalizePrefs,
  observedSteps,
  rememberSteps,
  reopenChecklist,
  skipStep,
  startPrefs,
  tipSeen,
  whatsNewShown,
} from "./prefs";
import { DEFAULT_COURSES, exampleTasks } from "./starterData";

const now = new Date("2026-11-19T15:00:00Z");
const everywhere = { canvasAvailable: true, desktop: true };
const ids = (steps) => steps.map((step) => step.id);

describe("normalizePrefs", () => {
  it("treats a missing or odd value as nothing decided yet", () => {
    expect(normalizePrefs(null)).toEqual({});
    expect(normalizePrefs(undefined)).toEqual({});
    expect(normalizePrefs([])).toEqual({});
    expect(normalizePrefs("x")).toEqual({});
    expect(normalizePrefs({ tips: { a: true } })).toEqual({ tips: { a: true } });
  });
});

describe("startPrefs", () => {
  it("starts the checklist for an empty account, which has nothing new to catch up on", () => {
    const prefs = startPrefs({}, { todos: [], now });
    expect(prefs.onboarding).toEqual({ status: "active", startedAt: now.toISOString(), done: {} });
    expect(prefs.seenRelease).toBe(RELEASE);
    expect(checklistShown(prefs)).toBe(true);
    expect(whatsNewShown(prefs)).toBe(false);
  });

  it("gives an account that already has tasks What's new once, and no checklist", () => {
    const prefs = startPrefs({}, { todos: [{ id: "t1" }], now });
    expect(prefs.onboarding).toEqual({ status: "existing" });
    expect(checklistShown(prefs)).toBe(false);
    expect(whatsNewShown(prefs)).toBe(true);
    expect(whatsNewShown(markWhatsNewSeen(prefs))).toBe(false);
  });

  it("counts a list of only the example tasks as new, so a second device starts the checklist too", () => {
    expect(checklistShown(startPrefs({}, { todos: exampleTasks(DEFAULT_COURSES, now), now }))).toBe(true);
  });

  it("decides only once, so another device doesn't start it again", () => {
    expect(startPrefs({ onboarding: { status: "dismissed" } }, { todos: [], now })).toBeNull();
    expect(startPrefs({ onboarding: { status: "existing" } }, { todos: [], now })).toBeNull();
  });

  it("keeps what's already saved", () => {
    expect(startPrefs({ tips: { pressN: true } }, { todos: [], now }).tips).toEqual({ pressN: true });
  });
});

describe("checklistSteps", () => {
  const active = startPrefs({}, { todos: [], now });

  it("lists only what this account can do on this device", () => {
    expect(ids(checklistSteps(active, everywhere))).toEqual(["checkOff", "firstTask", "category", "canvas", "planDay", "shortcuts"]);
    expect(ids(checklistSteps(active, { canvasAvailable: false, desktop: true }))).toEqual(["checkOff", "firstTask", "category", "planDay", "shortcuts"]);
    expect(ids(checklistSteps(active, { canvasAvailable: true, desktop: false }))).toEqual(["checkOff", "firstTask", "category", "canvas"]);
  });

  it("only Canvas can be skipped", () => {
    expect(checklistSteps(active, everywhere).filter((step) => step.optional).map((step) => step.id)).toEqual(["canvas"]);
  });

  it("ticks off steps from what's actually been done", () => {
    const steps = checklistSteps(active, {
      ...everywhere,
      todos: [{ id: "t1", title: "Essay", completed: true }],
      courses: [{ id: "personal", name: "Personal" }, { id: "c2", name: "Biology" }],
      canvas: { feeds: [{ id: "f1" }] },
      planner: { days: { "2026-11-19": { blocks: [{ id: "b1" }] } } },
    });
    expect(steps.filter((step) => step.done).map((step) => step.id)).toEqual(["checkOff", "firstTask", "category", "canvas", "planDay"]);
  });

  it("doesn't count what came from Canvas, the example tasks, or the starting categories", () => {
    const observed = observedSteps({ todos: [{ id: "t1", canvas: { uid: "x" } }, ...exampleTasks(DEFAULT_COURSES, now)], courses: DEFAULT_COURSES });
    expect(observed.firstTask).toBe(false);
    expect(observed.category).toBe(false);
    expect(observedSteps({ courses: [{ id: "c1", name: "General" }] }).category).toBe(false);
    expect(observedSteps({ courses: [...DEFAULT_COURSES, { id: "c3", name: "Biology" }] }).category).toBe(true);
    expect(observedSteps({ courses: [{ id: "work", name: "Internship" }] }).category).toBe(true);
  });

  it("counts any task checked off, a repeat included", () => {
    expect(observedSteps({ todos: exampleTasks(DEFAULT_COURSES, now) }).checkOff).toBe(false);
    expect(observedSteps({ todos: [{ id: "e1", example: true, completed: true }] }).checkOff).toBe(true);
    expect(observedSteps({ todos: [{ id: "r1", repeat: "weekly", completed: false, completions: { "2026-11-19": now.toISOString() } }] }).checkOff).toBe(true);
  });

  it("points at the examples while one is left to check off", () => {
    const step = (todos, desktop = true) => checklistSteps(active, { ...everywhere, desktop, todos })[0];
    expect(step(exampleTasks(DEFAULT_COURSES, now)).detail).toBe("Click the circle beside one of the examples below.");
    expect(step(exampleTasks(DEFAULT_COURSES, now), false).detail).toBe("Tap the circle beside one of the examples below.");
    expect(step([]).detail).toBe("Click the circle beside any task.");
    expect(step([]).action).toBeUndefined();
  });

  it("keeps a remembered step ticked after its task is deleted", () => {
    const remembered = rememberSteps(active, checklistSteps(active, { ...everywhere, todos: [{ id: "t1" }] }));
    expect(remembered.onboarding.done).toEqual({ firstTask: true });
    expect(checklistSteps(remembered, { ...everywhere, todos: [] }).find((step) => step.id === "firstTask").done).toBe(true);
  });

  it("marks skipped, until the step is done", () => {
    const skipped = skipStep(active, "canvas");
    expect(checklistSteps(skipped, everywhere).find((step) => step.id === "canvas")).toMatchObject({ skipped: true, done: false });
    const connected = checklistSteps(skipped, { ...everywhere, canvas: { feeds: [{ id: "f1" }] } }).find((step) => step.id === "canvas");
    expect(connected).toMatchObject({ skipped: false, done: true });
    expect(skipStep(skipped, "canvas", false).onboarding.skipped).toEqual({});
  });
});

describe("rememberSteps", () => {
  const active = startPrefs({}, { todos: [], now });

  it("returns null when nothing new was done, so it doesn't save on every render", () => {
    expect(rememberSteps(active, checklistSteps(active, everywhere))).toBeNull();
    const once = rememberSteps(active, [{ id: "firstTask", done: true }]);
    expect(rememberSteps(once, [{ id: "firstTask", done: true }])).toBeNull();
  });

  it("does nothing once the checklist is closed", () => {
    expect(rememberSteps(closeChecklist(active, "dismissed"), [{ id: "firstTask", done: true }])).toBeNull();
  });
});

describe("closing and reopening", () => {
  it("closes for good, and comes back from What you can do with its progress", () => {
    const progress = markStep(startPrefs({}, { todos: [], now }), "shortcuts");
    const closed = closeChecklist(progress, "dismissed");
    expect(checklistShown(closed)).toBe(false);
    const reopened = reopenChecklist(closed);
    expect(checklistShown(reopened)).toBe(true);
    expect(reopened.onboarding.done).toEqual({ shortcuts: true });
  });

  it("can be reopened by an account that never had it", () => {
    const reopened = reopenChecklist({ onboarding: { status: "existing" } });
    expect(reopened.onboarding).toEqual({ status: "active", done: {} });
  });
});

describe("tips", () => {
  it("remembers each tip once seen", () => {
    expect(tipSeen({}, "pressN")).toBe(false);
    const seen = markTipSeen({}, "pressN");
    expect(tipSeen(seen, "pressN")).toBe(true);
    expect(tipSeen(seen, "quickAdd")).toBe(false);
    expect(markTipSeen(seen, "quickAdd").tips).toEqual({ pressN: true, quickAdd: true });
  });

  it("counts tasks added with the form", () => {
    expect(countManualAdd({}).manualAdds).toBe(1);
    expect(countManualAdd(countManualAdd({})).manualAdds).toBe(2);
  });
});
