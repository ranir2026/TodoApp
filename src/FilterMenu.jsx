import { useEffect, useRef, useState } from "react";
import { activeFilterCount } from "./filters";

const SELECT = "field-tint w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none";

// The list's less-used filters, folded into one button so the toolbar fits beside the Today panel.
// The menu grows out of the button and fades back into it; Esc or a click outside closes it.
export default function FilterMenu({ courses, filters, onChange, onReset }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const closeTimerRef = useRef(null);
  const count = activeFilterCount(filters);

  function close({ restoreFocus = false } = {}) {
    if (!open || closing) return;
    setClosing(true);
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => { setOpen(false); setClosing(false); }, 120);
    if (restoreFocus) buttonRef.current?.focus();
  }

  function toggle() {
    if (open && !closing) close();
    else {
      clearTimeout(closeTimerRef.current);
      setClosing(false);
      setOpen(true);
    }
  }

  useEffect(() => {
    if (!open || closing) return undefined;
    const onPointerDown = (event) => { if (!rootRef.current?.contains(event.target)) close(); };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open && !closing}
        aria-haspopup="dialog"
        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
          count ? "border-slate-300 bg-slate-100 text-slate-800 hover:border-slate-400" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        }`}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3" />
        </svg>
        Filter
        {count > 0 && (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-slate-500 px-1 text-caption leading-none font-semibold text-white tabular-nums" aria-label={`${count} active`}>
            {count}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Filter tasks"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            close({ restoreFocus: true });
          }}
          className={`glass-light absolute top-full right-0 z-30 mt-1.5 w-60 space-y-2.5 rounded-card p-3 ${closing ? "menu-leave" : "menu-pop"}`}
        >
          <Field label="Category">
            <select value={filters.courseFilter} onChange={(e) => onChange({ courseFilter: e.target.value })} className={SELECT}>
              <option value="all">All categories</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.name}{course.archived ? " (archived)" : ""}</option>)}
            </select>
          </Field>
          <Field label="Show">
            <select value={filters.typeFilter} onChange={(e) => onChange({ typeFilter: e.target.value })} className={SELECT}>
              <option value="task">Tasks</option>
              <option value="event">Events</option>
              <option value="milestone">Milestones</option>
              <option value="all">Everything</option>
            </select>
          </Field>
          <Field label="Priority">
            <select value={filters.priorityFilter} onChange={(e) => onChange({ priorityFilter: e.target.value })} className={SELECT}>
              <option value="all">Any priority</option>
              <option value="urgent">Urgent</option>
              <option value="normal">Normal</option>
            </select>
          </Field>
          <Field label="Due">
            <select value={filters.dueFilter ?? ""} onChange={(e) => onChange({ dueFilter: e.target.value || null })} className={SELECT}>
              <option value="">Any time</option>
              <option value="soon">Due soon (48 hours)</option>
              <option value="overdue">Overdue</option>
            </select>
          </Field>
          <button
            type="button"
            onClick={onReset}
            disabled={!count}
            className="press-tint w-full rounded-lg py-1.5 text-xs font-medium text-course-600 transition-colors hover:bg-course-50 disabled:text-slate-300 disabled:hover:bg-transparent"
          >
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
