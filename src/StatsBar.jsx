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
  const weekTodos = todos.filter((t) => new Date(t.createdAt) >= weekStart);
  const weekDone = weekTodos.filter((t) => t.completed);
  const completionPct = weekTodos.length
    ? Math.round((weekDone.length / weekTodos.length) * 100)
    : 0;

  const dueSoon = todos.filter((t) => {
    if (t.completed || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    const hoursUntil = (due - now) / 36e5;
    return hoursUntil >= 0 && hoursUntil <= 48;
  });

  const overdue = todos.filter((t) => {
    if (t.completed || !t.dueDate) return false;
    return new Date(t.dueDate) < now;
  });

  return (
    <div className="flex flex-wrap gap-3">
      <div className="min-w-[160px] rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-xs font-medium text-slate-500">Weekly completion</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{completionPct}%</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-todo-500 transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>

      <div className="min-w-[140px] rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-xs font-medium text-slate-500">Due soon</p>
        <p className="mt-1 text-2xl font-bold text-urgent-600">{dueSoon.length}</p>
        <p className="mt-2 text-xs text-slate-400">within 48 hours</p>
      </div>

      <div className="min-w-[140px] rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-xs font-medium text-slate-500">Overdue</p>
        <p className={`mt-1 text-2xl font-bold ${overdue.length ? "text-danger-600" : "text-slate-300"}`}>
          {overdue.length}
        </p>
        <p className="mt-2 text-xs text-slate-400">needs attention</p>
      </div>
    </div>
  );
}
