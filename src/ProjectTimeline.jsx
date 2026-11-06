import { useLayoutEffect, useRef, useState } from "react";
import SegmentedControl from "./SegmentedControl";
import { Chevron } from "./Collapsible";
import { useLocalStorage } from "./useLocalStorage";
import { getCourseColor } from "./courseColors";
import { parseDateKey, resolveTask } from "./occurrences";
import { addDays, daysBetween, toDateKey } from "./planner";

const LABEL_WIDTH = 232;
const DAY_WIDTH = { weeks: 30, months: 10 };
const PROJECT_ROW = 44;
const ROW = 32;
const DRAG_THRESHOLD = 4;

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

export default function ProjectTimeline({ todos, courses, courseMap, planner, updatePlanner, onAddTodo, onUpdateTodo, onEdit, onDeleteProject }) {
  const [zoom, setZoom] = useLocalStorage("timelineZoom", "weeks");
  const [creating, setCreating] = useState(false);
  const [popover, setPopover] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [drag, setDrag] = useState(null);
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const dragRef = useRef(null);

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

  function createProject({ name, courseId, startDate, endDate }) {
    updatePlanner((current) => ({
      ...current,
      projects: [...current.projects, { id: crypto.randomUUID(), name, courseId, startDate, endDate: endDate < startDate ? startDate : endDate, collapsed: false, phases: [] }],
    }));
    setCreating(false);
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
  function beginDrag(event, state) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { ...state, originX: event.clientX, active: false, delta: 0 };

    const handleMove = (moveEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const dx = moveEvent.clientX - current.originX;
      if (!current.active && Math.abs(dx) < DRAG_THRESHOLD) return;
      const delta = Math.round(dx / dayWidth);
      // Re-render only when the drag starts or crosses into another day
      if (!current.active || delta !== current.delta) {
        current.active = true;
        current.delta = delta;
        setDrag({ ...current });
      }
    };
    const stop = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
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
    setPopover({
      projectId: project.id,
      kind,
      date: key,
      x: Math.min(event.clientX - root.left, root.width - 300),
      y: Math.min(event.clientY - root.top + 8, root.height - 260),
    });
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
    ? `repeating-linear-gradient(to right, rgb(248 250 252) 0 ${dayWidth}px, transparent ${dayWidth}px ${dayWidth * 6}px, rgb(248 250 252) ${dayWidth * 6}px ${dayWidth * 7}px)`
    : `repeating-linear-gradient(to right, rgb(241 245 249) 0 1px, transparent 1px ${dayWidth * 7}px)`;

  const activeProject = popover ? projects.find((project) => project.id === popover.projectId) : null;

  return (
    <div ref={rootRef} className={`relative flex h-full min-h-0 flex-col select-none ${drag ? "cursor-grabbing" : ""}`}>
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-course-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-course-600">
          + Project
        </button>
        <button type="button" onClick={scrollToToday} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-slate-300">
          Today
        </button>
        <p className="ml-2 hidden text-[11px] text-slate-400 lg:block">Double-click a project's row to add a phase, milestone, or task. Drag bars and points to reschedule.</p>
        <div className="flex-1" />
        <SegmentedControl label="Timeline zoom" className="inline-grid" segmentClassName="px-3" options={[{ id: "weeks", label: "Weeks" }, { id: "months", label: "Months" }]} value={zoom} onChange={setZoom} />
      </div>

      {(creating || projects.length === 0) && (
        <NewProjectForm courses={courses} todayKey={todayKey} canCancel={projects.length > 0} onCreate={createProject} onCancel={() => setCreating(false)} />
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="relative flex min-h-full flex-col" style={{ width: LABEL_WIDTH + timelineWidth }}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0" style={{ left: LABEL_WIDTH, width: timelineWidth, backgroundImage: weekendShading }} />
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-10 w-px bg-danger-500/60" style={{ left: LABEL_WIDTH + xOf(todayKey) + dayWidth / 2 }} />

          <div className="sticky top-0 z-30 flex border-b border-slate-200 bg-white">
            <div className="sticky left-0 z-10 flex shrink-0 items-end border-r border-slate-100 bg-white px-3 pb-1.5 text-[10px] font-semibold tracking-wide text-slate-400 uppercase" style={{ width: LABEL_WIDTH }}>
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
                  <div key={key} className={`absolute bottom-1 text-center text-[10px] ${isToday ? "font-bold text-danger-600" : date.getDay() === 0 || date.getDay() === 6 ? "text-slate-300" : "text-slate-400"}`} style={{ left: i * dayWidth, width: zoom === "weeks" ? dayWidth : dayWidth * 7, textAlign: zoom === "weeks" ? "center" : "left" }}>
                    {date.getDate()}
                  </div>
                );
              })}
            </div>
          </div>

          {projects.map((project) => {
            const color = getCourseColor(courseMap[project.courseId]);
            const items = projectTodos.filter((todo) => todo.projectId === project.id);
            const milestones = items.filter((todo) => todo.type === "milestone").sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
            const milestoneIds = new Set(milestones.map((milestone) => milestone.id));
            const tasks = items.filter((todo) => todo.type !== "milestone").map((todo) => ({ raw: todo, resolved: resolveTask(todo) }));
            const looseTasks = tasks.filter((task) => !milestoneIds.has(task.raw.milestoneId));
            const doneCount = tasks.filter((task) => task.resolved.completed).length;
            const span = liveRange("project", project.id, { start: project.startDate, end: project.endDate });
            const spanHandlers = barHandlers("project", project.id, project.id, { start: project.startDate, end: project.endDate });
            const phases = project.phases ?? [];
            const isEmpty = !phases.length && !items.length;

            const renderPoint = (todo, kind) => {
              const range = liveRange("todo", todo.id, { start: todo.dueDate, end: todo.dueDate });
              const handlers = barHandlers("todo", todo.id, project.id, { start: todo.dueDate, end: todo.dueDate }, () => onEdit(todo));
              return kind === "milestone"
                ? <Diamond key={todo.id} milestone={todo} tone={milestoneTone(todo, todayKey)} color={color} left={xOf(range.start) + dayWidth / 2} onPointerDown={handlers.move} />
                : <TaskDot key={todo.id} task={todo} done={resolveTask(todo).completed} overdue={!resolveTask(todo).completed && todo.dueDate < todayKey} color={color} left={xOf(range.start) + dayWidth / 2} onPointerDown={handlers.move} />;
            };

            const pointRow = (key, label, rowTasks, milestone) => {
              const dated = rowTasks.filter((task) => task.raw.dueDate);
              const undated = rowTasks.length - dated.length;
              const lineKeys = [...dated.map((task) => liveRange("todo", task.raw.id, { start: task.raw.dueDate, end: task.raw.dueDate }).start), ...(milestone?.dueDate ? [liveRange("todo", milestone.id, { start: milestone.dueDate, end: milestone.dueDate }).start] : [])];
              return (
                <Row
                  key={key}
                  height={ROW}
                  label={label}
                  sublabel={undated ? `${undated} undated` : null}
                  onTimelineDoubleClick={(event) => openPopover(event, project, { kind: "task" })}
                >
                  {lineKeys.length > 1 && (
                    <div className="absolute top-1/2 h-px -translate-y-1/2" style={{ left: xOf(earliest(lineKeys)) + dayWidth / 2, width: xOf(latest(lineKeys)) - xOf(earliest(lineKeys)), backgroundColor: `${color}66` }} />
                  )}
                  {dated.map((task) => renderPoint(task.raw, "task"))}
                  {milestone?.dueDate && renderPoint(milestone, "milestone")}
                </Row>
              );
            };

            return (
              <div key={project.id} className="border-b border-slate-100">
                <Row
                  height={PROJECT_ROW}
                  label={
                    <div className="group/label flex min-w-0 items-center gap-1.5">
                      <button type="button" onClick={() => updateProject(project.id, { collapsed: !project.collapsed })} className="-ml-1 rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label={project.collapsed ? `Expand ${project.name}` : `Collapse ${project.name}`} aria-expanded={!project.collapsed}>
                        <Chevron open={!project.collapsed} />
                      </button>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      {renaming?.kind === "project" && renaming.id === project.id ? (
                        <RenameInput value={renaming.value} onChange={(value) => setRenaming({ ...renaming, value })} onCommit={commitRename} onCancel={() => setRenaming(null)} />
                      ) : (
                        <button type="button" onClick={() => setRenaming({ kind: "project", id: project.id, value: project.name })} className="min-w-0 truncate text-left text-sm font-semibold text-slate-800 hover:text-course-600" title="Rename">
                          {project.name}
                        </button>
                      )}
                      {tasks.length > 0 && <span className="shrink-0 text-[10px] text-slate-400">{doneCount}/{tasks.length}</span>}
                      <span className="flex-1" />
                      <button type="button" onClick={(event) => openPopover(event, project, { date: todayKey >= project.startDate && todayKey <= project.endDate ? todayKey : project.startDate })} className="shrink-0 rounded px-1 text-sm leading-none text-slate-300 opacity-0 transition-opacity hover:text-course-600 focus-visible:opacity-100 group-hover/label:opacity-100" aria-label={`Add to ${project.name}`} title="Add phase, milestone, or task">
                        +
                      </button>
                      <button type="button" onClick={() => onDeleteProject(project.id)} className="shrink-0 rounded px-1 text-sm leading-none text-slate-300 opacity-0 transition-opacity hover:text-danger-500 focus-visible:opacity-100 group-hover/label:opacity-100" aria-label={`Delete ${project.name}`} title="Delete project and its tasks">
                        ×
                      </button>
                    </div>
                  }
                  sublabel={`${shortDate(project.startDate)} – ${shortDate(project.endDate)}`}
                  onTimelineDoubleClick={(event) => openPopover(event, project)}
                >
                  <Bar
                    left={xOf(span.start)}
                    width={(daysBetween(span.start, span.end) + 1) * dayWidth}
                    height={10}
                    style={{ backgroundColor: `${color}33`, boxShadow: `inset 0 0 0 1px ${color}55` }}
                    title={`${project.name}: ${shortDate(span.start)} – ${shortDate(span.end)}`}
                    handlers={spanHandlers}
                    active={drag?.kind === "project" && drag.id === project.id}
                  >
                    <div className="h-full rounded-full" style={{ width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%`, backgroundColor: `${color}99` }} />
                  </Bar>
                  {milestones.filter((milestone) => milestone.dueDate).map((milestone) => renderPoint(milestone, "milestone"))}
                </Row>

                {!project.collapsed && (
                  <>
                    {phases.map((phase) => {
                      const range = liveRange("phase", phase.id, { start: phase.start, end: phase.end });
                      const width = (daysBetween(range.start, range.end) + 1) * dayWidth;
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
                              <button type="button" onClick={() => deletePhase(project.id, phase.id)} className="shrink-0 rounded px-1 text-xs leading-none text-slate-300 opacity-0 transition-opacity hover:text-danger-500 focus-visible:opacity-100 group-hover/label:opacity-100" aria-label={`Delete phase ${phase.name}`}>
                                ×
                              </button>
                            </div>
                          }
                          onTimelineDoubleClick={(event) => openPopover(event, project, { kind: "phase" })}
                        >
                          <Bar
                            left={xOf(range.start)}
                            width={width}
                            height={20}
                            rounded="rounded-md"
                            style={{ backgroundColor: `${color}2e`, color, boxShadow: `inset 0 0 0 1px ${color}44` }}
                            title={`${phase.name}: ${shortDate(range.start)} – ${shortDate(range.end)}`}
                            handlers={barHandlers("phase", phase.id, project.id, { start: phase.start, end: phase.end })}
                            active={drag?.kind === "phase" && drag.id === phase.id}
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
                          <span className="shrink-0 text-[10px] text-slate-400">{milestone.progress?.total ? `${milestone.progress.done}/${milestone.progress.total}` : "no tasks"}</span>
                        </button>,
                        tasks.filter((task) => task.raw.milestoneId === milestone.id),
                        milestone,
                      ),
                    )}

                    {looseTasks.length > 0 && pointRow("loose", <span className="text-xs text-slate-400">Other tasks</span>, looseTasks, null)}

                    {isEmpty && (
                      <Row height={ROW} indent label={<span className="text-[11px] text-slate-300">Nothing planned yet</span>} onTimelineDoubleClick={(event) => openPopover(event, project)}>
                        <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[11px] whitespace-nowrap text-slate-300" style={{ left: xOf(project.startDate) + 4 }}>
                          Double-click to add a phase, milestone, or task
                        </span>
                      </Row>
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
        {sublabel && <span className="truncate text-[10px] leading-tight text-slate-400">{sublabel}</span>}
      </div>
      <div className="relative min-w-0 flex-1" onDoubleClick={onTimelineDoubleClick}>
        {children}
      </div>
    </div>
  );
}

function Bar({ left, width, height, rounded = "rounded-full", style, title, handlers, active, children }) {
  return (
    <div
      onPointerDown={handlers.move}
      onDoubleClick={(event) => event.stopPropagation()}
      title={title}
      className={`group/bar absolute top-1/2 -translate-y-1/2 cursor-grab touch-none overflow-hidden ${rounded} ${active ? "shadow-lg" : "hover:shadow-sm"}`}
      style={{ left, width, height, ...style }}
    >
      {children}
      <span onPointerDown={handlers.start} className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" aria-hidden="true" />
      <span onPointerDown={handlers.end} className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" aria-hidden="true" />
    </div>
  );
}

const DIAMOND_TONES = {
  reached: "bg-success-500 border-success-500",
  overdue: "bg-white border-danger-500",
  soon: "bg-white border-urgent-500 ring-4 ring-urgent-500/20",
  open: "bg-white",
};

function Diamond({ milestone, tone, color, left, onPointerDown }) {
  const status = tone === "reached" ? "reached" : tone === "overdue" ? "overdue" : tone === "soon" ? "due soon" : "upcoming";
  const progress = milestone.progress?.total ? ` · ${milestone.progress.done}/${milestone.progress.total} tasks` : " · no tasks linked";
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => event.stopPropagation()}
      title={`◆ ${milestone.title} · ${shortDate(milestone.dueDate)} · ${status}${progress}`}
      aria-label={`Milestone ${milestone.title}, ${status}`}
      className={`absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab touch-none rounded-[3px] border-2 shadow-sm ${DIAMOND_TONES[tone]}`}
      style={{ left, ...(tone === "open" ? { borderColor: color } : null) }}
    />
  );
}

function TaskDot({ task, done, overdue, color, left, onPointerDown }) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => event.stopPropagation()}
      title={`${task.title} · ${shortDate(task.dueDate)}${done ? " · done" : overdue ? " · overdue" : ""}`}
      aria-label={`Task ${task.title}`}
      className="absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 transition-transform hover:scale-125"
      style={{ left, borderColor: overdue ? "#ef4444" : color, backgroundColor: done ? color : "#fff" }}
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

function NewProjectForm({ courses, todayKey, canCancel, onCreate, onCancel }) {
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(addDays(todayKey, 28));

  function submit(event) {
    event.preventDefault();
    if (!name.trim() || !startDate || !endDate) return;
    onCreate({ name: name.trim(), courseId: courseId || null, startDate, endDate });
  }

  return (
    <form onSubmit={submit} className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && canCancel) {
            event.stopPropagation();
            onCancel();
          }
        }}
        placeholder={canCancel ? "Project name" : "Name your first project…"}
        className="min-w-40 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-course-400"
      />
      <select value={courseId} onChange={(event) => setCourseId(event.target.value)} aria-label="Category" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 outline-none">
        {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
      </select>
      <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Start date" className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none" />
      <span className="text-xs text-slate-300">to</span>
      <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="End date" className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none" />
      <button type="submit" disabled={!name.trim()} className="rounded-lg bg-course-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-course-600 disabled:opacity-40">Create</button>
      {canCancel && <button type="button" onClick={onCancel} className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancel</button>}
    </form>
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
      style={{ left: Math.max(popover.x, 8), top: Math.max(popover.y, 8) }}
    >
      <div className="flex items-center justify-between">
        <p className="truncate text-xs font-semibold text-slate-700">Add to {project.name}</p>
        <button type="button" onClick={onClose} className="rounded-full px-1.5 text-slate-400 hover:text-slate-700" aria-label="Close">×</button>
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
            <span className="text-xs text-slate-300">to</span>
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
      <p className="text-[10px] leading-snug text-slate-400">
        {kind === "phase" && "Phases only show here on the timeline."}
        {kind === "milestone" && "Shows on your calendar. It's reached on its own once its tasks are done."}
        {kind === "task" && "Shows in your task list and calendar like any other task."}
      </p>
      <button type="submit" disabled={!title.trim()} className="w-full rounded-lg bg-course-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-course-600 disabled:opacity-40">
        Add {kind}
      </button>
    </form>
  );
}
