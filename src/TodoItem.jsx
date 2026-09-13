import { parseDateKey } from "./occurrences";
import { courseAccentStyle, courseChipStyle } from "./courseColors";

function formatTime(t) {
  const [h, m] = t.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function timeRangeLabel(todo) {
  if (!todo.startTime) return null;
  return todo.endTime ? `${formatTime(todo.startTime)} – ${formatTime(todo.endTime)}` : formatTime(todo.startTime);
}

function dueLabel(dueDate) {
  if (!dueDate) return null;
  const due = parseDateKey(dueDate);
  const now = new Date();
  const diffDays = Math.ceil((due - now) / 86400000);
  if (diffDays < 0) return { text: "Overdue", tone: "text-danger-600 bg-danger-500/10" };
  if (diffDays === 0) return { text: "Due today", tone: "text-urgent-600 bg-urgent-500/10" };
  if (diffDays <= 2) return { text: `Due in ${diffDays}d`, tone: "text-todo-700 bg-todo-500/10" };
  return { text: due.toLocaleDateString(undefined, { month: "short", day: "numeric" }), tone: "text-slate-500 bg-slate-100" };
}

export default function TodoItem({ todo, course, onToggle, onDelete, onEdit, selected }) {
  const due = dueLabel(todo.dueDate);
  const timeRange = timeRangeLabel(todo);
  const isEvent = todo.type === "event";

  return (
    <li
      className={`group flex items-start gap-3 rounded-lg border bg-white px-4 py-3 transition-shadow hover:shadow-sm ${
        selected ? "border-todo-400 ring-2 ring-todo-400/30" : "border-slate-200"
      } border-l-4`}
      style={courseAccentStyle(course)}
    >
      <button
        onClick={() => onToggle(todo.id)}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          todo.completed
            ? "border-success-500 bg-success-500 text-white"
            : todo.priority === "urgent"
            ? "border-urgent-400 hover:border-urgent-600"
            : "border-slate-300 hover:border-todo-500"
        }`}
        aria-label="Toggle complete"
      >
        {todo.completed && (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 111.4-1.4l2.3 2.29 6.3-6.29a1 1 0 011.4 0z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      <button onClick={() => onEdit(todo)} className="min-w-0 flex-1 text-left">
        <p className={`text-sm font-medium ${todo.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>
          {todo.title}
          {todo.description && (
            <svg viewBox="0 0 20 20" fill="currentColor" className="ml-1.5 inline-block h-3 w-3 -translate-y-px text-slate-300">
              <path fillRule="evenodd" d="M2 4.75A2.75 2.75 0 014.75 2h10.5A2.75 2.75 0 0118 4.75v10.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25V4.75zM5 6.25a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 015 6.25zm0 3.5a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 015 9.75zm0 3.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
            </svg>
          )}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {isEvent && (
            <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={courseChipStyle(course)}>Event</span>
          )}
          {course && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={courseChipStyle(course)}
            >
              {course.name}
            </span>
          )}
          {todo.priority === "urgent" && (
            <span className="rounded-full bg-urgent-100 px-2 py-0.5 text-xs font-medium text-urgent-700">
              Urgent
            </span>
          )}
          {due && !todo.completed && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${due.tone}`}>{due.text}</span>
          )}
          {timeRange && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{timeRange}</span>
          )}
          {todo.repeat && todo.repeat !== "none" && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 capitalize">↻ {todo.repeat}</span>
          )}
        </div>
      </button>

      <button
        onClick={() => onDelete(todo.id)}
        className="shrink-0 rounded-md p-1 text-slate-300 opacity-0 transition-opacity hover:text-danger-500 group-hover:opacity-100"
        aria-label="Delete"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
        </svg>
      </button>
    </li>
  );
}
