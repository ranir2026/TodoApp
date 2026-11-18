import { useState } from "react";
import SegmentedControl from "./SegmentedControl";
import TodoItem from "./TodoItem";
import { courseChipStyle } from "./courseColors";
import { addDays, formatClock, toDateKey } from "./planner";
import { parseDateKey } from "./occurrences";

// The sign-in page's picture of the app: one card, four of its views. Each is drawn small in the
// app's own style rather than by the real views, which are built to be used, not looked at. Dates
// are counted from today so it always looks current. Nothing in the card can be focused or clicked;
// the caption says in words what the picture shows.

const PHYSICS = { id: "physics", name: "Physics", color: "#f59e0b" };
const PROGRAMMING = { id: "programming", name: "Programming", color: "#0ea5e9" };
const WRITING = { id: "writing", name: "Writing", color: "#6366f1" };
const PERSONAL = { id: "personal", name: "Personal", color: "#14b8a6" };

const VIEWS = [
  { id: "list", label: "List", caption: "Every task with its due date, category and links." },
  { id: "day", label: "Day plan", caption: "Give tasks a time and see your day hour by hour." },
  { id: "timeline", label: "Timeline", caption: "Lay out a project's milestones and steps across the weeks." },
  { id: "calendar", label: "Calendar", caption: "Your week at a glance, classes and repeats included." },
];

const colorMix = (color, percent) => `color-mix(in srgb, ${color} ${percent}%, white)`;

function ListView({ today }) {
  const rows = [
    { todo: { id: "s1", type: "task", title: "Problem set 7", dueDate: addDays(today, 1), startTime: "23:59", priority: "normal" }, course: PHYSICS },
    { todo: { id: "s2", type: "task", title: "Lab 4: sorting", description: "https://github.com", dueDate: addDays(today, 3), priority: "urgent" }, course: PROGRAMMING },
    { todo: { id: "s3", type: "event", title: "Study group", dueDate: addDays(today, 2), startTime: "16:00", endTime: "17:00", repeat: "weekly" }, course: PERSONAL },
  ];
  return (
    <div className="space-y-2">
      {rows.map(({ todo, course }) => (
        <ul key={todo.id}>
          <TodoItem preview todo={todo} course={course} onToggle={() => {}} onDelete={() => {}} onEdit={() => {}} />
        </ul>
      ))}
    </div>
  );
}

// Blocks on an hour grid, as the planner's Day view draws them
const DAY_START = 9 * 60;
const DAY_HOURS = 6;
const HOUR_PX = 38;
const NOW = 11 * 60 + 30;

