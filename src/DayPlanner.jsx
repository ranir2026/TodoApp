import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { expandRange, isOccurrenceCompleted, parseDateKey, resolveTask } from "./occurrences";
import { courseChipStyle, getCourseColor } from "./courseColors";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon } from "./icons";
import { EMPTY_DAY, addDays, formatClock, layoutColumns, minutesToTime, timeToMinutes, toDateKey } from "./planner";

const HOUR_HEIGHT = 52;
const SNAP = 15;
const DEFAULT_LENGTH = 60;
const DAY_MINUTES = 24 * 60;
const DRAG_THRESHOLD = 4;
const GHOST_WIDTH = 256;

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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

function trayMeta(sectionId, todo) {
  if (sectionId === "overdue" || sectionId === "upcoming") return shortDue(todo.dueDate);
  if (sectionId === "today" && todo.startTime) return formatClock(timeToMinutes(todo.startTime));
  return todo.priority === "urgent" ? "Urgent" : null;
}

// Fade the list only at an edge where more content is hidden behind it
function edgeMask({ top, bottom }) {
  if (!top && !bottom) return undefined;
  return `linear-gradient(to bottom, ${top ? "transparent 0, black 16px" : "black 0"}, ${bottom ? "black calc(100% - 16px), transparent 100%" : "black 100%"})`;
}

