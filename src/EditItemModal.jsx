import { useEffect, useState } from "react";
import { REPEAT_OPTIONS } from "./occurrences";

export default function EditItemModal({ item, courses, onSave, onDelete, onSkipOccurrence, onClose }) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (item) {
      setForm({
        type: item.type ?? "task",
        title: item.title,
        courseId: item.courseId ?? courses[0]?.id ?? "",
        dueDate: item.dueDate ?? "",
        endDate: item.endDate ?? "",
        startTime: item.startTime ?? "",
        endTime: item.endTime ?? "",
        priority: item.priority ?? "normal",
        description: item.description ?? "",
        repeat: item.repeat ?? "none",
        repeatDays: item.repeatDays ?? [],
        repeatUntil: item.repeatUntil ?? "",
        repeatCount: item.repeatCount ?? "",
      });
    } else {
      setForm(null);
    }
  }, [item, courses]);

  if (!item || !form) return null;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave(item.id, {
      ...form,
      title: form.title.trim(),
      dueDate: form.dueDate || null,
      endDate: form.type === "event" ? form.endDate || null : null,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      description: form.description.trim() || null,
      repeatUntil: form.repeat !== "none" ? form.repeatUntil || null : null,
      repeatCount: form.repeat !== "none" && form.repeatCount ? Number(form.repeatCount) : null,
      repeatDays: form.repeat === "weekly" ? form.repeatDays : null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Edit {form.type}</h2>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {["task", "event"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => update("type", t)}
                className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize transition-colors ${
                  form.type === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <input
          autoFocus
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-todo-500"
        />
        <select
          value={form.courseId}
          onChange={(e) => update("courseId", e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-course-500"
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={form.dueDate ?? ""}
            onChange={(e) => update("dueDate", e.target.value)}
            title={form.type === "event" ? "Event date" : "Due date"}
            className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500"
          />
          {form.type === "event" && (
            <>
              <span className="text-xs text-slate-300">to</span>
              <input
                type="date"
                value={form.endDate ?? ""}
                onChange={(e) => update("endDate", e.target.value)}
                title="Event end date (optional, for multi-day events)"
                className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500"
              />
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="time"
            value={form.startTime ?? ""}
            onChange={(e) => update("startTime", e.target.value)}
            className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500"
          />
          <span className="text-xs text-slate-300">to</span>
          <input
            type="time"
            value={form.endTime ?? ""}
            onChange={(e) => update("endTime", e.target.value)}
            className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500"
          />
        </div>
        <textarea
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Notes (optional)"
          rows={3}
          className="w-full resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 outline-none focus:border-todo-500"
        />
        <select
          value={form.repeat}
          onChange={(e) => update("repeat", e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500"
        >
          {REPEAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {form.repeat !== "none" && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={form.repeatUntil} onChange={(e) => update("repeatUntil", e.target.value)} title="Repeat until this date (optional)" className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500" />
            <input type="number" min="1" value={form.repeatCount} onChange={(e) => update("repeatCount", e.target.value)} placeholder="# times" title="Maximum number of occurrences (optional)" className="w-24 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-600 outline-none focus:border-todo-500" />
          </div>
        )}
        <button
          type="button"
          onClick={() => update("priority", form.priority === "urgent" ? "normal" : "urgent")}
          className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            form.priority === "urgent" ? "bg-urgent-100 text-urgent-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          Urgent
        </button>

        <div className="mt-2 flex items-center gap-2">
          {form.repeat !== "none" && item.occurrenceDate && (
            <button
              type="button"
              onClick={() => onSkipOccurrence(item.id, item.occurrenceDate)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-urgent-700 hover:bg-urgent-500/10"
            >
              Skip this date
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-danger-600 hover:bg-danger-500/10"
          >
            Delete
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:border-slate-300">
            Cancel
          </button>
          <button type="submit" className="rounded-lg bg-todo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-todo-600">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
