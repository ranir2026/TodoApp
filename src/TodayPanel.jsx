import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCourseColor } from "./courseColors";
import { ChevronLeftIcon, PlusIcon } from "./icons";
import { comboLabel } from "./keybinds";
import { EMPTY_DAY, edgeMask, fixedItemsOn, formatClock, minutesToTime, parseTodayEntry, resolveDayBlocks, toDateKey } from "./planner";

// Planner-only blocks have no category, so they get a neutral stripe, the same as in the planner
const PLANNER_ONLY = "var(--color-slate-300)";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// "9:00 – 10:30 AM": the shared AM/PM is only said once
function timeRange(start, end) {
  const from = formatClock(start);
  const to = formatClock(end);
  const suffix = / ?[AP]M$/i;
  const fromSuffix = from.match(suffix)?.[0];
  return fromSuffix && fromSuffix.trim() === to.match(suffix)?.[0]?.trim() ? `${from.replace(suffix, "")} – ${to}` : `${from} – ${to}`;
}

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Today's plan at a glance, docked to the right edge of the dashboard. You can check things off and
// add something just for today by typing it with its time ("Gym 4-5pm"); anything more is done in
// the full planner, which "Edit in planner" opens on this day.
export default function TodayPanel({ open, onToggle, shortcut, todos, courseMap, planner, updatePlanner, onToggleTodo, onOpenPlanner }) {
  const now = useClock();
  const todayKey = toDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const listRef = useRef(null);
  const tabRef = useRef(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const [entry, setEntry] = useState("");
  // Set when Return is pressed on something that can't be added yet, so the hint says why more firmly
  const [attempted, setAttempted] = useState(false);
  const [addedId, setAddedId] = useState(null);

  // Scheduled blocks plus whatever is already pinned to a time today, in time order
  const { rows, planned, plannedDone } = useMemo(() => {
    const todoById = new Map(todos.map((todo) => [todo.id, todo]));
    const blocks = resolveDayBlocks({ ...EMPTY_DAY, ...planner.days[todayKey] }, todoById, courseMap);
    const scheduledIds = new Set(blocks.map((block) => block.todoId).filter(Boolean));
    const { timed } = fixedItemsOn(todos, todayKey, scheduledIds);
    const all = [
      ...blocks.map((block) => ({
        key: block.id,
        kind: "block",
        block,
        title: block.title,
        done: block.done,
        color: block.course ? getCourseColor(block.course) : PLANNER_ONLY,
        category: block.course?.name,
        start: block.startMinutes,
        end: block.endMinutes,
      })),
      ...timed.map((item) => ({
        key: `fixed-${item.id}`,
        kind: item.type === "event" ? "event" : "task",
        item,
        title: item.title,
        done: Boolean(item.completed),
        color: getCourseColor(courseMap[item.courseId]),
        category: courseMap[item.courseId]?.name,
        start: item.startMinutes,
        end: item.endMinutes,
      })),
    ].sort((a, b) => a.start - b.start || a.end - b.end);
    return { rows: all, planned: blocks.length, plannedDone: blocks.filter((block) => block.done).length };
  }, [todos, planner, courseMap, todayKey]);

  function measureEdges() {
    const list = listRef.current;
    if (!list) return;
    const top = list.scrollTop > 1;
    const bottom = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
    setEdges((current) => (current.top === top && current.bottom === bottom ? current : { top, bottom }));
  }
  useLayoutEffect(measureEdges);

  function toggle(row) {
    if (row.kind === "task") {
      onToggleTodo(row.item.id, row.item.occurrenceDate);
      return;
    }
    const { block } = row;
    if (block.todoId) {
      onToggleTodo(block.todoId, block.occurrenceDate ?? undefined);
      return;
    }
    updatePlanner((current) => {
      const day = { ...EMPTY_DAY, ...current.days[todayKey] };
      return { ...current, days: { ...current.days, [todayKey]: { ...day, blocks: day.blocks.map((item) => (item.id === block.id ? { ...item, done: !item.done } : item)) } } };
    });
  }

  // What's being typed, previewed in the list where it would land
  const parsed = parseTodayEntry(entry);
  const draft = parsed.status === "ok"
    ? { key: "draft", kind: "draft", title: parsed.title, done: false, color: PLANNER_ONLY, start: parsed.start, end: parsed.end }
    : null;
  const overlap = draft ? rows.find((row) => !row.done && row.start < draft.end && row.end > draft.start) : null;
  const shownRows = draft ? [...rows, draft].sort((a, b) => a.start - b.start || (a === draft) - (b === draft) || a.end - b.end) : rows;

  function addEntry(event) {
    event.preventDefault();
    if (parsed.status !== "ok") {
      if (parsed.status !== "empty") setAttempted(true);
      return;
    }
    const block = { id: crypto.randomUUID(), todoId: null, occurrenceDate: null, title: parsed.title, start: minutesToTime(parsed.start), end: minutesToTime(parsed.end), done: false };
    updatePlanner((current) => {
      const day = { ...EMPTY_DAY, ...current.days[todayKey] };
      return { ...current, days: { ...current.days, [todayKey]: { ...day, blocks: [...day.blocks, block] } } };
    });
    setEntry("");
    setAttempted(false);
    setAddedId(block.id);
  }

  // Opening lands on the present: the row that's underway, or the now line, about a third of the way
  // down so what's just finished stays in view above it. Instant, since the panel is sliding in anyway.
  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const target = list?.querySelector("[data-now]");
    if (!list || !target) return;
    list.scrollTop += target.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 3;
  }, [open]);

  // Esc anywhere in the panel puts it away and hands focus back to the tab (the entry field clears
  // itself first if there's something in it)
  function handleKeyDown(event) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    event.stopPropagation();
    onToggle();
    tabRef.current?.focus();
  }

  // The new row takes the preview's place: bring it into view and pulse it once
  useEffect(() => {
    if (!addedId) return undefined;
    listRef.current?.querySelector(`[data-row-key="${addedId}"]`)?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    const id = setTimeout(() => setAddedId(null), 900);
    return () => clearTimeout(id);
  }, [addedId]);

  // The now line sits between what's over and what's still to come, unless something is underway
  // (that row says "Now" itself)
  const current = rows.find((row) => row.start <= nowMinutes && row.end > nowMinutes);
  const nowIndex = current ? -1 : (() => {
    const index = shownRows.findIndex((row) => row.end > nowMinutes);
    return index === -1 ? shownRows.length : index;
  })();
  // The dashboard's header already says the date, so the panel's says how the day is going
  const summary = planned > 0
    ? `${plannedDone} of ${planned} done`
    : rows.length > 0
    ? `${rows.length} ${rows.length === 1 ? "thing" : "things"} at set times`
    : "A clear day so far";
  const label = open ? "Hide today's plan" : "Show today's plan";

  return (
    <div className="today-dock relative z-30 shrink-0" data-open={open}>
      <section aria-label="Today's plan" onKeyDown={handleKeyDown} className="today-panel absolute inset-y-0 right-0 flex w-(--today-w) flex-col border-l border-slate-200 bg-white">
        <button
          ref={tabRef}
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="today-panel-body"
          aria-label={label}
          title={shortcut ? `${label} (${comboLabel(shortcut)})` : label}
          className="today-tab absolute top-1/2 right-[calc(100%-1px)] flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-xl border border-r-0 border-slate-200 bg-white py-2.5 pr-1.5 pl-2 text-slate-400 hover:text-slate-600"
        >
          <DayGlyph date={now} />
          <ChevronLeftIcon className="today-tab-chevron h-3.5 w-3.5" />
        </button>

        <div id="today-panel-body" inert={!open} className="today-panel-body flex min-h-0 flex-1 flex-col">
          <header className="shrink-0 px-4 pt-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base leading-tight font-semibold tracking-tight text-slate-900">Today</h2>
                <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">{summary}</p>
              </div>
              <button
                type="button"
                onClick={onOpenPlanner}
                className="shrink-0 rounded-full border border-course-100 bg-course-50 px-2.5 py-1 text-xs font-medium text-course-700 hover:border-course-300"
              >
                Edit in planner
              </button>
            </div>
            {planned > 0 && (
              <span aria-hidden="true" className="mt-3 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full rounded-full bg-success-500 transition-[width] duration-500 ease-out" style={{ width: `${(plannedDone / planned) * 100}%` }} />
              </span>
            )}
          </header>

          {shownRows.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <p className="text-sm font-medium text-slate-700">Nothing planned yet</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Type something below to add it, or block out your day in the planner.</p>
              <button type="button" onClick={onOpenPlanner} className="mt-3 rounded-full bg-course-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-course-600">
                Plan today
              </button>
            </div>
          ) : (
            <div
              ref={listRef}
              onScroll={measureEdges}
              className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 px-2 py-2"
              style={{ maskImage: edgeMask(edges), WebkitMaskImage: edgeMask(edges) }}
            >
              <ol>
                {shownRows.map((row, index) => (
                  <AgendaFragment key={row.key} showNow={index === nowIndex} nowMinutes={nowMinutes}>
                    {row === draft
                      ? <DraftRow row={row} />
                      : <AgendaRow row={row} current={row === current} past={row.end <= nowMinutes} flash={row.key === addedId} onToggle={() => toggle(row)} />}
                  </AgendaFragment>
                ))}
                {nowIndex === shownRows.length && <NowLine minutes={nowMinutes} />}
              </ol>
            </div>
          )}

          <form onSubmit={addEntry} className="shrink-0 border-t border-slate-100 px-3 pt-2.5 pb-3">
            <EntryHint parsed={parsed} attempted={attempted} overlap={overlap} />
            <div className="today-entry flex items-center gap-2 rounded-xl border border-transparent bg-slate-100 py-1 pr-1 pl-2.5">
              <PlusIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <input
                value={entry}
                onChange={(event) => { setEntry(event.target.value); setAttempted(false); }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  // With something typed, Esc clears it; on an empty field it closes the panel
                  if (entry) { event.stopPropagation(); setEntry(""); setAttempted(false); }
                }}
                placeholder="Add to today…"
                aria-label="Add to today's plan: a name, then a start and end time"
                aria-describedby="today-entry-hint"
                autoComplete="off"
                enterKeyHint="done"
                className="min-w-0 flex-1 bg-transparent py-1 text-subhead text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                tabIndex={draft ? 0 : -1}
                aria-hidden={!draft}
                aria-label="Add to today"
                className={`today-entry-submit flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-course-500 text-white hover:bg-course-600 ${draft ? "" : "is-hidden"}`}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.5 3.5v4a2 2 0 0 1-2 2h-7M6 7 3.5 9.5 6 12" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

