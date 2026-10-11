import { completionTimestamps, currentOccurrence, expandRange, getDueMoment, isOccurrenceCompleted, isOverdue, isRepeating, parseDateKey, resolveTask } from "./occurrences";

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day;
  date.setHours(0, 0, 0, 0);
  return new Date(date.setDate(diff));
}

export default function StatsBar({ todos }) {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const isInWeek = (timestamp) => {
    if (!timestamp) return false;
    const date = new Date(timestamp);
    return date >= weekStart && date < weekEnd;
  };
  const lastWeekDay = new Date(weekEnd);
  lastWeekDay.setDate(lastWeekDay.getDate() - 1);

  // This week's workload: everything finished this week, plus everything still open that is
  // due by the end of the week (including leftovers from earlier weeks), undated, or added this week.
  let weekTotal = 0;
  let weekDone = 0;
  for (const t of todos) {
    if ((t.type ?? "task") !== "task") continue;
    if (isRepeating(t)) {
      const weekKeys = Object.keys(expandRange([t], weekStart, lastWeekDay));
      const doneInWeek = weekKeys.filter((key) => isOccurrenceCompleted(t, key)).length;
      const doneLate = completionTimestamps(t).filter(isInWeek).length - doneInWeek;
      const current = currentOccurrence(t);
      const carriedOver = current && parseDateKey(current) < weekStart ? 1 : 0;
      weekTotal += weekKeys.length + Math.max(doneLate, 0) + carriedOver;
      weekDone += doneInWeek + Math.max(doneLate, 0);
    } else if (t.completed) {
      if (isInWeek(t.completedAt)) {
        weekTotal += 1;
        weekDone += 1;
      }
    } else if (!t.dueDate || parseDateKey(t.dueDate) < weekEnd || isInWeek(t.createdAt)) {
      weekTotal += 1;
    }
  }
  const completionPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

  const tasks = todos.map(resolveTask);
  const dueSoon = tasks.filter((t) => {
    if (t.completed || t.type === "event" || !t.dueDate) return false;
    const due = getDueMoment(t);
    const hoursUntil = (due - now) / 36e5;
    return hoursUntil >= 0 && hoursUntil <= 48;
  });

  const overdue = tasks.filter((t) => isOverdue(t, now));

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700">Week</p>
          <p className="text-sm font-bold text-slate-900">{completionPct}%</p>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-todo-500 transition-all duration-500" style={{ width: `${completionPct}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">Due soon</p>
        <p className="text-sm font-bold text-urgent-600">{dueSoon.length}</p>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">Overdue</p>
        <p className={`text-sm font-bold ${overdue.length ? "text-danger-600" : "text-slate-300"}`}>{overdue.length}</p>
      </div>
    </div>
  );
}
