// Plans a Connect Canvas import from the user's choices: which categories to create, the
// settings to save, and the tasks that result. Pure, so the review step can preview exactly
// what Import will do, and Import commits that same plan.
import { applyCourseMatches } from "./canvasCourses";
import { hasCanvasData, reconcile } from "./canvasSync";

export function planCanvasImport({ feed, rows, choices, options, todos, courses, canvas = {}, now, timeZone }) {
  const { domain, url, items } = feed;
  const matches = rows.map((row) => ({ key: row.key, courseId: row.courseId, choice: choices[row.key] ?? { type: "skip" } }));
  const applied = applyCourseMatches({ domain, matches, courses, canvasState: canvas });
  const nowIso = new Date(now).toISOString();
  const canvasState = {
    ...applied.canvasState,
    feeds: [...(canvas.feeds ?? []).filter((existing) => existing.domain !== domain), { id: `feed:${domain}`, url, domain, label: domain, lastSyncedAt: nowIso, status: "ok" }],
    dismissedIds: canvas.dismissedIds ?? [],
    includeNonAssignments: Boolean(options.includeNonAssignments),
    includePastDue: Boolean(options.includePastDue),
  };
  const result = reconcile({ domain, feedItems: items, todos, courses: applied.courses, canvasState, now, timeZone });

  // A new category nothing would go into isn't created yet; its course stays unmatched and is
  // asked about again once it has work to import
  const used = new Set(result.todos.map((todo) => todo.courseId));
  const empty = new Set(applied.createdCategoryIds.filter((id) => !used.has(id)));
  const courseMap = Object.fromEntries(Object.entries(canvasState.courseMap).filter(([, id]) => !empty.has(id)));
  const existingIds = new Set(todos.map((todo) => todo.id));
  const added = result.todos.filter((todo) => !existingIds.has(todo.id));

  return {
    todos: result.todos,
    courses: applied.courses.filter((course) => !empty.has(course.id)),
    canvas: { ...canvasState, courseMap },
    summary: result.summary,
    addedIds: added.map((todo) => todo.id),
    createdCategoryIds: applied.createdCategoryIds.filter((id) => !empty.has(id)),
    categoryCount: new Set(added.map((todo) => todo.courseId)).size,
    deferredCount: matches.filter((match) => empty.has(applied.canvasState.courseMap[match.key])).length,
  };
}

// The settings to restore when an import is undone. {} would never be saved (it means "not
// loaded"), so "not connected" is written as an empty feed list instead.
export function settingsBeforeImport(canvas) {
  return hasCanvasData(canvas) ? canvas : { feeds: [] };
}
