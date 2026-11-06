import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { expandRange, isOccurrenceCompleted, parseDateKey, resolveTask } from "./occurrences";
import { courseChipStyle, getCourseColor } from "./courseColors";
import { EMPTY_DAY, addDays, formatClock, layoutColumns, minutesToTime, timeToMinutes, toDateKey } from "./planner";

const HOUR_HEIGHT = 52;
const SNAP = 15;
const DEFAULT_LENGTH = 60;
const DAY_MINUTES = 24 * 60;
const DRAG_THRESHOLD = 4;

const snap = (minutes) => Math.round(minutes / SNAP) * SNAP;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function isInside(element, x, y) {
  const rect = element?.getBoundingClientRect();
  return Boolean(rect) && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function dayLabel(dateKey, todayKey) {
  const offset = Math.round((parseDateKey(dateKey) - parseDateKey(todayKey)) / 86400000);
  const date = parseDateKey(dateKey).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  if (offset === 0) return { title: "Today", date };
  if (offset === 1) return { title: "Tomorrow", date };
  if (offset === -1) return { title: "Yesterday", date };
  return { title: date, date: null };
}

function shortDue(dueDate) {
  return parseDateKey(dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DayPlanner({ todos, courseMap, planner, updatePlanner, onToggleTodo, onEdit }) {
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));
  const [dateKey, setDateKey] = useState(todayKey);
  const [nowMinutes, setNowMinutes] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  const [drag, setDrag] = useState(null);
  const [draftItem, setDraftItem] = useState("");
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const gridRef = useRef(null);
  const trayRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
      setTodayKey(toDateKey(now));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // Open each day scrolled to where the work is: an hour before now on today, otherwise the morning
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    const anchor = dateKey === todayKey ? Math.max(nowMinutes - 60, 0) : 8 * 60;
    scrollRef.current.scrollTop = (anchor / 60) * HOUR_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  const todoById = useMemo(() => new Map(todos.map((todo) => [todo.id, todo])), [todos]);
  const day = { ...EMPTY_DAY, ...planner.days[dateKey] };

  // Blocks pointing at real tasks follow the task: its current title and completion, and they
  // disappear if the task is deleted
  const blocks = day.blocks
    .filter((block) => !block.todoId || todoById.has(block.todoId))
    .map((block) => {
      const todo = block.todoId ? todoById.get(block.todoId) : null;
      return {
        ...block,
        todo,
        title: todo ? todo.title : block.title,
        done: todo ? isOccurrenceCompleted(todo, block.occurrenceDate ?? todo.dueDate) : Boolean(block.done),
        course: todo ? courseMap[todo.courseId] : null,
        startMinutes: timeToMinutes(block.start),
        endMinutes: timeToMinutes(block.end),
      };
    });
  const scheduledIds = new Set(blocks.map((block) => block.todoId).filter(Boolean));

  const openTasks = todos
    .filter((todo) => (todo.type ?? "task") === "task")
    .map(resolveTask)
    .filter((todo) => !todo.completed && !scheduledIds.has(todo.id));
  const tray = {
    overdue: openTasks.filter((todo) => todo.dueDate && todo.dueDate < dateKey).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    dueToday: openTasks.filter((todo) => todo.dueDate === dateKey && !todo.startTime),
    undated: openTasks.filter((todo) => !todo.dueDate),
  };

  // Things already pinned to a time that day (events, timed tasks): shown so you can plan around them
  const fixedItems = (expandRange(todos, parseDateKey(dateKey), parseDateKey(dateKey))[dateKey] ?? [])
    .filter((item) => item.type !== "milestone" && !scheduledIds.has(item.id));
  const timedItems = fixedItems
    .filter((item) => item.startTime)
    .map((item) => {
      const startMinutes = timeToMinutes(item.startTime);
      const endMinutes = item.endTime ? Math.max(timeToMinutes(item.endTime), startMinutes + SNAP) : startMinutes + 30;
      return { ...item, startMinutes, endMinutes };
    });
  const allDayItems = fixedItems.filter((item) => !item.startTime && item.type === "event");

  function updateDay(change) {
    updatePlanner((current) => ({
      ...current,
      days: { ...current.days, [dateKey]: change({ ...EMPTY_DAY, ...current.days[dateKey] }) },
    }));
  }

  function addBlock(source, start, end) {
    const block = {
      id: crypto.randomUUID(),
      todoId: source.todoId ?? null,
      occurrenceDate: source.occurrenceDate ?? null,
      title: source.todoId ? null : source.title,
      start: minutesToTime(start),
      end: minutesToTime(end),
      done: Boolean(source.done),
    };
    updateDay((current) => ({
      ...current,
      blocks: [...current.blocks, block],
      inbox: source.inboxId ? current.inbox.filter((item) => item.id !== source.inboxId) : current.inbox,
    }));
  }

  function moveBlock(id, start, end) {
    updateDay((current) => ({
      ...current,
      blocks: current.blocks.map((block) => (block.id === id ? { ...block, start: minutesToTime(start), end: minutesToTime(end) } : block)),
    }));
  }

  // Taking a block off the schedule returns a planner-only item to the tray; a real task reappears there on its own
  function unschedule(block) {
    updateDay((current) => ({
      ...current,
      blocks: current.blocks.filter((item) => item.id !== block.id),
      inbox: block.todoId ? current.inbox : [...current.inbox, { id: block.id, title: block.title, done: block.done }],
    }));
  }

  function toggleBlock(block) {
    if (block.todoId) {
      onToggleTodo(block.todoId, block.occurrenceDate ?? undefined);
      return;
    }
    updateDay((current) => ({
      ...current,
      blocks: current.blocks.map((item) => (item.id === block.id ? { ...item, done: !item.done } : item)),
    }));
  }

  function addInboxItem(event) {
    event.preventDefault();
    const title = draftItem.trim();
    if (!title) return;
    updateDay((current) => ({ ...current, inbox: [...current.inbox, { id: crypto.randomUUID(), title, done: false }] }));
    setDraftItem("");
  }

  function removeInboxItem(id) {
    updateDay((current) => ({ ...current, inbox: current.inbox.filter((item) => item.id !== id) }));
  }

  // First free hour after now (today) or 9am, for scheduling without dragging
  function nextFreeSlot(length = DEFAULT_LENGTH) {
    const busy = [...blocks, ...timedItems];
    let start = dateKey === todayKey ? Math.ceil(nowMinutes / SNAP) * SNAP : 9 * 60;
    while (start + length <= DAY_MINUTES) {
      const end = start + length;
      const clash = busy.find((item) => item.startMinutes < end && item.endMinutes > start);
      if (!clash) return start;
      start = Math.ceil(clash.endMinutes / SNAP) * SNAP;
    }
    return null;
  }

  function scheduleNext(source) {
    const start = nextFreeSlot();
    if (start !== null) addBlock(source, start, start + DEFAULT_LENGTH);
  }

  // ── Dragging ────────────────────────────────────────────────────────────
  // Pointer events (not HTML drag and drop) so the drop snaps to a 15-minute slot and the
  // preview tracks the pointer. "new" drags come from the tray, "move" and "resize" from blocks.
  function minutesAtY(clientY) {
    const rect = gridRef.current.getBoundingClientRect();
    return ((clientY - rect.top) / HOUR_HEIGHT) * 60;
  }

  function resolveDrag(state, x, y) {
    const overGrid = isInside(scrollRef.current, x, y);
    const overTray = isInside(trayRef.current, x, y);
    const root = rootRef.current.getBoundingClientRect();
    let start = state.start;
    let end = state.end;
    if (state.kind === "resize") {
      end = clamp(snap(minutesAtY(y)), state.start + SNAP, DAY_MINUTES);
    } else {
      const length = state.end - state.start;
      start = clamp(snap(minutesAtY(y) - state.grab), 0, DAY_MINUTES - length);
      end = start + length;
    }
    return { ...state, start, end, overGrid, overTray, x: x - root.left, y: y - root.top };
  }

  function autoScroll(clientY) {
    const scroller = scrollRef.current;
    const rect = scroller.getBoundingClientRect();
    if (clientY < rect.top + 36) scroller.scrollTop -= 14;
    else if (clientY > rect.bottom - 36) scroller.scrollTop += 14;
  }

  function beginPointer(event, state) {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = { ...state, originX: event.clientX, originY: event.clientY, active: false };

    const handleMove = (moveEvent) => {
      const current = dragRef.current;
      if (!current) return;
      if (!current.active && Math.hypot(moveEvent.clientX - current.originX, moveEvent.clientY - current.originY) < DRAG_THRESHOLD) return;
      current.active = true;
      autoScroll(moveEvent.clientY);
      setDrag(resolveDrag(current, moveEvent.clientX, moveEvent.clientY));
    };
    const stop = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
    const handleUp = (upEvent) => {
      stop();
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!current) return;
      if (!current.active) {
        current.onClick?.();
        return;
      }
      const result = resolveDrag(current, upEvent.clientX, upEvent.clientY);
      if (result.kind === "new" && result.overGrid) addBlock(result.source, result.start, result.end);
      if (result.kind === "move" && result.overTray) unschedule(result.block);
      else if (result.kind === "move" && result.overGrid) moveBlock(result.block.id, result.start, result.end);
      if (result.kind === "resize") moveBlock(result.block.id, result.start, result.end);
    };
    const handleCancel = () => {
      stop();
      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
  }

  function dragFromTray(event, source) {
    beginPointer(event, { kind: "new", source, title: source.title, course: source.course, start: 0, end: DEFAULT_LENGTH, grab: SNAP });
  }

  function dragBlock(event, block) {
    beginPointer(event, {
      kind: "move",
      block,
      title: block.title,
      course: block.course,
      start: block.startMinutes,
      end: block.endMinutes,
      grab: minutesAtY(event.clientY) - block.startMinutes,
      onClick: block.todo ? () => onEdit(block.todo) : undefined,
    });
  }

  function resizeBlock(event, block) {
    event.stopPropagation();
    beginPointer(event, { kind: "resize", block, start: block.startMinutes, end: block.endMinutes });
  }

  // ── Layout ──────────────────────────────────────────────────────────────
  const shownBlocks = blocks.map((block) => {
    if (drag?.block?.id !== block.id) return block;
    return { ...block, startMinutes: drag.start, endMinutes: drag.end, dragging: true, leaving: drag.kind === "move" && !drag.overGrid };
  });
  const preview = drag?.kind === "new" && drag.overGrid ? { id: "preview", preview: true, startMinutes: drag.start, endMinutes: drag.end, title: drag.title, course: drag.course } : null;
  const laidOut = layoutColumns(
    [...timedItems.map((item) => ({ ...item, fixed: true })), ...shownBlocks, ...(preview ? [preview] : [])].map((item) => ({ item, start: item.startMinutes, end: item.endMinutes })),
  );

  const plannedDone = blocks.filter((block) => block.done).length;
  const label = dayLabel(dateKey, todayKey);
  const traySections = [
    { id: "overdue", title: dateKey === todayKey ? "Overdue" : `Due before ${parseDateKey(dateKey).toLocaleDateString(undefined, { weekday: "short" })}`, items: tray.overdue, tone: "text-danger-600" },
    { id: "today", title: dateKey === todayKey ? "Due today" : dateKey === addDays(todayKey, 1) ? "Due tomorrow" : "Due this day", items: tray.dueToday, tone: "text-urgent-600" },
    { id: "undated", title: "No date", items: tray.undated, tone: "text-slate-400" },
  ];
  const showGhost = drag && (drag.kind === "new" ? !drag.overGrid : drag.kind === "move" && !drag.overGrid);

  return (
    <div ref={rootRef} className={`relative flex h-full min-h-0 select-none ${drag ? "cursor-grabbing" : ""}`}>
      <aside ref={trayRef} className={`flex w-72 shrink-0 flex-col border-r border-slate-100 transition-colors ${drag?.kind === "move" && drag.overTray ? "bg-slate-50" : ""}`}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <p className="text-xs font-semibold text-slate-700">Unscheduled</p>
            <p className="mt-0.5 text-[11px] text-slate-400">Drag onto the schedule to plan when you'll do it.</p>
          </div>
          {traySections.map((section) => section.items.length > 0 && (
            <section key={section.id}>
              <h3 className={`mb-1.5 text-[10px] font-semibold tracking-wide uppercase ${section.tone}`}>{section.title}</h3>
              <ul className="space-y-1">
                {section.items.map((todo) => {
                  const course = courseMap[todo.courseId];
                  const source = { todoId: todo.id, occurrenceDate: todo.occurrenceDate ?? todo.dueDate ?? null, title: todo.title, course };
                  return (
                    <TrayRow
                      key={todo.id}
                      title={todo.title}
                      color={getCourseColor(course)}
                      meta={section.id === "overdue" && todo.dueDate ? shortDue(todo.dueDate) : todo.priority === "urgent" ? "Urgent" : null}
                      onPointerDown={(event) => dragFromTray(event, source)}
                      onSchedule={() => scheduleNext(source)}
                    />
                  );
                })}
              </ul>
            </section>
          ))}
          <section>
            <h3 className="mb-1.5 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">Planner items</h3>
            {day.inbox.length > 0 && (
              <ul className="mb-1.5 space-y-1">
                {day.inbox.map((item) => (
                  <TrayRow
                    key={item.id}
                    title={item.title}
                    plannerOnly
                    onPointerDown={(event) => dragFromTray(event, { inboxId: item.id, title: item.title, done: item.done })}
                    onSchedule={() => scheduleNext({ inboxId: item.id, title: item.title, done: item.done })}
                    onRemove={() => removeInboxItem(item.id)}
                  />
                ))}
              </ul>
            )}
            <form onSubmit={addInboxItem}>
              <input
                value={draftItem}
                onChange={(event) => setDraftItem(event.target.value)}
                placeholder="Add something just for today…"
                className="w-full rounded-lg border border-dashed border-slate-200 px-2 py-1.5 text-xs outline-none placeholder:text-slate-400 focus:border-todo-400 focus:border-solid"
              />
            </form>
            <p className="mt-1 text-[10px] text-slate-300">Planner items stay here and never show up in your task list.</p>
          </section>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          <button type="button" onClick={() => setDateKey((key) => addDays(key, -1))} className="rounded-full p-1.5 leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Previous day">‹</button>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-slate-900">{label.title}</p>
            {label.date && <p className="text-[11px] leading-tight text-slate-400">{label.date}</p>}
          </div>
          <button type="button" onClick={() => setDateKey((key) => addDays(key, 1))} className="rounded-full p-1.5 leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Next day">›</button>
          {dateKey !== todayKey && (
            <button type="button" onClick={() => setDateKey(todayKey)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-slate-300">Today</button>
          )}
          <div className="flex-1" />
          {blocks.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{plannedDone} of {blocks.length} planned done</span>
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full rounded-full bg-success-500 transition-all duration-500" style={{ width: `${(plannedDone / blocks.length) * 100}%` }} />
              </span>
            </div>
          )}
        </div>

        {allDayItems.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-100 px-4 py-1.5">
            <span className="mr-1 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">All day</span>
            {allDayItems.map((item) => (
              <button key={item.id} type="button" onClick={() => onEdit(item)} className="rounded px-1.5 py-0.5 text-[11px]" style={courseChipStyle(courseMap[item.courseId], item.completed)}>
                {item.title}
              </button>
            ))}
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex">
            <div className="w-14 shrink-0 text-right text-[10px] text-slate-400">
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} style={{ height: HOUR_HEIGHT }} className="-translate-y-1.5 pr-2">
                  {hour === 0 ? "" : formatClock(hour * 60).replace(":00", "")}
                </div>
              ))}
            </div>
            <div ref={gridRef} className="relative mr-3 min-w-0 flex-1 border-l border-slate-100" style={{ height: HOUR_HEIGHT * 24 }}>
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="border-b border-slate-100" style={{ height: HOUR_HEIGHT }}>
                  <div className="border-b border-dashed border-slate-50" style={{ height: HOUR_HEIGHT / 2 }} />
                </div>
              ))}

              {laidOut.map(({ item: { item }, column, columns }) => {
                const top = (item.startMinutes / 60) * HOUR_HEIGHT;
                const height = Math.max(((item.endMinutes - item.startMinutes) / 60) * HOUR_HEIGHT, 20);
                const position = { top, height, left: `calc(${(column / columns) * 100}% + 3px)`, width: `calc(${100 / columns}% - 6px)` };
                if (item.fixed) return <FixedItem key={`fixed-${item.id}`} item={item} course={courseMap[item.courseId]} style={position} onEdit={onEdit} />;
                if (item.preview) {
                  return (
                    <div key="preview" className="pointer-events-none absolute z-20 rounded-lg border-2 border-dashed border-todo-400 bg-todo-50/80 px-2 py-1 text-[11px] font-medium text-todo-700" style={position}>
                      {item.title}
                      <span className="ml-1.5 font-normal text-todo-600">{formatClock(item.startMinutes)}</span>
                    </div>
                  );
                }
                return (
                  <PlanBlock
                    key={item.id}
                    block={item}
                    style={position}
                    compact={height < 40}
                    onPointerDown={(event) => dragBlock(event, item)}
                    onResize={(event) => resizeBlock(event, item)}
                    onToggle={() => toggleBlock(item)}
                    onRemove={() => unschedule(item)}
                  />
                );
              })}

              {dateKey === todayKey && (
                <div className="pointer-events-none absolute left-0 right-0 z-30 flex items-center" style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}>
                  <div className="h-1.5 w-1.5 -translate-x-0.5 rounded-full bg-danger-500" />
                  <div className="h-px flex-1 bg-danger-500" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showGhost && (
        <div
          className="pointer-events-none absolute z-50 max-w-56 truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-lg"
          style={{ left: drag.x + 10, top: drag.y + 8 }}
        >
          {drag.kind === "move" && drag.overTray ? `Unschedule “${drag.title}”` : drag.title}
        </div>
      )}
    </div>
  );
}

