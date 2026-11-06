import { useEffect, useRef, useState } from "react";
import SegmentedControl from "./SegmentedControl";
import DayPlanner from "./DayPlanner";
import ProjectTimeline from "./ProjectTimeline";
import { useLocalStorage } from "./useLocalStorage";
import { CloseIcon } from "./icons";

const TABS = [
  { id: "today", label: "Today" },
  { id: "timeline", label: "Timeline" },
];

// Desktop planner: plan the hours of a day, or lay projects out over weeks.
// `suspended` is set while another dialog (the item editor) sits on top, so Escape closes that one first.
export default function PlannerModal({ open, suspended, onClose, todos, courses, courseMap, planner, updatePlanner, onToggleTodo, onAddTodo, onUpdateTodo, onEdit, onDeleteProject }) {
  const [tab, setTab] = useLocalStorage("plannerTab", "today");
  const pressStartedOnBackdrop = useRef(false);
  // Each tab renders its own controls into the header (through a portal) instead of a second toolbar row
  const [toolbar, setToolbar] = useState(null);

  useEffect(() => {
    if (!open || suspended) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, suspended, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-6"
      onPointerDown={(event) => { pressStartedOnBackdrop.current = event.target === event.currentTarget; }}
      // A drag that starts inside and ends out here must not count as a click on the backdrop
      onClick={(event) => { if (event.target === event.currentTarget && pressStartedOnBackdrop.current) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Planner" className="modal-surface flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-dialog border border-slate-200 bg-white shadow-xl">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 px-4">
          <h2 className="text-sm font-semibold text-slate-900">Planner</h2>
          <SegmentedControl label="Planner view" className="inline-grid shrink-0" segmentClassName="px-4" options={TABS} value={tab} onChange={setTab} />
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
            />
          ) : (
            <DayPlanner todos={todos} courseMap={courseMap} toolbar={toolbar} planner={planner} updatePlanner={updatePlanner} onToggleTodo={onToggleTodo} onEdit={onEdit} />
          )}
        </div>
      </div>
    </div>
  );
}
