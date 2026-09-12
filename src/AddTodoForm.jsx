import { forwardRef, useState } from "react";
import { REPEAT_OPTIONS } from "./occurrences";
import { parseQuickAdd } from "./quickAdd";

const AddTodoForm = forwardRef(function AddTodoForm({ courses, onAdd }, ref) {
  const [title, setTitle] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [type, setType] = useState("task");
  const [courseId, setCourseId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");
  const [repeat, setRepeat] = useState("none");

  function reset() {
    setTitle("");
    setType("task");
    setCourseId("");
    setDueDate("");
    setStartTime("");
    setEndTime("");
    setPriority("normal");
    setDescription("");
    setRepeat("none");
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const parsed = parseQuickAdd(title, courses);
    if (!parsed.title.trim()) return;

    onAdd({
      type: type === "event" || parsed.type === "event" ? "event" : "task",
      title: parsed.title,
      courseId: courseId || parsed.courseId || courses[0]?.id || null,
      dueDate: dueDate || parsed.dueDate || null,
      startTime: startTime || parsed.startTime || null,
      endTime: endTime || parsed.endTime || null,
      priority: priority === "urgent" || parsed.priority === "urgent" ? "urgent" : "normal",
      description: description.trim() || null,
      repeat: repeat !== "none" ? repeat : parsed.repeat,
    });
    reset();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <input
        ref={ref}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder='Essay @Math tomorrow 3pm !weekly'
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-todo-500 focus:ring-2 focus:ring-todo-500/20"
      />
      <p className="text-[10px] leading-tight text-slate-400">
        @course &nbsp;·&nbsp; today / tomorrow / mon / 9/20 &nbsp;·&nbsp; 3pm or 3-4pm &nbsp;·&nbsp; daily/weekly/monthly &nbsp;·&nbsp; ! urgent &nbsp;·&nbsp; event: for events
      </p>

      <button
        type="button"
        onClick={() => setAdvancedOpen((o) => !o)}
        className="text-xs font-medium text-slate-400 hover:text-slate-600"
      >
        {advancedOpen ? "Hide details ▾" : "Add details ▸"}
      </button>

      {advancedOpen && (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {["task", "event"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
                  type === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-course-500"
          >
            <option value="">Course (from text, or default)</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500"
          />
          <div className="flex items-center gap-1.5">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              title="Start time (optional)"
              className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500"
            />
            <span className="text-xs text-slate-300">to</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              title="End time (optional)"
              className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500"
            />
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 outline-none focus:border-todo-500"
          />
          <select
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500"
          >
            {REPEAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPriority(priority === "urgent" ? "normal" : "urgent")}
            className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              priority === "urgent" ? "bg-urgent-100 text-urgent-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            Urgent
          </button>
        </div>
      )}

      <button
        type="submit"
        className="w-full rounded-lg bg-todo-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-todo-600"
      >
        Add
      </button>
    </form>
  );
});

export default AddTodoForm;
