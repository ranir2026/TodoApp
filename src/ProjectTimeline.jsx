import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import SegmentedControl from "./SegmentedControl";
import Collapsible, { Chevron } from "./Collapsible";
import { useLocalStorage } from "./useLocalStorage";
import { COLOR_PALETTE, getCourseColor } from "./courseColors";
import { parseDateKey, resolveTask } from "./occurrences";
import { addDays, daysBetween, formatClock, projectColor, timeToMinutes, toDateKey } from "./planner";
import { animateSpring } from "./spring";
import { CheckIcon, CloseIcon, PencilIcon, PlusIcon } from "./icons";
import TimelineTooltip from "./TimelineTooltip";

const LABEL_MIN = 180;
const LABEL_MAX = 560;
const LABEL_AUTO_MAX = 420;
const DAY_WIDTH = { weeks: 30, months: 10 };
const PROJECT_ROW = 44;
const ROW = 32;
const TASK_ROW = 28;
const DRAG_THRESHOLD = 4;
const VELOCITY_WINDOW = 100;

let measureContext = null;
// Width of a label in the app's font, so the name column can fit the longest name
function textWidth(text, font) {
  measureContext ??= document.createElement("canvas").getContext("2d");
  const family = getComputedStyle(document.body).fontFamily;
  measureContext.font = `${font} ${family}`;
  // The app opens small text up slightly (0.012em), so allow for it
  return measureContext.measureText(text).width * 1.02;
}

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function startOfWeekKey(key) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() - date.getDay());
  return toDateKey(date);
}

