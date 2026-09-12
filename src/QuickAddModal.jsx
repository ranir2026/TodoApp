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
      .map((c) => ({ label: `@${c.name}`, hint: "course", insert: `@${c.name}`, start }));
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

export default function QuickAddModal({ open, courses, onAdd, onClose }) {
  const [text, setText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setText("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const cursorPos = text.length;
  const suggestions = useMemo(() => getSuggestions(text, cursorPos, courses).slice(0, 6), [text, cursorPos, courses]);

  useEffect(() => setActiveIndex(0), [text]);

  if (!open) return null;

  function acceptSuggestion(s) {
    const next = text.slice(0, s.start) + s.insert + " " + text.slice(cursorPos);
    setText(next);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function submit() {
    const parsed = parseQuickAdd(text, courses);
    if (!parsed.title.trim()) return;
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
      if (e.key === "Escape") {
        e.preventDefault();
        setText((t) => t);
        setActiveIndex(0);
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
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Essay @Math tomorrow 3pm !weekly"
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
                      i === activeIndex ? "bg-todo-50 text-slate-900" : "text-slate-700"
                    }`}
                  >
                    <span className="font-mono">{s.label}</span>
                    <span className="text-xs text-slate-400">{s.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <p className="mb-1 font-semibold text-slate-600">Formatting guide</p>
          <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">@Course</span> — assign a course, e.g. <span className="font-mono">@Math</span></p>
          <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">today / tomorrow / tmrw / mon / 9/20</span> — sets the due date</p>
          <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">3pm / 9:30am / 3pm-4pm</span> — sets start (and end) time</p>
          <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">daily / weekly / monthly</span> — sets how often it repeats</p>
          <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">!</span> or <span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">urgent</span> — marks it urgent</p>
          <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">event:</span> at the start — creates an event instead of a task</p>
          <p className="pt-1 text-slate-400">Everything else becomes the title. Press <span className="font-mono">Tab</span> to accept a suggestion, <span className="font-mono">Enter</span> to add.</p>
        </div>
      </div>
    </div>
  );
}
