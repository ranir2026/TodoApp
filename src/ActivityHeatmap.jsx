const WEEKS = 16;

function toDateKey(d) {
  return d.toLocaleDateString("en-CA");
}

function levelClass(count) {
  if (count <= 0) return "bg-slate-100";
  if (count === 1) return "bg-todo-200";
  if (count === 2) return "bg-todo-400";
  if (count === 3) return "bg-todo-600";
  return "bg-todo-700";
}

export default function ActivityHeatmap({ todos }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const countsByDay = {};
  for (const t of todos) {
    if (!t.completed || !t.completedAt) continue;
    const key = toDateKey(new Date(t.completedAt));
    countsByDay[key] = (countsByDay[key] || 0) + 1;
  }

  const totalDays = WEEKS * 7;
  const start = new Date(today);
  start.setDate(start.getDate() - (totalDays - 1) - today.getDay());

  const weeks = [];
  const cursor = new Date(start);
  for (let w = 0; w < WEEKS + 1; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(days);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs font-medium text-slate-500">Activity</p>
      <div className="flex gap-0.5 overflow-x-auto">
        {weeks.map((days, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {days.map((date, di) => {
              const key = toDateKey(date);
              const isFuture = date > today;
              const count = countsByDay[key] || 0;
              return (
                <div
                  key={di}
                  title={`${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${count} completed`}
                  className={`h-2.5 w-2.5 rounded-sm ${isFuture ? "bg-transparent" : levelClass(count)}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-slate-400">
        <span>Less</span>
        <div className="h-2 w-2 rounded-sm bg-slate-100" />
        <div className="h-2 w-2 rounded-sm bg-todo-200" />
        <div className="h-2 w-2 rounded-sm bg-todo-400" />
        <div className="h-2 w-2 rounded-sm bg-todo-600" />
        <span>More</span>
      </div>
    </div>
  );
}
