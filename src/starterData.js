import { COLOR_PALETTE } from "./courseColors";
import { EMPTY_DAY, addDays, toDateKey } from "./planner";

// What a new account starts with. Everything here has a fixed id, so two devices starting at once
// don't add it twice, and `example: true`, so none of it counts as the person's own.

// The categories a new account starts with
export const DEFAULT_COURSES = [
  { id: "personal", name: "Personal", color: COLOR_PALETTE[0] },
  { id: "work", name: "Work", color: COLOR_PALETTE[1] },
];

const EXAMPLE_CHECK_OFF = "example-check-off";
const EXAMPLE_NOTE = "example-note";
const STARTING_EXAMPLES = [EXAMPLE_CHECK_OFF, EXAMPLE_NOTE];
export const EXAMPLE_PROJECT = "example-project";

// Personal or Work when it's there, otherwise the account's own category in that place
function categoryFor(courses, id, index) {
  return courses.some((course) => course.id === id) ? id : (courses[index] ?? courses[0])?.id ?? null;
}

function exampleTodo(now, fields) {
  return {
    type: "task",
    endDate: null,
    startTime: null,
    endTime: null,
    priority: "normal",
    description: null,
    repeat: "none",
    repeatDays: null,
    repeatUntil: null,
    repeatCount: null,
    completed: false,
    createdAt: now.toISOString(),
    example: true,
    ...fields,
  };
}

// Two tasks for the Getting started checklist to point at, so the first thing to try is checking one off
export function exampleTasks(courses, now = new Date()) {
  const today = toDateKey(now);
  return [
    exampleTodo(now, { id: EXAMPLE_CHECK_OFF, title: "Check off this task", courseId: categoryFor(courses, "personal", 0), dueDate: today }),
    exampleTodo(now, {
      id: EXAMPLE_NOTE,
      title: "Open this task to see its note",
      courseId: categoryFor(courses, "work", 1),
      dueDate: addDays(today, 1),
      description: "Tasks can have a note like this one, plus links, a time and a repeat. Check it off once you've read it, or delete it.",
    }),
  ];
}

// Whether either of those two is still there to check off
export function startingExamplesOpen(todos) {
  return todos.some((todo) => STARTING_EXAMPLES.includes(todo.id) && !todo.completed);
}

// A project on the timeline: two milestones with three tasks toward each, two of them on the same
// day so the timeline shows how tasks stack up. Its first milestone is under a week away, so it
// also shows in the list as one card.
export function exampleProject(courses, now = new Date()) {
  const today = toDateKey(now);
  const courseId = categoryFor(courses, "work", 1);
  const project = { id: EXAMPLE_PROJECT, name: "Research paper", courseId, color: null, startDate: today, endDate: addDays(today, 18), collapsed: false, example: true };
  const item = (id, title, days, fields = {}) => exampleTodo(now, { id, title, courseId, dueDate: addDays(today, days), projectId: EXAMPLE_PROJECT, ...fields });
  const outline = "example-milestone-outline";
  const paper = "example-milestone-paper";
  return {
    project,
    todos: [
      item(outline, "Outline due", 6, { type: "milestone" }),
      item("example-topic", "Pick a topic", 1, { milestoneId: outline }),
      item("example-sources", "Find sources", 4, { milestoneId: outline }),
      item("example-notes", "Take notes", 4, { milestoneId: outline }),
      item(paper, "Paper due", 18, { type: "milestone" }),
      item("example-draft", "Write the first draft", 11, { milestoneId: paper }),
      item("example-feedback", "Get feedback", 14, { milestoneId: paper }),
      item("example-revise", "Revise and proofread", 17, { milestoneId: paper }),
    ],
  };
}

// Puts the example tasks (the project's too) at the top of the list, leaving out any already there
export function withExampleTasks(todos, courses, now = new Date()) {
  const have = new Set(todos.map((todo) => todo.id));
  const missing = [...exampleTasks(courses, now), ...exampleProject(courses, now).todos].filter((todo) => !have.has(todo.id));
  return missing.length ? [...missing, ...todos] : todos;
}

// Adds the example project to the timeline unless it's there already. `planner` is normalized.
export function withExampleProject(planner, courses, now = new Date()) {
  if (planner.projects.some((project) => project.id === EXAMPLE_PROJECT)) return planner;
  return { ...planner, projects: [...planner.projects, exampleProject(courses, now).project] };
}

// Two things just for one day, waiting in the planner's tray, for "Plan your day" when the starting
// examples are already checked off and there'd be nothing due to plan. Only on a day with nothing
// planned or waiting yet. `planner` is normalized.
const EXAMPLE_PLANNER_ITEMS = [
  { id: "example-plan-laundry", title: "Laundry", done: false },
  { id: "example-plan-walk", title: "Go for a walk", done: false },
];

export function withExamplePlannerItems(planner, dateKey) {
  const day = { ...EMPTY_DAY, ...planner.days[dateKey] };
  if (day.inbox.length || day.blocks.length) return planner;
  return { ...planner, days: { ...planner.days, [dateKey]: { ...day, inbox: EXAMPLE_PLANNER_ITEMS.map((item) => ({ ...item })) } } };
}
