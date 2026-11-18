// Canvas's everyday surfaces: the chips on imported tasks, the dashboard card (and its mobile
// panel), and the notice for courses that still need a category.
import { useContext } from "react";
import { hasCanvasDates, LINK_BROKEN_CODES } from "./canvasManage";
import { CanvasActionsContext, feedStatus, formatClock } from "./canvasStatus";
import { CloseIcon, RefreshIcon, SchoolIcon } from "./icons";

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

// Canvas's own due value: a date ("2026-11-20") or a UTC instant
function formatCanvasDue(value) {
  if (!value) return "no date";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  const date = new Date(value);
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${formatClock(date)}`;
}

function openInNewTab(event, href) {
  event.stopPropagation();
  event.preventDefault();
  window.open(href, "_blank", "noopener,noreferrer");
}

function onActivate(handler) {
  return (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    handler(event);
  };
}

const CHIP = { compact: "shrink-0 rounded-full px-1.5 py-px text-caption font-medium", regular: "rounded-full px-2 py-0.5 text-xs font-medium" };

/**
 * "Due date moved": Canvas changed the date. It sits right after the due chip because it's
 * about the date. Clicking it marks it seen. Spans with roles, since the row is already a button.
 */
export function CanvasDueFlag({ todo, compact = false }) {
  const { enabled, dismissDueMoved } = useContext(CanvasActionsContext);
  const moved = todo.canvas?.dueMoved;
  if (!enabled || !moved || todo.completed) return null;
  const applied = hasCanvasDates(todo);
  const detail = applied
    ? `Canvas moved this from ${formatCanvasDue(moved.from)} to ${formatCanvasDue(moved.to)}.`
    : `Canvas now says ${formatCanvasDue(moved.to)}. You set your own date, so it wasn't changed.`;
  const dismiss = (event) => {
    event.stopPropagation();
    event.preventDefault();
    dismissDueMoved(todo.id);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      title={`${detail} Click to dismiss.`}
      aria-label={`${detail} Dismiss`}
      onClick={dismiss}
      onKeyDown={onActivate(dismiss)}
      className={`${compact ? CHIP.compact : CHIP.regular} inline-flex cursor-pointer items-center gap-1 bg-todo-50 text-todo-700 ring-1 ring-todo-300 ring-inset hover:bg-todo-100`}
    >
      {applied ? "Date moved" : "Canvas date changed"}
      <span aria-hidden="true" className="opacity-60">×</span>
    </span>
  );
}

// Where the task came from: a link to the assignment in Canvas, and a note when Canvas dropped it
export function CanvasSourceChips({ todo, compact = false }) {
  const { enabled } = useContext(CanvasActionsContext);
  const meta = todo.canvas;
  if (!enabled || !meta) return null;
  const chip = compact ? CHIP.compact : CHIP.regular;
  const icon = <SchoolIcon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />;
  return (
    <>
      {meta.url ? (
        <span
          role="link"
          tabIndex={0}
          title="Open in Canvas"
          onClick={(event) => openInNewTab(event, meta.url)}
          onKeyDown={onActivate((event) => openInNewTab(event, meta.url))}
          className={`${chip} inline-flex cursor-pointer items-center gap-1 bg-link-100 text-link-700 hover:bg-link-200`}
        >
          {icon}
          Canvas
        </span>
      ) : (
        <span className={`${chip} inline-flex items-center gap-1 bg-slate-100 text-slate-500`}>{icon}Canvas</span>
      )}
      {meta.missing && (
        <span title="Canvas no longer lists this. It was kept because you changed or completed it." className={`${chip} bg-slate-100 text-slate-500`}>
          Not in Canvas
        </span>
      )}
    </>
  );
}

function RefreshButton({ sync, className, iconClassName = "h-3.5 w-3.5" }) {
  return (
    <button
      type="button"
      onClick={() => sync.syncNow({ manual: true })}
      disabled={sync.syncing}
      title="Check Canvas now"
      aria-label="Check Canvas now"
      className={className}
    >
      <RefreshIcon className={`${iconClassName} ${sync.syncing ? "animate-spin motion-reduce:animate-none" : ""}`} />
    </button>
  );
}

