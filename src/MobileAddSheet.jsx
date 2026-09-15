import { useState } from "react";
import AddTodoForm from "./AddTodoForm";
import QuickAddModal from "./QuickAddModal";

export default function MobileAddSheet({ open, courses, onAdd, onClose }) {
  const [mode, setMode] = useState("quick");

  if (!open) return null;

  return (
    <div className="mobile-sheet-backdrop" onClick={onClose}>
      <section className="mobile-add-sheet" onClick={(event) => event.stopPropagation()} aria-label="Add task or event">
        <div className="mobile-sheet-handle" />
        <div className="mb-4 flex items-center justify-between">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-todo-600">New item</p><h2 className="mt-1 text-lg font-bold text-slate-900">Add to your day</h2></div>
          <button type="button" onClick={onClose} className="mobile-icon-button" aria-label="Close add sheet">×</button>
        </div>
        <div className="mb-3 flex gap-1 rounded-xl bg-slate-100 p-1">
          <button type="button" onClick={() => setMode("quick")} className={`mobile-segment ${mode === "quick" ? "mobile-segment-active" : ""}`}>Quick syntax</button>
          <button type="button" onClick={() => setMode("manual")} className={`mobile-segment ${mode === "manual" ? "mobile-segment-active" : ""}`}>Manual fields</button>
        </div>
        {mode === "quick" ? <div className="mobile-quick-add"><QuickAddModal open embedded courses={courses} onAdd={(item) => { onAdd(item); onClose(); }} onClose={onClose} /></div> : <AddTodoForm courses={courses} onAdd={(item) => { onAdd(item); onClose(); }} />}
      </section>
    </div>
  );
}