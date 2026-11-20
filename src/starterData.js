import { COLOR_PALETTE } from "./courseColors";
import { addDays, toDateKey } from "./planner";

// The categories a new account starts with
export const DEFAULT_COURSES = [
  { id: "personal", name: "Personal", color: COLOR_PALETTE[0] },
  { id: "work", name: "Work", color: COLOR_PALETTE[1] },
];

// Those, and the single General category accounts started with before November 2026. Making any
// other category (or renaming one of these) is what ticks off "Make a category".
const STARTING_COURSES = [["c1", "General"], ...DEFAULT_COURSES.map((course) => [course.id, course.name])];

export function isStartingCourse(course) {
  return STARTING_COURSES.some(([id, name]) => course?.id === id && course?.name === name);
}

// Two tasks for the Getting started checklist to point at, so a new list isn't empty and the first
// thing to try is checking one off. Fixed ids, so two devices starting at once don't add them twice.
const EXAMPLE_CHECK_OFF = "example-check-off";
const EXAMPLE_NOTE = "example-note";

export function exampleTasks(courses, now = new Date()) {
  const today = toDateKey(now);
  // Personal and Work when they're there, otherwise the account's own first categories
  const category = (id, index) => (courses.some((course) => course.id === id) ? id : (courses[index] ?? courses[0])?.id ?? null);
  const task = { type: "task", endDate: null, startTime: null, endTime: null, priority: "normal", repeat: "none", repeatDays: null, repeatUntil: null, repeatCount: null, completed: false, createdAt: now.toISOString(), example: true };
  return [
    { ...task, id: EXAMPLE_CHECK_OFF, title: "Check off this task", courseId: category("personal", 0), dueDate: today, description: null },
    {
      ...task,
      id: EXAMPLE_NOTE,
      title: "Open this task to see its note",
      courseId: category("work", 1),
      dueDate: addDays(today, 1),
      description: "Tasks can have a note like this one, plus links, a time and a repeat. Check it off once you've read it, or delete it.",
    },
  ];
}

// Puts the examples at the top of the list, leaving out any that are already there
export function withExampleTasks(todos, courses, now = new Date()) {
  const have = new Set(todos.map((todo) => todo.id));
  const missing = exampleTasks(courses, now).filter((todo) => !have.has(todo.id));
  return missing.length ? [...missing, ...todos] : todos;
}
