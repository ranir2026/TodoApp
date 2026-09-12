function toDateKey(d) {
  return d.toLocaleDateString("en-CA");
}

// Expands items (tasks/events) into per-day occurrences within [startDate, endDate] (inclusive),
// accounting for weekly recurrence. Returns a map of dateKey -> items (with an `occurrenceDate` field).
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
      const due = new Date(item.dueDate);
      if (item.repeatWeekly) {
        if (cursor >= due && cursor.getDay() === due.getDay()) {
          (map[key] ??= []).push({ ...item, occurrenceDate: key });
        }
      } else if (toDateKey(due) === key) {
        (map[key] ??= []).push({ ...item, occurrenceDate: key });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return map;
}