function AgendaFragment({ showNow, nowMinutes, children }) {
  return (
    <>
      {showNow && <NowLine minutes={nowMinutes} />}
      {children}
    </>
  );
}

function NowLine({ minutes }) {
  return (
    <li aria-hidden="true" data-now="" className="flex items-center gap-1.5 py-1 pl-2">
      <span className="text-caption font-semibold text-danger-600 tabular-nums">{formatClock(minutes)}</span>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger-500" />
      <span className="h-px flex-1 bg-danger-500/50" />
    </li>
  );
}

// The time token in the hint and the format legend share one look, so the example maps onto what you type
function TimeToken({ children }) {
  return <span className="shrink-0 rounded bg-course-500/10 px-1 py-px font-medium text-course-700 tabular-nums">{children}</span>;
}

// Under-the-breath guidance above the field: the format when it's empty, then a live read of what
// you've typed, so the time is confirmed before Return rather than discovered after
function EntryHint({ parsed, attempted, overlap }) {
  let content;
  if (parsed.status === "empty") {
    content = (
      <>
        <span className="shrink-0 rounded bg-slate-100 px-1 py-px font-medium text-slate-600">Name</span>
        <TimeToken>start-end</TimeToken>
        <span className="truncate text-slate-400">as in “Gym 4-5pm”</span>
      </>
    );
  } else if (parsed.status === "ok") {
    content = (
      <>
        <TimeToken>{timeRange(parsed.start, parsed.end)}</TimeToken>
        {overlap
          ? <span className="truncate text-todo-700">Overlaps {overlap.title}</span>
          : <span className="truncate text-slate-400">Return to add</span>}
      </>
    );
  } else {
    const message = {
      "needs-time": "Add a time at the end, like 4-5pm",
      "needs-end": "Then a dash and the end time, like 4-5pm",
      "needs-title": "Add a name before the time",
      "invalid-time": "That time doesn't exist",
      backwards: "It ends before it starts",
    }[parsed.status];
    content = <span className={`truncate ${attempted ? "font-medium text-danger-600" : "text-slate-500"}`}>{message}</span>;
  }
  return (
    <p id="today-entry-hint" className="mb-1.5 flex h-4 min-w-0 items-center gap-1.5 px-1 text-caption leading-none">
      {content}
    </p>
  );
}