function shortDate(key) {
  return parseDateKey(key).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const earliest = (keys) => keys.reduce((min, key) => (key < min ? key : min));
const latest = (keys) => keys.reduce((max, key) => (key > max ? key : max));

// Dragging a bar by its middle moves it; dragging an edge moves just that end, never past the other
function shiftRange({ start, end }, mode, delta) {
  if (mode === "start") {
    const next = addDays(start, delta);
    return { start: next > end ? end : next, end };
  }
  if (mode === "end") {
    const next = addDays(end, delta);
    return { start, end: next < start ? start : next };
  }
  return { start: addDays(start, delta), end: addDays(end, delta) };
}

function milestoneTone(milestone, todayKey) {
  if (milestone.completed) return "reached";
  if (!milestone.dueDate) return "open";
  if (milestone.dueDate < todayKey) return "overdue";
  if (daysBetween(todayKey, milestone.dueDate) <= 7) return "soon";
  return "open";
}

export default function ProjectTimeline({ todos, courses, courseMap, toolbar, planner, updatePlanner, onAddTodo, onUpdateTodo, onEdit, onDeleteProject, onToggleTodo, onQuickAdd, quickAddProjectId, draft, bottomInset = 0 }) {
  const [zoom, setZoom] = useLocalStorage("timelineZoom", "weeks");
  // null means "fit the longest name"; dragging the column's edge sets a width of your own
  const [labelOverride, setLabelOverride] = useLocalStorage("timelineLabelWidth", null);
  const [creating, setCreating] = useState(false);
  // Bumped each time the form opens so its fields start fresh and play their entrance again
  const [formKey, setFormKey] = useState(0);
  const [colorMenu, setColorMenu] = useState(null);
  const [createdId, setCreatedId] = useState(null);
  // Milestones whose task list is dropped down in the projects panel
  const [openMilestones, setOpenMilestones] = useState(() => new Set());
  const toggleMilestoneList = (id) => setOpenMilestones((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const [popover, setPopover] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [drag, setDrag] = useState(null);
  const [pressed, setPressed] = useState(null);
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const settleRef = useRef(null);
  const tooltipRef = useRef(null);
  const tipTimerRef = useRef(null);
  const tipHiddenAtRef = useRef(0);
  const tipOpenRef = useRef(false);
  const runningSettleRef = useRef(null);

  const dayWidth = DAY_WIDTH[zoom] ?? DAY_WIDTH.weeks;
  const todayKey = toDateKey(new Date());
  const { projects } = planner;
  const projectIds = new Set(projects.map((project) => project.id));
  const projectTodos = todos.filter((todo) => todo.projectId && projectIds.has(todo.projectId));

  // Fit the name column to its longest label: project rows (chevron, color, name, count), phases, and milestones
  const autoLabelWidth = useMemo(() => {
    let widest = 0;
    for (const project of projects) {
      const items = projectTodos.filter((todo) => todo.projectId === project.id);
      const taskCount = items.filter((todo) => todo.type !== "milestone").length;
      widest = Math.max(widest, 12 + 18 + 6 + 16 + 6 + textWidth(project.name, "600 14px") + (taskCount ? 6 + textWidth(`${taskCount}/${taskCount}`, "400 11px") : 0) + 8);
      if (project.collapsed) continue;
      for (const phase of project.phases ?? []) widest = Math.max(widest, 32 + textWidth(phase.name, "400 12px") + 8);
      for (const milestone of items.filter((todo) => todo.type === "milestone")) {
        widest = Math.max(widest, 12 + 16 + 4 + 8 + 6 + textWidth(milestone.title, "400 12px") + 6 + textWidth("00/00", "400 11px") + 8);
        if (openMilestones.has(milestone.id)) {
          for (const task of items.filter((todo) => todo.milestoneId === milestone.id)) {
            widest = Math.max(widest, 28 + 14 + 8 + textWidth(task.title, "400 12px") + 8 + textWidth("Nov 30", "400 11px") + 8);
          }
        }
      }
    }
    return Math.round(Math.min(Math.max(widest + 12, LABEL_MIN + 52), LABEL_AUTO_MAX));
  }, [projects, projectTodos, openMilestones]);
  const labelWidth = Math.min(Math.max(labelOverride ?? autoLabelWidth, LABEL_MIN), LABEL_MAX);

  function startLabelResize(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = labelWidth;
    document.body.style.cursor = "col-resize";
    const handleMove = (moveEvent) => setLabelOverride(Math.round(Math.min(Math.max(startWidth + moveEvent.clientX - startX, LABEL_MIN), LABEL_MAX)));
    const handleUp = () => {
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }

  // The visible range covers every project with some room on both sides, starting on a Sunday
  // so the weekend shading lines up
  const keys = [todayKey];
  for (const project of projects) {
    keys.push(project.startDate, project.endDate);
    for (const phase of project.phases ?? []) keys.push(phase.start, phase.end);
  }
  for (const todo of projectTodos) if (todo.dueDate) keys.push(todo.dueDate);
  if (draft?.dueDate) keys.push(draft.dueDate);
  const rangeStart = startOfWeekKey(addDays(earliest(keys), -14));
  const rangeEnd = addDays(latest(keys), zoom === "weeks" ? 45 : 120);
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
  const timelineWidth = totalDays * dayWidth;
  const xOf = (key) => daysBetween(rangeStart, key) * dayWidth;

  // Adding something earlier than the range grows it to the left; keep the view where it was
  const previousStartRef = useRef(rangeStart);
  useLayoutEffect(() => {
    const previous = previousStartRef.current;
    previousStartRef.current = rangeStart;
    if (previous !== rangeStart && scrollRef.current) scrollRef.current.scrollLeft += daysBetween(rangeStart, previous) * dayWidth;
  }, [rangeStart, dayWidth]);

  // After a drop, the item glides from where the pointer let go into the day it snapped to,
  // carrying the pointer's speed so there is no seam between dragging and settling
  useLayoutEffect(() => {
    const settle = settleRef.current;
    if (!settle) return;
    settleRef.current = null;
    const elements = [...rootRef.current.querySelectorAll(settle.keys.map((key) => `[data-drag-key="${key}"]`).join(","))].map((element) => ({
      element,
      left: parseFloat(element.style.left),
      width: parseFloat(element.style.width),
    }));
    const distance = settle.point || Math.abs(settle.dLeft) >= Math.abs(settle.dWidth) ? settle.dLeft : settle.dWidth;
    if (!elements.length || Math.abs(distance) < 1 || prefersReducedMotion()) return;
    const apply = (offset) => {
      const t = offset / distance;
      for (const { element, left, width } of elements) {
        element.style.left = `${left + settle.dLeft * t}px`;
        if (!settle.point) element.style.width = `${width + settle.dWidth * t}px`;
      }
    };
    apply(distance);
    const cancel = animateSpring({ from: distance, to: 0, velocity: settle.velocity, damping: 1, response: 0.3, onUpdate: apply, onComplete: () => { runningSettleRef.current = null; } });
    runningSettleRef.current = () => {
      cancel();
      apply(0);
    };
  });

  useLayoutEffect(() => {
    if (!createdId) return;
    const row = scrollRef.current?.querySelector(`[data-project-id="${createdId}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [createdId]);

  // Keep the quick add's project, and the spot its task will land, in view above the docked panel
  function revealInScroller(element, { horizontal = false } = {}) {
    const scroller = scrollRef.current;
    if (!scroller || !element) return;
    const view = scroller.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    const visibleBottom = view.bottom - bottomInset;
    let top = scroller.scrollTop;
    if (rect.top < view.top + 40) top -= view.top + 40 - rect.top;
    else if (rect.bottom > visibleBottom - 8) top += rect.bottom - (visibleBottom - 8);
    let left = scroller.scrollLeft;
    if (horizontal) {
      if (rect.left < view.left + labelWidth + 16) left -= view.left + labelWidth + 16 - rect.left;
      else if (rect.right > view.right - 16) left += rect.right - (view.right - 16);
    }
    if (top !== scroller.scrollTop || left !== scroller.scrollLeft) scroller.scrollTo({ top, left, behavior });
  }

  useLayoutEffect(() => {
    if (!quickAddProjectId) return;
    revealInScroller(scrollRef.current?.querySelector(`[data-project-id="${quickAddProjectId}"] > div`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAddProjectId]);

  useLayoutEffect(() => {
    if (!draft?.dueDate) return;
    revealInScroller(scrollRef.current?.querySelector("[data-draft-dot]"), { horizontal: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.projectId, draft?.milestoneId, draft?.dueDate]);

  useLayoutEffect(() => {
    scrollToToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  function scrollToToday() {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollLeft = Math.max(0, xOf(todayKey) - (scroller.clientWidth - labelWidth) * 0.2);
  }

  // ── Planner updates ─────────────────────────────────────────────────────
  function updateProject(id, patch) {
    updatePlanner((current) => ({
      ...current,
      projects: current.projects.map((project) => (project.id === id ? { ...project, ...(typeof patch === "function" ? patch(project) : patch) } : project)),
    }));
  }

  // A project's span grows to fit anything added or moved outside it
  function extendProject(id, dates) {
    updateProject(id, (project) => ({
      startDate: earliest([project.startDate, ...dates]),
      endDate: latest([project.endDate, ...dates]),
    }));
  }

  function updatePhase(projectId, phaseId, patch) {
    updateProject(projectId, (project) => ({
      phases: project.phases.map((phase) => (phase.id === phaseId ? { ...phase, ...patch } : phase)),
    }));
  }

  function deletePhase(projectId, phaseId) {
    updateProject(projectId, (project) => ({ phases: project.phases.filter((phase) => phase.id !== phaseId) }));
  }

  function openCreate() {
    if (creating) return;
    setFormKey((key) => key + 1);
    setCreating(true);
  }

  function createProject({ name, courseId, color, startDate, endDate }) {
    const id = crypto.randomUUID();
    updatePlanner((current) => ({
      ...current,
      projects: [...current.projects, { id, name, courseId, color: color ?? null, startDate, endDate: endDate < startDate ? startDate : endDate, collapsed: false, phases: [] }],
    }));
    setCreating(false);
    setCreatedId(id);
  }



  // The color menu opens from the swatch that was clicked
  function openColorMenu(event, { value, categoryColor, onChange }) {
    const root = rootRef.current.getBoundingClientRect();
    const anchor = event.currentTarget.getBoundingClientRect();
    const x = Math.max(Math.min(anchor.left - root.left - 8, root.width - 208), 8);
    const y = Math.min(anchor.bottom - root.top + 6, root.height - 150);
    setColorMenu({ x, y, originX: anchor.left - root.left + anchor.width / 2 - x, originY: anchor.top - root.top - y, value, categoryColor, onChange });
  }

  function addItem(project, { kind, title, date, endDate, milestoneId }) {
    if (kind === "phase") {
      const end = endDate && endDate >= date ? endDate : date;
      updateProject(project.id, (current) => ({ phases: [...(current.phases ?? []), { id: crypto.randomUUID(), name: title, start: date, end }] }));
      extendProject(project.id, [date, end]);
    } else {
      onAddTodo({
        type: kind,
        title,
        dueDate: date,
        courseId: project.courseId && courseMap[project.courseId] && !courseMap[project.courseId].archived ? project.courseId : null,
        projectId: project.id,
        milestoneId: kind === "task" ? milestoneId || null : null,
        priority: "normal",
        repeat: "none",
      });
      extendProject(project.id, [date]);
    }
    setPopover(null);
  }

  function commitRename() {
    if (!renaming) return;
    const value = renaming.value.trim();
    if (value && renaming.kind === "project") updateProject(renaming.id, { name: value });
    if (value && renaming.kind === "phase") updatePhase(renaming.projectId, renaming.id, { name: value });
    setRenaming(null);
  }

  // ── Dragging (horizontal, whole days) ───────────────────────────────────
  // Pixel offsets of where the item was let go, relative to where it snaps
  function releaseOffsets({ range, mode, delta, dx }) {
    const width = (daysBetween(range.start, range.end) + 1) * dayWidth;
    const snapped = shiftRange(range, mode, delta);
    const snappedShift = daysBetween(range.start, snapped.start) * dayWidth;
    const snappedWidth = (daysBetween(snapped.start, snapped.end) + 1) * dayWidth;
    let left = dx;
    let releasedWidth = width;
    if (mode === "start") {
      left = Math.min(dx, width - dayWidth);
      releasedWidth = width - left;
    } else if (mode === "end") {
      left = 0;
      releasedWidth = Math.max(width + dx, dayWidth);
    }
    return { dLeft: left - snappedShift, dWidth: releasedWidth - snappedWidth };
  }

  function beginDrag(event, state) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    // A stack's card stays up through a click (it's how you read the stack); it goes once a drag starts
    if (state.kind !== "group") hideTip();
    runningSettleRef.current?.();
    runningSettleRef.current = null;
    dragRef.current = { ...state, originX: event.clientX, active: false, delta: 0, dx: 0, samples: [] };
    setPressed(`${state.kind}:${state.id}`);

    const handleMove = (moveEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const dx = moveEvent.clientX - current.originX;
      if (!current.active && Math.abs(dx) < DRAG_THRESHOLD) return;
      if (!current.active) hideTip();
      const now = performance.now();
      current.samples = [...current.samples.filter((sample) => now - sample.time < VELOCITY_WINDOW), { x: moveEvent.clientX, time: now }];
      current.active = true;
      current.dx = dx;
      current.delta = Math.round(dx / dayWidth);
      setDrag({ ...current });
    };
    const stop = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      setPressed(null);
    };
    const handleUp = () => {
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
      const velocity = first && last && last.time > first.time ? ((last.x - first.x) / (last.time - first.time)) * 1000 : 0;
      // A stack of tasks settles together with each of its tasks' dots in the dropped-down lists
      const keys = current.kind === "group" ? [`group:${current.id}`, ...current.ids.map((id) => `todo:${id}`)] : [`${current.kind}:${current.id}`];
      settleRef.current = { keys, point: current.kind === "todo" || current.kind === "group", velocity, ...releaseOffsets(current) };
      if (current.delta !== 0) commitDrag(current);
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

  function commitDrag({ kind, id, ids, projectId, mode, range, delta }) {
    const next = shiftRange(range, mode, delta);
    if (kind === "group") {
      for (const taskId of ids) onUpdateTodo(taskId, { dueDate: next.start });
      extendProject(projectId, [next.start]);
    }
    if (kind === "project") updateProject(id, { startDate: next.start, endDate: next.end });
    if (kind === "phase") {
      updatePhase(projectId, id, next);
      extendProject(projectId, [next.start, next.end]);
    }
    if (kind === "todo") {
      onUpdateTodo(id, { dueDate: next.start });
      extendProject(projectId, [next.start]);
    }
  }

  function liveRange(kind, id, range) {
    return drag && drag.kind === kind && drag.id === id ? shiftRange(range, drag.mode, drag.delta) : range;
  }

  const isDragging = (kind, id) => Boolean(drag?.active && drag.kind === kind && drag.id === id);

  // While dragged, a bar follows the pointer exactly; `landing` outlines the days it will snap to
  function barGeometry(kind, id, range) {
    const left = xOf(range.start);
    const width = (daysBetween(range.start, range.end) + 1) * dayWidth;
    if (!isDragging(kind, id)) return { left, width, landing: null };
    const snapped = shiftRange(range, drag.mode, drag.delta);
    const landing = { left: xOf(snapped.start), width: (daysBetween(snapped.start, snapped.end) + 1) * dayWidth };
    if (drag.mode === "start") {
      const shift = Math.min(drag.dx, width - dayWidth);
      return { left: left + shift, width: width - shift, landing };
    }
    if (drag.mode === "end") return { left, width: Math.max(width + drag.dx, dayWidth), landing };
    return { left: left + drag.dx, width, landing };
  }

  // A task moves with the pointer when it's dragged on its own or as part of a stack
  const isMoving = (id) => isDragging("todo", id) || Boolean(drag?.active && drag.kind === "group" && drag.ids.includes(id));

  function pointGeometry(todo) {
    const left = xOf(todo.dueDate) + dayWidth / 2;
    if (!isMoving(todo.id)) return { left, landing: null };
    return { left: left + drag.dx, landing: xOf(addDays(todo.dueDate, drag.delta)) + dayWidth / 2 };
  }

  function barHandlers(kind, id, projectId, range, onClick) {
    const start = (mode) => (event) => beginDrag(event, { kind, id, projectId, mode, range, onClick: mode === "move" ? onClick : undefined });
    return { move: start("move"), start: start("start"), end: start("end") };
  }

  function openPopover(event, project, { kind = "milestone", date } = {}) {
    const root = rootRef.current.getBoundingClientRect();
    let key = date;
    if (!key) {
      const cell = event.currentTarget.getBoundingClientRect();
      key = addDays(rangeStart, Math.floor((event.clientX - cell.left) / dayWidth));
    }
    const clickX = event.clientX - root.left;
    const clickY = event.clientY - root.top;
    const x = Math.max(Math.min(clickX, root.width - 300), 8);
    const y = Math.max(Math.min(clickY + 8, root.height - 260), 8);
    // The popover grows out of the point that was clicked
    setPopover({ projectId: project.id, kind, date: key, x, y, originX: clickX - x, originY: clickY - y });
  }

  // ── Hover cards ─────────────────────────────────────────────────────────
  // Shown after a short pause; once one is up, moving to a neighbor swaps instantly ("warm"), like
  // system tooltips. Points anchor the arrow at their center; bars at the pointer along the bar.
  // A point's card can be hovered: leaving the point waits a beat before hiding, and reaching the
  // card in that time keeps it open (so a stack's task list can be clicked).
  function hideTip() {
    clearTimeout(tipTimerRef.current);
    if (tooltipRef.current) tooltipRef.current.hide();
    tipOpenRef.current = false;
    tipHiddenAtRef.current = performance.now();
  }

  function hideTipSoon() {
    clearTimeout(tipTimerRef.current);
    tipTimerRef.current = setTimeout(hideTip, 160);
  }

  function tipHandlers(key, getContent, anchor = "point") {
    const place = (event) => {
      const root = rootRef.current.getBoundingClientRect();
      const rect = event.currentTarget.getBoundingClientRect();
      const x = anchor === "point" ? rect.left + rect.width / 2 : Math.min(Math.max(event.clientX, rect.left + 8), rect.right - 8);
      return { x: x - root.left, top: rect.top - root.top, bottom: rect.bottom - root.top, width: root.width };
    };
    return {
      onPointerEnter: (event) => {
        if (event.pointerType !== "mouse" || dragRef.current) return;
        clearTimeout(tipTimerRef.current);
        const position = place(event);
        const show = () => {
          tipOpenRef.current = true;
          tooltipRef.current?.show({ key, content: getContent(), interactive: anchor === "point", ...position });
        };
        if (tipOpenRef.current || performance.now() - tipHiddenAtRef.current < 300) show();
        else tipTimerRef.current = setTimeout(show, 180);
      },
      onPointerMove: anchor === "bar" ? (event) => { if (!dragRef.current) tooltipRef.current?.move(place(event).x); } : undefined,
      onPointerLeave: anchor === "point" ? hideTipSoon : hideTip,
    };
  }

  // Several tasks due the same day in one row share a stack of dots. A stack that shows every task
  // as a dot (up to three) gets one card per task; a bigger one gets a single card listing them all.
  function stackTip(stack, date, milestone, color) {
    const select = (task) => () => {
      hideTip();
      onEdit(task.raw);
    };
    if (stack.length <= STACK_MAX) return stack.map((task) => ({ ...taskTip(task.raw, color), onSelect: select(task) }));
    const open = stack.filter((task) => !task.resolved.completed);
    const days = daysBetween(todayKey, date);
    const status = !open.length
      ? { label: "All done", tone: "success" }
      : days < 0
      ? { label: `${open.length} overdue`, tone: "danger" }
      : { label: `Due ${fromNow(date)}`, tone: days <= 2 ? "urgent" : "neutral" };
    return {
      kind: "Tasks",
      color,
      title: `${stack.length} tasks · ${longDate(date)}`,
      lines: [milestone ? `Count toward ◆ ${milestone.title}` : "Not tied to a milestone"],
      status,
      items: stack.map((task) => ({
        id: task.raw.id,
        title: task.raw.title,
        done: task.resolved.completed,
        overdue: !task.resolved.completed && days < 0,
        meta: task.raw.startTime ? formatClock(timeToMinutes(task.raw.startTime)) : null,
        onSelect: select(task),
      })),
    };
  }

  const longDate = (key) => parseDateKey(key).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const dayCount = (start, end) => `${daysBetween(start, end) + 1} ${daysBetween(start, end) === 0 ? "day" : "days"}`;
  function fromNow(key) {
    const days = daysBetween(todayKey, key);
    if (days === 0) return "today";
    if (days === 1) return "tomorrow";
    if (days === -1) return "yesterday";
    return days > 0 ? `in ${days} days` : `${-days} days ago`;
  }
  // Where a span sits relative to today
  function spanStatus(start, end) {
    if (todayKey < start) return { label: `Starts ${fromNow(start)}`, tone: "neutral" };
    if (todayKey > end) return { label: "Finished", tone: "neutral" };
    return { label: "In progress", tone: "success" };
  }

  function taskTip(task, color) {
    const resolved = resolveTask(task);
    const milestone = task.milestoneId ? projectTodos.find((todo) => todo.id === task.milestoneId) : null;
    const time = task.startTime ? ` at ${formatClock(timeToMinutes(task.startTime))}` : "";
    const days = daysBetween(todayKey, task.dueDate);
    const status = resolved.completed
      ? { label: "Done", tone: "success" }
      : days < 0
      ? { label: "Overdue", tone: "danger" }
      : { label: `Due ${fromNow(task.dueDate)}`, tone: days <= 2 ? "urgent" : "neutral" };
    return {
      kind: "Task",
      color,
      title: task.title,
      lines: [`Due ${longDate(task.dueDate)}${time}`, milestone ? `Counts toward \u25c6 ${milestone.title}` : "Not tied to a milestone"],
      status,
    };
  }

  function milestoneTip(milestone, color) {
    const tone = milestoneTone(milestone, todayKey);
    const status = tone === "reached"
      ? { label: "Reached", tone: "success" }
      : tone === "overdue"
      ? { label: "Overdue", tone: "danger" }
      : { label: `Due ${fromNow(milestone.dueDate)}`, tone: tone === "soon" ? "urgent" : "neutral" };
    return {
      kind: "Milestone",
      color,
      title: milestone.title,
      lines: [`Due ${longDate(milestone.dueDate)}`, ...(milestone.progress?.total ? [] : ["No tasks linked yet"])],
      status,
      progress: milestone.progress,
    };
  }

  // ── Header ──────────────────────────────────────────────────────────────
  const months = [];
  for (let i = 0; i < totalDays; i++) {
    const key = addDays(rangeStart, i);
    const monthKey = key.slice(0, 7);
    if (months.at(-1)?.key !== monthKey) months.push({ key: monthKey, start: i, days: 0, label: parseDateKey(key).toLocaleDateString(undefined, { month: zoom === "weeks" ? "long" : "short", year: "numeric" }) });
    months.at(-1).days += 1;
  }
  const weekendShading = zoom === "weeks"
    ? `repeating-linear-gradient(to right, var(--color-slate-50) 0 ${dayWidth}px, transparent ${dayWidth}px ${dayWidth * 6}px, var(--color-slate-50) ${dayWidth * 6}px ${dayWidth * 7}px)`
    : `repeating-linear-gradient(to right, var(--color-slate-100) 0 1px, transparent 1px ${dayWidth * 7}px)`;

  const activeProject = popover ? projects.find((project) => project.id === popover.projectId) : null;

  const controls = (
    <>
      <button type="button" onClick={openCreate} className="flex shrink-0 items-center gap-1 rounded-lg bg-course-500 py-1 pr-2.5 pl-2 text-xs font-medium text-white hover:bg-course-600">
        <PlusIcon className="h-3.5 w-3.5" />
        Project
      </button>
      <button type="button" onClick={scrollToToday} className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300">
        Today
      </button>
      <div className="flex-1" />
      <SegmentedControl label="Timeline zoom" className="inline-grid shrink-0" segmentClassName="px-3" options={[{ id: "weeks", label: "Weeks" }, { id: "months", label: "Months" }]} value={zoom} onChange={setZoom} />
    </>
  );

  return (
    <div ref={rootRef} className={`relative flex h-full min-h-0 flex-col select-none ${drag ? "cursor-grabbing" : ""}`}>
      {toolbar && createPortal(controls, toolbar)}

      <Collapsible open={creating || projects.length === 0}>
        <NewProjectForm
          key={formKey}
          courses={courses}
          todayKey={todayKey}
          canCancel={projects.length > 0}
          focusName={formKey > 0}
          onCreate={createProject}
          onCancel={() => setCreating(false)}
          onPickColor={openColorMenu}
        />
      </Collapsible>

      <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={hideTip} className="absolute inset-0 overflow-auto">
        <div className="relative flex min-h-full flex-col" style={{ width: labelWidth + timelineWidth, "--label-width": `${labelWidth}px` }}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0" style={{ left: labelWidth, width: timelineWidth, backgroundImage: weekendShading }} />
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-10 w-px bg-danger-500/60" style={{ left: labelWidth + xOf(todayKey) + dayWidth / 2 }} />

          <div className="sticky top-0 z-30 flex border-b border-slate-200 bg-white">
            <div className="sticky left-0 z-10 flex shrink-0 items-end border-r border-slate-100 bg-white px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase" style={{ width: "var(--label-width)" }}>
              Projects
            </div>
            <div className="relative shrink-0" style={{ width: timelineWidth, height: 40 }}>
              {months.map((month) => (
                <div key={month.key} className="absolute top-0 truncate border-l border-slate-100 px-1.5 pt-1 text-[11px] font-semibold text-slate-600" style={{ left: month.start * dayWidth, width: month.days * dayWidth }}>
                  {month.label}
                </div>
              ))}
              {Array.from({ length: totalDays }, (_, i) => {
                const key = addDays(rangeStart, i);
                const date = parseDateKey(key);
                if (zoom === "months" && date.getDay() !== 0) return null;
                const isToday = key === todayKey;
                return (
                  <div key={key} className={`absolute bottom-1 text-center text-[11px] ${isToday ? "font-bold text-danger-600" : date.getDay() === 0 || date.getDay() === 6 ? "text-slate-400" : "text-slate-500"}`} style={{ left: i * dayWidth, width: zoom === "weeks" ? dayWidth : dayWidth * 7, textAlign: zoom === "weeks" ? "center" : "left" }}>
                    {date.getDate()}
                  </div>
                );
              })}
            </div>
          </div>

          {projects.map((project) => {
            const color = projectColor(project, courseMap);
            const items = projectTodos.filter((todo) => todo.projectId === project.id);
            const milestones = items.filter((todo) => todo.type === "milestone").sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
            const milestoneIds = new Set(milestones.map((milestone) => milestone.id));
            const tasks = items.filter((todo) => todo.type !== "milestone").map((todo) => ({ raw: todo, resolved: resolveTask(todo) }));
            const looseTasks = tasks.filter((task) => !milestoneIds.has(task.raw.milestoneId));
            const doneCount = tasks.filter((task) => task.resolved.completed).length;
            const span = liveRange("project", project.id, { start: project.startDate, end: project.endDate });
            const spanGeometry = barGeometry("project", project.id, { start: project.startDate, end: project.endDate });
            const spanHandlers = barHandlers("project", project.id, project.id, { start: project.startDate, end: project.endDate });
            const phases = project.phases ?? [];
            const isEmpty = !phases.length && !items.length;
            // While a quick add is open for this project it stays expanded and shows where the task will land
            const draftHere = draft?.projectId === project.id ? draft : null;
            const quickAddHere = quickAddProjectId === project.id;
            const expanded = !project.collapsed || quickAddHere;

            const renderPoint = (todo, kind) => {
              const { left, landing } = pointGeometry(todo);
              const handlers = barHandlers("todo", todo.id, project.id, { start: todo.dueDate, end: todo.dueDate }, () => onEdit(todo));
              const dragKey = `todo:${todo.id}`;
              const tip = tipHandlers(dragKey, () => (kind === "milestone" ? milestoneTip(todo, color) : taskTip(todo, color)));
              const state = { dragKey, pressed: pressed === dragKey, onPointerDown: handlers.move, tip };
              return (
                <span key={todo.id} className="contents">
                  {landing !== null && <PointLanding left={landing} diamond={kind === "milestone"} color={color} />}
                  {kind === "milestone"
                    ? <Diamond milestone={todo} tone={milestoneTone(todo, todayKey)} color={color} left={left} {...state} />
                    : <TaskDot task={todo} done={resolveTask(todo).completed} overdue={!resolveTask(todo).completed && todo.dueDate < todayKey} color={color} left={left} {...state} />}
                </span>
              );
            };

            // Tasks due the same day stack up; a task being dragged on its own leaves its stack while it moves
            const renderStacks = (dated, milestone) => {
              const byDate = new Map();
              for (const task of dated) {
                if (isDragging("todo", task.raw.id)) {
                  byDate.set(`solo:${task.raw.id}`, [task]);
                  continue;
                }
                byDate.set(task.raw.dueDate, [...(byDate.get(task.raw.dueDate) ?? []), task]);
              }
              return [...byDate.values()].map((stack) => {
                if (stack.length === 1) return renderPoint(stack[0].raw, "task");
                const sorted = [...stack].sort((a, b) => (a.raw.startTime ?? "").localeCompare(b.raw.startTime ?? "") || a.raw.title.localeCompare(b.raw.title));
                const ids = sorted.map((task) => task.raw.id);
                const id = [...ids].sort()[0];
                const date = sorted[0].raw.dueDate;
                const dragKey = `group:${id}`;
                const { left, landing } = pointGeometry(sorted[0].raw);
                return (
                  <span key={dragKey} className="contents">
                    {landing !== null && <PointLanding left={landing} color={color} />}
                    <TaskStack
                      tasks={sorted}
                      date={date}
                      todayKey={todayKey}
                      color={color}
                      left={left}
                      dragKey={dragKey}
                      pressed={pressed === dragKey}
                      tip={tipHandlers(dragKey, () => stackTip(sorted, date, milestone, color))}
                      onPointerDown={(event) => beginDrag(event, { kind: "group", id, ids, projectId: project.id, mode: "move", range: { start: date, end: date } })}
                    />
                  </span>
                );
              });
            };

            const pointRow = (key, label, rowTasks, milestone) => {
              const dated = rowTasks.filter((task) => task.raw.dueDate);
              const undated = rowTasks.length - dated.length;
              const lineXs = [...dated.map((task) => pointGeometry(task.raw).left), ...(milestone?.dueDate ? [pointGeometry(milestone).left] : [])];
              const draftInRow = draftHere?.dueDate && (milestone ? draftHere.milestoneId === milestone.id : !draftHere.milestoneId) ? draftHere : null;
              return (
                <Row
                  key={key}
                  height={ROW}
                  label={label}
                  sublabel={undated ? `${undated} undated` : null}
                  onTimelineDoubleClick={(event) => openPopover(event, project, { kind: "task" })}
                >
                  {lineXs.length > 1 && (
                    <div className="absolute top-1/2 h-px -translate-y-1/2" style={{ left: Math.min(...lineXs), width: Math.max(...lineXs) - Math.min(...lineXs), backgroundColor: `${color}66` }} />
                  )}
                  {renderStacks(dated, milestone)}
                  {milestone?.dueDate && renderPoint(milestone, "milestone")}
                  {draftInRow && <DraftDot left={xOf(draftInRow.dueDate) + dayWidth / 2} title={draftInRow.title} color={color} />}
                </Row>
              );
            };

            return (
              <div key={project.id} data-project-id={project.id} className={`border-b border-slate-100 transition-colors ${project.id === createdId ? "planner-row-enter" : ""}`} style={quickAddHere ? { backgroundColor: `${color}0d` } : undefined}>
                <Row
                  height={PROJECT_ROW}
                  label={
                    <div className="group/label relative flex min-w-0 items-center gap-1.5">
                      <button type="button" onClick={() => updateProject(project.id, { collapsed: !project.collapsed })} className="-ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={project.collapsed ? `Expand ${project.name}` : `Collapse ${project.name}`} aria-expanded={!project.collapsed}>
                        <Chevron open={expanded} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => openColorMenu(event, {
                          value: project.color ?? null,
                          categoryColor: getCourseColor(courseMap[project.courseId]),
                          onChange: (next) => updateProject(project.id, { color: next }),
                        })}
                        className="-mx-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-slate-100"
                        aria-label={`Change ${project.name} color`}
                        title="Change color"
                      >
                        <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 ring-inset" style={{ backgroundColor: color }} />
                      </button>
                      {renaming?.kind === "project" && renaming.id === project.id ? (
                        <RenameInput value={renaming.value} onChange={(value) => setRenaming({ ...renaming, value })} onCommit={commitRename} onCancel={() => setRenaming(null)} />
                      ) : (
                        <button type="button" onClick={() => setRenaming({ kind: "project", id: project.id, value: project.name })} className="line-clamp-2 min-w-0 text-left text-sm leading-tight font-semibold break-words text-slate-800 hover:text-course-600" title={`${project.name} (click to rename)`}>
                          {project.name}
                        </button>
                      )}
                      {tasks.length > 0 && <span className="shrink-0 text-[11px] text-slate-500">{doneCount}/{tasks.length}</span>}
                      <HoverActions>
                        {onQuickAdd && (
                          <button type="button" onClick={() => onQuickAdd(project.id)} className="flex h-6 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-course-600" aria-label={`Quick add a task to ${project.name}`} title="Quick add a task to this project">
                            <PlusIcon className="h-3 w-3" />
                            Task
                          </button>
                        )}
                        <button type="button" onClick={(event) => openPopover(event, project, { date: todayKey >= project.startDate && todayKey <= project.endDate ? todayKey : project.startDate })} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-course-600" aria-label={`Add to ${project.name}`} title="Add a phase, milestone, or task on a date">
                          <PlusIcon className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => onDeleteProject(project.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-danger-500" aria-label={`Delete ${project.name}`} title="Delete project and its tasks">
                          <CloseIcon className="h-3.5 w-3.5" />
                        </button>
                      </HoverActions>
                    </div>
                  }
                  sublabel={`${shortDate(span.start)} – ${shortDate(span.end)}`}
                  onTimelineDoubleClick={(event) => openPopover(event, project)}
                >
                  {spanGeometry.landing && <BarLanding {...spanGeometry.landing} height={14} color={color} />}
                  <Bar
                    dragKey={`project:${project.id}`}
                    left={spanGeometry.left}
                    width={spanGeometry.width}
                    height={10}
                    style={{ backgroundColor: `${color}33`, color, boxShadow: `inset 0 0 0 1px ${color}55` }}
                    tip={tipHandlers(`project:${project.id}`, () => ({
                      kind: "Project",
                      color,
                      title: project.name,
                      lines: [`${longDate(span.start)} \u2013 ${longDate(span.end)}`, dayCount(span.start, span.end)],
                      status: spanStatus(span.start, span.end),
                      progress: { done: doneCount, total: tasks.length },
                    }), "bar")}
                    handlers={spanHandlers}
                    active={isDragging("project", project.id)}
                    pressed={pressed === `project:${project.id}`}
                  >
                    <div className="h-full rounded-full" style={{ width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%`, backgroundColor: `${color}99` }} />
                  </Bar>
                  {milestones.filter((milestone) => milestone.dueDate).map((milestone) => renderPoint(milestone, "milestone"))}
                </Row>

                {expanded && (
                  <>
                    {phases.map((phase) => {
                      const range = liveRange("phase", phase.id, { start: phase.start, end: phase.end });
                      const geometry = barGeometry("phase", phase.id, { start: phase.start, end: phase.end });
                      const width = geometry.width;
                      return (
                        <Row
                          key={phase.id}
                          height={ROW}
                          indent
                          label={
                            <div className="group/label relative flex min-w-0 items-center gap-1.5">
                              {renaming?.kind === "phase" && renaming.id === phase.id ? (
                                <RenameInput value={renaming.value} onChange={(value) => setRenaming({ ...renaming, value })} onCommit={commitRename} onCancel={() => setRenaming(null)} />
                              ) : (
                                <button type="button" onClick={() => setRenaming({ kind: "phase", projectId: project.id, id: phase.id, value: phase.name })} className="line-clamp-2 min-w-0 text-left text-xs leading-tight break-words text-slate-600 hover:text-course-600" title={`${phase.name} (click to rename)`}>
                                  {phase.name}
                                </button>
                              )}
                              <HoverActions>
                                <button type="button" onClick={() => deletePhase(project.id, phase.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-danger-500" aria-label={`Delete phase ${phase.name}`}>
                                  <CloseIcon className="h-3.5 w-3.5" />
                                </button>
                              </HoverActions>
                            </div>
                          }
                          onTimelineDoubleClick={(event) => openPopover(event, project, { kind: "phase" })}
                        >
                          {geometry.landing && <BarLanding {...geometry.landing} height={24} rounded="rounded-lg" color={color} />}
                          <Bar
                            dragKey={`phase:${phase.id}`}
                            left={geometry.left}
                            width={width}
                            height={20}
                            rounded="rounded-md"
                            style={{ backgroundColor: `${color}2e`, color, boxShadow: `inset 0 0 0 1px ${color}44` }}
                            tip={tipHandlers(`phase:${phase.id}`, () => ({
                              kind: "Phase",
                              color,
                              title: phase.name,
                              lines: [`${longDate(range.start)} \u2013 ${longDate(range.end)}`, `${dayCount(range.start, range.end)} in ${project.name}`],
                              status: spanStatus(range.start, range.end),
                            }), "bar")}
                            handlers={barHandlers("phase", phase.id, project.id, { start: phase.start, end: phase.end })}
                            active={isDragging("phase", phase.id)}
                            pressed={pressed === `phase:${phase.id}`}
                          >
                            {width > 60 && <span className="block truncate px-2 text-[11px] font-medium leading-5">{phase.name}</span>}
                          </Bar>
                        </Row>
                      );
                    })}

                    {milestones.map((milestone) => {
                      const milestoneTasks = tasks.filter((task) => task.raw.milestoneId === milestone.id);
                      const listOpen = openMilestones.has(milestone.id);
                      return (
                        <div key={milestone.id} className="contents">
                          {pointRow(
                            milestone.id,
                            <div className="group/label relative flex min-w-0 items-center">
                              <button
                                type="button"
                                onClick={() => toggleMilestoneList(milestone.id)}
                                aria-expanded={listOpen}
                                title={`${milestone.title}: ${listOpen ? "hide" : "show"} its tasks`}
                                className="-ml-1 flex min-w-0 items-center gap-1 rounded-md py-0.5 pr-1 text-left text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              >
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-400"><Chevron open={listOpen} /></span>
                                <span className={`mr-0.5 h-2 w-2 shrink-0 rotate-45 rounded-[1px] ${milestone.completed ? "bg-success-500" : "border-[1.5px] border-urgent-500"}`} />
                                <span className="line-clamp-2 min-w-0 leading-tight break-words">{milestone.title}</span>
                                <span className="ml-0.5 shrink-0 text-[11px] text-slate-500">{milestone.progress?.total ? `${milestone.progress.done}/${milestone.progress.total}` : "no tasks"}</span>
                              </button>
                              <HoverActions>
                                {onQuickAdd && (
                                  <button type="button" onClick={() => onQuickAdd(project.id, `@${milestone.title} `)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-course-600" aria-label={`Add a task toward ${milestone.title}`} title="Add a task toward this milestone">
                                    <PlusIcon className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button type="button" onClick={() => onEdit(milestone)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-course-600" aria-label={`Edit ${milestone.title}`} title="Edit milestone">
                                  <PencilIcon className="h-3.5 w-3.5" />
                                </button>
                              </HoverActions>
                            </div>,
                            milestoneTasks,
                            milestone,
                          )}
                          {listOpen && (
                            <MilestoneTaskList
                              tasks={milestoneTasks}
                              color={color}
                              todayKey={todayKey}
                              renderPoint={renderPoint}
                              onToggle={(task) => onToggleTodo?.(task.raw.id, task.resolved.occurrenceDate ?? undefined)}
                              onAdd={onQuickAdd ? () => onQuickAdd(project.id, `@${milestone.title} `) : null}
                            />
                          )}
                        </div>
                      );
                    })}

                    {(looseTasks.length > 0 || (draftHere?.dueDate && !draftHere.milestoneId)) && pointRow("loose", <span className="text-xs text-slate-500">Other tasks</span>, looseTasks, null)}

                    {isEmpty && !draftHere?.dueDate && (
                      <Row height={ROW} indent label={<span className="text-[11px] text-slate-400">Nothing planned yet</span>} onTimelineDoubleClick={(event) => openPopover(event, project)} />
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Carries the label column down to the bottom so the day grid doesn't show through under it */}
          <div className="flex flex-1">
            <div className="sticky left-0 z-20 shrink-0 border-r border-slate-100 bg-white" style={{ width: "var(--label-width)", minHeight: bottomInset }} />
          </div>
        </div>
      </div>

      {/* The name column's edge: drag to resize, double-click to fit the names again */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize project names"
        aria-valuenow={labelWidth}
        aria-valuemin={LABEL_MIN}
        aria-valuemax={LABEL_MAX}
        tabIndex={0}
        title="Drag to resize. Double-click to fit the names."
        onPointerDown={startLabelResize}
        onDoubleClick={() => setLabelOverride(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          setLabelOverride(Math.min(Math.max(labelWidth + (event.key === "ArrowRight" ? 16 : -16), LABEL_MIN), LABEL_MAX));
        }}
        className="group/resize absolute inset-y-0 z-30 flex w-2.5 -translate-x-1/2 cursor-col-resize justify-center outline-none"
        style={{ left: labelWidth }}
      >
        <span className="h-full w-0.5 rounded-full transition-colors group-hover/resize:bg-course-400 group-focus-visible/resize:bg-course-400 group-active/resize:bg-course-500" />
      </div>
      </div>

      <TimelineTooltip ref={tooltipRef} onPointerEnter={() => clearTimeout(tipTimerRef.current)} onPointerLeave={hideTipSoon} onWheel={hideTip} />

      {colorMenu && (
        <>
          <div className="absolute inset-0 z-40" onPointerDown={() => setColorMenu(null)} />
          <ColorMenu
            menu={colorMenu}
            onChange={(next) => {
              colorMenu.onChange(next);
              setColorMenu((current) => current && { ...current, value: next });
            }}
            onClose={() => setColorMenu(null)}
          />
        </>
      )}

      {popover && activeProject && (
        <>
          <div className="absolute inset-0 z-40" onPointerDown={() => setPopover(null)} />
          <AddPopover
            key={`${popover.projectId}-${popover.date}-${popover.kind}`}
            popover={popover}
            project={activeProject}
            milestones={projectTodos.filter((todo) => todo.type === "milestone" && todo.projectId === activeProject.id).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))}
            onAdd={(item) => addItem(activeProject, item)}
            onClose={() => setPopover(null)}
          />
        </>
      )}
    </div>
  );
}

// Row actions float over the end of the label on hover, so they never cost the name any width
function HoverActions({ children }) {
  return (
    <span className="absolute inset-y-0 right-0 flex items-center pointer-events-none bg-linear-to-r from-transparent via-white via-30% to-white pl-5 opacity-0 transition-opacity group-hover/label:pointer-events-auto group-hover/label:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
      {children}
    </span>
  );
}

function Row({ height, label, sublabel, indent = false, onTimelineDoubleClick, children }) {
  return (
    <div className="flex" style={{ minHeight: height }}>
      <div className={`sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r border-slate-100 bg-white py-1 pr-2 ${indent ? "pl-8" : "pl-3"}`} style={{ width: "var(--label-width)" }}>
        {label}
        {sublabel && <span className="truncate text-[11px] leading-tight text-slate-500">{sublabel}</span>}
      </div>
      <div className="relative min-w-0 flex-1" onDoubleClick={onTimelineDoubleClick}>
        {children}
      </div>
    </div>
  );
}

function Bar({ dragKey, left, width, height, rounded = "rounded-full", style, tip, handlers, active, pressed, children }) {
  // Narrow bars keep thin edge handles so there is still a middle to grab and move
  const handleWidth = width >= 48 ? 10 : 4;
  return (
    <div
      data-drag-key={dragKey}
      onPointerDown={handlers.move}
      onDoubleClick={(event) => event.stopPropagation()}
      {...tip}
      className={`group/bar absolute top-1/2 z-[1] -translate-y-1/2 cursor-grab touch-none overflow-hidden transition-shadow duration-150 ${rounded} ${active ? "shadow-lg" : pressed ? "shadow-md" : "hover:shadow-sm"}`}
      style={{ left, width, height, ...style }}
    >
      {children}
      {["start", "end"].map((edge) => (
        <span
          key={edge}
          onPointerDown={handlers[edge]}
          className={`absolute inset-y-0 flex cursor-ew-resize items-center justify-center ${edge === "start" ? "left-0" : "right-0"}`}
          style={{ width: handleWidth }}
          aria-hidden="true"
        >
          {handleWidth > 4 && <span className="h-[60%] max-h-3 w-0.5 rounded-full bg-current opacity-0 transition-opacity group-hover/bar:opacity-40" />}
        </span>
      ))}
    </div>
  );
}

// Dashed outline of the days a dragged bar will snap to
function BarLanding({ left, width, height, rounded = "rounded-full", color }) {
  return <div aria-hidden="true" className={`pointer-events-none absolute top-1/2 -translate-y-1/2 border border-dashed ${rounded}`} style={{ left, width, height, borderColor: color }} />;
}

function PointLanding({ left, diamond, color }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 border border-dashed ${diamond ? "h-4 w-4 rotate-45 rounded-[3px]" : "h-3.5 w-3.5 rounded-full"}`}
      style={{ left, borderColor: color }}
    />
  );
}

const DIAMOND_TONES = {
  reached: "bg-success-500 border-success-500",
  overdue: "bg-white border-danger-500",
  soon: "bg-white border-urgent-500 ring-4 ring-urgent-500/20",
  open: "bg-white",
};

function Diamond({ milestone, tone, color, left, dragKey, pressed, tip, onPointerDown }) {
  const status = tone === "reached" ? "reached" : tone === "overdue" ? "overdue" : tone === "soon" ? "due soon" : "upcoming";
  const progress = milestone.progress?.total ? ` · ${milestone.progress.done}/${milestone.progress.total} tasks` : " · no tasks linked";
  return (
    <button
      type="button"
      data-drag-key={dragKey}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => event.stopPropagation()}
      {...tip}
      aria-label={`Milestone ${milestone.title}, ${status}${progress}`}
      className={`absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab touch-none rounded-[3px] border-2 transition-[scale,box-shadow] duration-150 ${pressed ? "scale-110 shadow-md" : "shadow-sm"} ${DIAMOND_TONES[tone]}`}
      style={{ left, ...(tone === "open" ? { borderColor: color } : null) }}
    />
  );
}

function TaskDot({ task, done, overdue, color, left, dragKey, pressed, tip, onPointerDown }) {
  return (
    <button
      type="button"
      data-drag-key={dragKey}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => event.stopPropagation()}
      {...tip}
      aria-label={`Task ${task.title}, ${shortDate(task.dueDate)}${done ? ", done" : overdue ? ", overdue" : ""}`}
      className={`absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 transition-[scale,box-shadow] duration-150 hover:scale-125 ${pressed ? "scale-125 shadow-md" : ""} ${overdue ? "border-danger-500" : ""} ${done ? "" : "bg-white"}`}
      style={{ left, ...(overdue ? null : { borderColor: color }), ...(done ? { backgroundColor: color } : null) }}
    />
  );
}

// Several tasks due the same day: up to three overlapping dots (overdue and open ones in front of
// done ones), dragged as one. Hovering shows every task in the stack.
const STACK_MAX = 3;
const STACK_STEP = 5;

function TaskStack({ tasks, date, todayKey, color, left, dragKey, pressed, tip, onPointerDown }) {
  const rank = (task) => (task.resolved.completed ? 2 : date < todayKey ? 0 : 1);
  const shown = [...tasks].sort((a, b) => rank(a) - rank(b)).slice(0, STACK_MAX);
  const width = 10 + (shown.length - 1) * STACK_STEP;
  const open = tasks.filter((task) => !task.resolved.completed).length;
  return (
    <button
      type="button"
      data-drag-key={dragKey}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => event.stopPropagation()}
      {...tip}
      aria-label={`${tasks.length} tasks on ${shortDate(date)}, ${open ? `${open} open` : "all done"}: ${tasks.map((task) => task.raw.title).join(", ")}`}
      className={`absolute top-1/2 z-10 h-2.5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none transition-[scale] duration-150 hover:scale-115 ${pressed ? "scale-115" : ""}`}
      style={{ left, width }}
    >
      {shown.map((task, index) => {
        const done = task.resolved.completed;
        const overdue = !done && date < todayKey;
        return (
          <span
            key={task.raw.id}
            className={`absolute top-0 h-2.5 w-2.5 rounded-full border-2 ${overdue ? "border-danger-500" : ""} ${done ? "" : "bg-white"}`}
            // Front dots sit on top; a white ring keeps overlapping dots apart
            style={{ left: index * STACK_STEP, zIndex: STACK_MAX - index, boxShadow: "0 0 0 1.5px white", ...(overdue ? null : { borderColor: color }), ...(done ? { backgroundColor: color } : null) }}
          />
        );
      })}
    </button>
  );
}

// A milestone's tasks dropped down under it: a checklist where clicking a row marks the task done
// (or not), with each task's dot repeated on its own row so the list lines up with the timeline
function MilestoneTaskList({ tasks, color, todayKey, renderPoint, onToggle, onAdd }) {
  const sorted = [...tasks].sort((a, b) => (a.raw.dueDate ?? "9999").localeCompare(b.raw.dueDate ?? "9999") || a.raw.title.localeCompare(b.raw.title));
  if (!sorted.length) {
    return (
      <Row height={TASK_ROW} label={
        <span className="project-form-field flex items-center gap-2 pl-7 text-[11px] text-slate-400">
          No tasks yet
          {onAdd && <button type="button" onClick={onAdd} className="rounded px-1 font-medium text-course-600 hover:bg-course-50">Add one</button>}
        </span>
      } />
    );
  }
  return sorted.map((task, index) => {
    const done = task.resolved.completed;
    const overdue = !done && task.raw.dueDate && task.raw.dueDate < todayKey;
    return (
      <Row
        key={task.raw.id}
        height={TASK_ROW}
        label={
          <button
            type="button"
            role="checkbox"
            aria-checked={done}
            onClick={() => onToggle(task)}
            className="project-form-field group/check -ml-1 flex min-w-0 items-center gap-2 rounded-md py-0.5 pr-1 pl-7 text-left text-xs hover:bg-slate-50"
            style={{ "--i": index }}
          >
            <span
              className={`task-complete-toggle flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] ${done ? "text-white" : "bg-white group-hover/check:border-slate-400"}`}
              style={done ? { backgroundColor: color, borderColor: color } : { borderColor: "var(--color-slate-300)" }}
            >
              {done && <CheckIcon className="h-2.5 w-2.5" />}
            </span>
            <span className={`line-clamp-2 min-w-0 flex-1 leading-tight break-words ${done ? "text-slate-400 line-through" : "text-slate-700"}`}>{task.raw.title}</span>
            <span className={`shrink-0 text-[11px] ${overdue ? "text-danger-600" : "text-slate-400"}`}>{task.raw.dueDate ? shortDate(task.raw.dueDate) : "No date"}</span>
          </button>
        }
      >
        {task.raw.dueDate && renderPoint(task.raw, "task")}
      </Row>
    );
  });
}

// The task being typed in quick add, shown where it will land: a breathing dashed dot and its title
function DraftDot({ left, title, color }) {
  return (
    <span data-draft-dot="" aria-hidden="true" className="pointer-events-none absolute top-1/2 z-20 flex -translate-y-1/2 items-center gap-1.5" style={{ left: left - 6, color }}>
      <span className="planner-draft-dot h-3 w-3 shrink-0 rounded-full border-2 border-dashed border-current bg-white" />
      <span className="max-w-48 truncate rounded bg-white/90 px-1 text-[11px] font-medium shadow-sm">{title}</span>
    </span>
  );
}

function RenameInput({ value, onChange, onCommit, onCancel }) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit();
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
      className="min-w-0 flex-1 rounded border border-course-400 px-1.5 py-0.5 text-xs outline-none"
    />
  );
}

function NewProjectForm({ courses, todayKey, canCancel, focusName, onCreate, onCancel, onPickColor }) {
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [color, setColor] = useState(null);
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(addDays(todayKey, 28));
  const categoryColor = getCourseColor(courses.find((course) => course.id === courseId));

  function submit(event) {
    event.preventDefault();
    if (!name.trim() || !startDate || !endDate) return;
    onCreate({ name: name.trim(), courseId: courseId || null, color, startDate, endDate });
  }

  // Each field drops in a beat after the one before it
  const field = (index) => ({ style: { "--i": index } });

  return (
    <form onSubmit={submit} className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
      <div {...field(0)} className="project-form-field flex min-w-40 flex-1 items-center gap-1.5 rounded-lg border border-slate-200 bg-white pl-1 focus-within:border-course-400">
        <button
          type="button"
          onClick={(event) => onPickColor(event, { value: color, categoryColor, onChange: setColor })}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-slate-100"
          aria-label="Project color"
          title="Project color"
        >
          <span className="h-3 w-3 rounded-full ring-1 ring-black/10 ring-inset" style={{ backgroundColor: color || categoryColor }} />
        </button>
        <input
          // Focus only when asked for with "+ Project": on the empty state it would swallow the tab shortcut
          autoFocus={focusName}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && canCancel) {
              event.stopPropagation();
              onCancel();
            }
          }}
          placeholder={canCancel ? "Project name" : "Name your first project…"}
          aria-label="Project name"
          className="min-w-0 flex-1 bg-transparent py-1.5 pr-2.5 text-sm outline-none"
        />
      </div>
      <select {...field(1)} value={courseId} onChange={(event) => setCourseId(event.target.value)} aria-label="Category" className="project-form-field rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 outline-none">
        {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
      </select>
      <input {...field(2)} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Start date" className="project-form-field rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none" />
      <span {...field(3)} className="project-form-field text-xs text-slate-400">to</span>
      <input {...field(4)} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="End date" className="project-form-field rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none" />
      <button {...field(5)} type="submit" disabled={!name.trim()} className="project-form-field rounded-lg bg-course-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-course-600 disabled:opacity-40">Create</button>
      {canCancel && <button {...field(6)} type="button" onClick={onCancel} className="project-form-field rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancel</button>}
    </form>
  );
}

// Swatches for a project's color: its category's color (the default), the presets, or any custom color
function ColorMenu({ menu, onChange, onClose }) {
  const custom = menu.value && !COLOR_PALETTE.includes(menu.value.toLowerCase());
  const swatch = (selected) => `flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 transition-shadow ${selected ? "ring-2 ring-slate-400" : "hover:ring-2 hover:ring-slate-200"}`;
  const pick = (value) => {
    onChange(value);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-label="Project color"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className="modal-surface absolute z-50 w-52 rounded-card border border-slate-200 bg-white p-3 shadow-xl"
      style={{ left: menu.x, top: menu.y, transformOrigin: `${menu.originX}px ${menu.originY}px` }}
    >
      <button
        type="button"
        autoFocus={!menu.value}
        onClick={() => pick(null)}
        className="mb-2.5 flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
      >
        <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10 ring-inset" style={{ backgroundColor: menu.categoryColor }} />
        <span className="flex-1">Category color</span>
        {!menu.value && <span className="text-course-600">✓</span>}
      </button>
      <div className="grid grid-cols-5 gap-2 px-0.5">
        {COLOR_PALETTE.map((value) => (
          <button key={value} type="button" autoFocus={menu.value?.toLowerCase() === value} onClick={() => pick(value)} className={swatch(menu.value?.toLowerCase() === value)} aria-label={`Color ${value}`} aria-pressed={menu.value?.toLowerCase() === value}>
            <span className="h-6 w-6 rounded-full" style={{ backgroundColor: value }} />
          </button>
        ))}
        <label className={`${swatch(custom)} relative cursor-pointer`} title="Custom color">
          <span className="h-6 w-6 rounded-full" style={{ background: custom ? menu.value : "conic-gradient(#f43f5e, #f59e0b, #84cc16, #10b981, #0ea5e9, #6366f1, #d946ef, #f43f5e)" }} />
          <input
            type="color"
            value={menu.value || menu.categoryColor}
            onChange={(event) => onChange(event.target.value)}
            aria-label="Custom color"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}

const KIND_OPTIONS = [
  { id: "phase", label: "Phase" },
  { id: "milestone", label: "Milestone" },
  { id: "task", label: "Task" },
];

function AddPopover({ popover, project, milestones, onAdd, onClose }) {
  const [kind, setKind] = useState(popover.kind);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(popover.date);
  const [endDate, setEndDate] = useState(addDays(popover.date, 6));
  // New tasks default to the next milestone they lead up to
  const [milestoneId, setMilestoneId] = useState(() => milestones.find((milestone) => milestone.dueDate >= popover.date)?.id ?? "");
  const inputRef = useRef(null);

  function submit(event) {
    event.preventDefault();
    if (!title.trim() || !date) return;
    onAdd({ kind, title: title.trim(), date, endDate, milestoneId });
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className="modal-surface absolute z-50 w-72 space-y-2 rounded-card border border-slate-200 bg-white p-3 shadow-xl"
      style={{ left: popover.x, top: popover.y, transformOrigin: `${popover.originX}px ${popover.originY}px` }}
    >
      <div className="flex items-center justify-between">
        <p className="truncate text-xs font-semibold text-slate-700">Add to {project.name}</p>
        <button type="button" onClick={onClose} className="-my-1 -mr-1.5 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      <SegmentedControl label="Item type" options={KIND_OPTIONS} value={kind} onChange={(next) => { setKind(next); inputRef.current?.focus(); }} />
      <input
        ref={inputRef}
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={kind === "phase" ? "Phase name (e.g. Research)" : kind === "milestone" ? "Milestone (e.g. Draft due)" : "Task"}
        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-course-400"
      />
      <div className="flex items-center gap-1.5">
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label={kind === "phase" ? "Start date" : "Date"} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 outline-none" />
        {kind === "phase" && (
          <>
            <span className="text-xs text-slate-400">to</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="End date" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 outline-none" />
          </>
        )}
      </div>
      {kind === "task" && milestones.length > 0 && (
        <select value={milestoneId} onChange={(event) => setMilestoneId(event.target.value)} aria-label="Milestone" className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 outline-none">
          <option value="">No milestone</option>
          {milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>Counts toward ◆ {milestone.title}</option>)}
        </select>
      )}
      <button type="submit" disabled={!title.trim()} className="w-full rounded-lg bg-course-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-course-600 disabled:opacity-40">
        Add {kind}
      </button>
    </form>
  );
}
