// Planner data lives outside the todo list: day plans are only shown in the planner modal, and
// projects hold the timeline-only pieces (span, phases). Milestones and project tasks are todos.
import { getCourseColor } from "./courseColors";
import { expandRange, isOccurrenceCompleted, parseDateKey } from "./occurrences";

export const EMPTY_PLANNER = { days: {}, projects: [] };
export const EMPTY_DAY = { blocks: [], inbox: [] };

export function normalizePlanner(planner) {
  return {
    days: planner?.days && typeof planner.days === "object" ? planner.days : {},
    projects: Array.isArray(planner?.projects) ? planner.projects : [],
  };
}

// A project's own color, falling back to its category's
export function projectColor(project, courseMap) {
  return project?.color || getCourseColor(courseMap[project?.courseId]);
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

// A day's scheduled blocks. Blocks pointing at real tasks follow the task: its current title and
// completion, and they disappear if the task is deleted.
export function resolveDayBlocks(day, todoById, courseMap) {
  return day.blocks
    .filter((block) => !block.todoId || todoById.has(block.todoId))
    .map((block) => {
      const todo = block.todoId ? todoById.get(block.todoId) : null;
      return {
        ...block,
        todo,
        title: todo ? todo.title : block.title,
        done: todo ? isOccurrenceCompleted(todo, block.occurrenceDate ?? todo.dueDate) : Boolean(block.done),
        course: todo ? courseMap[todo.courseId] : null,
        startMinutes: timeToMinutes(block.start),
        endMinutes: timeToMinutes(block.end),
      };
    });
}

// Things already pinned to a time that day (events, timed tasks) that aren't on the schedule,
// and the all-day events
export function fixedItemsOn(todos, dateKey, scheduledIds) {
  const items = (expandRange(todos, parseDateKey(dateKey), parseDateKey(dateKey))[dateKey] ?? [])
    .filter((item) => item.type !== "milestone" && !scheduledIds.has(item.id));
  const timed = items
    .filter((item) => item.startTime)
    .map((item) => {
      const startMinutes = timeToMinutes(item.startTime);
      const endMinutes = item.endTime ? Math.max(timeToMinutes(item.endTime), startMinutes + 15) : startMinutes + 30;
      return { ...item, startMinutes, endMinutes };
    });
  return { timed, allDay: items.filter((item) => !item.startTime && item.type === "event") };
}

// Fade the list only at an edge where more content is hidden behind it
export function edgeMask({ top, bottom }) {
  if (!top && !bottom) return undefined;
  return `linear-gradient(to bottom, ${top ? "transparent 0, black 16px" : "black 0"}, ${bottom ? "black calc(100% - 16px), transparent 100%" : "black 100%"})`;
}

// ── Typed entries for today: "Gym 4-5pm", "Study 9:30-11", "Call 14:00-14:30" ──────────────
// A name, then a start and end time joined by a dash. Hours typed without am/pm are read the way
// people say them during the day (7–11 morning, 12–6 afternoon), and an end time is pushed past
// the start when that's the only reading that makes sense ("11-1" is 11am to 1pm).
const ENTRY_TIME = String.raw`(\d{1,2})(?::([0-5]\d))?\s*([ap])?\.?(?:m\.?)?`;
const ENTRY_RANGE = new RegExp(String.raw`(?:^|\s)${ENTRY_TIME}\s*[-–—]\s*${ENTRY_TIME}\s*$`, "i");
const ENTRY_PARTIAL = new RegExp(String.raw`(?:^|\s)${ENTRY_TIME}\s*[-–—]?\s*$`, "i");

function entryClock(hours, minutes, meridiem) {
  if (meridiem) return hours >= 1 && hours <= 12 ? ((hours % 12) + (meridiem === "p" ? 12 : 0)) * 60 + minutes : null;
  return hours <= 23 ? hours * 60 + minutes : null;
}

export function parseTodayEntry(text) {
  const trimmed = text.trim();
  if (!trimmed) return { status: "empty" };
  const match = trimmed.match(ENTRY_RANGE);
  if (!match) return { status: ENTRY_PARTIAL.test(trimmed) ? "needs-end" : "needs-time", title: trimmed };

  const title = trimmed.slice(0, match.index).trim();
  const part = (hours, minutes, meridiem) => ({
    hours: Number(hours),
    minutes: Number(minutes ?? 0),
    meridiem: meridiem?.toLowerCase(),
    // "0", "09" or "14" can only be a 24-hour clock
    clock24: !meridiem && (Number(hours) === 0 || Number(hours) > 12 || hours.startsWith("0")),
  });
  const from = part(match[1], match[2], match[3]);
  const to = part(match[4], match[5], match[6]);
  const at = (time, meridiem) => entryClock(time.hours, time.minutes, time.clock24 ? undefined : meridiem);
  const flip = (meridiem) => (meridiem === "a" ? "p" : "a");

  let start;
  let end;
  if (from.meridiem && to.meridiem) {
    start = at(from, from.meridiem);
    end = at(to, to.meridiem);
  } else if (to.meridiem) {
    end = at(to, to.meridiem);
    start = at(from, to.meridiem);
    if (start !== null && end !== null && start >= end && !from.clock24) start = at(from, flip(to.meridiem));
  } else {
    start = from.meridiem ? at(from, from.meridiem) : at(from, from.hours >= 7 && from.hours <= 11 ? "a" : "p");
    const half = start !== null && start >= 12 * 60 ? "p" : "a";
    end = at(to, half);
    if (start !== null && end !== null && end <= start && !to.clock24) end = at(to, flip(half));
  }
  if (start === null || end === null) return { status: "invalid-time", title };
  // Running up to midnight: "11pm-12am"
  if (end === 0 && start > 0) end = 24 * 60;
  if (end <= start) return { status: "backwards", title, start, end };
  if (!title) return { status: "needs-title", start, end };
  return { status: "ok", title, start, end };
}
