import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseDateKey, resolveTask } from "./occurrences";
import { courseChipStyle, getCourseColor } from "./courseColors";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon } from "./icons";
import { EMPTY_DAY, addDays, fixedItemsOn, formatClock, edgeMask, layoutColumns, minutesToTime, resolveDayBlocks, timeToMinutes, toDateKey } from "./planner";
import { animateSpring } from "./spring";
import { edgeDepth } from "./dragEdges";

const HOUR_HEIGHT = 52;
const SNAP = 15;
const DEFAULT_LENGTH = 60;
const DAY_MINUTES = 24 * 60;
const DRAG_THRESHOLD = 4;
const GHOST_WIDTH = 256;
const VELOCITY_WINDOW = 100;
// Auto-scroll while dragging near the schedule's top or bottom: the deeper into the edge, the faster
const EDGE_SPEED = 16;

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

const isTyping = (target) => target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

// suspended: another dialog (the item editor) sits on top, so the arrow keys belong to it
export default function DayPlanner({ todos, courseMap, toolbar, planner, updatePlanner, onToggleTodo, onEdit, suspended = false }) {
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));
  const [dateKey, setDateKey] = useState(todayKey);
  // Which way the last day change went (-1, 0, 1), so the new day slides in from that side
  const [dayShift, setDayShift] = useState(0);
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
  const settleRef = useRef(null);
  const runningSettleRef = useRef(null);

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

  // A dropped item that missed the schedule springs back to where it was picked up, carrying the
  // pointer's speed. X and Y are separate springs, so a sideways flick doesn't bend the path home.
  useLayoutEffect(() => {
    const element = returnRef.current;
    if (!returning || !element) return undefined;
    const { dx, dy, vx = 0, vy = 0 } = returning;
    const total = Math.hypot(dx, dy) || 1;
    const offset = { x: 0, y: 0 };
    let settled = 0;
    const paint = () => {
      const remaining = Math.hypot(dx - offset.x, dy - offset.y) / total;
      element.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${1 + 0.02 * remaining})`;
      // It fades as it lands, handing over to the row it came from
      element.style.opacity = String(Math.min(1, remaining * 2.5));
    };
    const done = () => { settled += 1; if (settled === 2) setReturning(null); };
    const cancels = [
      animateSpring({ from: 0, to: dx, velocity: vx, damping: 0.9, response: 0.35, onUpdate: (x) => { offset.x = x; paint(); }, onComplete: done }),
      animateSpring({ from: 0, to: dy, velocity: vy, damping: 0.9, response: 0.35, onUpdate: (y) => { offset.y = y; paint(); }, onComplete: done }),
    ];
    return () => cancels.forEach((cancel) => cancel());
  }, [returning]);

  // After a drop, the block glides from where the pointer let go into the 15-minute slot it snapped
  // to, carrying the pointer's speed, so there is no seam between dragging and settling
  useLayoutEffect(() => {
    const settle = settleRef.current;
    if (!settle) return;
    settleRef.current = null;
    const element = scrollRef.current?.querySelector(`[data-block-id="${settle.id}"]`);
    const distance = Math.abs(settle.dTop) >= Math.abs(settle.dHeight) ? settle.dTop : settle.dHeight;
    if (!element || Math.abs(distance) < 1 || prefersReducedMotion()) return;
    const top = parseFloat(element.style.top);
    const height = parseFloat(element.style.height);
    const apply = (value) => {
      const t = value / distance;
      element.style.top = `${top + settle.dTop * t}px`;
      element.style.height = `${height + settle.dHeight * t}px`;
    };
    apply(distance);
    const cancel = animateSpring({ from: distance, to: 0, velocity: settle.velocity, damping: 1, response: 0.3, onUpdate: apply, onComplete: () => { runningSettleRef.current = null; } });
    runningSettleRef.current = () => { cancel(); apply(0); };
  });

  // Left and right arrows step through the days (not while typing, or while the item editor is open)
  useEffect(() => {
    if (suspended) return undefined;
    const handleKey = (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isTyping(event.target) || dragRef.current) return;
      event.preventDefault();
      goToDay(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  function goToDay(step) {
    setDayShift(Math.sign(step));
    setDateKey((key) => addDays(key, step));
  }

  function goToToday() {
    setDayShift(todayKey > dateKey ? 1 : -1);
    setDateKey(todayKey);
  }

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

  const blocks = resolveDayBlocks(day, todoById, courseMap);
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
  const { timed: timedItems, allDay: allDayItems } = fixedItemsOn(todos, dateKey, scheduledIds);

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

  // `start` / `end` are the 15-minute slot it will land in; `rawStart` / `rawEnd` are exactly where the
  // pointer has it, which is where it's drawn while dragging
  function resolveDrag(state, x, y) {
    const overGrid = isInside(scrollRef.current, x, y);
    const overTray = isInside(trayRef.current, x, y);
    const root = rootRef.current.getBoundingClientRect();
    const pointer = minutesAtY(y);
    let { start, end } = state;
    let rawStart = start;
    let rawEnd = end;
    if (state.kind === "resize") {
      rawEnd = clamp(pointer, state.start + SNAP, DAY_MINUTES);
      end = clamp(snap(pointer), state.start + SNAP, DAY_MINUTES);
    } else if (state.kind === "resize-start") {
      rawStart = clamp(pointer, 0, state.end - SNAP);
      start = clamp(snap(pointer), 0, state.end - SNAP);
    } else {
      const length = state.end - state.start;
      rawStart = clamp(pointer - state.grab, 0, DAY_MINUTES - length);
      start = clamp(snap(pointer - state.grab), 0, DAY_MINUTES - length);
      rawEnd = rawStart + length;
      end = start + length;
    }
    return { ...state, start, end, rawStart, rawEnd, overGrid, overTray, x: x - root.left, y: y - root.top };
  }

  // One frame of edge auto-scroll; true if the schedule moved
  function autoScrollStep(clientY) {
    const scroller = scrollRef.current;
    const rect = scroller.getBoundingClientRect();
    const depth = edgeDepth(clientY, rect.top, rect.bottom);
    if (!depth) return false;
    const before = scroller.scrollTop;
    scroller.scrollTop += Math.sign(depth) * Math.ceil(EDGE_SPEED * depth * depth);
    return scroller.scrollTop !== before;
  }

  function beginPointer(event, state) {
    if (event.button !== 0) return;
    event.preventDefault();
    runningSettleRef.current?.();
    runningSettleRef.current = null;
    dragRef.current = { ...state, originX: event.clientX, originY: event.clientY, lastX: event.clientX, lastY: event.clientY, active: false, samples: [] };
    setPressedKey(state.pressKey);
    let frame = null;

    // While dragging, a frame loop keeps the schedule scrolling near its edges even when the pointer
    // holds still, and re-resolves the drag so the item stays under the pointer as the grid moves
    const tick = () => {
      const current = dragRef.current;
      if (!current?.active) { frame = null; return; }
      if (autoScrollStep(current.lastY)) setDrag(resolveDrag(current, current.lastX, current.lastY));
      frame = requestAnimationFrame(tick);
    };

    const handleMove = (moveEvent) => {
      const current = dragRef.current;
      if (!current) return;
      if (!current.active && Math.hypot(moveEvent.clientX - current.originX, moveEvent.clientY - current.originY) < DRAG_THRESHOLD) return;
      current.active = true;
      current.lastX = moveEvent.clientX;
      current.lastY = moveEvent.clientY;
      const now = performance.now();
      current.samples = [...current.samples.filter((sample) => now - sample.time < VELOCITY_WINDOW), { x: moveEvent.clientX, y: moveEvent.clientY, time: now }];
      frame ??= requestAnimationFrame(tick);
      setDrag(resolveDrag(current, moveEvent.clientX, moveEvent.clientY));
    };
    const stop = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      if (frame) cancelAnimationFrame(frame);
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
      const [first, last] = [current.samples[0], current.samples.at(-1)];
      const elapsed = first && last ? last.time - first.time : 0;
      const velocity = elapsed > 0 ? { x: ((last.x - first.x) / elapsed) * 1000, y: ((last.y - first.y) / elapsed) * 1000 } : { x: 0, y: 0 };
      const result = resolveDrag(current, upEvent.clientX, upEvent.clientY);
      // Where it was let go, relative to the slot it lands in, for the settle
      const px = (minutes) => (minutes / 60) * HOUR_HEIGHT;
      const settle = (id) => {
        settleRef.current = { id, dTop: px(result.rawStart - result.start), dHeight: px(result.rawEnd - result.rawStart - (result.end - result.start)), velocity: velocity.y };
      };
      if (result.kind === "new" && result.overGrid) settle(addBlock(result.source, result.start, result.end));
      else if (result.kind === "move" && result.overTray) unschedule(result.block);
      else if (result.kind === "move" && result.overGrid) { settle(result.block.id); moveBlock(result.block.id, result.start, result.end); }
      else if (result.kind === "resize" || result.kind === "resize-start") { settle(result.block.id); moveBlock(result.block.id, result.start, result.end); }
      else sendBack(result, velocity);
    };
    const handleCancel = () => {
      stop();
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (current?.active && !current.kind.startsWith("resize")) sendBack(current);
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

  function sendBack(state, velocity = { x: 0, y: 0 }) {
    if (state.x === undefined || prefersReducedMotion()) return;
    const fromX = state.x - state.grabX;
    const fromY = state.y - state.grabY;
    setReturning({ ...state, fromX, fromY, dx: state.homeX - fromX, dy: state.homeY - fromY, vx: velocity.x, vy: velocity.y });
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

  // edge: "end" drags the bottom edge, "start" the top
  function resizeBlock(event, block, edge = "end") {
    event.stopPropagation();
    beginPointer(event, { kind: edge === "start" ? "resize-start" : "resize", block, pressKey: block.id, start: block.startMinutes, end: block.endMinutes });
  }

  // ── Layout ──────────────────────────────────────────────────────────────
  // A block being dragged is laid out in the slot it will land in (so neighbors make room there) but
  // drawn where the pointer has it; carried off the schedule, it stays dimmed where it was
  const shownBlocks = blocks.map((block) => {
    if (returning?.kind === "move" && returning.block.id === block.id) return { ...block, leaving: true };
    if (drag?.block?.id !== block.id) return block;
    if (drag.kind === "move" && !drag.overGrid) return { ...block, leaving: true };
    return { ...block, startMinutes: drag.start, endMinutes: drag.end, rawStart: drag.rawStart, rawEnd: drag.rawEnd, dragging: true };
  });
  const preview = drag?.kind === "new" && drag.overGrid ? { id: "preview", preview: true, startMinutes: drag.start, endMinutes: drag.end, rawStart: drag.rawStart, rawEnd: drag.rawEnd, title: drag.title, course: drag.course, plannerOnly: drag.plannerOnly } : null;
  const laidOut = layoutColumns(
    [...timedItems.map((item) => ({ ...item, fixed: true })), ...shownBlocks, ...(preview ? [preview] : [])].map((item) => ({ item, start: item.startMinutes, end: item.endMinutes })),
  );

  const plannedDone = blocks.filter((block) => block.done).length;
  const label = dayLabel(dateKey, todayKey);
  const traySections = [
    { id: "overdue", title: dateKey === todayKey ? "Overdue" : `Due before ${parseDateKey(dateKey).toLocaleDateString(undefined, { weekday: "short" })}`, items: tray.overdue, tone: "text-danger-600" },
    { id: "today", title: dateKey === todayKey ? "Due today" : dateKey === addDays(todayKey, 1) ? "Due tomorrow" : "Due this day", items: tray.dueToday, tone: "text-todo-700" },
    { id: "undated", title: "No date", items: tray.undated, tone: "text-slate-500" },
    { id: "upcoming", title: "Upcoming", items: tray.upcoming, tone: "text-slate-500" },
  ];
  // The field under the tray says which day its items are for
  const inboxPlaceholder = dateKey === todayKey
    ? "Add something just for today…"
    : dateKey === addDays(todayKey, 1)
    ? "Add something for tomorrow…"
    : `Add something for ${parseDateKey(dateKey).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}…`;
  const nothingFound = searching && traySections.every((section) => section.items.length === 0) && inboxItems.length === 0;
  const showGhost = drag && (drag.kind === "new" ? !drag.overGrid : drag.kind === "move" && !drag.overGrid);
  // The picked-up row stays dimmed until its ghost has landed back on it
  const liftedKey = drag?.kind === "new" ? drag.pressKey : returning?.kind === "new" ? returning.pressKey : null;

  const controls = (
    <>
      <div className="flex shrink-0 items-center">
        <button type="button" onClick={() => goToDay(-1)} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Previous day" title="Previous day (←)">
          <ChevronLeftIcon />
        </button>
        <button type="button" onClick={() => goToDay(1)} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Next day" title="Next day (→)">
          <ChevronRightIcon />
        </button>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight text-slate-900">{label.title}</p>
        {label.date && <p className="truncate text-caption leading-tight text-slate-500">{label.date}</p>}
      </div>
      {/* Only offered once you've moved away from today; on today itself it would just repeat the title */}
      {dateKey !== todayKey && (
        <button
          type="button"
          onClick={goToToday}
          className="ml-1 shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300"
        >
          Today
        </button>
      )}
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
            className="field-tint mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none placeholder:text-slate-400 focus:bg-white"
          />
        </div>

        <div
          ref={listRef}
          onScroll={measureListEdges}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-2"
          style={{ maskImage: edgeMask(listEdges), WebkitMaskImage: edgeMask(listEdges) }}
        >
          {nothingFound && <p className="text-caption text-slate-500">No open tasks match “{query.trim()}”.</p>}
          {!searching && openTasks.length === 0 && inboxItems.length === 0 && <p className="text-caption text-slate-500">Nothing left to plan. Every task is done or on the schedule.</p>}
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
            placeholder={inboxPlaceholder}
            aria-label={`Add a planner item for ${label.date ?? label.title}`}
            className="field-tint w-full rounded-lg border border-dashed border-slate-300 bg-white px-2 py-1.5 text-xs outline-none placeholder:text-slate-400 focus:border-solid"
          />
        </form>
      </aside>

      <div key={dateKey} className={`flex min-w-0 flex-1 flex-col ${dayShift ? "planner-day-enter" : ""}`} style={{ "--day-shift": `${dayShift * 32}px` }}>
        {allDayItems.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-100 px-4 py-1.5">
            <span className="mr-1 text-caption font-semibold tracking-wide text-slate-500 uppercase">All day</span>
            {allDayItems.map((item) => (
              <button key={item.id} type="button" onClick={() => onEdit(item)} className="rounded px-1.5 py-0.5 text-caption" style={courseChipStyle(courseMap[item.courseId], item.completed)}>
                {item.title}
              </button>
            ))}
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex">
            <div className="relative w-14 shrink-0 text-right text-caption text-slate-400">
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} style={{ height: HOUR_HEIGHT }} className="-translate-y-1.5 pr-2">
                  {/* The now line's time takes the place of an hour label it would run into */}
                  {hour === 0 || (dateKey === todayKey && Math.abs(nowMinutes - hour * 60) < 20) ? "" : formatClock(hour * 60).replace(":00", "")}
                </div>
              ))}
              {dateKey === todayKey && (
                <span className="absolute right-1.5 -translate-y-1/2 rounded bg-white pl-0.5 font-semibold whitespace-nowrap text-danger-600 tabular-nums" style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}>
                  {/* Just the time ("11:05"): the hour labels around it already say AM or PM, and the gutter is narrow */}
                  {formatClock(nowMinutes).replace(/\s?[AP]M$/i, "")}
                </span>
              )}
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
                // While dragged, the item follows the pointer exactly and a dashed outline marks the slot it will snap to
                const following = item.rawStart !== undefined;
                const drawn = following
                  ? { ...position, top: (item.rawStart / 60) * HOUR_HEIGHT, height: Math.max(((item.rawEnd - item.rawStart) / 60) * HOUR_HEIGHT, 20) }
                  : position;
                const landing = following && <SlotLanding style={position} color={item.course && !item.plannerOnly ? getCourseColor(item.course) : null} />;
                if (item.preview) {
                  return (
                    <Fragment key="preview">
                      {landing}
                      <PlanBlock block={{ ...item, dragging: true }} style={drawn} compact={drawn.height < 40} ghost />
                    </Fragment>
                  );
                }
                return (
                  <Fragment key={item.id}>
                    {landing}
                    <PlanBlock
                      block={item}
                      style={drawn}
                      compact={drawn.height < 40}
                      pressed={pressedKey === item.id}
                      flash={flashId === item.id}
                      onPointerDown={(event) => dragBlock(event, item)}
                      onResize={(event, edge) => resizeBlock(event, item, edge)}
                      onToggle={() => toggleBlock(item)}
                      onRemove={() => unschedule(item)}
                    />
                  </Fragment>
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
  return <h3 className={`mb-1.5 text-caption font-semibold tracking-wide uppercase ${className}`}>{children}</h3>;
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
      {meta && <span className="shrink-0 text-caption text-slate-400">{meta}</span>}
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onSchedule}
        title="Schedule at the next free hour"
        aria-label={`Schedule ${title} at the next free hour`}
        className="row-action flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-course-600"
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </button>
      {onRemove && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
          aria-label={`Remove ${title}`}
          className="row-action flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-danger-500"
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

// Dark text on a light tint, with the category as a left stripe (as in the tray), so any category
// color stays readable. Done blocks fade to neutral; planner-only blocks are neutral so they never
// pass for a category. `ghost`: the copy that follows the pointer while dragging in from the tray.
function PlanBlock({ block, style, compact, pressed, flash, ghost = false, onPointerDown, onResize, onToggle, onRemove }) {
  const color = block.course ? getCourseColor(block.course) : null;
  const stripe = block.done ? "var(--color-slate-300)" : color ?? PLANNER_ONLY_STRIPE;
  const surface = block.done
    ? { backgroundColor: "var(--color-slate-50)", borderColor: "var(--color-slate-200)" }
    : color
    ? { backgroundColor: `color-mix(in srgb, ${color} 9%, white)`, borderColor: `${color}40` }
    : { backgroundColor: "var(--color-slate-50)", borderColor: "var(--color-slate-300)" };

  return (
    <div
      data-block-id={ghost ? undefined : block.id}
      onPointerDown={onPointerDown}
      className={`group absolute flex touch-none overflow-hidden rounded-lg border border-l-4 text-left transition-[opacity,box-shadow,scale] duration-150 ease-out ${ghost ? "pointer-events-none" : "cursor-grab"} ${
        block.done ? "text-slate-400" : "text-slate-800"
      } ${block.dragging ? "z-20 shadow-lg" : pressed ? "z-20 scale-[0.98] shadow-md" : "z-10 shadow-sm hover:shadow"} ${block.leaving ? "opacity-40" : ""} ${flash ? "planner-flash" : ""}`}
      style={{ ...style, ...surface, borderLeftColor: stripe }}
    >
      <div className={`flex min-w-0 flex-1 gap-1.5 px-1.5 ${compact ? "items-center" : "items-start py-1"}`}>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onToggle}
          aria-label={block.done ? `Mark ${block.title} not done` : `Mark ${block.title} done`}
          // 14px to look at, 26px to hit
          className={`task-complete-toggle relative mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px] before:absolute before:-inset-1.5 before:content-[''] ${block.done ? "border-success-500 bg-success-500 text-white" : "border-slate-400 bg-white hover:border-success-500"}`}
        >
          {block.done && (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-2.5 w-2.5"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 111.4-1.4l2.3 2.29 6.3-6.29a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
          )}
        </button>
        <div className={`min-w-0 flex-1 ${compact ? "flex items-baseline gap-1.5" : ""}`}>
          <p className={`truncate text-caption font-semibold ${block.done ? "line-through" : ""}`}>{block.title}</p>
          <p className={`truncate text-caption ${block.done ? "text-slate-400" : "text-slate-500"}`}>
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
      {/* Resize handles: the top edge moves the start, the bottom edge the end. The top one stops short
          of the corners so it never sits over the checkbox or the unschedule button. */}
      {!ghost && (
        <>
          <div onPointerDown={(event) => onResize(event, "start")} className="absolute top-0 right-6 left-6 flex h-[5px] cursor-ns-resize justify-center pt-px" aria-hidden="true">
            <span className={`h-1 w-6 rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-25 ${compact ? "hidden" : ""}`} />
          </div>
          <div onPointerDown={(event) => onResize(event, "end")} className={`absolute inset-x-0 bottom-0 flex cursor-ns-resize items-end justify-center pb-0.5 ${compact ? "h-1.5" : "h-2.5"}`} aria-hidden="true">
            <span className={`h-1 w-6 rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-25 ${compact ? "hidden" : ""}`} />
          </div>
        </>
      )}
    </div>
  );
}

// The slot a dragged block will snap to
function SlotLanding({ style, color }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 rounded-lg border-2 border-dashed"
      style={{ ...style, borderColor: color ? `${color}99` : "var(--color-slate-300)", backgroundColor: color ? `${color}0d` : "rgb(15 23 42 / 0.02)" }}
    />
  );
}

// Something already pinned to a time (an event, a timed task): dashed, so it reads as fixed rather
// than planned, but at full strength and with dark text so it stays legible
function FixedItem({ item, course, style, onEdit }) {
  const color = getCourseColor(course);
  return (
    <button
      type="button"
      onClick={() => onEdit(item)}
      title={`${item.title} (already scheduled)`}
      className={`absolute z-0 overflow-hidden rounded-lg border border-dashed px-2 py-1 text-left text-caption transition-colors hover:brightness-[0.98] ${item.completed ? "text-slate-400 line-through" : "text-slate-700"}`}
      style={{ ...style, backgroundColor: item.completed ? "var(--color-slate-50)" : `color-mix(in srgb, ${color} 8%, white)`, borderColor: item.completed ? "var(--color-slate-300)" : `${color}99` }}
    >
      <span className="font-semibold">{item.title}</span>
      <span className="ml-1.5 text-slate-500">{formatClock(item.startMinutes)}</span>
    </button>
  );
}