function DayView({ today }) {
  const blocks = [
    { title: "Review lecture notes", course: PHYSICS, start: 9 * 60, end: 10 * 60 + 15, done: true },
    { title: "Lab 4: sorting", course: PROGRAMMING, start: 10 * 60 + 30, end: 11 * 60 + 45 },
    { title: "Read chapter 12", course: WRITING, start: 13 * 60, end: 13 * 60 + 45 },
    { title: "Gym", course: PERSONAL, start: 14 * 60 + 15, end: 15 * 60 },
  ];
  const top = (minutes) => ((minutes - DAY_START) / 60) * HOUR_PX;
  const label = parseDateKey(today).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">Today <span className="ml-1 text-xs font-normal text-slate-500">{label}</span></p>
      <div className="relative mt-2.5 ml-14" style={{ height: DAY_HOURS * HOUR_PX }}>
        {Array.from({ length: DAY_HOURS + 1 }, (_, hour) => (
          <div key={hour} className="absolute inset-x-0 border-t border-slate-100" style={{ top: hour * HOUR_PX }}>
            {hour < DAY_HOURS && (
              <span className="absolute -top-2 -left-14 w-12 text-right text-[10px] whitespace-nowrap text-slate-400 tabular-nums">
                {formatClock(DAY_START + hour * 60).replace(":00", "")}
              </span>
            )}
          </div>
        ))}
        {blocks.map((block) => {
          const height = top(block.end) - top(block.start) - 2;
          // As the planner does, a short block keeps its title and time on one line
          const compact = height < 40;
          return (
          <div
            key={block.title}
            className={`absolute inset-x-1 flex gap-1.5 overflow-hidden rounded-lg border border-l-4 px-1.5 shadow-sm ${compact ? "items-center" : "items-start py-1"} ${block.done ? "text-slate-400" : "text-slate-800"}`}
            style={{
              top: top(block.start) + 1,
              height,
              backgroundColor: block.done ? "var(--color-slate-50)" : colorMix(block.course.color, 9),
              borderColor: block.done ? "var(--color-slate-200)" : `${block.course.color}40`,
              borderLeftColor: block.done ? "var(--color-slate-300)" : block.course.color,
            }}
          >
            <span className={`mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px] ${block.done ? "border-success-500 bg-success-500 text-white" : "border-slate-400 bg-white"}`}>
              {block.done && <svg viewBox="0 0 20 20" fill="currentColor" className="h-2.5 w-2.5"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 111.4-1.4l2.3 2.29 6.3-6.29a1 1 0 011.4 0z" clipRule="evenodd" /></svg>}
            </span>
            <span className={`min-w-0 ${compact ? "flex items-baseline gap-1.5" : ""}`}>
              <span className={`block truncate text-caption font-semibold ${block.done ? "line-through" : ""}`}>{block.title}</span>
              <span className={`block truncate text-caption ${block.done ? "text-slate-400" : "text-slate-500"}`}>{formatClock(block.start)} – {formatClock(block.end)}</span>
            </span>
          </div>
          );
        })}
        {/* Now, as the planner marks it */}
        <div className="absolute inset-x-0 z-10 flex items-center" style={{ top: top(NOW) }}>
          <span className="absolute -left-14 w-12 -translate-y-px text-right text-[10px] font-semibold whitespace-nowrap text-danger-600 tabular-nums">{formatClock(NOW)}</span>
          <span className="-ml-1 h-2 w-2 rounded-full bg-danger-500" />
          <span className="h-px flex-1 bg-danger-500" />
        </div>
      </div>
    </div>
  );
}

// A project across two weeks, as the planner's Timeline draws it: the project's span, a milestone,
// and its steps joined to it
const SPAN_DAYS = 14;

