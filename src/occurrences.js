export const REPEAT_OPTIONS = [
  { value: "none", label: "Doesn't repeat" },
  { value: "daily", label: "Repeats daily" },
  { value: "weekly", label: "Repeats weekly" },
  { value: "monthly", label: "Repeats monthly" },
];

function toDateKey(d) {
  return d.toLocaleDateString("en-CA");
}

// Parses a "YYYY-MM-DD" string as a local date (avoids the day-shift that
// `new Date("YYYY-MM-DD")` causes by parsing it as UTC).
export function parseDateKey(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function matchesRepeat(item, due, cursor) {
  if (item.endDate) {
    const end = parseDateKey(item.endDate);
    return cursor >= due && cursor <= end;
  }
  switch (item.repeat) {
    case "daily":
      return cursor >= due;
    case "weekly":
      return cursor >= due && cursor.getDay() === due.getDay();
    case "monthly":
      return cursor >= due && cursor.getDate() === due.getDate();
    default:
      return toDateKey(cursor) === toDateKey(due);
  }
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
