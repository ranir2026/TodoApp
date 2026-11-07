import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import SegmentedControl from "./SegmentedControl";
import Collapsible, { Chevron } from "./Collapsible";
import { useLocalStorage } from "./useLocalStorage";
import { COLOR_PALETTE, getCourseColor } from "./courseColors";
import { parseDateKey, resolveTask } from "./occurrences";
import { addDays, daysBetween, toDateKey } from "./planner";
import { animateSpring } from "./spring";
import { CloseIcon, PlusIcon } from "./icons";

const LABEL_WIDTH = 232;
const DAY_WIDTH = { weeks: 30, months: 10 };
const PROJECT_ROW = 44;
const ROW = 32;
const DRAG_THRESHOLD = 4;
const VELOCITY_WINDOW = 100;

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

export default function ProjectTimeline({ todos, courses, courseMap, toolbar, planner, updatePlanner, onAddTodo, onUpdateTodo, onEdit, onDeleteProject }) {
  const [zoom, setZoom] = useLocalStorage("timelineZoom", "weeks");
  const [creating, setCreating] = useState(false);
  // Bumped each time the form opens so its fields start fresh and play their entrance again
  const [formKey, setFormKey] = useState(0);
  const [colorMenu, setColorMenu] = useState(null);
  const [createdId, setCreatedId] = useState(null);
  const [popover, setPopover] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [drag, setDrag] = useState(null);
  const [pressed, setPressed] = useState(null);
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const settleRef = useRef(null);
  const runningSettleRef = useRef(null);

  const dayWidth = DAY_WIDTH[zoom] ?? DAY_WIDTH.weeks;
  const todayKey = toDateKey(new Date());
  const { projects } = planner;
  const projectIds = new Set(projects.map((project) => project.id));
  const projectTodos = todos.filter((todo) => todo.projectId && projectIds.has(todo.projectId));

  // The visible range covers every project with some room on both sides, starting on a Sunday
  // so the weekend shading lines up
  const keys = [todayKey];
  for (const project of projects) {
    keys.push(project.startDate, project.endDate);
    for (const phase of project.phases ?? []) keys.push(phase.start, phase.end);
  }
  for (const todo of projectTodos) if (todo.dueDate) keys.push(todo.dueDate);
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
    const elements = [...rootRef.current.querySelectorAll(`[data-drag-key="${settle.key}"]`)].map((element) => ({
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

  useLayoutEffect(() => {
    scrollToToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  function scrollToToday() {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollLeft = Math.max(0, xOf(todayKey) - (scroller.clientWidth - LABEL_WIDTH) * 0.2);
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

  // A project's own color, falling back to its category's
  const projectColor = (project) => project.color || getCourseColor(courseMap[project.courseId]);

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
    runningSettleRef.current?.();
    runningSettleRef.current = null;
    dragRef.current = { ...state, originX: event.clientX, active: false, delta: 0, dx: 0, samples: [] };
    setPressed(`${state.kind}:${state.id}`);

    const handleMove = (moveEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const dx = moveEvent.clientX - current.originX;
      if (!current.active && Math.abs(dx) < DRAG_THRESHOLD) return;
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
      settleRef.current = { key: `${current.kind}:${current.id}`, point: current.kind === "todo", velocity, ...releaseOffsets(current) };
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

  function commitDrag({ kind, id, projectId, mode, range, delta }) {
    const next = shiftRange(range, mode, delta);
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

  function pointGeometry(todo) {
    const left = xOf(todo.dueDate) + dayWidth / 2;
    if (!isDragging("todo", todo.id)) return { left, landing: null };
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

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="relative flex min-h-full flex-col" style={{ width: LABEL_WIDTH + timelineWidth }}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0" style={{ left: LABEL_WIDTH, width: timelineWidth, backgroundImage: weekendShading }} />
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-10 w-px bg-danger-500/60" style={{ left: LABEL_WIDTH + xOf(todayKey) + dayWidth / 2 }} />

          <div className="sticky top-0 z-30 flex border-b border-slate-200 bg-white">
            <div className="sticky left-0 z-10 flex shrink-0 items-end border-r border-slate-100 bg-white px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase" style={{ width: LABEL_WIDTH }}>
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
            const color = projectColor(project);
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

            const renderPoint = (todo, kind) => {
              const { left, landing } = pointGeometry(todo);
              const handlers = barHandlers("todo", todo.id, project.id, { start: todo.dueDate, end: todo.dueDate }, () => onEdit(todo));
              const dragKey = `todo:${todo.id}`;
              const state = { dragKey, pressed: pressed === dragKey, onPointerDown: handlers.move };
              return (
                <span key={todo.id} className="contents">
                  {landing !== null && <PointLanding left={landing} diamond={kind === "milestone"} color={color} />}
                  {kind === "milestone"
                    ? <Diamond milestone={todo} tone={milestoneTone(todo, todayKey)} color={color} left={left} {...state} />
                    : <TaskDot task={todo} done={resolveTask(todo).completed} overdue={!resolveTask(todo).completed && todo.dueDate < todayKey} color={color} left={left} {...state} />}
                </span>
              );
            };

            const pointRow = (key, label, rowTasks, milestone) => {
              const dated = rowTasks.filter((task) => task.raw.dueDate);
              const undated = rowTasks.length - dated.length;
              const lineXs = [...dated.map((task) => pointGeometry(task.raw).left), ...(milestone?.dueDate ? [pointGeometry(milestone).left] : [])];
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
                  {dated.map((task) => renderPoint(task.raw, "task"))}
                  {milestone?.dueDate && renderPoint(milestone, "milestone")}
                </Row>
              );
            };

            return (
              <div key={project.id} data-project-id={project.id} className={`border-b border-slate-100 ${project.id === createdId ? "planner-row-enter" : ""}`}>
                <Row
                  height={PROJECT_ROW}
                  label={
                    <div className="group/label flex min-w-0 items-center gap-1.5">
                      <button type="button" onClick={() => updateProject(project.id, { collapsed: !project.collapsed })} className="-ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={project.collapsed ? `Expand ${project.name}` : `Collapse ${project.name}`} aria-expanded={!project.collapsed}>
                        <Chevron open={!project.collapsed} />
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
                        <button type="button" onClick={() => setRenaming({ kind: "project", id: project.id, value: project.name })} className="min-w-0 truncate text-left text-sm font-semibold text-slate-800 hover:text-course-600" title="Rename">
                          {project.name}
                        </button>
                      )}
                      {tasks.length > 0 && <span className="shrink-0 text-[11px] text-slate-500">{doneCount}/{tasks.length}</span>}
                      <span className="flex-1" />
                      <button type="button" onClick={(event) => openPopover(event, project, { date: todayKey >= project.startDate && todayKey <= project.endDate ? todayKey : project.startDate })} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-course-600 focus-visible:opacity-100 group-hover/label:opacity-100" aria-label={`Add to ${project.name}`} title="Add phase, milestone, or task">
                        <PlusIcon className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => onDeleteProject(project.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-danger-500 focus-visible:opacity-100 group-hover/label:opacity-100" aria-label={`Delete ${project.name}`} title="Delete project and its tasks">
                        <CloseIcon className="h-3.5 w-3.5" />
                      </button>
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
                    title={`${project.name}: ${shortDate(span.start)} – ${shortDate(span.end)}`}
                    handlers={spanHandlers}
                    active={isDragging("project", project.id)}
                    pressed={pressed === `project:${project.id}`}
                  >
                    <div className="h-full rounded-full" style={{ width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%`, backgroundColor: `${color}99` }} />
                  </Bar>
                  {milestones.filter((milestone) => milestone.dueDate).map((milestone) => renderPoint(milestone, "milestone"))}
                </Row>

                {!project.collapsed && (
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
                            <div className="group/label flex min-w-0 items-center gap-1.5">
                              {renaming?.kind === "phase" && renaming.id === phase.id ? (
                                <RenameInput value={renaming.value} onChange={(value) => setRenaming({ ...renaming, value })} onCommit={commitRename} onCancel={() => setRenaming(null)} />
                              ) : (
                                <button type="button" onClick={() => setRenaming({ kind: "phase", projectId: project.id, id: phase.id, value: phase.name })} className="min-w-0 truncate text-left text-xs text-slate-600 hover:text-course-600" title="Rename phase">
                                  {phase.name}
                                </button>
                              )}
                              <span className="flex-1" />
                              <button type="button" onClick={() => deletePhase(project.id, phase.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-danger-500 focus-visible:opacity-100 group-hover/label:opacity-100" aria-label={`Delete phase ${phase.name}`}>
                                <CloseIcon className="h-3.5 w-3.5" />
                              </button>
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
                            title={`${phase.name}: ${shortDate(range.start)} – ${shortDate(range.end)}`}
                            handlers={barHandlers("phase", phase.id, project.id, { start: phase.start, end: phase.end })}
                            active={isDragging("phase", phase.id)}
                            pressed={pressed === `phase:${phase.id}`}
                          >
                            {width > 60 && <span className="block truncate px-2 text-[11px] font-medium leading-5">{phase.name}</span>}
                          </Bar>
                        </Row>
                      );
                    })}

                    {milestones.map((milestone) =>
                      pointRow(
                        milestone.id,
                        <button type="button" onClick={() => onEdit(milestone)} className="flex min-w-0 items-center gap-1.5 text-left text-xs text-slate-700 hover:text-course-600">
                          <span className={`h-2 w-2 shrink-0 rotate-45 rounded-[1px] ${milestone.completed ? "bg-success-500" : "border-[1.5px] border-urgent-500"}`} />
                          <span className="min-w-0 truncate">{milestone.title}</span>
                          <span className="shrink-0 text-[11px] text-slate-500">{milestone.progress?.total ? `${milestone.progress.done}/${milestone.progress.total}` : "no tasks"}</span>
                        </button>,
                        tasks.filter((task) => task.raw.milestoneId === milestone.id),
                        milestone,
                      ),
                    )}

                    {looseTasks.length > 0 && pointRow("loose", <span className="text-xs text-slate-500">Other tasks</span>, looseTasks, null)}

                    {isEmpty && (
                      <Row height={ROW} indent label={<span className="text-[11px] text-slate-400">Nothing planned yet</span>} onTimelineDoubleClick={(event) => openPopover(event, project)} />
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Carries the label column down to the bottom so the day grid doesn't show through under it */}
          <div className="flex flex-1">
            <div className="sticky left-0 z-20 shrink-0 border-r border-slate-100 bg-white" style={{ width: LABEL_WIDTH }} />
          </div>
        </div>
      </div>

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

function Row({ height, label, sublabel, indent = false, onTimelineDoubleClick, children }) {
  return (
    <div className="flex" style={{ height }}>
      <div className={`sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r border-slate-100 bg-white pr-2 ${indent ? "pl-8" : "pl-3"}`} style={{ width: LABEL_WIDTH }}>
        {label}
        {sublabel && <span className="truncate text-[11px] leading-tight text-slate-500">{sublabel}</span>}
      </div>
      <div className="relative min-w-0 flex-1" onDoubleClick={onTimelineDoubleClick}>
        {children}
      </div>
    </div>
  );
}

function Bar({ dragKey, left, width, height, rounded = "rounded-full", style, title, handlers, active, pressed, children }) {
  // Narrow bars keep thin edge handles so there is still a middle to grab and move
  const handleWidth = width >= 48 ? 10 : 4;
  return (
    <div
      data-drag-key={dragKey}
      onPointerDown={handlers.move}
      onDoubleClick={(event) => event.stopPropagation()}
      title={title}
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

function Diamond({ milestone, tone, color, left, dragKey, pressed, onPointerDown }) {
  const status = tone === "reached" ? "reached" : tone === "overdue" ? "overdue" : tone === "soon" ? "due soon" : "upcoming";
  const progress = milestone.progress?.total ? ` · ${milestone.progress.done}/${milestone.progress.total} tasks` : " · no tasks linked";
  return (
    <button
      type="button"
      data-drag-key={dragKey}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => event.stopPropagation()}
      title={`◆ ${milestone.title} · ${shortDate(milestone.dueDate)} · ${status}${progress}`}
      aria-label={`Milestone ${milestone.title}, ${status}`}
      className={`absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab touch-none rounded-[3px] border-2 transition-[scale,box-shadow] duration-150 ${pressed ? "scale-110 shadow-md" : "shadow-sm"} ${DIAMOND_TONES[tone]}`}
      style={{ left, ...(tone === "open" ? { borderColor: color } : null) }}
    />
  );
}

function TaskDot({ task, done, overdue, color, left, dragKey, pressed, onPointerDown }) {
  return (
    <button
      type="button"
      data-drag-key={dragKey}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => event.stopPropagation()}
      title={`${task.title} · ${shortDate(task.dueDate)}${done ? " · done" : overdue ? " · overdue" : ""}`}
      aria-label={`Task ${task.title}`}
      className={`absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 transition-[scale,box-shadow] duration-150 hover:scale-125 ${pressed ? "scale-125 shadow-md" : ""} ${overdue ? "border-danger-500" : ""} ${done ? "" : "bg-white"}`}
      style={{ left, ...(overdue ? null : { borderColor: color }), ...(done ? { backgroundColor: color } : null) }}
    />
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
