export const REPEAT_OPTIONS = [
  { value: "none", label: "Doesn't repeat" },
  { value: "daily", label: "Repeats daily" },
  { value: "weekly", label: "Repeats weekly" },
  { value: "monthly", label: "Repeats monthly" },
];

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function toDateKey(d) {
  return d.toLocaleDateString("en-CA");
}

// Parses a "YYYY-MM-DD" string as a local date (avoids the day-shift that
// `new Date("YYYY-MM-DD")` causes by parsing it as UTC).
export function parseDateKey(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Exact deadline for a task: its start time on the due date, or end of that day if untimed.
export function getDueMoment(todo) {
  const due = parseDateKey(todo.dueDate);
  if (todo.startTime) {
    const [hours, minutes] = todo.startTime.split(":").map(Number);
    due.setHours(hours, minutes, 0, 0);
  } else {
    due.setHours(23, 59, 59, 999);
  }
  return due;
}

export function isOverdue(todo, now = new Date()) {
  if (todo.completed || todo.type === "event" || !todo.dueDate) return false;
  return getDueMoment(todo) < now;
}

function matchesRepeat(item, due, cursor) {
  if (item.skipDates?.includes(toDateKey(cursor))) return false;
  if (item.repeat !== "none") {
    if (cursor < due) return false;
    if (item.repeatUntil && cursor > parseDateKey(item.repeatUntil)) return false;

    const dayDifference = Math.floor((cursor - due) / 86400000);
    const monthDifference = (cursor.getFullYear() - due.getFullYear()) * 12 + cursor.getMonth() - due.getMonth();
    const occurrenceIndex = item.repeat === "daily" ? dayDifference : item.repeat === "weekly" ? Math.floor(dayDifference / 7) : monthDifference;
    if (item.repeatCount && occurrenceIndex >= Number(item.repeatCount)) return false;

    if (item.repeat === "daily") return true;
    if (item.repeat === "weekly") {
      const repeatDays = item.repeatDays?.length ? item.repeatDays : [DOW[cursor.getDay()]];
      return repeatDays.includes(DOW[cursor.getDay()]);
    }
    return cursor.getDate() === due.getDate();
  }

  if (item.type === "event" && item.endDate) {
    const end = parseDateKey(item.endDate);
    return cursor >= due && cursor <= end;
  }
  return toDateKey(cursor) === toDateKey(due);
}

// Expands items (tasks/events) into per-day occurrences within [startDate, endDate] (inclusive),
// accounting for recurrence. Returns a map of dateKey -> items (with an `occurrenceDate` field).
export function expandRange(items, startDate, endDate) {
  const map = {};
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const key = toDateKey(cursor);
    for (const item of items) {
      if (!item.dueDate) continue;
      const due = parseDateKey(item.dueDate);
      if (matchesRepeat(item, due, cursor)) {
        const occurrence = { ...item, occurrenceDate: key };
        if (isRepeating(item)) occurrence.completed = isOccurrenceCompleted(item, key);
        (map[key] ??= []).push(occurrence);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return map;
}

const MAX_LOOKAHEAD_DAYS = 3 * 366;

export function isRepeating(item) {
  return Boolean(item.dueDate) && (item.repeat ?? "none") !== "none";
}

// Map of occurrence dateKey -> ISO completion timestamp for a repeating item.
function completionMap(item) {
  if (item.completions) return item.completions;
  // Legacy: before per-occurrence tracking, checking off a repeating task marked the whole
  // series completed. Treat that as having completed only the first occurrence.
  return item.completed ? { [item.dueDate]: item.completedAt ?? null } : {};
}

export function isOccurrenceCompleted(item, dateKey) {
  return isRepeating(item) ? dateKey in completionMap(item) : Boolean(item.completed);
}

// ISO timestamps of every completion of this item (one per checked-off occurrence for repeating tasks).
export function completionTimestamps(item) {
  if (isRepeating(item)) return Object.values(completionMap(item)).filter(Boolean);
  return item.completed && item.completedAt ? [item.completedAt] : [];
}

// First occurrence after the most recently completed one, or null once the series has ended.
export function currentOccurrence(item) {
  const due = parseDateKey(item.dueDate);
  const lastDone = Object.keys(completionMap(item)).sort().at(-1);
  const cursor = lastDone ? parseDateKey(lastDone) : new Date(due);
  if (lastDone) cursor.setDate(cursor.getDate() + 1);
  const until = item.repeatUntil ? parseDateKey(item.repeatUntil) : null;
  for (let i = 0; i < MAX_LOOKAHEAD_DAYS; i++) {
    if (until && cursor > until) return null;
    if (matchesRepeat(item, due, cursor)) return toDateKey(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

// A repeating task is presented as its current occurrence; it only reads as completed once
// every occurrence is done.
export function resolveTask(item) {
  if (!isRepeating(item)) return item;
  const next = currentOccurrence(item);
  return next
    ? { ...item, dueDate: next, occurrenceDate: next, completed: false, completedAt: null }
    : { ...item, completed: true };
}

// Toggles one occurrence of a repeating item (the current one when no date is given).
export function toggleOccurrence(item, dateKey, now = new Date()) {
  const completions = { ...completionMap(item) };
  const key = dateKey ?? currentOccurrence(item);
  if (key && !(key in completions)) completions[key] = now.toISOString();
  else delete completions[key ?? Object.keys(completions).sort().at(-1)];
  return { ...item, completions, completed: false, completedAt: null };
}
