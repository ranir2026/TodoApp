import { resolveTask } from "./occurrences";

export function isMilestone(item) {
  return item?.type === "milestone";
}

// Milestones are never checked off directly: one counts as reached once every task linked to it
// is done, or once its project is marked done (`doneProjects`: projectId -> when). Its completion is
// derived here on every render rather than stored, so it always follows its tasks and two devices
// can't disagree about it.
export function withMilestoneStatus(todos, doneProjects = {}) {
  if (!todos.some(isMilestone)) return todos;
  const linked = {};
  for (const todo of todos) {
    if (todo.milestoneId && !isMilestone(todo)) (linked[todo.milestoneId] ??= []).push(todo);
  }
  return todos.map((todo) => {
    if (!isMilestone(todo)) return todo;
    const tasks = linked[todo.id] ?? [];
    const done = tasks.filter((task) => resolveTask(task).completed).length;
    const projectDone = (todo.projectId && doneProjects[todo.projectId]) || null;
    const completed = Boolean(projectDone) || (tasks.length > 0 && done === tasks.length);
    const completedAt = completed ? tasks.map((task) => task.completedAt).filter(Boolean).sort().at(-1) ?? projectDone : null;
    return { ...todo, completed, completedAt, progress: { done, total: tasks.length } };
  });
}
