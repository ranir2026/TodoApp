import { useEffect, useRef, useState } from "react";
import { isOverdue, parseDateKey } from "./occurrences";
import { useSwipeToDelete } from "./useSwipeToDelete";
import { extractLinks } from "./noteLinks";
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

function dueLabel(todo, isEvent) {
  const { dueDate } = todo;
  if (!dueDate) return null;
  const due = parseDateKey(dueDate);
  const now = new Date();
  if (isEvent) return { text: `On ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, tone: "text-slate-500 bg-slate-100" };

  if (isOverdue(todo, now)) return { text: "Overdue", tone: "text-danger-600 bg-danger-500/10" };
  const diffDays = Math.round((due - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);

  if (diffDays < 0) return { text: "Overdue", tone: "text-danger-600 bg-danger-500/10" };
  // Status colors: red is overdue, amber is due soon (strongest today), violet is kept for Urgent priority
  if (diffDays === 0) return { text: "Due today", tone: "text-todo-700 bg-todo-100 font-semibold" };
  if (diffDays === 1) return { text: "Due tomorrow", tone: "text-todo-700 bg-todo-500/10" };
  if (diffDays <= 7) return { text: `Due ${due.toLocaleDateString(undefined, { weekday: "short" })}`, tone: "text-todo-700 bg-todo-500/10" };
  return { text: due.toLocaleDateString(undefined, { month: "short", day: "numeric" }), tone: "text-slate-500 bg-slate-100" };
}

function CheckIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 111.4-1.4l2.3 2.29 6.3-6.29a1 1 0 011.4 0z" clipRule="evenodd" />
    </svg>
  );
}

function openLink(event, href) {
  event.stopPropagation();
  event.preventDefault();
  window.open(href, "_blank", "noopener,noreferrer");
}

const SMALL_CHIP = "shrink-0 rounded-full px-1.5 py-px text-caption font-medium";

// A milestone's tasks in one card: the milestone heads it (click to edit), and each task is a slim
// row with its checkbox and only the chips that differ from task to task. Category and project are
// shared, so they're said once, by the card's accent and header.
export function MilestoneCard({ milestone, tasks, course, project, onToggle, onDelete, onEdit, selectedId }) {
  const due = dueLabel(milestone, false);
  const progress = milestone.progress;
  return (
    <li data-flip-key={`milestone:${milestone.id}`} className="overflow-hidden rounded-xl border border-l-4 border-slate-200 bg-white transition-shadow hover:shadow-sm" style={courseAccentStyle(course)}>
      <button
        type="button"
        data-task-id={milestone.id}
        onClick={() => onEdit(milestone)}
        title={`Edit milestone ${milestone.title}`}
        className="row-press milestone-head flex w-full min-w-0 items-center gap-2 px-3.5 pt-2.5 pb-2 text-left transition-colors hover:bg-slate-50/70"
      >
        <span className={`h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px] border-2 ${milestone.completed ? "border-success-500 bg-success-500" : "border-urgent-500"}`} />
        <span className="min-w-0 truncate text-xs font-semibold text-slate-700">{milestone.title}</span>
        {project && <span className="min-w-0 truncate text-caption text-slate-400">▸ {project.name}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
          {milestone.completed
            ? <span className={`${SMALL_CHIP} bg-success-500/10 text-success-600`}>Reached</span>
            : due && <span className={`${SMALL_CHIP} ${due.tone}`}>{due.text}</span>}
          {progress?.total > 0 && (
            <span className="flex items-center gap-1.5 text-caption text-slate-500 tabular-nums" title={`${progress.done} of ${progress.total} tasks done`}>
              <span className="h-1 w-8 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full rounded-full bg-success-500" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </span>
              {progress.done}/{progress.total}
            </span>
          )}
        </span>
      </button>
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {tasks.map((task) => (
          <CompactTaskRow key={task.id} todo={task} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} selected={task.id === selectedId} />
        ))}
      </ul>
    </li>
  );
}

function CompactTaskRow({ todo, onToggle, onDelete, onEdit, selected }) {
  const done = todo.completed;
  const due = dueLabel(todo, false);
  const timeRange = timeRangeLabel(todo);
  const links = extractLinks(todo.description);
  return (
    <li data-task-id={todo.id} className={`task-row group flex items-center gap-2.5 py-1.5 pr-2 pl-3.5 transition-colors ${selected ? "is-selected bg-course-500/5 ring-2 ring-course-500/25 ring-inset" : "hover:bg-slate-50/70"}`}>
      {/* 16px to look at, 28px to hit */}
      <button
        type="button"
        onClick={() => onToggle(todo.id, todo.occurrenceDate)}
        className={`task-complete-toggle relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors before:absolute before:-inset-1.5 before:content-[''] ${
          done ? "border-success-500 bg-success-500 text-white" : todo.priority === "urgent" ? "border-urgent-500 hover:border-urgent-600" : "border-slate-300 hover:border-todo-500"
        }`}
        aria-label={`Toggle ${todo.title} complete`}
      >
        {done && <CheckIcon className="h-2.5 w-2.5" />}
      </button>
      <button type="button" onClick={() => onEdit(todo)} className="row-press flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className={`min-w-0 flex-1 text-subhead leading-snug break-words transition-colors ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>
          {todo.title}
          {todo.description && !links.length && (
            <svg viewBox="0 0 20 20" fill="currentColor" className="ml-1 inline-block h-3 w-3 -translate-y-px text-slate-300" aria-hidden="true">
              <path fillRule="evenodd" d="M2 4.75A2.75 2.75 0 014.75 2h10.5A2.75 2.75 0 0118 4.75v10.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25V4.75zM5 6.25a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 015 6.25zm0 3.5a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 015 9.75zm0 3.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
            </svg>
          )}
        </span>
        {/* When it's due leads; the rest follow in falling order of importance */}
        {due && !done && <span className={`${SMALL_CHIP} ${due.tone}`}>{due.text}</span>}
        {timeRange && <span className={`${SMALL_CHIP} bg-slate-100 text-slate-500`}>{timeRange}</span>}
        {todo.priority === "urgent" && !done && <span className={`${SMALL_CHIP} bg-urgent-100 text-urgent-700`}>Urgent</span>}
        {todo.repeat && todo.repeat !== "none" && <span className={`${SMALL_CHIP} bg-slate-100 text-slate-500`} title={`Repeats ${todo.repeat}`}>↻</span>}
        {links.map((link) => (
          <span
            key={link.href}
            role="link"
            tabIndex={0}
            title={link.href}
            onClick={(event) => openLink(event, link.href)}
            onKeyDown={(event) => { if (event.key === "Enter") openLink(event, link.href); }}
            className={`${SMALL_CHIP} max-w-28 cursor-pointer truncate bg-link-100 text-link-700 hover:bg-link-200`}
          >
            ↗ {link.label}
          </span>
        ))}
      </button>
      <button
        type="button"
        onClick={() => onDelete(todo.id, todo.occurrenceDate)}
        className="row-action shrink-0 rounded-full p-0.5 text-slate-300 hover:text-danger-500"
        aria-label={`Delete ${todo.title}`}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
        </svg>
      </button>
    </li>
  );
}

