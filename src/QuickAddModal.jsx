import { useEffect, useMemo, useRef, useState } from "react";
import { extractLinks } from "./noteLinks";
import { CloseIcon } from "./icons";
import { parseQuickAdd, SUGGESTION_KEYWORDS } from "./quickAdd";

function getCurrentToken(text, cursorPos) {
  const before = text.slice(0, cursorPos);
  const match = before.match(/(\S+)$/);
  if (!match) return null;
  return { token: match[1], start: match.index };
}

// Timeline tasks are one-off: a weekday names a single due date (the next one), not a repeat,
// unless "weekly" asks for one; with no date at all, `defaultDueDate` fills one in
function plannerDraft(parsed, defaultDueDate) {
  const weekly = parsed.repeat === "weekly";
  let draft = { ...parsed, repeatDays: weekly ? parsed.repeatDays : [], dueDates: parsed.dueDate ? [parsed.dueDate] : [] };
  if (!draft.dueDate) {
    const fallback = defaultDueDate?.(draft);
    if (fallback) draft = { ...draft, dueDate: fallback.date, dueDates: [fallback.date], dueDateSource: fallback.label };
  }
  return draft;
}

function getSuggestions(text, cursorPos, courses, planner = false) {
  const current = getCurrentToken(text, cursorPos);
  if (!current) return [];
  const { token, start } = current;

  // Keep suggesting categories past a space, since names like "Comp Sci" contain one
  const mention = text.slice(0, cursorPos).match(/@([^@]*)$/);
  if (mention) {
    const q = mention[1].toLowerCase().replace(/\s+/g, " ");
    const matches = courses.filter((c) => c.name.toLowerCase().startsWith(q) && c.name.toLowerCase() !== q.trimEnd());
    if (matches.length || token.startsWith("@")) {
      return matches.map((c) => ({ label: `@${c.name}`, hint: c.hint ?? "category", color: c.color, insert: `@${c.name}`, start: mention.index }));
    }
  }

  const q = token.toLowerCase();
  if (q.length < 1) return [];
  // Everything in the planner is a task, so the task / event markers aren't offered there
  return SUGGESTION_KEYWORDS.filter((k) => k.insert.startsWith(q) && k.insert !== q && !(planner && (k.insert === "tk" || k.insert === "ev"))).map((k) => ({
    label: k.insert,
    hint: k.hint,
    insert: k.insert,
    start,
  }));
}

function formatDate(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  const year = d.getFullYear() === new Date().getFullYear() ? undefined : "numeric";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year });
}

