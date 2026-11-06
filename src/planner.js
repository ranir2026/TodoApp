// Planner data lives outside the todo list: day plans are only shown in the planner modal, and
// projects hold the timeline-only pieces (span, phases). Milestones and project tasks are todos.
export const EMPTY_PLANNER = { days: {}, projects: [] };
export const EMPTY_DAY = { blocks: [], inbox: [] };

export function normalizePlanner(planner) {
  return {
    days: planner?.days && typeof planner.days === "object" ? planner.days : {},
    projects: Array.isArray(planner?.projects) ? planner.projects : [],
  };
}

export function toDateKey(date) {
  return date.toLocaleDateString("en-CA");
}

export function addDays(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return toDateKey(new Date(y, m - 1, d + days));
}

// Whole days from a to b (both "YYYY-MM-DD")
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes) {
  const clamped = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export function formatClock(minutes) {
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Side-by-side columns for overlapping items ({ start, end } in minutes). Each item gets its
// column and the column count of the cluster of overlaps it belongs to.
export function layoutColumns(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed = [];
  let cluster = [];
  let clusterEnd = -1;
  const finishCluster = () => {
    const count = Math.max(1, ...cluster.map((entry) => entry.column + 1));
    for (const entry of cluster) entry.columns = count;
    cluster = [];
  };
  for (const item of sorted) {
    if (item.start >= clusterEnd) finishCluster();
    const taken = new Set(cluster.filter((entry) => entry.item.end > item.start).map((entry) => entry.column));
    let column = 0;
    while (taken.has(column)) column += 1;
    const entry = { item, column, columns: 1 };
    cluster.push(entry);
    placed.push(entry);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  finishCluster();
  return placed;
}
