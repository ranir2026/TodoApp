import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SegmentedControl from "./SegmentedControl";
import DayPlanner from "./DayPlanner";
import ProjectTimeline from "./ProjectTimeline";
import QuickAddModal from "./QuickAddModal";
import { useLocalStorage } from "./useLocalStorage";
import { CloseIcon } from "./icons";
import { comboLabel, normalizeCombo } from "./keybinds";
import { projectColor } from "./planner";

const TABS = [
  { id: "today", label: "Today" },
  { id: "timeline", label: "Timeline" },
];

const isTyping = (target) => target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

// Desktop planner: plan the hours of a day, or lay projects out over weeks.
// `suspended` is set while another dialog (the item editor) sits on top, so Escape closes that one first.
export default function PlannerModal({ open, tabRequest, suspended, onClose, keymap, todos, courses, courseMap, planner, updatePlanner, onToggleTodo, onAddTodo, onUpdateTodo, onEdit, onDeleteProject }) {
  const [tab, setTab] = useLocalStorage("plannerTab", "today");
  // Opened from somewhere that wants a particular tab (the dashboard's Today panel): switch during
  // render so the planner never shows the other tab first
  const [handledRequest, setHandledRequest] = useState(tabRequest);
  if (tabRequest !== handledRequest) {
    setHandledRequest(tabRequest);
    if (tabRequest?.tab) setTab(tabRequest.tab);
  }
  // The planner's quick add for one project, where "@" picks one of its milestones: { projectId, text }
  const [quickAdd, setQuickAdd] = useState(null);
  // What's being typed there, previewed on the timeline as it would land
  const [draft, setDraft] = useState(null);
  const pressStartedOnBackdrop = useRef(false);
  const surfaceRef = useRef(null);
  const switchCombo = keymap?.plannerSwitchTab;
  // Each tab renders its own controls into the header (through a portal) instead of a second toolbar row
  const [toolbar, setToolbar] = useState(null);

  const quickAddProject = quickAdd ? planner.projects.find((project) => project.id === quickAdd.projectId) : null;

  // The project's milestones to "@"-mention, open ones soonest first
  const milestoneMentions = useMemo(() => {
    if (!quickAddProject) return [];
    const color = projectColor(quickAddProject, courseMap);
    return todos
      .filter((todo) => todo.type === "milestone" && todo.projectId === quickAddProject.id)
      .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
      .map((milestone) => ({ id: milestone.id, name: milestone.title, color, dueDate: milestone.dueDate, hint: milestone.completed ? "\u25c6 reached" : "\u25c6 milestone" }));
  }, [todos, quickAddProject, courseMap]);

  const closeQuickAdd = useCallback(() => {
    setQuickAdd(null);
    setDraft(null);
  }, []);
  // Without a date, a task is due when its milestone is, or when the project ends
  const defaultDueDate = useCallback((parsed) => {
    const milestone = parsed.courseId ? milestoneMentions.find((mention) => mention.id === parsed.courseId) : null;
    if (milestone?.dueDate) return { date: milestone.dueDate, label: "milestone date" };
    return quickAddProject?.endDate ? { date: quickAddProject.endDate, label: "project end" } : null;
  }, [milestoneMentions, quickAddProject]);

  const handlePreview = useCallback((preview) => {
    setDraft(preview?.title ? { title: preview.title, milestoneId: preview.courseId, dueDate: preview.dueDate } : null);
  }, []);

  useEffect(() => {
    if (!open || suspended) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") {
        // With the quick add docked open, Escape outside its field closes the quick add first
        if (quickAdd) closeQuickAdd();
        else if (event.target === document.body || surfaceRef.current?.contains(event.target)) onClose();
        return;
      }
      // The tab shortcut only fires when you aren't typing, doesn't repeat while held, and waits
      // while a quick add is open so its project stays on screen
      if (quickAdd || isTyping(event.target) || event.repeat) return;
      if (switchCombo && normalizeCombo(event) === switchCombo) {
        event.preventDefault();
        setTab((current) => (current === "timeline" ? "today" : "timeline"));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, suspended, quickAdd, onClose, closeQuickAdd, switchCombo, setTab]);

  // The task joins the project (and the "@" milestone, if any) and takes the project's category;
  // the project's span grows if the task falls outside it
  function addFromQuickAdd(item) {
    const project = quickAddProject;
    if (!project) return;
    const milestone = item.courseId ? todos.find((todo) => todo.id === item.courseId) : null;
    const course = courseMap[project.courseId];
    onAddTodo({
      ...item,
      type: "task",
      courseId: course && !course.archived ? course.id : null,
      projectId: project.id,
      milestoneId: milestone?.id ?? null,
    });
    if (item.dueDate && (item.dueDate < project.startDate || item.dueDate > project.endDate)) {
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
        <div ref={surfaceRef} role="dialog" aria-modal="true" aria-label="Planner" className="modal-surface relative flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-dialog border border-slate-200 bg-white shadow-xl">
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 px-4">
            <h2 className="text-sm font-semibold text-slate-900">Planner</h2>
            <div className="shrink-0" title={switchCombo ? `Switch views (${comboLabel(switchCombo)})` : undefined}>
              <SegmentedControl label="Planner view" className="inline-grid" segmentClassName="px-4" options={TABS} value={tab} onChange={(next) => { closeQuickAdd(); setTab(next); }} />
            </div>
            <span aria-hidden="true" className="h-5 w-px shrink-0 bg-slate-200" />
            <div ref={setToolbar} className="flex min-w-0 flex-1 items-center gap-2" />
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
                onToggleTodo={onToggleTodo}
                onQuickAdd={(projectId, text = "") => setQuickAdd({ projectId, text })}
                quickAddProjectId={quickAdd?.projectId ?? null}
                draft={quickAdd && draft ? { ...draft, projectId: quickAdd.projectId } : null}
                bottomInset={quickAdd ? 220 : 0}
              />
            ) : (
              <DayPlanner todos={todos} courseMap={courseMap} toolbar={toolbar} planner={planner} updatePlanner={updatePlanner} onToggleTodo={onToggleTodo} onEdit={onEdit} />
            )}
          </div>
          {/* Docked inside the planner with no scrim, so the timeline stays in view and scrollable */}
          {tab === "timeline" && quickAddProject && (
            <QuickAddModal
              key={quickAddProject.id}
              open
              mode="planner"
              title="Quick Add Task to Project"
              subtitle={
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: projectColor(quickAddProject, courseMap) }} />
                  <span className="truncate font-medium">{quickAddProject.name}</span>
                </span>
              }
              initialText={quickAdd.text}
              courses={milestoneMentions}
              onAdd={addFromQuickAdd}
              onClose={closeQuickAdd}
              onPreviewChange={handlePreview}
              defaultDueDate={defaultDueDate}
            />
          )}
        </div>
      </div>
    </>
  );
}