export default function DayPlanner({ todos, courseMap, toolbar, planner, updatePlanner, onToggleTodo, onEdit }) {
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));
  const [dateKey, setDateKey] = useState(todayKey);
  const [nowMinutes, setNowMinutes] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  const [drag, setDrag] = useState(null);
  const [pressedKey, setPressedKey] = useState(null);
  const [returning, setReturning] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [draftItem, setDraftItem] = useState("");
  const [query, setQuery] = useState("");
  const [listEdges, setListEdges] = useState({ top: false, bottom: false });
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const gridRef = useRef(null);
  const trayRef = useRef(null);
  const listRef = useRef(null);
  const dragRef = useRef(null);
  const returnRef = useRef(null);

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

  // A dropped item that missed the schedule glides back to where it was picked up
  useLayoutEffect(() => {
    const element = returnRef.current;
    if (!returning || !element) return undefined;
    const animation = element.animate(
      [{ transform: "translate(0, 0) scale(1.02)", opacity: 1 }, { transform: `translate(${returning.dx}px, ${returning.dy}px) scale(1)`, opacity: 0 }],
      { duration: 260, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" },
    );
    animation.onfinish = () => setReturning(null);
    return () => animation.cancel();
  }, [returning]);

  // A block placed with "+" may land out of view: bring it on screen and pulse it once
  useEffect(() => {
    if (!flashId) return undefined;
    const scroller = scrollRef.current;
    const element = scroller?.querySelector(`[data-block-id="${flashId}"]`);
    if (element) {
      const top = element.offsetTop;
      const bottom = top + element.offsetHeight;
      if (top < scroller.scrollTop || bottom > scroller.scrollTop + scroller.clientHeight) {
        scroller.scrollTo({ top: Math.max(top - scroller.clientHeight / 3, 0), behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }
    }
    const id = setTimeout(() => setFlashId(null), 900);
    return () => clearTimeout(id);
  }, [flashId]);

  function measureListEdges() {
    const list = listRef.current;
    if (!list) return;
    const top = list.scrollTop > 1;
    const bottom = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
    setListEdges((current) => (current.top === top && current.bottom === bottom ? current : { top, bottom }));
  }

  useLayoutEffect(measureListEdges);

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

  // Every open task can be planned, grouped by when it's due
  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;
  const openTasks = todos
    .filter((todo) => (todo.type ?? "task") === "task")
    .map(resolveTask)
    .filter((todo) => !todo.completed && !scheduledIds.has(todo.id))
    .filter((todo) => !searching || todo.title.toLowerCase().includes(needle));
  const byDue = (a, b) => a.dueDate.localeCompare(b.dueDate) || (a.startTime ?? "").localeCompare(b.startTime ?? "");
  const tray = {
    overdue: openTasks.filter((todo) => todo.dueDate && todo.dueDate < dateKey).sort(byDue),
    dueToday: openTasks.filter((todo) => todo.dueDate === dateKey).sort(byDue),
    undated: openTasks.filter((todo) => !todo.dueDate),
    upcoming: openTasks.filter((todo) => todo.dueDate > dateKey).sort(byDue),
  };
  const inboxItems = searching ? day.inbox.filter((item) => item.title.toLowerCase().includes(needle)) : day.inbox;

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
    return block.id;
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
    // New planner items land at the end of the list, right above the box they were typed into
    requestAnimationFrame(() => {
      const list = listRef.current;
      list?.scrollTo({ top: list.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  }

  function removeInboxItem(id) {
    updateDay((current) => ({ ...current, inbox: current.inbox.filter((item) => item.id !== id) }));
  }

  // First free hour after now (today) or 9am, for scheduling without dragging
  // The first free stretch of `length` minutes after now (today) or 9am, or null if none is left
  function nextFreeSlot(length) {
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

  // Book the next free hour; when no full hour is left in the day, book the first shorter gap
  // instead (down to 15 minutes), running until the next block or midnight
  function scheduleNext(source) {
    const hour = nextFreeSlot(DEFAULT_LENGTH);
    if (hour !== null) {
      setFlashId(addBlock(source, hour, hour + DEFAULT_LENGTH));
      return;
    }
    const start = nextFreeSlot(SNAP);
    if (start === null) return;
    const nextBusy = [...blocks, ...timedItems].filter((item) => item.startMinutes >= start + SNAP).reduce((min, item) => Math.min(min, item.startMinutes), DAY_MINUTES);
    setFlashId(addBlock(source, start, Math.min(start + DEFAULT_LENGTH, Math.floor(nextBusy / SNAP) * SNAP)));
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
    setPressedKey(state.pressKey);

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
      setPressedKey(null);
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
      else if (result.kind === "move" && result.overTray) unschedule(result.block);
      else if (result.kind === "move" && result.overGrid) moveBlock(result.block.id, result.start, result.end);
      else if (result.kind === "resize") moveBlock(result.block.id, result.start, result.end);
      else sendBack(result);
    };
    const handleCancel = () => {
      stop();
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (current?.active && current.kind !== "resize") sendBack(current);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
  }

  // Where the grabbed element sits and where the pointer holds it, so the ghost keeps the same grip
  function grip(event, width) {
    const root = rootRef.current.getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    const ghostWidth = Math.min(width ?? rect.width, GHOST_WIDTH);
    return {
      ghostWidth,
      grabX: clamp(event.clientX - rect.left, 8, ghostWidth - 8),
      grabY: clamp(event.clientY - rect.top, 6, 24),
      homeX: rect.left - root.left,
      homeY: rect.top - root.top,
    };
  }

  function sendBack(state) {
    if (state.x === undefined || prefersReducedMotion()) return;
    const fromX = state.x - state.grabX;
    const fromY = state.y - state.grabY;
    setReturning({ ...state, fromX, fromY, dx: state.homeX - fromX, dy: state.homeY - fromY });
  }

  function dragFromTray(event, source, pressKey) {
    beginPointer(event, { kind: "new", source, pressKey, title: source.title, course: source.course, plannerOnly: !source.todoId, start: 0, end: DEFAULT_LENGTH, grab: SNAP, ...grip(event) });
  }

  function dragBlock(event, block) {
    beginPointer(event, {
      kind: "move",
      block,
      pressKey: block.id,
      title: block.title,
      course: block.course,
      plannerOnly: !block.todo,
      start: block.startMinutes,
      end: block.endMinutes,
      grab: minutesAtY(event.clientY) - block.startMinutes,
      onClick: block.todo ? () => onEdit(block.todo) : undefined,
      ...grip(event, GHOST_WIDTH),
    });
  }

  function resizeBlock(event, block) {
    event.stopPropagation();
    beginPointer(event, { kind: "resize", block, pressKey: block.id, start: block.startMinutes, end: block.endMinutes });
  }

  // ── Layout ──────────────────────────────────────────────────────────────
  const shownBlocks = blocks.map((block) => {
    if (returning?.kind === "move" && returning.block.id === block.id) return { ...block, leaving: true };
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
    { id: "undated", title: "No date", items: tray.undated, tone: "text-slate-500" },
    { id: "upcoming", title: "Upcoming", items: tray.upcoming, tone: "text-slate-500" },
  ];
  const nothingFound = searching && traySections.every((section) => section.items.length === 0) && inboxItems.length === 0;
  const showGhost = drag && (drag.kind === "new" ? !drag.overGrid : drag.kind === "move" && !drag.overGrid);
  // The picked-up row stays dimmed until its ghost has landed back on it
  const liftedKey = drag?.kind === "new" ? drag.pressKey : returning?.kind === "new" ? returning.pressKey : null;

  const controls = (
    <>
      <div className="flex shrink-0 items-center">
        <button type="button" onClick={() => setDateKey((key) => addDays(key, -1))} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Previous day">
          <ChevronLeftIcon />
        </button>
        <button type="button" onClick={() => setDateKey((key) => addDays(key, 1))} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Next day">
          <ChevronRightIcon />
        </button>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight text-slate-900">{label.title}</p>
        {label.date && <p className="truncate text-[11px] leading-tight text-slate-500">{label.date}</p>}
      </div>
      <button
        type="button"
        onClick={() => setDateKey(todayKey)}
        disabled={dateKey === todayKey}
        className="ml-1 shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:cursor-default disabled:opacity-40 disabled:hover:border-slate-200"
      >
        Today
      </button>
      <div className="flex-1" />
      {blocks.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          <span>{plannedDone} of {blocks.length} planned done</span>
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-success-500 transition-all duration-500" style={{ width: `${(plannedDone / blocks.length) * 100}%` }} />
          </span>
        </div>
      )}
    </>
  );

  return (
    <div ref={rootRef} className={`relative flex h-full min-h-0 select-none ${drag ? "cursor-grabbing" : ""}`}>
      {toolbar && createPortal(controls, toolbar)}
      <aside ref={trayRef} className={`flex w-72 shrink-0 flex-col border-r border-slate-100 transition-colors ${drag?.kind === "move" && drag.overTray ? "bg-slate-50" : ""}`}>
        <div className="shrink-0 px-4 pt-4 pb-2">
          <p className="text-xs font-semibold text-slate-700">Unscheduled</p>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.stopPropagation();
                setQuery("");
              }
            }}
            placeholder="Find any task…"
            aria-label="Find any task"
            className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none placeholder:text-slate-400 focus:border-course-400 focus:bg-white"
          />
        </div>

        <div
          ref={listRef}
          onScroll={measureListEdges}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-2"
          style={{ maskImage: edgeMask(listEdges), WebkitMaskImage: edgeMask(listEdges) }}
        >
          {nothingFound && <p className="text-[11px] text-slate-500">No open tasks match “{query.trim()}”.</p>}
          {!searching && openTasks.length === 0 && inboxItems.length === 0 && <p className="text-[11px] text-slate-500">Nothing left to plan. Every task is done or on the schedule.</p>}
          {traySections.map((section) => section.items.length > 0 && (
            <section key={section.id}>
              <SectionLabel className={section.tone}>{section.title}</SectionLabel>
              <ul className="space-y-1">
                {section.items.map((todo) => {
                  const course = courseMap[todo.courseId];
                  const source = { todoId: todo.id, occurrenceDate: todo.occurrenceDate ?? todo.dueDate ?? null, title: todo.title, course };
                  return (
                    <TrayRow
                      key={todo.id}
                      pressed={pressedKey === todo.id}
                      lifted={liftedKey === todo.id}
                      title={todo.title}
                      color={getCourseColor(course)}
                      meta={trayMeta(section.id, todo)}
                      onPointerDown={(event) => dragFromTray(event, source, todo.id)}
                      onSchedule={() => scheduleNext(source)}
                    />
                  );
                })}
              </ul>
            </section>
          ))}
          {inboxItems.length > 0 && (
            <section>
              <SectionLabel className="text-slate-500">Planner items</SectionLabel>
              <ul className="space-y-1">
                {inboxItems.map((item) => (
                  <TrayRow
                    key={item.id}
                    pressed={pressedKey === item.id}
                    lifted={liftedKey === item.id}
                    title={item.title}
                    plannerOnly
                    onPointerDown={(event) => dragFromTray(event, { inboxId: item.id, title: item.title, done: item.done }, item.id)}
                    onSchedule={() => scheduleNext({ inboxId: item.id, title: item.title, done: item.done })}
                    onRemove={() => removeInboxItem(item.id)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Pinned under the list so adding a planner item never means scrolling to the end */}
        <form onSubmit={addInboxItem} className="shrink-0 px-4 pt-2 pb-4">
          <input
            value={draftItem}
            onChange={(event) => setDraftItem(event.target.value)}
            placeholder="Add something just for today…"
            aria-label="Add a planner item"
            className="w-full rounded-lg border border-dashed border-slate-300 bg-white px-2 py-1.5 text-xs outline-none placeholder:text-slate-400 focus:border-course-400 focus:border-solid"
          />
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {allDayItems.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-100 px-4 py-1.5">
            <span className="mr-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">All day</span>
            {allDayItems.map((item) => (
              <button key={item.id} type="button" onClick={() => onEdit(item)} className="rounded px-1.5 py-0.5 text-[11px]" style={courseChipStyle(courseMap[item.courseId], item.completed)}>
                {item.title}
              </button>
            ))}
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex">
            <div className="w-14 shrink-0 text-right text-[11px] text-slate-400">
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
                    <div key="preview" className="pointer-events-none absolute z-20 rounded-lg border-2 border-dashed border-course-300 bg-course-50/80 px-2 py-1 text-[11px] font-medium text-course-700" style={position}>
                      {item.title}
                      <span className="ml-1.5 font-normal text-course-600">{formatClock(item.startMinutes)}</span>
                    </div>
                  );
                }
                return (
                  <PlanBlock
                    key={item.id}
                    block={item}
                    style={position}
                    compact={height < 40}
                    pressed={pressedKey === item.id}
                    flash={flashId === item.id}
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
        <DragGhost
          title={drag.kind === "move" && drag.overTray ? `Unschedule “${drag.title}”` : drag.title}
          course={drag.course}
          plannerOnly={drag.plannerOnly}
          style={{ left: drag.x - drag.grabX, top: drag.y - drag.grabY, width: drag.ghostWidth }}
        />
      )}
      {returning && (
        <DragGhost
          ref={returnRef}
          title={returning.title}
          course={returning.course}
          plannerOnly={returning.plannerOnly}
          style={{ left: returning.fromX, top: returning.fromY, width: returning.ghostWidth }}
        />
      )}
    </div>
  );
}

function SectionLabel({ className = "", children }) {
  return <h3 className={`mb-1.5 text-[11px] font-semibold tracking-wide uppercase ${className}`}>{children}</h3>;
}

// The category shows as a left stripe, the same as rows in the task list; planner-only items get a neutral one
const PLANNER_ONLY_STRIPE = "var(--color-slate-300)";

function TrayRow({ title, color, meta, plannerOnly = false, pressed, lifted, onPointerDown, onSchedule, onRemove }) {
  return (
    <li
      onPointerDown={onPointerDown}
      className={`group flex cursor-grab touch-none items-center gap-2 rounded-lg border border-l-4 bg-white py-1 pr-1 pl-2 text-xs text-slate-700 transition-[scale,box-shadow,opacity,border-color] duration-150 ease-out ${
        pressed ? "scale-[0.98] border-slate-300 shadow-md" : "border-slate-200 shadow-sm hover:border-slate-300 hover:shadow"
      } ${lifted ? "opacity-40" : ""}`}
      style={{ borderLeftColor: plannerOnly ? PLANNER_ONLY_STRIPE : color }}
    >
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {meta && <span className="shrink-0 text-[11px] text-slate-400">{meta}</span>}
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onSchedule}
        title="Schedule at the next free hour"
        aria-label={`Schedule ${title} at the next free hour`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-course-600 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </button>
      {onRemove && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
          aria-label={`Remove ${title}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-danger-500 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}

// The row you picked up, following the pointer from the spot you grabbed it
function DragGhost({ ref, title, course, plannerOnly, style }) {
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-50 flex scale-[1.02] items-center gap-2 rounded-lg border border-l-4 border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-lg"
      style={{ ...style, borderLeftColor: plannerOnly ? PLANNER_ONLY_STRIPE : getCourseColor(course) }}
    >
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </div>
  );
}

function PlanBlock({ block, style, compact, pressed, flash, onPointerDown, onResize, onToggle, onRemove }) {
  // Done blocks fade to neutral; planner-only blocks are neutral so they never pass for a category
  const tone = block.done
    ? "border-slate-200 bg-slate-100 text-slate-400"
    : !block.course
    ? "border-slate-300 bg-slate-50 text-slate-700"
    : "";
  const tint = !block.done && block.course ? { ...courseChipStyle(block.course), borderColor: `${getCourseColor(block.course)}55` } : null;

  return (
    <div
      data-block-id={block.id}
      onPointerDown={onPointerDown}
      className={`group absolute flex cursor-grab touch-none overflow-hidden rounded-lg border text-left transition-[opacity,box-shadow,scale] duration-150 ease-out ${tone} ${
        block.dragging ? "z-20 shadow-lg" : pressed ? "z-20 scale-[0.98] shadow-md" : "z-10 shadow-sm hover:shadow"
      } ${block.leaving ? "opacity-40" : ""} ${flash ? "planner-flash" : ""}`}
      style={{ ...style, ...tint }}
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
          <p className="truncate text-[11px] opacity-75">
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
          className="-mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-black/5 hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-60"
        >
          <CloseIcon className="h-3 w-3" />
        </button>
      </div>
      {/* Resize handle: a wider hit area along the bottom edge, with a grip that shows on hover */}
      <div onPointerDown={onResize} className={`absolute inset-x-0 bottom-0 flex cursor-ns-resize items-end justify-center pb-0.5 ${compact ? "h-1.5" : "h-2.5"}`} aria-hidden="true">
        <span className={`h-1 w-6 rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-30 ${compact ? "hidden" : ""}`} />
      </div>
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