function TimelineView({ today }) {
  const first = addDays(today, -3);
  const days = Array.from({ length: SPAN_DAYS }, (_, index) => addDays(first, index));
  const at = (offset) => `${((offset + 3 + 0.5) / SPAN_DAYS) * 100}%`;
  const color = PHYSICS.color;
  const rows = [
    { kind: "project", label: "Lab report", meta: "1/3", from: -1, to: 10, color: PHYSICS.color },
    { kind: "milestone", label: "Draft due", meta: "1/2", day: 6 },
    { kind: "task", label: "Collect data", day: 1, done: true },
    { kind: "task", label: "Write methods", day: 4 },
    { kind: "task", label: "Final edits", day: 9 },
    { kind: "project", label: "Portfolio site", meta: "0/1", from: 2, to: 8, color: PROGRAMMING.color },
    { kind: "task", label: "Deploy", day: 7, color: PROGRAMMING.color },
  ];
  const ROW = 30;
  const milestone = rows[1];
  const middle = (index) => index * ROW + ROW / 2;
  // The steps due by the milestone are joined to it: across from each, then up to the diamond
  const joined = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind === "task" && row.day <= milestone.day);
  const lowest = Math.max(...joined.map(({ index }) => index));
  const line = `${color}80`;
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] text-caption">
      <div>
        <p className="h-8 pt-3.5 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">Projects</p>
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-1.5 truncate pr-2" style={{ height: ROW }}>
            {row.kind === "project" && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />}
            {row.kind === "milestone" && <span className="h-2 w-2 shrink-0 rotate-45 border-[1.5px]" style={{ borderColor: color }} />}
            {row.kind === "task" && <span className={`ml-3.5 h-2.5 w-2.5 shrink-0 rounded-[3px] border ${row.done ? "border-success-500 bg-success-500" : "border-slate-300"}`} />}
            <span className={`truncate ${row.kind === "project" ? "text-xs font-semibold text-slate-900" : row.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{row.label}</span>
            {row.meta && <span className="shrink-0 text-slate-400">{row.meta}</span>}
          </div>
        ))}
      </div>
      <div className="relative">
        {/* Weekends shaded, today in red */}
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${SPAN_DAYS}, minmax(0, 1fr))` }}>
          {days.map((key) => {
            const date = parseDateKey(key);
            const weekend = date.getDay() === 0 || date.getDay() === 6;
            return (
              <div key={key} className={weekend ? "bg-slate-50" : ""}>
                <p className={`h-8 pt-3.5 text-center text-[10px] tabular-nums ${key === today ? "font-bold text-danger-600" : "text-slate-400"}`}>{date.getDate()}</p>
              </div>
            );
          })}
        </div>
        <div className="relative" style={{ marginTop: 32, height: rows.length * ROW }}>
          <span className="absolute inset-y-0 w-px bg-danger-500/60" style={{ left: at(0) }} />
          {/* The project's span */}
          {rows.map((row, index) => (row.kind === "project" ? (
            <span key={row.label} className="absolute h-2.5 -translate-y-1/2 rounded-full border" style={{ top: middle(index), left: at(row.from), right: `calc(100% - ${at(row.to)})`, backgroundColor: `${row.color}33`, borderColor: `${row.color}66` }} />
          ) : null))}
          {joined.map(({ row, index }) => (
            <span key={row.label} className="absolute h-px" style={{ top: middle(index), left: at(row.day), right: `calc(100% - ${at(milestone.day)})`, backgroundColor: line }} />
          ))}
          <span className="absolute w-px" style={{ top: middle(1), height: middle(lowest) - middle(1), left: at(milestone.day), backgroundColor: line }} />
          {rows.map((row, index) => {
            if (row.kind === "project") return null;
            const style = { top: middle(index), left: at(row.day) };
            return row.kind === "milestone" ? (
              <span key={row.label} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2 bg-white" style={{ ...style, borderColor: color, boxShadow: `0 0 0 3px ${color}26` }} />
            ) : (
              <span key={row.label} className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ ...style, borderColor: row.done ? "var(--color-success-500)" : row.color ?? color, backgroundColor: row.done ? "var(--color-success-500)" : "white" }} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// This week, as the calendar's week view draws it: the day's deadlines across the top, then the
// hours. Classes repeat on the same weekdays every week, and the study group falls on the day the
// list says it does.
const WEEK_START_HOUR = 10;
const WEEK_HOURS = 7;
const WEEK_HOUR_PX = 25;

const toMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};
const shortDate = (key, options = {}) => parseDateKey(key).toLocaleDateString(undefined, { month: "short", day: "numeric", ...options });

function CalendarView({ today }) {
  const weekday = parseDateKey(today).getDay();
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - weekday));
  const timed = [
    ...[1, 3, 5].map((day) => ({ day, title: "Physics lecture", course: PHYSICS, start: "10:00", end: "11:00" })),
    ...[2, 4].map((day) => ({ day, title: "Writing seminar", course: WRITING, start: "11:00", end: "12:15" })),
    ...[2, 4].map((day) => ({ day, title: "Lab section", course: PROGRAMMING, start: "14:00", end: "15:30" })),
    { day: 1, title: "Office hours", course: PROGRAMMING, start: "13:00", end: "14:00" },
    { day: (weekday + 2) % 7, title: "Study group", course: PERSONAL, start: "16:00", end: "17:00" },
  ];
  const allDay = [
    { key: days[1], title: "Quiz 3", course: WRITING },
    { key: addDays(today, 3), title: "Lab 4: sorting", course: PROGRAMMING },
    { key: addDays(today, 6), title: "◆ Draft due", course: PHYSICS },
  ];
  const top = (minutes) => ((minutes - WEEK_START_HOUR * 60) / 60) * WEEK_HOUR_PX;
  const columns = { gridTemplateColumns: "repeat(7, minmax(0, 1fr))" };
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">{shortDate(days[0])} – {shortDate(days[6], { year: "numeric" })}</p>
      <div className="mt-2 flex h-6 border-b border-slate-100 text-center text-xs font-medium">
        <div className="w-9 shrink-0" />
        <div className="grid min-w-0 flex-1" style={columns}>
          {days.map((key) => (
            <span key={key} className="min-w-0 truncate text-slate-500">{parseDateKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</span>
          ))}
        </div>
      </div>
      <div className="flex border-b border-slate-100">
        <div className="w-9 shrink-0" />
        <div className="grid min-w-0 flex-1" style={columns}>
          {days.map((key) => {
            const item = allDay.find((entry) => entry.key === key);
            return (
              <div key={key} className="h-[22px] border-l border-slate-100 p-0.5 first:border-l-0">
                {item && <span className="block truncate rounded px-1 py-0.5 text-[10px] leading-3" style={courseChipStyle(item.course)}>{item.title}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex">
        <div className="w-9 shrink-0 text-right text-[10px] text-slate-400">
          {Array.from({ length: WEEK_HOURS }, (_, hour) => (
            <div key={hour} className="pr-1.5" style={{ height: WEEK_HOUR_PX }}>{formatClock((WEEK_START_HOUR + hour) * 60).replace(":00", "")}</div>
          ))}
        </div>
        <div className="flex min-w-0 flex-1">
          {days.map((key, day) => (
            <div key={key} className="relative min-w-0 flex-1 border-l border-slate-100" style={{ height: WEEK_HOURS * WEEK_HOUR_PX }}>
              {Array.from({ length: WEEK_HOURS }, (_, hour) => (
                <div key={hour} className="border-b border-slate-100" style={{ height: WEEK_HOUR_PX }} />
              ))}
              {timed.filter((item) => item.day === day).map((item) => (
                <span
                  key={item.title}
                  className="absolute inset-x-0.5 overflow-hidden rounded px-1 py-px text-[10px] leading-[11px] shadow-sm"
                  style={{ ...courseChipStyle(item.course), top: top(toMinutes(item.start)), height: top(toMinutes(item.end)) - top(toMinutes(item.start)) }}
                >
                  {item.title}
                </span>
              ))}
              {key === today && (
                <div className="absolute inset-x-0 z-10 flex items-center" style={{ top: top(NOW) }}>
                  <span className="h-1.5 w-1.5 -translate-x-0.5 rounded-full bg-danger-500" />
                  <span className="h-px flex-1 bg-danger-500" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PANELS = { list: ListView, day: DayView, timeline: TimelineView, calendar: CalendarView };

export default function LandingPreview({ className = "", style }) {
  const [view, setView] = useState("list");
  const [today] = useState(() => toDateKey(new Date()));
  const Panel = PANELS[view];
  const caption = VIEWS.find((item) => item.id === view).caption;
  return (
    <div className={className} style={style}>
      <SegmentedControl label="Preview the app" options={VIEWS} value={view} onChange={setView} className="grid w-full" segmentClassName="px-2 py-1 text-[13px] normal-case!" />
      <div inert aria-hidden="true" className="landing-preview mt-3 h-72 overflow-hidden rounded-2xl p-3">
        <div key={view} className="auth-swap h-full">
          <Panel today={today} />
        </div>
      </div>
      <p className="mt-2.5 text-[13px] text-slate-500" aria-live="polite"><span key={view} className="auth-swap block">{caption}</span></p>
    </div>
  );
}
