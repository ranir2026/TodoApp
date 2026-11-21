import { currentOccurrence, isRepeating, resolveTask, toggleOccurrence } from "./occurrences";

// A project is marked done by hand. Once done it moves to Completed at the bottom of the timeline,
// collapsed, and anything still open in it is checked off so none of it lingers in the list.

export function isProjectDone(project) {
  return Boolean(project?.completedAt);
}

// The project's tasks not done yet. Milestones aren't counted: they follow their tasks.
export function openProjectTasks(todos, projectId) {
  return todos.filter((todo) => todo.projectId === projectId && todo.type !== "milestone" && !resolveTask(todo).completed);
}

// Checks off what's left. A one-off task is completed. A repeating one has its current date checked
// off and stops repeating after it.
export function checkOffProject(todos, projectId, now = new Date()) {
  const open = new Set(openProjectTasks(todos, projectId).map((todo) => todo.id));
  if (!open.size) return todos;
  return todos.map((todo) => {
    if (!open.has(todo.id)) return todo;
    if (!isRepeating(todo)) return { ...todo, completed: true, completedAt: now.toISOString() };
    const current = currentOccurrence(todo);
    return { ...toggleOccurrence(todo, current, now), repeatUntil: current };
  });
}

function patchProject(planner, projectId, patch) {
  return { ...planner, projects: planner.projects.map((project) => (project.id === projectId ? { ...project, ...patch } : project)) };
}

export function markProjectDone(planner, projectId, now = new Date()) {
  return patchProject(planner, projectId, { completedAt: now.toISOString(), collapsed: true });
}

// Back in progress, opened up. Tasks checked off when it was marked done stay checked off.
export function reopenProject(planner, projectId) {
  return patchProject(planner, projectId, { completedAt: null, collapsed: false });
}

// projectId -> when it was marked done, for the projects that are
export function doneProjectDates(projects) {
  return Object.fromEntries(projects.filter(isProjectDone).map((project) => [project.id, project.completedAt]));
}
