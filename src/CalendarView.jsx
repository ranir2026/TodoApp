import { useEffect, useMemo, useState } from "react";

const HOUR_HEIGHT = 44;

function toDateKey(d) {
  return d.toLocaleDateString("en-CA");
}

function startOfWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatHour(hour) {
  const d = new Date(2000, 0, 1, hour);
  return d.toLocaleTimeString(undefined, { hour: "numeric" });
}

function groupByDay(todos) {
  const map = {};
  for (const t of todos) {
    if (!t.dueDate) continue;
    const key = t.dueDate.slice(0, 10);
    (map[key] ??= []).push(t);
  }
  return map;
}

function chipClass(t) {
  if (t.completed) return "bg-slate-100 text-slate-400 line-through";
  return t.priority === "urgent" ? "bg-urgent-100 text-urgent-700" : "bg-todo-100 text-todo-700";
}

export default function CalendarView({ todos, courseMap, onToggle, onQuickAdd }) {
  const [mode, setMode] = useState("month");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const todosByDay = useMemo(() => groupByDay(todos), [todos]);

  function shift(delta) {
    setCursor((c) => {
      const d = new Date(c);
      if (mode === "month") d.setMonth(d.getMonth() + delta);
      else if (mode === "week") d.setDate(d.getDate() + delta * 7);
      else d.setDate(d.getDate() + delta);
      return d;
    });
  }

  const title =
    mode === "month"
      ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : mode === "week"
      ? (() => {
          const start = startOfWeek(cursor);
          const end = new Date(start);
          end.setDate(end.getDate() + 6);
          return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
        })()
      : cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Previous">
            ‹
          </button>
          <h2 className="min-w-[180px] text-sm font-semibold text-slate-800">{title}</h2>
          <button onClick={() => shift(1)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Next">
            ›
          </button>
          <button
            onClick={() => setCursor(new Date(new Date().setHours(0, 0, 0, 0)))}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:border-slate-300"
          >
            Today
          </button>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {["month", "week", "day"].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {mode === "month" && (
          <MonthGrid cursor={cursor} todosByDay={todosByDay} courseMap={courseMap} onToggle={onToggle} onQuickAdd={onQuickAdd} />
        )}
        {mode === "week" && <TimeGrid days={weekDays(cursor)} todosByDay={todosByDay} onToggle={onToggle} now={now} />}
        {mode === "day" && <TimeGrid days={[cursor]} todosByDay={todosByDay} onToggle={onToggle} now={now} />}
      </div>
    </div>
  );
}

function weekDays(cursor) {
  const start = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function MonthGrid({ cursor, todosByDay, courseMap, onToggle, onQuickAdd }) {
  const [addingKey, setAddingKey] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");

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
    <>
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
              className={`min-h-[68px] rounded-lg border p-1.5 text-left align-top ${
                isToday ? "border-todo-400 bg-todo-50/40" : "border-slate-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isToday ? "font-bold text-todo-700" : "text-slate-500"}`}>{date.getDate()}</span>
                <button onClick={() => setAddingKey(isAdding ? null : key)} className="rounded px-1 text-xs text-slate-300 hover:text-todo-600" aria-label="Quick add">
                  +
                </button>
              </div>

              <div className="mt-1 space-y-0.5">
                {dayTodos.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onToggle(t.id)}
                    className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] ${chipClass(t)}`}
                    title={courseMap[t.courseId]?.name ? `${t.title} (${courseMap[t.courseId].name})` : t.title}
                  >
                    {t.title}
                  </button>
                ))}
                {dayTodos.length > 3 && <p className="px-1 text-[10px] text-slate-400">+{dayTodos.length - 3} more</p>}
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
    </>
  );
}

function TimeGrid({ days, todosByDay, onToggle, now }) {
  const todayKey = toDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="h-full overflow-auto">
      <div className="flex" style={{ minWidth: days.length > 1 ? 640 : 320 }}>
        <div className="w-14 shrink-0 pt-6 text-right text-[10px] text-slate-400">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ height: HOUR_HEIGHT }} className="pr-2">
              {formatHour(h)}
            </div>
          ))}
        </div>

        {days.map((day) => {
          const key = toDateKey(day);
          const dayTodos = (todosByDay[key] || []).filter((t) => t.startTime);
          const allDayTodos = (todosByDay[key] || []).filter((t) => !t.startTime);
          const isToday = key === todayKey;

          return (
            <div key={key} className="flex-1 border-l border-slate-100">
              <div className="sticky top-0 z-10 h-6 border-b border-slate-100 bg-white text-center text-xs font-medium">
                <span className={isToday ? "font-bold text-todo-700" : "text-slate-500"}>
                  {day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                </span>
              </div>

              {allDayTodos.length > 0 && (
                <div className="space-y-0.5 border-b border-slate-100 p-1">
                  {allDayTodos.map((t) => (
                    <button key={t.id} onClick={() => onToggle(t.id)} className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] ${chipClass(t)}`}>
                      {t.title}
                    </button>
                  ))}
                </div>
              )}

              <div className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="border-b border-slate-50" style={{ height: HOUR_HEIGHT }} />
                ))}

                {dayTodos.map((t) => {
                  const start = timeToMinutes(t.startTime);
                  const end = t.endTime ? timeToMinutes(t.endTime) : start + 30;
                  const top = (start / 60) * HOUR_HEIGHT;
                  const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 18);
                  return (
                    <button
                      key={t.id}
                      onClick={() => onToggle(t.id)}
                      className={`absolute left-0.5 right-0.5 overflow-hidden rounded px-1 py-0.5 text-left text-[11px] shadow-sm ${chipClass(t)}`}
                      style={{ top, height }}
                      title={t.title}
                    >
                      {t.title}
                    </button>
                  );
                })}

                {isToday && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
                    style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                  >
                    <div className="h-1.5 w-1.5 -translate-x-0.5 rounded-full bg-danger-500" />
                    <div className="h-px flex-1 bg-danger-500" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