// Where the typed entry will land: an outline of the row-to-be, in time order with the rest
function DraftRow({ row }) {
  return (
    <li aria-hidden="true" className="today-draft my-0.5 flex items-stretch gap-2.5 rounded-lg border border-dashed border-course-300 bg-course-50/60 py-1.5 pr-2 pl-2">
      <span className="w-[3px] shrink-0 rounded-full bg-course-300" />
      <span className="mt-px h-4 w-4 shrink-0 rounded-full border-[1.5px] border-dashed border-course-300" />
      <div className="min-w-0 flex-1">
        <p className="text-subhead leading-snug font-medium break-words text-course-700">{row.title}</p>
        <p className="mt-0.5 text-caption text-course-600 tabular-nums">{timeRange(row.start, row.end)}</p>
      </div>
    </li>
  );
}

function AgendaRow({ row, current, past, flash, onToggle }) {
  const checkable = row.kind !== "event";
  const titleTone = row.done ? "text-slate-400 line-through decoration-slate-300" : row.kind === "event" ? "text-slate-600" : "font-medium text-slate-800";
  return (
    <li data-row-key={row.key} data-now={current ? "" : undefined} className={`flex items-stretch gap-2.5 rounded-lg py-1.5 pr-2 pl-2 transition-colors ${current ? "bg-slate-50" : ""} ${flash ? "planner-flash" : ""}`}>
      <span aria-hidden="true" className={`w-[3px] shrink-0 rounded-full transition-opacity ${row.done || row.kind === "event" ? "opacity-40" : ""}`} style={{ backgroundColor: row.color }} />
      {checkable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={row.done ? `Mark ${row.title} not done` : `Mark ${row.title} done`}
          className={`task-complete-toggle relative mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] before:absolute before:-inset-1.5 before:content-[''] ${
            row.done ? "border-success-500 bg-success-500 text-white" : "border-slate-300 hover:border-success-500"
          }`}
        >
          {row.done && (
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-2.5 w-2.5"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 111.4-1.4l2.3 2.29 6.3-6.29a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
          )}
        </button>
      ) : (
        <svg viewBox="0 0 16 16" aria-label="Event" className="mt-px h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
          <path d="M2.5 6.5h11M5.5 2v2.5M10.5 2v2.5" />
        </svg>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-subhead leading-snug break-words ${titleTone}`}>{row.title}</p>
        <p className={`mt-0.5 text-caption tabular-nums ${past && !current ? "text-slate-400" : "text-slate-500"}`}>
          {current && !row.done ? (
            <><span className="font-semibold text-danger-600">Now</span> · until {formatClock(row.end)}</>
          ) : timeRange(row.start, row.end)}
          {row.category && <span> · {row.category}</span>}
        </p>
      </div>
    </li>
  );
}

// A tiny tear-off calendar page with today's date, so the tab says what it opens
function DayGlyph({ date }) {
  return (
    <span aria-hidden="true" className="flex w-7 flex-col overflow-hidden rounded-md border border-slate-200 bg-white text-center leading-none">
      <span className="bg-danger-500 py-[2px] text-[7px] font-bold tracking-wider text-white uppercase">{date.toLocaleDateString(undefined, { weekday: "short" })}</span>
      <span className="py-[3px] text-xs font-semibold text-slate-800 tabular-nums">{date.getDate()}</span>
    </span>
  );
}
