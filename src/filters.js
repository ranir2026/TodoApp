// The task list's filters other than status, search and sort, as the Filter menu edits them
export const DEFAULT_FILTERS = { courseFilter: "all", typeFilter: "task", priorityFilter: "all", dueFilter: null };

// How many filters differ from the defaults; the Filter button's badge
export function activeFilterCount({ courseFilter, typeFilter, priorityFilter, dueFilter }) {
  return [courseFilter !== "all", typeFilter !== "task", priorityFilter !== "all", Boolean(dueFilter)].filter(Boolean).length;
}
