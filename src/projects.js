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

// ── Recently deleted ─────────────────────────────────────────────────────────────────────────────
// A deleted project leaves the timeline with its milestones and tasks, and waits in
// `planner.deleted` ({ project, todos, deletedAt }, newest first) for 30 days before it's gone for good.

export const KEEP_DELETED_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function isEntry(entry) {
  return Boolean(entry?.project?.id) && Array.isArray(entry.todos) && typeof entry.deletedAt === "string";
}

// When a deleted project goes for good
export function deletedUntil(entry) {
  return new Date(new Date(entry.deletedAt).getTime() + KEEP_DELETED_DAYS * DAY_MS);
}

function isKept(entry, now) {
  return isEntry(entry) && deletedUntil(entry) > now;
}

// The ones that can still be restored, newest first
export function recentlyDeleted(planner, now = new Date()) {
  return (planner.deleted ?? []).filter((entry) => isKept(entry, now));
}

export function hasExpiredDeleted(planner, now = new Date()) {
  return (planner.deleted ?? []).some((entry) => !isKept(entry, now));
}

export function withoutExpiredDeleted(planner, now = new Date()) {
  return hasExpiredDeleted(planner, now) ? { ...planner, deleted: recentlyDeleted(planner, now) } : planner;
}

// Takes the project off the timeline and keeps it, with `todos` (its milestones and tasks, already
// taken out of the list), in Recently deleted
export function moveToDeleted(planner, projectId, todos, now = new Date()) {
  const project = planner.projects.find((item) => item.id === projectId);
  if (!project) return planner;
  const entry = { project, todos, deletedAt: now.toISOString() };
  return {
    ...planner,
    projects: planner.projects.filter((item) => item.id !== projectId),
    deleted: [entry, ...recentlyDeleted(planner, now).filter((kept) => kept.project.id !== projectId)],
  };
}

// Puts the project back on the timeline, at `index` (the end by default), and out of Recently
// deleted. Its todos go back to the list separately (restoredTodos).
export function restoreDeleted(planner, projectId, index = planner.projects.length) {
  const entry = (planner.deleted ?? []).find((item) => item.project?.id === projectId);
  if (!entry) return planner;
  const projects = planner.projects.filter((item) => item.id !== projectId);
  return {
    ...planner,
    projects: [...projects.slice(0, index), entry.project, ...projects.slice(index)],
    deleted: planner.deleted.filter((item) => item !== entry),
  };
}

// The list with a restored project's todos added back, leaving out any already in it (a Canvas
// assignment that came back by itself, say)
export function restoredTodos(todos, entry) {
  const have = new Set(todos.map((todo) => todo.id));
  const missing = entry.todos.filter((todo) => !have.has(todo.id));
  return missing.length ? [...todos, ...missing] : todos;
}

// Deletes it for good, before its 30 days are up
export function forgetDeleted(planner, projectId) {
  const deleted = planner.deleted ?? [];
  return deleted.some((item) => item.project?.id === projectId)
    ? { ...planner, deleted: deleted.filter((item) => item.project?.id !== projectId) }
    : planner;
}

// Back in Recently deleted, as it was (undoing a delete for good)
export function putBackDeleted(planner, entry) {
  const deleted = (planner.deleted ?? []).filter((item) => item.project?.id !== entry.project.id);
  return { ...planner, deleted: [...deleted, entry].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)) };
}
