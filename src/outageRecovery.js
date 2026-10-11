import { completionMap, isRepeating } from "./occurrences";

// The builds deployed on 2026-10-11 from 12:56 EDT until the fix shipped without the Supabase
// config, so every device saved edits only locally. On each device's first sync afterwards we
// carry over what can be dated to that window: tasks created, tasks checked off, and repeating
// occurrences checked off. Everything else defers to the cloud copy, because a device that was
// merely out of date can't otherwise be told apart from one with real edits.
const OUTAGE_START = Date.parse("2026-10-11T16:50:00Z");
const FLAG_PREFIX = "outage-recovered-2026-10-11:";

const duringOutage = (iso) => Boolean(iso) && Date.parse(iso) >= OUTAGE_START;

export function hasRecoveredOutageEdits(userId) {
  try {
    return localStorage.getItem(FLAG_PREFIX + userId) === "1";
  } catch {
    return true;
  }
}

export function markOutageEditsRecovered(userId) {
  try {
    localStorage.setItem(FLAG_PREFIX + userId, "1");
  } catch {
    // Storage unavailable: the merge is idempotent, so running it again later is harmless
  }
}

// Returns null when there is nothing to carry over.
export function mergeOutageEdits(remote, local) {
  const remoteTodos = remote.todos ?? [];
  const remoteIds = new Set(remoteTodos.map((todo) => todo.id));
  const localById = new Map((local.todos ?? []).map((todo) => [todo.id, todo]));
  let changed = false;

  const todos = remoteTodos.map((cloud) => {
    const mine = localById.get(cloud.id);
    if (!mine) return cloud;
    if (isRepeating(cloud)) {
      const completions = { ...completionMap(cloud) };
      for (const [dateKey, completedAt] of Object.entries(mine.completions ?? {})) {
        if (!(dateKey in completions) && duringOutage(completedAt)) completions[dateKey] = completedAt;
      }
      if (Object.keys(completions).length === Object.keys(completionMap(cloud)).length) return cloud;
      changed = true;
      return { ...cloud, completions, completed: false, completedAt: null };
    }
    if (!cloud.completed && mine.completed && duringOutage(mine.completedAt)) {
      changed = true;
      return { ...cloud, completed: true, completedAt: mine.completedAt };
    }
    return cloud;
  });

  const added = (local.todos ?? []).filter((todo) => !remoteIds.has(todo.id) && duringOutage(todo.createdAt));
  if (added.length) changed = true;
  if (!changed) return null;

  // Bring along categories that only exist locally if a carried-over task uses them
  const remoteCourses = remote.courses?.length ? remote.courses : local.courses;
  const courseIds = new Set(remoteCourses.map((course) => course.id));
  const neededCourses = (local.courses ?? []).filter((course) => !courseIds.has(course.id) && added.some((todo) => todo.courseId === course.id));

  return { todos: [...todos, ...added], courses: [...remoteCourses, ...neededCourses] };
}