function formatTime(t) {
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatRepeatDays(days) {
  return days
    .map((day) => day.charAt(0).toUpperCase() + day.slice(1))
    .join(", ");
}

// In the planner, "@" picks a milestone instead of a category (pass the milestones as `courses`),
// everything added is a task, and it docks at the bottom of the planner without a scrim so the
// timeline stays visible and scrollable; `onPreviewChange` reports the parsed draft as you type
export default function QuickAddModal({ open, embedded = false, mode = "default", initialText = "", title, subtitle, courses, onAdd, onClose, onPreviewChange, defaultDueDate }) {
  const planner = mode === "planner";
  const [text, setText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setText(initialText);
      setError(null);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, initialText]);

  const cursorPos = text.length;
  const suggestions = useMemo(() => getSuggestions(text, cursorPos, courses, planner).slice(0, 6), [text, cursorPos, courses, planner]);
  const preview = useMemo(() => {
    if (!text.trim()) return null;
    const parsed = parseQuickAdd(text, courses);
    return planner ? plannerDraft(parsed, defaultDueDate) : parsed;
  }, [text, courses, planner, defaultDueDate]);
  const previewCourse = preview?.courseId ? courses.find((c) => c.id === preview.courseId) : null;

  useEffect(() => setActiveIndex(0), [text]);
  useEffect(() => {
    if (open) onPreviewChange?.(preview);
  }, [open, preview, onPreviewChange]);

  if (!open) return null;

  function acceptSuggestion(s) {
    const next = text.slice(0, s.start) + s.insert + " " + text.slice(cursorPos);
    setText(next);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function submit() {
    const raw = parseQuickAdd(text, courses);
    const parsed = planner ? plannerDraft(raw, defaultDueDate) : raw;
    if (!parsed.title.trim()) return;
    if (!planner && !parsed.typeExplicit) {
      setError('Add "tk" for task or "ev" for event at the end');
      return;
    }
    onAdd({
      type: planner ? "task" : parsed.type,
      title: parsed.title,
      courseId: parsed.courseId,
      dueDate: parsed.dueDate,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      priority: parsed.priority,
      description: parsed.description,
      repeat: parsed.repeat,
      repeatDays: parsed.repeatDays,
      dueDates: parsed.dueDates,
    });
    // In the planner, the next task starts toward the same milestone, so a milestone's tasks can be
    // entered one after another
    const milestone = planner && parsed.courseId ? courses.find((c) => c.id === parsed.courseId) : null;
    setText(milestone ? `@${milestone.name} ` : "");
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
      if (!text.trim()) {
        onClose();
        return;
      }
      submit();
    }
    if (e.key === "Escape") {
      // Docked in the planner, Escape belongs to this panel and must not also close the planner
      if (planner) e.stopPropagation();
      if (suggestions.length === 0) onClose();
    }
  }

  return (
    <div
      className={embedded ? "mobile-quick-content" : planner ? "pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-center p-4" : "modal-scrim fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 pt-24"}
      onClick={embedded || planner ? undefined : onClose}
    >
      <div
        role={planner ? "dialog" : undefined}
        aria-label={planner ? title : undefined}
        className={embedded ? "w-full" : planner ? "quick-dock-enter glass-light pointer-events-auto w-full max-w-xl rounded-sheet p-4" : "w-full max-w-lg rounded-sheet border border-slate-200 bg-white p-4 shadow-xl"}
        onClick={embedded || planner ? undefined : (e) => e.stopPropagation()}
      >
        {planner ? (
          <div className="mb-2 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
              {subtitle && <div className="mt-0.5 text-xs text-slate-600">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} className="-mt-1 -mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-900/5 hover:text-slate-800" aria-label="Close quick add">
              <CloseIcon />
            </button>
          </div>
        ) : (
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Quick add</h2>
        )}

        <div className="relative">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="done"
            placeholder={planner ? "Write intro @Draft due tomorrow" : "Essay @Math tomorrow 3pm !weekly tk"}
            className="w-full rounded-lg border border-todo-300 px-3 py-2 text-sm outline-none focus:border-todo-500 focus:ring-2 focus:ring-todo-500/20"
          />

          {suggestions.length > 0 && (
            <ul className={`absolute inset-x-0 z-10 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ${planner ? "bottom-full mb-1" : "top-full mt-1"}`}>
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
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-800">
              {preview.title || <span className="text-slate-300 italic">Untitled…</span>}
            </p>
            {preview.description && <p className="mt-1 text-xs text-slate-500">{preview.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full border px-2 py-1 text-xs font-medium ${
                  planner || preview.typeExplicit ? "border-slate-200 bg-white text-slate-600" : "border-dashed border-amber-300 bg-amber-50 text-amber-700"
                }`}
              >
                {planner ? "Task" : preview.typeExplicit ? (preview.type === "event" ? "Event" : "Task") : "tk / ev ?"}
              </span>

              {previewCourse ? (
                <span
                  className="rounded-full border px-2 py-1 text-xs font-medium"
                  style={{ backgroundColor: `${previewCourse.color}1f`, borderColor: `${previewCourse.color}55`, color: previewCourse.color }}
                >
                  {planner ? `◆ ${previewCourse.name}` : `@${previewCourse.name}`}
                </span>
              ) : (
                <span className="rounded-full border border-dashed border-slate-300 px-2 py-1 text-xs font-medium text-slate-400">{planner ? "no milestone" : "no category"}</span>
              )}

              {preview.dueDate ? (
                <span
                  className={`rounded-full border px-2 py-1 text-xs font-medium ${preview.dueDateSource ? "border-dashed border-slate-300 bg-white/60 text-slate-500" : "border-slate-200 bg-white text-slate-600"}`}
                  title={preview.dueDateSource ? `No date typed, so it's due on the ${preview.dueDateSource}` : undefined}
                >
                  {preview.repeatDays?.length > 1
                    ? formatRepeatDays(preview.repeatDays)
                    : formatDate(preview.dueDate)}
                  {preview.dueDateSource && <span className="font-normal"> · {preview.dueDateSource}</span>}
                </span>
              ) : (
                <span className="rounded-full border border-dashed border-slate-300 px-2 py-1 text-xs font-medium text-slate-400">no date</span>
              )}

              {preview.startTime ? (
                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">
                  {formatTime(preview.startTime)}
                  {preview.endTime ? ` – ${formatTime(preview.endTime)}` : ""}
                </span>
              ) : (
                <span className="rounded-full border border-dashed border-slate-300 px-2 py-1 text-xs font-medium text-slate-400">no time</span>
              )}

              {preview.repeat !== "none" && (
                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 capitalize">
                  ↻ {preview.repeat}{preview.repeat === "weekly" && preview.repeatDays?.length ? ` (${preview.repeatDays.join(", ")})` : ""}
                </span>
              )}
              {preview.priority === "urgent" && (
                <span className="rounded-full border border-urgent-200 bg-urgent-100 px-2 py-1 text-xs font-medium text-urgent-700">Urgent</span>
              )}
              {extractLinks(preview.description).map((link) => (
                <span key={link.href} title={link.href} className="rounded-full border border-link-200 bg-link-100 px-2 py-1 text-xs font-medium text-link-700">
                  ↗ {link.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mt-1.5 text-xs font-medium text-danger-600">{error}</p>}

        {planner ? (
          // Docked over the timeline, the guide stays to one line so the panel covers as little as possible
          <p className="mt-2.5 text-[11px] leading-relaxed text-slate-600">
            {[["@milestone", "milestone"], ["tomorrow / mon / nov 11", "date"], ["3pm", "time"], ["weekly", "repeat"], ["!", "urgent"], ["[note]", "note"]].map(([syntax, meaning]) => (
              <span key={syntax} className="mr-2.5 inline-block whitespace-nowrap">
                <span className="rounded bg-white/80 px-1 py-0.5 font-mono text-slate-800">{syntax}</span> {meaning}
              </span>
            ))}
          </p>
        ) : (
          <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <p className="mb-1 font-semibold text-slate-600">Formatting guide</p>
            {planner
              ? <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">@Milestone</span> — counts it toward a milestone, e.g. <span className="font-mono">@Draft due</span></p>
              : <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">@Category</span> — assign a category, e.g. <span className="font-mono">@Math</span></p>}
            <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">today / tomorrow / mon / 9/20 / nov 11</span> — sets the due date</p>
            <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">3pm / 9:30am / 3pm-4pm</span> — sets start (and end) time</p>
            <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">daily / weekly / monthly</span> — sets how often it repeats</p>
            <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">!</span> or <span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">urgent</span> — marks it urgent</p>
            <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">[note]</span> — adds additional info</p>
            {!planner && <p><span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">tk</span> or <span className="rounded bg-white px-1 py-0.5 font-mono text-slate-700">ev</span> (anywhere, usually at the end) — required: task or event</p>}
            <p className="pt-1 text-slate-400">Everything else becomes the title. Press <span className="font-mono">Tab</span> to accept a suggestion, <span className="font-mono">Enter</span> to add.</p>
          </div>
        )}
      </div>
    </div>
  );
}
