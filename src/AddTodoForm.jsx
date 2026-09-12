import { useState } from "react";

export default function AddTodoForm({ courses, onAdd }) {
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("normal");

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), courseId: courseId || null, dueDate: dueDate || null, priority });
    setTitle("");
    setDueDate("");
    setPriority("normal");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <input
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
        <option value="">No course</option>
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
}