// hideCourse: the list is already grouped by category (header + accent stripe), so the chip would say it a third time
export default function TodoItem({ todo, course, project, onToggle, onDelete, onEdit, selected, mobile = false, leavesOnComplete = false, hideCourse = false }) {
  const isEvent = todo.type === "event";
  const isMilestone = todo.type === "milestone";
  const links = extractLinks(todo.description);
  const due = dueLabel(todo, isEvent);
  const timeRange = timeRangeLabel(todo);
  // A bare row (just a name) is centered on its checkbox; with chips, the checkbox lines up with the name's line
  const hasChips = Boolean((due && !todo.completed) || timeRange || todo.priority === "urgent" || isEvent || isMilestone || project || (course && !hideCourse) || (todo.repeat && todo.repeat !== "none") || links.length);
  const toggleOffset = hasChips ? "mt-0.5" : "";
  const [completing, setCompleting] = useState(false);
  const done = todo.completed || completing;
  const rowRef = useRef(null);
  const commitRef = useRef(null);
  const collapseRef = useRef(null);
  const { surfaceRef, handlers: swipeHandlers, open: swipeOpen, remove } = useSwipeToDelete(rowRef, () => onDelete(todo.id, todo.occurrenceDate));

  // If the row unmounts mid-animation (e.g. tab switch), still record the completion
  useEffect(() => () => commitRef.current?.(), []);

  // The row stayed mounted after completing (e.g. a repeating task moved to its next date): un-collapse it
  useEffect(() => {
    collapseRef.current?.cancel();
    collapseRef.current = null;
  }, [todo]);

  // Mobile: show the check and strike-through first, then collapse the row before it
  // leaves the list, so the tap's result is visible before the task disappears.
  function handleToggle() {
    if (!mobile || todo.completed) return onToggle(todo.id, todo.occurrenceDate);
    if (completing) return;
    navigator.vibrate?.(10);
    setCompleting(true);
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      commitRef.current = null;
      setCompleting(false);
      onToggle(todo.id, todo.occurrenceDate);
    };
    commitRef.current = commit;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!leavesOnComplete || reduceMotion) {
      setTimeout(commit, reduceMotion ? 150 : 350);
      return;
    }
    setTimeout(() => {
      const row = rowRef.current;
      if (!row?.animate) return commit();
      const style = getComputedStyle(row);
      const animation = row.animate(
        [
          { height: `${row.offsetHeight}px`, opacity: 1, marginBottom: style.marginBottom },
          { height: "0px", opacity: 0, marginBottom: "0px" },
        ],
        { duration: 260, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "forwards" },
      );
      collapseRef.current = animation;
      animation.onfinish = commit;
    }, 320);
  }

  // Milestones complete themselves once their tasks are done, so they get a status mark instead of a checkbox
  const toggleButton = isMilestone ? (
    <span
      title={todo.completed ? "Milestone reached" : "Reached automatically when its tasks are done"}
      className={`flex shrink-0 items-center justify-center ${mobile ? "task-toggle-mobile" : `${toggleOffset} h-5 w-5`}`}
    >
      <span className={`block h-3 w-3 rotate-45 rounded-[2px] border-2 ${done ? "border-success-500 bg-success-500" : "border-urgent-500"}`} />
    </span>
  ) : (
    <button
      onClick={handleToggle}
      className={`task-complete-toggle flex shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        mobile ? "task-toggle-mobile mobile-hit" : `relative ${toggleOffset} h-5 w-5 before:absolute before:-inset-1 before:content-['']`
      } ${completing ? "task-check-pop" : ""} ${
        done
          ? mobile ? "task-toggle-done" : "border-success-500 bg-success-500 text-white"
          : todo.priority === "urgent"
          ? "border-urgent-500 hover:border-urgent-600"
          : "border-slate-300 hover:border-todo-500"
      }`}
      aria-label="Toggle complete"
    >
      {done && (
        <svg viewBox="0 0 20 20" fill="currentColor" className={mobile ? "h-3.5 w-3.5" : "h-3 w-3"}>
          <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 111.4-1.4l2.3 2.29 6.3-6.29a1 1 0 011.4 0z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );

  const details = (
    <button onClick={() => onEdit(todo)} className={`min-w-0 flex-1 text-left ${mobile ? "" : "row-press"}`}>
      <p className={`${mobile ? "task-title-mobile" : "text-sm"} font-medium transition-colors ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>
        {todo.title}
        {todo.description && (
          <svg viewBox="0 0 20 20" fill="currentColor" className="ml-1.5 inline-block h-3 w-3 -translate-y-px text-slate-300">
            <path fillRule="evenodd" d="M2 4.75A2.75 2.75 0 014.75 2h10.5A2.75 2.75 0 0118 4.75v10.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25V4.75zM5 6.25a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 015 6.25zm0 3.5a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 015 9.75zm0 3.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
          </svg>
        )}
      </p>
      {/* When it's due leads, then when in the day, then what kind of thing it is and where it belongs */}
      {hasChips && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {due && !todo.completed && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${due.tone}`}>{due.text}</span>
        )}
        {timeRange && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{timeRange}</span>
        )}
        {todo.priority === "urgent" && (
          <span className="rounded-full bg-urgent-100 px-2 py-0.5 text-xs font-medium text-urgent-700">
            Urgent
          </span>
        )}
        {isEvent && (
          <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={courseChipStyle(course)}>Event</span>
        )}
        {isMilestone && (
          <span className="rounded-full bg-urgent-100 px-2 py-0.5 text-xs font-medium text-urgent-700">
            {todo.completed ? "Milestone reached" : "Milestone"}
          </span>
        )}
        {isMilestone && todo.progress && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {todo.progress.total ? `${todo.progress.done}/${todo.progress.total} tasks` : "No tasks linked"}
          </span>
        )}
        {project && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">▸ {project.name}</span>
        )}
        {course && !hideCourse && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={courseChipStyle(course)}
          >
            {course.name}
          </span>
        )}
        {todo.repeat && todo.repeat !== "none" && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 capitalize">↻ {todo.repeat}</span>
        )}
        {links.map((link) => (
          // Span instead of <a>: the whole card is already a button
          <span
            key={link.href}
            role="link"
            tabIndex={0}
            title={link.href}
            onClick={(event) => {
              event.stopPropagation();
              window.open(link.href, "_blank", "noopener,noreferrer");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              event.stopPropagation();
              window.open(link.href, "_blank", "noopener,noreferrer");
            }}
            className="cursor-pointer rounded-full bg-link-100 px-2 py-0.5 text-xs font-medium text-link-700 hover:bg-link-200"
          >
            ↗ {link.label}
          </span>
        ))}
      </div>}
    </button>
  );

  if (mobile) {
    return (
      <li ref={rowRef} data-task-id={todo.id} className="task-swipe-row">
        <button type="button" onClick={remove} tabIndex={swipeOpen ? 0 : -1} className="task-swipe-delete" aria-label={`Delete ${todo.title}`}>Delete</button>
        <div
          ref={surfaceRef}
          {...swipeHandlers}
          className={`task-row-mobile flex items-start gap-3 border-l-4 ${selected ? "ring-2 ring-[var(--tint)]/30" : ""}`}
          style={courseAccentStyle(course)}
        >
          {toggleButton}
          {details}
        </div>
      </li>
    );
  }

  return (
    <li
      data-task-id={todo.id}
      data-flip-key={todo.id}
      className={`task-card group flex ${hasChips ? "items-start" : "items-center"} gap-3 rounded-xl border bg-white px-4 py-3 transition-[box-shadow,background-color] hover:shadow-sm ${
        selected ? "is-selected border-course-300 ring-2 ring-course-500/25" : "border-slate-200"
      } border-l-4`}
      style={courseAccentStyle(course)}
    >
      {toggleButton}
      {details}
      <button
        onClick={() => onDelete(todo.id, todo.occurrenceDate)}
        className="row-action shrink-0 rounded-full p-1 text-slate-300 hover:text-danger-500"
        aria-label="Delete"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
        </svg>
      </button>
    </li>
  );
}
