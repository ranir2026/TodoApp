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
        (map[key] ??= []).push({ ...item, occurrenceDate: key });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return map;
}
