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
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium whitespace-nowrap text-slate-500">Week</p>
        <p className="text-base font-bold text-slate-900">{completionPct}%</p>
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-todo-500 transition-all duration-500" style={{ width: `${completionPct}%` }} />
        </div>
      </div>
      <div className="h-6 w-px bg-slate-100" />
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium whitespace-nowrap text-slate-500">Due soon</p>
        <p className="text-base font-bold text-urgent-600">{dueSoon.length}</p>
      </div>
      <div className="h-6 w-px bg-slate-100" />
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium whitespace-nowrap text-slate-500">Overdue</p>
        <p className={`text-base font-bold ${overdue.length ? "text-danger-600" : "text-slate-300"}`}>{overdue.length}</p>
      </div>
    </div>
  );
}
