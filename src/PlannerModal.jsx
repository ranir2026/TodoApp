import { useEffect, useMemo, useRef, useState } from "react";
import SegmentedControl from "./SegmentedControl";
import DayPlanner from "./DayPlanner";
import ProjectTimeline from "./ProjectTimeline";
import QuickAddModal from "./QuickAddModal";
import { useLocalStorage } from "./useLocalStorage";
import { CloseIcon, PlusIcon } from "./icons";
import { comboLabel, normalizeCombo } from "./keybinds";
import { projectColor } from "./planner";

const TABS = [
  { id: "today", label: "Today" },
  { id: "timeline", label: "Timeline" },
];

const isTyping = (target) => target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

// Desktop planner: plan the hours of a day, or lay projects out over weeks.
// `suspended` is set while another dialog (the item editor) sits on top, so Escape closes that one first.
export default function PlannerModal({ open, suspended, onClose, keymap, todos, courses, courseMap, planner, updatePlanner, onToggleTodo, onAddTodo, onUpdateTodo, onEdit, onDeleteProject }) {
  const [tab, setTab] = useLocalStorage("plannerTab", "today");
  // The planner's own quick add, where "@" picks a milestone; holds the text it opens with
  const [quickAdd, setQuickAdd] = useState(null);
  const pressStartedOnBackdrop = useRef(false);
  const surfaceRef = useRef(null);
  const switchCombo = keymap?.plannerSwitchTab;
  const quickAddCombo = keymap?.quickAdd;
  // Each tab renders its own controls into the header (through a portal) instead of a second toolbar row
  const [toolbar, setToolbar] = useState(null);

  // Milestones to "@"-mention, soonest first, colored and labeled by their project
  const milestoneMentions = useMemo(() => {
    const projects = new Map(planner.projects.map((project) => [project.id, project]));
    return todos
      .filter((todo) => todo.type === "milestone" && projects.has(todo.projectId))
      .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
      .map((milestone) => {
        const project = projects.get(milestone.projectId);
        return { id: milestone.id, name: milestone.title, color: projectColor(project, courseMap), hint: `◆ ${project.name}` };
      });
  }, [todos, planner.projects, courseMap]);

  useEffect(() => {
    if (!open || suspended || quickAdd) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") {
        // An Escape that closed a dialog over the planner (quick add) can reach here once that
        // dialog is gone; only one pressed in the planner itself, or with nothing focused, closes it
        if (event.target === document.body || surfaceRef.current?.contains(event.target)) onClose();
        return;
      }
      // Shortcuts only fire when you aren't typing, and holding a key down doesn't repeat them
      if (isTyping(event.target) || event.repeat) return;
      const combo = normalizeCombo(event);
      if (switchCombo && combo === switchCombo) {
        event.preventDefault();
        setTab((current) => (current === "timeline" ? "today" : "timeline"));
      } else if (quickAddCombo && combo === quickAddCombo) {
        event.preventDefault();
        setQuickAdd({ text: "" });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, suspended, quickAdd, onClose, switchCombo, quickAddCombo, setTab]);

  // A task added toward a milestone joins that milestone's project and takes its category,
  // and the project's span grows if the task falls outside it
  function addFromQuickAdd(item) {
    const milestone = item.courseId ? todos.find((todo) => todo.id === item.courseId) : null;
    const project = milestone ? planner.projects.find((candidate) => candidate.id === milestone.projectId) : null;
    const course = project ? courseMap[project.courseId] : null;
    onAddTodo({
      ...item,
      type: "task",
      courseId: course && !course.archived ? course.id : null,
      projectId: project?.id ?? null,
      milestoneId: milestone?.id ?? null,
    });
    if (project && item.dueDate && (item.dueDate < project.startDate || item.dueDate > project.endDate)) {
      updatePlanner((current) => ({
        ...current,
        projects: current.projects.map((candidate) => (candidate.id === project.id
          ? { ...candidate, startDate: item.dueDate < candidate.startDate ? item.dueDate : candidate.startDate, endDate: item.dueDate > candidate.endDate ? item.dueDate : candidate.endDate }
          : candidate)),
      }));
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="modal-backdrop fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-6"
        onPointerDown={(event) => { pressStartedOnBackdrop.current = event.target === event.currentTarget; }}
        // A drag that starts inside and ends out here must not count as a click on the backdrop
        onClick={(event) => { if (event.target === event.currentTarget && pressStartedOnBackdrop.current) onClose(); }}
      >
        <div ref={surfaceRef} role="dialog" aria-modal="true" aria-label="Planner" className="modal-surface flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-dialog border border-slate-200 bg-white shadow-xl">
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 px-4">
            <h2 className="text-sm font-semibold text-slate-900">Planner</h2>
            <div className="shrink-0" title={switchCombo ? `Switch views (${comboLabel(switchCombo)})` : undefined}>
              <SegmentedControl label="Planner view" className="inline-grid" segmentClassName="px-4" options={TABS} value={tab} onChange={setTab} />
            </div>
            <span aria-hidden="true" className="h-5 w-px shrink-0 bg-slate-200" />
            <div ref={setToolbar} className="flex min-w-0 flex-1 items-center gap-2" />
            <button
              type="button"
              onClick={() => setQuickAdd({ text: "" })}
              title="Add a task, using @ to pick its milestone"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 py-1 pr-1.5 pl-2 text-xs font-medium text-slate-600 hover:border-slate-300"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Task
              {quickAddCombo && <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-sans text-[11px] text-slate-500">{comboLabel(quickAddCombo)}</kbd>}
            </button>
            <button type="button" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close planner">
              <CloseIcon />
            </button>
          </div>
          <div key={tab} className="planner-tab-enter min-h-0 flex-1">
            {tab === "timeline" ? (
              <ProjectTimeline
                todos={todos}
                courses={courses}
                courseMap={courseMap}
                toolbar={toolbar}
                planner={planner}
                updatePlanner={updatePlanner}
                onAddTodo={onAddTodo}
                onUpdateTodo={onUpdateTodo}
                onEdit={onEdit}
                onDeleteProject={onDeleteProject}
                onQuickAdd={(text) => setQuickAdd({ text })}
              />
            ) : (
              <DayPlanner todos={todos} courseMap={courseMap} toolbar={toolbar} planner={planner} updatePlanner={updatePlanner} onToggleTodo={onToggleTodo} onEdit={onEdit} />
            )}
          </div>
        </div>
      </div>
      {/* Outside the planner's surface: its transform would otherwise trap this fixed overlay inside it */}
      <QuickAddModal
        open={Boolean(quickAdd)}
        mode="planner"
        initialText={quickAdd?.text ?? ""}
        courses={milestoneMentions}
        onAdd={addFromQuickAdd}
        onClose={() => setQuickAdd(null)}
      />
    </>
  );
}
