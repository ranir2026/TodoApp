import { expandRange, isDueSoon, isOccurrenceCompleted, isOverdue, isRepeating, parseDateKey, resolveTask } from "./occurrences";

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day;
  date.setHours(0, 0, 0, 0);
  return new Date(date.setDate(diff));
}

// With onShowDue, "Due soon" and "Overdue" open the list filtered to those tasks (and close it again);
// dueFilter says which one is showing
export default function StatsBar({ todos, dueFilter = null, onShowDue }) {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const lastWeekDay = new Date(weekEnd);
  lastWeekDay.setDate(lastWeekDay.getDate() - 1);

  // Only what is due this week counts: each task due in this week, and each repeat that falls in it,
  // is one item, done when it has been completed.
  let weekTotal = 0;
  let weekDone = 0;
  for (const t of todos) {
    if ((t.type ?? "task") !== "task") continue;
    if (isRepeating(t)) {
      const weekKeys = Object.keys(expandRange([t], weekStart, lastWeekDay));
      weekTotal += weekKeys.length;
      weekDone += weekKeys.filter((key) => isOccurrenceCompleted(t, key)).length;
    } else if (t.dueDate) {
      const due = parseDateKey(t.dueDate);
      if (due >= weekStart && due < weekEnd) {
        weekTotal += 1;
        if (t.completed) weekDone += 1;
      }
    }
  }
  const completionPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

  const tasks = todos.map(resolveTask);
  const dueSoon = tasks.filter((t) => isDueSoon(t, now));

  const overdue = tasks.filter((t) => isOverdue(t, now));

  return (
    <div className="space-y-1 rounded-card border border-slate-200 bg-white p-3 shadow-sm">
      <div className="pb-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700">This week</p>
          <p className="text-xs font-medium text-slate-500 tabular-nums">{weekTotal ? `${weekDone} of ${weekTotal} done` : "Nothing due this week"}</p>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-full origin-left rounded-full bg-todo-500 transition-transform duration-300 ease-out motion-reduce:transition-none" style={{ transform: `scaleX(${completionPct / 100})` }} />
        </div>
      </div>
      <StatRow label="Due soon" count={dueSoon.length} tone="text-urgent-600" zeroTone="text-urgent-600" active={dueFilter === "soon"} onClick={onShowDue && (() => onShowDue("soon"))} />
      <StatRow label="Overdue" count={overdue.length} tone="text-danger-600" active={dueFilter === "overdue"} onClick={onShowDue && (() => onShowDue("overdue"))} />
    </div>
  );
}

function StatRow({ label, count, tone, zeroTone = "text-slate-300", active, onClick }) {
  const content = (
    <>
      <span className={`text-xs font-medium ${active ? "text-slate-800" : "text-slate-500"}`}>{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${count ? tone : zeroTone}`}>{count}</span>
    </>
  );
  const layout = "-mx-1.5 flex w-[calc(100%+0.75rem)] items-center justify-between rounded-lg px-1.5 py-0.5";
  if (!onClick) return <div className={layout}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? "Show all tasks again" : `Show only tasks that are ${label.toLowerCase()}`}
      className={`press-tint ${layout} text-left transition-colors ${active ? "bg-slate-100" : "hover:bg-slate-50"}`}
    >
      {content}
    </button>
  );
}
