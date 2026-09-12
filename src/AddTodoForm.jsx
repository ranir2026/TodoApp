import { forwardRef, useState } from "react";

const AddTodoForm = forwardRef(function AddTodoForm({ courses, onAdd }, ref) {
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [priority, setPriority] = useState("normal");

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      courseId: courseId || courses[0]?.id || null,
      dueDate: dueDate || null,
      startTime: startTime || null,
      endTime: endTime || null,
      priority,
    });
    setTitle("");
    setDueDate("");
    setStartTime("");
    setEndTime("");
    setPriority("normal");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <input
        ref={ref}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task..."
        className="min-w-[180px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-todo-500 focus:ring-2 focus:ring-todo-500/20"
      />
      <select
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
        className="rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-course-500"
      >
        {courses.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500"
      />
      <input
        type="time"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        title="Start time (optional)"
        className="rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500"
      />
      <span className="text-xs text-slate-300">to</span>
      <input
        type="time"
        value={endTime}
        onChange={(e) => setEndTime(e.target.value)}
        title="End time (optional)"
        className="rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500"
      />
      <button
        type="button"
        onClick={() => setPriority(priority === "urgent" ? "normal" : "urgent")}
        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          priority === "urgent" ? "bg-urgent-100 text-urgent-700" : "bg-slate-100 text-slate-500"
        }`}
      >
        Urgent
      </button>
      <button
        type="submit"
        className="rounded-lg bg-todo-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-todo-600"
      >
        Add
      </button>
    </form>
  );
});

export default AddTodoForm;
