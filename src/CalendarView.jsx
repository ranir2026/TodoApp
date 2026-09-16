import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { expandRange, parseDateKey } from "./occurrences";
import { courseChipStyle } from "./courseColors";

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

function chipClass(t) {
  if (t.completed) return "bg-slate-100 text-slate-400 line-through";
  return "";
}

function weekDays(cursor) {
  const start = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function monthCells(cursor) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const list = [];
  for (let i = 0; i < startOffset; i++) list.push(null);
  for (let day = 1; day <= daysInMonth; day++) list.push(new Date(year, month, day));
  while (list.length % 7 !== 0) list.push(null);
  return list;
}

function isMultiDayEvent(item) {
  return item.type === "event" && item.dueDate && item.endDate && item.endDate !== item.dueDate;
}

function dateValue(date) {
  return date.getTime();
}

function getMultiDaySegments(items, dates) {
  const rangeStart = dates[0];
  const rangeEnd = dates[dates.length - 1];
  return items
    .filter(isMultiDayEvent)
    .map((item) => {
      const start = parseDateKey(item.dueDate);
      const end = parseDateKey(item.endDate);
      const visibleStart = dateValue(start) > dateValue(rangeStart) ? start : rangeStart;
      const visibleEnd = dateValue(end) < dateValue(rangeEnd) ? end : rangeEnd;
      if (dateValue(visibleStart) > dateValue(visibleEnd)) return null;
      return { item, start: visibleStart, end: visibleEnd };
    })
    .filter(Boolean);
}

const CalendarView = forwardRef(function CalendarView({ todos, courseMap, mode, compact = false, onModeChange, onEdit, onQuickAdd, onSelectDate }, ref) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [now, setNow] = useState(new Date());
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  useImperativeHandle(ref, () => ({
    shift(delta) {
      setCursor((current) => {
        const next = new Date(current);
        if (mode === "month") next.setMonth(next.getMonth() + delta);
        else if (mode === "week") next.setDate(next.getDate() + delta * 7);
        else next.setDate(next.getDate() + delta);
        return next;
      });
    },
  }), [mode]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const cells = useMemo(() => monthCells(cursor), [cursor]);
  const days = mode === "week" ? weekDays(cursor) : mode === "day" ? [cursor] : null;

  const rangeStart = mode === "month" ? cells.find(Boolean) : days[0];
  const rangeEnd = mode === "month" ? [...cells].reverse().find(Boolean) : days[days.length - 1];

  const occByDay = useMemo(() => expandRange(todos, rangeStart, rangeEnd), [todos, rangeStart, rangeEnd]);

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

  function handleTouchStart(event) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchStartY.current = event.touches[0]?.clientY ?? null;
  }

  function handleTouchEnd(event) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const delta = event.changedTouches[0]?.clientX - touchStartX.current;
    const verticalDelta = event.changedTouches[0]?.clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(delta) >= 96 && Math.abs(delta) > Math.abs(verticalDelta) * 1.35) {
      setCursor((current) => {
        const next = new Date(current);
        if (mode === "month") next.setMonth(next.getMonth() + (delta < 0 ? 1 : -1));
        else if (mode === "week") next.setDate(next.getDate() + (delta < 0 ? 7 : -7));
        else next.setDate(next.getDate() + (delta < 0 ? 1 : -1));
        return next;
      });
    }
  }

  return (
    <div className="mobile-calendar-shell flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => ref.current?.shift(-1)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Previous">
            ‹
          </button>
          <h2 className="min-w-[180px] text-sm font-semibold text-slate-800">{title}</h2>
          <button onClick={() => ref.current?.shift(1)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Next">
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
              onClick={() => onModeChange(m)}
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
          <MonthGrid cells={cells} todos={todos} occByDay={occByDay} courseMap={courseMap} onEdit={onEdit} onQuickAdd={onQuickAdd} onSelectDate={(key) => { setCursor(parseDateKey(key)); onSelectDate?.(key); }} />
        )}
        {mode !== "month" && <TimeGrid days={days} todos={todos} courseMap={courseMap} occByDay={occByDay} onEdit={onEdit} now={now} compact={compact} />}
      </div>
    </div>
  );
});

