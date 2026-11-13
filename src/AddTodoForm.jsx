import { forwardRef, useState } from "react";
import { REPEAT_OPTIONS } from "./occurrences";
import Collapsible, { Chevron } from "./Collapsible";

// Pass onToggleCollapsed to give the form a header that collapses it; without it the form is always open
const AddTodoForm = forwardRef(function AddTodoForm({ courses, onAdd, collapsed = false, onToggleCollapsed }, ref) {
  const [type, setType] = useState("task");
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");
  const [repeat, setRepeat] = useState("none");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [repeatCount, setRepeatCount] = useState("");
  // The remembered category may have been archived or deleted since it was picked
  const selectedCourseId = courses.some((c) => c.id === courseId) ? courseId : courses[0]?.id ?? "";
  const open = !onToggleCollapsed || !collapsed;

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      type,
      title: title.trim(),
      courseId: selectedCourseId || null,
      dueDate: dueDate || null,
      endDate: type === "event" ? endDate || null : null,
      startTime: startTime || null,
      endTime: endTime || null,
      priority,
      description: description.trim() || null,
      repeat,
      repeatUntil: repeat !== "none" ? repeatUntil || null : null,
      repeatCount: repeat !== "none" ? repeatCount || null : null,
    });
    setTitle("");
    setDueDate("");
    setEndDate("");
    setStartTime("");
    setEndTime("");
    setPriority("normal");
    setDescription("");
    setRepeat("none");
    setRepeatUntil("");
    setRepeatCount("");
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-card border border-slate-200 bg-white p-3 shadow-sm">
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={open}
          aria-controls="add-todo-fields"
          className="-m-1 flex w-[calc(100%+0.5rem)] items-center gap-1 rounded-lg p-1 text-left text-xs font-semibold text-slate-700 hover:text-slate-900"
        >
          <Chevron open={open} />
          Add manually
        </button>
      )}
      <Collapsible open={open} id={onToggleCollapsed ? "add-todo-fields" : undefined}>
      <div className={`space-y-2 ${onToggleCollapsed ? "pt-2.5" : ""}`}>
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {["task", "event"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 rounded px-2 py-1 text-xs font-medium capitalize transition-colors ${
              type === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <input
        ref={ref}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={type === "event" ? "Add an event..." : "Add a task..."}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm field-tint outline-none"
      />
      <select
        value={selectedCourseId}
        onChange={(e) => setCourseId(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 field-tint outline-none"
      >
        {courses.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          title={type === "event" ? "Event date" : "Due date"}
          className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 field-tint outline-none"
        />
        {type === "event" && (
          <>
            <span className="text-xs text-slate-300">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="Event end date (optional, for multi-day events)"
              className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 field-tint outline-none"
            />
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          title="Start time (optional)"
          className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 field-tint outline-none"
        />
        <span className="text-xs text-slate-300">to</span>
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          title="End time (optional)"
          className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 field-tint outline-none"
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 field-tint outline-none"
      />
      <select
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 field-tint outline-none"
      >
        {REPEAT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {repeat !== "none" && (
        <div className="flex items-center gap-1.5">
          <input type="date" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} title="Repeat until this date (optional)" className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 field-tint outline-none" />
          <input type="number" min="1" value={repeatCount} onChange={(e) => setRepeatCount(e.target.value)} placeholder="# times" title="Maximum number of occurrences (optional)" className="w-24 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 field-tint outline-none" />
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPriority(priority === "urgent" ? "normal" : "urgent")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            priority === "urgent" ? "bg-urgent-100 text-urgent-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          Urgent
        </button>
        <button
          type="submit"
          className="flex-1 rounded-lg bg-todo-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-todo-600"
        >
          Add
        </button>
      </div>
      </div>
      </Collapsible>
    </form>
  );
});

export default AddTodoForm;
