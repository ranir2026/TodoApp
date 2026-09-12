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
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500">Week</p>
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