export default CalendarView;

function MonthGrid({ cells, todos, occByDay, courseMap, onEdit, onQuickAdd, onSelectDate }) {
  const [addingKey, setAddingKey] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const rows = cells.length / 7;
  const todayKey = toDateKey(new Date());

  function submitQuickAdd(key) {
    if (draftTitle.trim()) onQuickAdd(draftTitle.trim(), key);
    setDraftTitle("");
    setAddingKey(null);
  }

  return (
    <div className="mobile-month-grid flex h-full flex-col">
      <div className="grid shrink-0 grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      <div className="mt-1 flex min-h-0 flex-1 flex-col gap-1">
        {Array.from({ length: rows }, (_, row) => {
          const week = cells.slice(row * 7, row * 7 + 7);
          const weekDates = week.filter(Boolean);
          const segments = getMultiDaySegments(todos, [
            weekDates[0] ?? new Date(),
            weekDates[weekDates.length - 1] ?? new Date(),
          ]);
          return (
            <div key={row} className="mobile-month-row relative min-h-0 flex-1 overflow-hidden">
              <div className="grid grid-cols-7 gap-1">
        {week.map((date, dayIndex) => {
          const i = row * 7 + dayIndex;
          if (!date) return <div key={i} />;
          const key = toDateKey(date);
          const dayItems = (occByDay[key] || []).filter((item) => !isMultiDayEvent(item));
          const visibleItems = dayItems.slice(0, 4);
          const hiddenItemCount = dayItems.length - visibleItems.length;
          const isToday = key === todayKey;
          const isAdding = addingKey === key;

          return (
            <div
              key={key}
              onClick={() => onSelectDate?.(key)}
              className={`mobile-month-day relative flex min-h-0 flex-col overflow-hidden rounded-lg border p-1.5 pb-6 text-left align-top ${
                isToday ? "border-todo-400 bg-todo-50/40" : "border-slate-100"
              }`}
            >
              <button onClick={() => setAddingKey(isAdding ? null : key)} className="absolute right-1.5 top-1 rounded px-1 text-xs text-slate-300 hover:text-todo-600" aria-label="Quick add">
                +
              </button>
              <span className={`absolute bottom-1 right-1.5 text-xs ${isToday ? "font-bold text-todo-700" : "text-slate-500"}`}>{date.getDate()}</span>

              <div
                className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto"
                style={segments.length ? { paddingTop: 24 + segments.length * 20 } : undefined}
              >
                {visibleItems.map((t) => (
                  <button
                    key={t.id}
                    onClick={(event) => { event.stopPropagation(); onEdit(t); }}
                    className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] ${chipClass(t)}`}
                    style={courseChipStyle(courseMap[t.courseId], t.completed)}
                    title={courseMap[t.courseId]?.name ? `${t.title} (${courseMap[t.courseId].name})` : t.title}
                  >
                    {t.title}
                  </button>
                ))}
                {hiddenItemCount > 0 && <p className="px-1 text-[10px] text-slate-400">+{hiddenItemCount} more</p>}
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
                  className="mt-1 w-full shrink-0 rounded border border-todo-300 px-1 py-0.5 text-[11px] outline-none"
                />
              )}
            </div>
          );
        })}
              </div>
              <div className="pointer-events-none absolute inset-0 grid grid-cols-7 gap-1">
                {segments.map(({ item, start, end }, segmentIndex) => {
                  const startIndex = week.findIndex((date) => date && toDateKey(date) === toDateKey(start));
                  const endIndex = week.findIndex((date) => date && toDateKey(date) === toDateKey(end));
                  return (
                    <button
                      key={`${item.id}-${toDateKey(start)}`}
                      onClick={() => onEdit(item)}
                      className={`pointer-events-auto z-10 mx-0.5 h-5 min-w-0 self-start overflow-hidden truncate rounded px-1 text-left text-[11px] shadow-sm ${chipClass(item)}`}
                      style={{ ...courseChipStyle(courseMap[item.courseId], item.completed), gridColumn: `${startIndex + 1} / ${endIndex + 2}`, transform: `translateY(${24 + segmentIndex * 20}px)` }}
                      title={item.title}
                    >
                      {item.title}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({ days, todos, courseMap, occByDay, onEdit, now, compact }) {
  const hourHeight = compact ? 20 : HOUR_HEIGHT;
  const todayKey = toDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const scrollAnchorRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (scrollAnchorRef.current && containerRef.current) {
      scrollAnchorRef.current.scrollIntoView({ block: "center" });
    } else if (containerRef.current) {
      containerRef.current.scrollTop = Math.max(0, (9 / 24) * containerRef.current.scrollHeight - 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]?.toDateString()]);

  return (
    <div ref={containerRef} className="h-full overflow-auto">
      <div className="flex" style={{ minWidth: compact ? 0 : days.length > 1 ? 640 : 320 }}>
        <div className="w-14 shrink-0 pt-6 text-right text-[10px] text-slate-400">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ height: hourHeight }} className="pr-2">
              {formatHour(h)}
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-10 grid h-6 grid-cols-7 border-b border-slate-100 bg-white text-center text-xs font-medium">
            {days.map((day) => (
              <span key={toDateKey(day)} className="min-w-0 truncate text-slate-500">
                {day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              </span>
            ))}
          </div>
          <div className="relative border-b border-slate-100" style={{ minHeight: 28 }}>
            <div className="grid grid-cols-7 gap-0.5 p-1">
              {getMultiDaySegments(todos, days).map(({ item, start, end }) => {
                const startIndex = days.findIndex((day) => toDateKey(day) === toDateKey(start));
                const endIndex = days.findIndex((day) => toDateKey(day) === toDateKey(end));
                return (
                  <button
                    key={`${item.id}-${toDateKey(start)}`}
                    onClick={() => onEdit(item)}
                    className={`z-10 truncate rounded px-1 py-0.5 text-left text-[11px] shadow-sm ${chipClass(item)}`}
                    style={{ ...courseChipStyle(courseMap[item.courseId], item.completed), gridColumn: `${startIndex + 1} / ${endIndex + 2}` }}
                    title={item.title}
                  >
                    {item.title}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex">
        {days.map((day) => {
          const key = toDateKey(day);
          const dayItems = (occByDay[key] || []).filter((t) => t.startTime && !isMultiDayEvent(t));
          const allDayItems = (occByDay[key] || []).filter((t) => !t.startTime && !isMultiDayEvent(t));
          const isToday = key === todayKey;

          return (
            <div key={key} className="min-w-0 flex-1 border-l border-slate-100">
              {allDayItems.length > 0 && (
                <div className="sticky top-6 z-10 space-y-0.5 border-b border-slate-100 bg-white p-1">
                  {allDayItems.map((t) => (
                    <button key={t.id} onClick={() => onEdit(t)} className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] ${chipClass(t)}`} style={courseChipStyle(courseMap[t.courseId], t.completed)}>
                      {t.title}
                    </button>
                  ))}
                </div>
              )}

              <div className="relative" style={{ height: hourHeight * 24 }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="border-b border-slate-50" style={{ height: hourHeight }} />
                ))}

                {dayItems.map((t) => {
                  const start = timeToMinutes(t.startTime);
                  const end = t.endTime ? timeToMinutes(t.endTime) : start + 30;
                  const top = (start / 60) * hourHeight;
                  const height = Math.max(((end - start) / 60) * hourHeight, 18);
                  return (
                    <button
                      key={t.id}
                      onClick={() => onEdit(t)}
                      className={`absolute left-0.5 right-0.5 overflow-hidden rounded px-1 py-0.5 text-left text-[11px] shadow-sm ${chipClass(t)}`}
                      style={{ ...courseChipStyle(courseMap[t.courseId], t.completed), top, height }}
                      title={t.title}
                    >
                      {t.title}
                    </button>
                  );
                })}

                {isToday && (
                  <div
                    ref={scrollAnchorRef}
                    className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
                    style={{ top: (nowMinutes / 60) * hourHeight }}
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
      </div>
    </div>
  );
}