// Desktop dashboard card, in the right column with the other links out of the app
export function CanvasCard({ ready, canvas, sync, onConnect, onManage }) {
  const feeds = canvas.feeds ?? [];
  return (
    <section className="rounded-card border border-slate-200 bg-white p-3 shadow-sm" aria-labelledby="canvas-card-title">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="canvas-card-title" className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <SchoolIcon className="h-3.5 w-3.5 text-course-600" />
          Canvas
        </h2>
        {feeds.length > 0 && <RefreshButton sync={sync} className="-my-1 -mr-1 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60" />}
      </div>
      {feeds.length === 0 ? (
        <>
          <p className="mb-2 text-xs leading-relaxed text-slate-500">Bring in assignments from your school's Canvas calendar.</p>
          <button type="button" onClick={onConnect} disabled={!ready} className="w-full rounded-lg border border-dashed border-course-300 px-2 py-1.5 text-xs font-medium text-course-600 hover:bg-course-50 disabled:opacity-50">
            {ready ? "Connect Canvas" : "Loading…"}
          </button>
        </>
      ) : (
        <>
          <ul className="space-y-1.5">
            {feeds.map((feed) => {
              const status = feedStatus(feed, sync);
              return (
                <li key={feed.domain} className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-700" title={feed.domain}>{feed.domain}</p>
                  <p className={`truncate text-caption ${status.tone}`} title={status.detail}>{status.text}</p>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={onManage} className="mt-2.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-800">
            {feeds.some((feed) => LINK_BROKEN_CODES.has(feed.status)) ? "Fix link" : "Manage"}
          </button>
        </>
      )}
    </section>
  );
}

// Mobile Profile panel: the same states in the mobile panel style
export function CanvasMobilePanel({ ready, canvas, sync, onConnect, onManage }) {
  const feed = canvas.feeds?.[0];
  const status = feed ? feedStatus(feed, sync) : null;
  return (
    <section className="mobile-panel">
      <div className="mobile-panel-heading">
        <h3>Canvas</h3>
        <span>{feed ? plural(canvas.feeds.length, "school") : "Admin preview"}</span>
      </div>
      {feed ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">{feed.domain}</p>
            <p className={`truncate text-xs ${status.tone}`}>{status.text}</p>
          </div>
          <RefreshButton sync={sync} className="mobile-icon-button mobile-hit shrink-0 disabled:opacity-60" iconClassName="" />
        </div>
      ) : (
        <p className="mobile-muted">Import assignments from your school's Canvas calendar.</p>
      )}
      <button type="button" onClick={feed ? onManage : onConnect} disabled={!ready} className="mobile-panel-action disabled:opacity-50">
        {!ready ? "Loading…" : feed ? (status.broken ? "Fix Canvas link" : "Manage Canvas") : "Connect Canvas"}
      </button>
    </section>
  );
}

/**
 * Non-blocking notice above the task list: courses with work waiting for a category, such as a
 * new semester's, or ones whose category was deleted. Match reopens setup at the matching step.
 */
export function CanvasCoursesNotice({ courses, onMatch, onDismiss, variant = "desktop" }) {
  if (!courses.length) return null;
  const waiting = courses.reduce((sum, course) => sum + course.count, 0);
  const lost = courses.every((course) => course.dangling);
  const title = lost
    ? `${plural(courses.length, "Canvas course")} lost ${courses.length === 1 ? "its" : "their"} category`
    : `${plural(courses.length, "new Canvas course")}`;
  const detail = `${plural(waiting, "item")} waiting for a category`;
  if (variant === "mobile") {
    return (
      <div role="status" className="notice-enter mb-4 flex items-center gap-3 rounded-[var(--mobile-radius-panel)] bg-white px-4 py-3">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-course-50 text-course-600"><SchoolIcon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">{title}</span>
          <span className="block text-xs text-slate-500">{detail}</span>
        </span>
        <button type="button" onClick={onMatch} className="mobile-hit shrink-0 rounded-full bg-course-600 px-3.5 py-2 text-sm font-semibold text-white">Match</button>
        <button type="button" onClick={onDismiss} className="mobile-hit -mr-1 shrink-0 px-1 text-lg leading-none text-slate-300" aria-label="Hide for now">×</button>
      </div>
    );
  }
  return (
    <div role="status" className="notice-enter mb-3 flex items-center gap-3 rounded-card border border-course-100 bg-course-50/70 py-2 pr-2 pl-3">
      <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-course-600 shadow-sm"><SchoolIcon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">{title}</span>
        <span className="block truncate text-caption text-slate-500">{detail}</span>
      </span>
      <button type="button" onClick={onMatch} className="shrink-0 rounded-lg bg-course-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-course-600">Match courses</button>
      <button type="button" onClick={onDismiss} className="shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-600" aria-label="Hide for now">
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
