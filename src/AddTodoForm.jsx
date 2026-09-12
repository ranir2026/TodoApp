import { forwardRef, useState } from "react";
import { REPEAT_OPTIONS } from "./occurrences";

const AddTodoForm = forwardRef(function AddTodoForm({ courses, onAdd }, ref) {
  const [type, setType] = useState("task");
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");
  const [repeat, setRepeat] = useState("none");

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      type,
      title: title.trim(),
      courseId: courseId || courses[0]?.id || null,
      dueDate: dueDate || null,
      startTime: startTime || null,
      endTime: endTime || null,
      priority,
      description: description.trim() || null,
      repeat,
    });
    setTitle("");
    setDueDate("");
    setStartTime("");
    setEndTime("");
    setPriority("normal");
    setDescription("");
    setRepeat("none");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
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

      <input
        ref={ref}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={type === "event" ? "Add an event..." : "Add a task..."}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-todo-500 focus:ring-2 focus:ring-todo-500/20"
      />
      <select
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-course-500"
      >
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
    </form>
  );
});

export default AddTodoForm;
