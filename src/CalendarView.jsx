import { useMemo, useState } from "react";

function toDateKey(d) {
  return d.toISOString().slice(0, 10);
}

export default function CalendarView({ todos, courseMap, onToggle, onQuickAdd }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [addingKey, setAddingKey] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");

  const todosByDay = useMemo(() => {
    const map = {};
    for (const t of todos) {
      if (!t.dueDate) continue;
      const key = t.dueDate.slice(0, 10);
      (map[key] ??= []).push(t);
    }
    return map;
  }, [todos]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list = [];
    for (let i = 0; i < startOffset; i++) list.push(null);
    for (let day = 1; day <= daysInMonth; day++) list.push(new Date(year, month, day));
    return list;
  }, [cursor]);

  const todayKey = toDateKey(new Date());

  function submitQuickAdd(key) {
    if (draftTitle.trim()) onQuickAdd(draftTitle.trim(), key);
    setDraftTitle("");
    setAddingKey(null);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Previous month"
        >
          ‹
        </button>
        <h2 className="text-sm font-semibold text-slate-800">
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <button
          onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const key = toDateKey(date);
          const dayTodos = todosByDay[key] || [];
          const isToday = key === todayKey;
          const isAdding = addingKey === key;

          return (
            <div
              key={key}
              className={`min-h-[88px] rounded-lg border p-1.5 text-left align-top ${
                isToday ? "border-todo-400 bg-todo-50/40" : "border-slate-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isToday ? "font-bold text-todo-700" : "text-slate-500"}`}>
                  {date.getDate()}
                </span>
                <button
                  onClick={() => setAddingKey(isAdding ? null : key)}
                  className="rounded px-1 text-xs text-slate-300 hover:text-todo-600"
                  aria-label="Quick add"
                >
                  +
                </button>
              </div>

              <div className="mt-1 space-y-0.5">
                {dayTodos.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onToggle(t.id)}
                    className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] ${
                      t.completed
                        ? "bg-slate-100 text-slate-400 line-through"
                        : t.priority === "urgent"
                        ? "bg-urgent-100 text-urgent-700"
                        : "bg-todo-100 text-todo-700"
                    }`}
                    title={courseMap[t.courseId]?.name ? `${t.title} (${courseMap[t.courseId].name})` : t.title}
                  >
                    {t.title}
                  </button>
                ))}
                {dayTodos.length > 3 && (
                  <p className="px-1 text-[10px] text-slate-400">+{dayTodos.length - 3} more</p>
                )}
              </div>

              {isAdding && (
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitQuickAdd(key);
                    if (e.key === "Escape") setAddingKey(null);
                  }}
                  onBlur={() => submitQuickAdd(key)}
                  placeholder="Task..."
                  className="mt-1 w-full rounded border border-todo-300 px-1 py-0.5 text-[11px] outline-none"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