function TrayRow({ title, color, meta, plannerOnly = false, onPointerDown, onSchedule, onRemove }) {
  return (
    <li
      onPointerDown={onPointerDown}
      className="group flex cursor-grab touch-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm transition-shadow hover:border-slate-300 hover:shadow"
    >
      {plannerOnly
        ? <span className="h-2 w-2 shrink-0 rounded-sm border border-slate-300" />
        : <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {meta && <span className="shrink-0 text-[10px] text-slate-400">{meta}</span>}
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onSchedule}
        title="Schedule at the next free hour"
        aria-label={`Schedule ${title} at the next free hour`}
        className="shrink-0 rounded px-1 text-slate-300 opacity-0 transition-opacity hover:text-todo-600 focus-visible:opacity-100 group-hover:opacity-100"
      >
        +
      </button>
      {onRemove && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
          aria-label={`Remove ${title}`}
          className="shrink-0 rounded px-1 text-slate-300 opacity-0 transition-opacity hover:text-danger-500 focus-visible:opacity-100 group-hover:opacity-100"
        >
          ×
        </button>
      )}
    </li>
  );
}

function PlanBlock({ block, style, compact, onPointerDown, onResize, onToggle, onRemove }) {
  const tint = block.course ? courseChipStyle(block.course) : null;
  const colors = block.done
    ? { backgroundColor: "#f1f5f9", color: "#94a3b8", borderColor: "#e2e8f0" }
    : tint
    ? { ...tint, borderColor: `${getCourseColor(block.course)}55` }
    : { backgroundColor: "#fffbeb", color: "#b45309", borderColor: "#fde68a" };

  return (
    <div
      onPointerDown={onPointerDown}
      className={`group absolute flex cursor-grab touch-none overflow-hidden rounded-lg border text-left transition-[opacity,box-shadow] ${block.dragging ? "z-20 shadow-lg" : "z-10 shadow-sm hover:shadow"} ${block.leaving ? "opacity-40" : ""}`}
      style={{ ...style, ...colors }}
    >
      <div className={`flex min-w-0 flex-1 gap-1.5 px-1.5 ${compact ? "items-center" : "items-start py-1"}`}>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onToggle}
          aria-label={block.done ? `Mark ${block.title} not done` : `Mark ${block.title} done`}
          className={`task-complete-toggle mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px] ${block.done ? "border-success-500 bg-success-500 text-white" : "border-current bg-white/60"}`}
        >
          {block.done && (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-2.5 w-2.5"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 111.4-1.4l2.3 2.29 6.3-6.29a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
          )}
        </button>
        <div className={`min-w-0 flex-1 ${compact ? "flex items-baseline gap-1.5" : ""}`}>
          <p className={`truncate text-[11px] font-semibold ${block.done ? "line-through" : ""}`}>{block.title}</p>
          <p className="truncate text-[10px] opacity-75">
            {formatClock(block.startMinutes)} – {formatClock(block.endMinutes)}
            {!block.todo && !compact && <span className="ml-1">· planner only</span>}
          </p>
        </div>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
          title="Unschedule"
          aria-label={`Unschedule ${block.title}`}
          className="shrink-0 rounded px-0.5 text-xs leading-none opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-60"
        >
          ×
        </button>
      </div>
      <div onPointerDown={onResize} className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" aria-hidden="true" />
    </div>
  );
}

function FixedItem({ item, course, style, onEdit }) {
  return (
    <button
      type="button"
      onClick={() => onEdit(item)}
      title={`${item.title} (already scheduled)`}
      className={`absolute z-0 overflow-hidden rounded-lg border border-dashed px-2 py-1 text-left text-[11px] opacity-70 hover:opacity-100 ${item.completed ? "line-through" : ""}`}
      style={{ ...style, ...courseChipStyle(course, item.completed), borderColor: `${getCourseColor(course)}66` }}
    >
      <span className="font-semibold">{item.title}</span>
      <span className="ml-1.5 opacity-75">{formatClock(item.startMinutes)}</span>
    </button>
  );
}
