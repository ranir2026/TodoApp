import { useEffect, useMemo, useRef, useState } from "react";
import { parseQuickAdd, SUGGESTION_KEYWORDS } from "./quickAdd";

function getCurrentToken(text, cursorPos) {
  const before = text.slice(0, cursorPos);
  const match = before.match(/(\S+)$/);
  if (!match) return null;
  return { token: match[1], start: match.index };
}

function getSuggestions(text, cursorPos, courses) {
  const current = getCurrentToken(text, cursorPos);
  if (!current) return [];
  const { token, start } = current;

  if (token.startsWith("@")) {
    const q = token.slice(1).toLowerCase();
    return courses
      .filter((c) => c.name.toLowerCase().startsWith(q))
      .map((c) => ({ label: `@${c.name}`, hint: "category", color: c.color, insert: `@${c.name}`, start }));
  }

  const q = token.toLowerCase();
  if (q.length < 1) return [];
  return SUGGESTION_KEYWORDS.filter((k) => k.insert.startsWith(q) && k.insert !== q).map((k) => ({
    label: k.insert,
    hint: k.hint,
    insert: k.insert,
    start,
  }));
}

function formatDate(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(t) {
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function QuickAddModal({ open, courses, onAdd, onClose }) {
  const [text, setText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setText("");
      setError(null);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const cursorPos = text.length;
  const suggestions = useMemo(() => getSuggestions(text, cursorPos, courses).slice(0, 6), [text, cursorPos, courses]);
  const preview = useMemo(() => (text.trim() ? parseQuickAdd(text, courses) : null), [text, courses]);
  const previewCourse = preview?.courseId ? courses.find((c) => c.id === preview.courseId) : null;

  useEffect(() => setActiveIndex(0), [text]);

  if (!open) return null;

  function acceptSuggestion(s) {
    const next = text.slice(0, s.start) + s.insert + " " + text.slice(cursorPos);
    setText(next);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function submit() {
    const parsed = parseQuickAdd(text, courses);
    if (!parsed.title.trim()) return;
    if (!parsed.typeExplicit) {
      setError('Add "tk" for task or "ev" for event at the end');
      return;
    }
    onAdd({
      type: parsed.type,
      title: parsed.title,
      courseId: parsed.courseId,
      dueDate: parsed.dueDate,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      priority: parsed.priority,
      description: null,
      repeat: parsed.repeat,
    });
    setText("");
    setError(null);
  }

  function handleKeyDown(e) {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && suggestions[activeIndex])) {
        e.preventDefault();
        acceptSuggestion(suggestions[activeIndex]);
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape" && suggestions.length === 0) {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 pt-24" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Quick add</h2>

        <div className="relative">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Essay @Math tomorrow 3pm !weekly tk"
            className="w-full rounded-lg border border-todo-300 px-3 py-2 text-sm outline-none focus:border-todo-500 focus:ring-2 focus:ring-todo-500/20"
          />

          {suggestions.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {suggestions.map((s, i) => (
                <li key={s.label}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => acceptSuggestion(s)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${
                      i === activeIndex ? "bg-todo-50" : ""
                    }`}
                  >
                    <span className="font-mono font-semibold" style={s.color ? { color: s.color } : undefined}>
                      {s.label}
                    </span>
                    <span className="text-xs text-slate-400">{s.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {preview && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-md border px-2 py-1 text-xs font-medium ${
                preview.typeExplicit ? "border-slate-200 bg-slate-100 text-slate-600" : "border-dashed border-amber-300 bg-amber-50 text-amber-700"
              }`}
            >
              {preview.typeExplicit ? (preview.type === "event" ? "Event" : "Task") : "tk / ev ?"}
            </span>
            {previewCourse && (
              <span
                className="rounded-md border px-2 py-1 text-xs font-medium"
                style={{ backgroundColor: `${previewCourse.color}1f`, borderColor: `${previewCourse.color}55`, color: previewCourse.color }}
              >
                @{previewCourse.name}
              </span>
            )}
            {preview.dueDate && (
              <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                {formatDate(preview.dueDate)}
              </span>
            )}
            {preview.startTime && (
              <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                {formatTime(preview.startTime)}
                {preview.endTime ? ` – ${formatTime(preview.endTime)}` : ""}
              </span>
            )}
            {preview.repeat !== "none" && (
              <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 capitalize">
                ↻ {preview.repeat}
              </span>
            )}
            {preview.priority === "urgent" && (
              <span className="rounded-md border border-urgent-200 bg-urgent-100 px-2 py-1 text-xs font-medium text-urgent-700">Urgent</span>
            )}
          </div>
        )}

        {error && <p className="mt-1.5 text-xs font-medium text-danger-600">{error}</p>}

        <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <p className="mb-1 font-semibold text-slate-600">Formatting guide</p>
          <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">@Category</span> — assign a category, e.g. <span className="font-mono">@Math</span></p>
          <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">today / tomorrow / tmrw / mon / 9/20</span> — sets the due date</p>
          <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">3pm / 9:30am / 3pm-4pm</span> — sets start (and end) time</p>
          <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">daily / weekly / monthly</span> — sets how often it repeats</p>
          <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">!</span> or <span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">urgent</span> — marks it urgent</p>
          <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">tk</span> or <span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">ev</span> (anywhere, usually at the end) — required: task or event</p>
          <p className="pt-1 text-slate-400">Everything else becomes the title. Press <span className="font-mono">Tab</span> to accept a suggestion, <span className="font-mono">Enter</span> to add.</p>
        </div>
      </div>
    </div>
  );
}
