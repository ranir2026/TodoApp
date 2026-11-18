import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";
import CategorySelect from "./CategorySelect";
import { feedStatus } from "./canvasStatus";
import { settingsCourseRows } from "./canvasManage";
import { CloseIcon, SchoolIcon } from "./icons";
import SwitchRow from "./SwitchRow";
import { maskFeedUrl } from "../supabase/functions/_shared/canvasFeedUrl.js";

const isMobile = () => window.matchMedia("(max-width: 767px)").matches;
const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

function choiceFor(row) {
  return row.categoryId === null ? { type: "skip" } : { type: "existing", categoryId: row.categoryId };
}

function SectionTitle({ children }) {
  return <h3 className="mb-2 text-xs font-semibold text-slate-700">{children}</h3>;
}

function FeedCard({ feed, sync, todos, variant, onReplaceLink, onDisconnect }) {
  const [confirming, setConfirming] = useState(false);
  const status = feedStatus(feed, sync);
  const imported = todos.filter((todo) => todo.canvas?.domain === feed.domain).length;
  const mobile = variant === "mobile";
  const button = mobile
    ? "min-h-11 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600"
    : "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-800";

  return (
    <div className="rounded-card border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{feed.domain}</p>
          <p className="mt-0.5 truncate font-mono text-caption text-slate-400">{maskFeedUrl(feed.url)}</p>
        </div>
        <button type="button" onClick={() => sync.syncNow({ manual: true })} disabled={sync.syncing} className={`${button} shrink-0 disabled:opacity-50`}>
          {sync.syncing ? "Checking…" : "Check now"}
        </button>
      </div>
      <p className={`mt-2 text-xs ${status.tone}`} role={status.broken ? "alert" : undefined}>
        {status.text}
        {status.detail && <span className="block text-slate-500">{status.detail}</span>}
      </p>

      {confirming ? (
        <div className="notice-enter mt-3 rounded-lg bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-800">Disconnect {feed.domain}?</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {imported
              ? `Its ${plural(imported, "imported task")} can stay as regular tasks, or be removed. Your course choices are kept for next time.`
              : "Your course choices are kept for next time."}
          </p>
          <div className={`mt-3 flex gap-2 ${mobile ? "flex-col" : "flex-wrap justify-end"}`}>
            <button type="button" onClick={() => setConfirming(false)} className={mobile ? "min-h-11 rounded-full px-4 text-sm font-medium text-slate-500" : "rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"}>Cancel</button>
            {imported > 0 && (
              <button type="button" onClick={() => onDisconnect(feed.domain, true)} className={mobile ? "min-h-11 rounded-full bg-danger-500/10 px-4 text-sm font-semibold text-danger-600" : "rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger-600 hover:bg-danger-500/10"}>
                Remove {plural(imported, "task")}
              </button>
            )}
            <button type="button" onClick={() => onDisconnect(feed.domain, false)} className={mobile ? "min-h-11 rounded-full bg-slate-900 px-4 text-sm font-semibold text-white" : "rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"}>
              {imported ? "Keep tasks" : "Disconnect"}
            </button>
          </div>
        </div>
      ) : (
        <div className={`mt-3 flex gap-2 ${mobile ? "flex-col" : "items-center"}`}>
          <button type="button" onClick={() => onReplaceLink(feed.domain)} className={status.broken ? (mobile ? "mobile-sheet-primary" : "rounded-lg bg-course-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-course-600") : button}>
            {status.broken ? "Paste the new link" : "Replace link"}
          </button>
          <button type="button" onClick={() => setConfirming(true)} className={mobile ? "min-h-11 rounded-full px-4 text-sm font-medium text-danger-600" : "rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger-600 hover:bg-danger-500/10 ml-auto"}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function SettingsBody({ variant, canvas, courses, todos, sync, onReplaceLink, onConnectAnother, onChangeMapping, onChangeOption, onDisconnect }) {
  const feeds = canvas.feeds ?? [];
  const mobile = variant === "mobile";
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>{feeds.length === 1 ? "School" : "Schools"}</SectionTitle>
        <div className="space-y-2">
          {feeds.map((feed) => (
            <FeedCard key={feed.domain} feed={feed} sync={sync} todos={todos} variant={variant} onReplaceLink={onReplaceLink} onDisconnect={onDisconnect} />
          ))}
        </div>
        <p className="mt-2 text-caption leading-relaxed text-slate-400">
          The app checks Canvas when you open it and every so often while it's open. Canvas's feed can lag behind Canvas itself, so a change made there may take a while to show up.
        </p>
      </section>

      {feeds.map((feed) => {
        const rows = settingsCourseRows({ canvas, todos, domain: feed.domain });
        if (!rows.length) return null;
        return (
          <section key={feed.domain}>
            <SectionTitle>Courses{feeds.length > 1 ? ` at ${feed.domain}` : ""}</SectionTitle>
            <ul className="divide-y divide-slate-100 rounded-card border border-slate-200 bg-white">
              {rows.map((row) => (
                <li key={row.key} className={`${mobile ? "" : "flex items-center justify-between gap-3"} px-3 py-2.5`}>
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${row.categoryId === null ? "text-slate-400" : "text-slate-800"}`}>{row.name}</p>
                    {/* Canvas's own label tells two sections of one course apart */}
                    <p className="truncate text-caption text-slate-400">
                      {[row.label && row.label !== row.name ? row.label : null, row.categoryId === null ? "Not imported" : plural(row.count, "task")].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <CategorySelect
                    choice={choiceFor(row)}
                    onChange={(choice) => onChangeMapping(feed.domain, row, choice)}
                    courses={courses}
                    label={`Category for ${row.name}`}
                    newName={row.courseId ? row.name : "Canvas"}
                    variant={variant}
                    className={mobile ? "mt-2" : "w-44 shrink-0"}
                  />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-caption leading-relaxed text-slate-400">Changing a course moves only its Canvas tasks that are still where Canvas put them. Your own tasks never move.</p>
          </section>
        );
      })}

      <section>
        <SectionTitle>Import</SectionTitle>
        <div className="divide-y divide-slate-100 rounded-card border border-slate-200 bg-white px-3">
          <SwitchRow label="Calendar events" detail="Class meetings and other non-assignment items" checked={Boolean(canvas.includeNonAssignments)} onChange={(checked) => onChangeOption("includeNonAssignments", checked)} />
          <SwitchRow label="Past-due assignments" detail="Work whose due date has already passed" checked={Boolean(canvas.includePastDue)} onChange={(checked) => onChangeOption("includePastDue", checked)} />
        </div>
        <p className="mt-2 text-caption leading-relaxed text-slate-400">Turning one off keeps what's already imported; it only stops new ones.</p>
      </section>

      <button type="button" onClick={onConnectAnother} className={mobile ? "min-h-11 w-full rounded-full px-4 text-sm font-semibold text-course-600" : "rounded-lg px-1 text-xs font-semibold text-course-600 hover:text-course-700"}>
        Connect another school
      </button>
    </div>
  );
}

// Ongoing Canvas management. Setup itself lives in the Connect Canvas flow.
export default function CanvasSettingsModal({ open, onClose, ...props }) {
  useEffect(() => {
    if (!open || isMobile()) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (isMobile()) {
    return (
      <BottomSheet open={open} onClose={onClose} label="Canvas settings" title="Canvas">
        {() => <SettingsBody variant="mobile" {...props} />}
      </BottomSheet>
    );
  }

  if (!open) return null;
  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 px-4 pt-16 pb-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="canvas-settings-title"
        onClick={(event) => event.stopPropagation()}
        className="modal-surface flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-sheet border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-course-50 text-course-600"><SchoolIcon className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="canvas-settings-title" className="text-base leading-tight font-semibold text-slate-900">Canvas</h2>
            <p className="mt-1 text-caption text-slate-400">Assignments from your school's calendar feed</p>
          </div>
          <button type="button" onClick={onClose} className="-mt-1 -mr-1.5 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-5 py-4">
          <SettingsBody variant="desktop" {...props} />
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg bg-course-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-course-600">Done</button>
        </div>
      </div>
    </div>
  );
}
