import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import BottomSheet from "./BottomSheet";
import { canvasEditedFields, canvasVersion } from "./canvasManage";
import { CanvasEditPanel } from "./CanvasUI";
import Collapsible from "./Collapsible";
import { CloseIcon, PlusIcon } from "./icons";
import { parseDateKey, REPEAT_OPTIONS, resolveTask } from "./occurrences";
import { projectColor } from "./planner";
import SegmentedControl from "./SegmentedControl";
import SwitchRow from "./SwitchRow";
import Tip from "./Tip";
import TodoItem from "./TodoItem";
import useDialogFocus from "./useDialogFocus";

const isMobile = () => window.matchMedia("(max-width: 767px)").matches;
const FALLBACK_COLOR = "#94a3b8";
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
// Jan 4, 2026 was a Sunday, so the week from there names the days in DAYS order, in the user's language
const dayName = (index, weekday) => new Date(2026, 0, 4 + index).toLocaleDateString(undefined, { weekday });
// What "Stop after" counts: a weekly repeat on several days still counts weeks
const REPEAT_UNITS = { daily: "days", weekly: "weeks", monthly: "months" };
const TYPE_OPTIONS = [{ id: "task", label: "Task" }, { id: "event", label: "Event" }];

const STYLES = {
  desktop: {
    label: "mb-1 block text-caption font-medium text-slate-500",
    input: "field-tint block h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400",
    title: "field-tint block h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-[15px] font-medium text-slate-900 outline-none",
    // One line tall, like the fields around it, and five lines at most before it scrolls
    textarea: "field-tint block w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-[7px] text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400",
    notesMax: 116,
    select: "field-tint block h-9 w-full min-w-0 appearance-none truncate rounded-lg border border-slate-200 bg-white pr-8 text-sm text-slate-800 outline-none",
    selectPad: "pl-3",
    selectPadDot: "pl-8",
    dot: "left-3 h-2.5 w-2.5",
    countPad: "pr-16",
    unit: "text-sm",
    gap: "mt-3",
    gapInner: "pt-3",
    group: "mt-4 border-t border-slate-100 pt-4",
    slot: "flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700",
    link: "inline-flex items-center gap-1 rounded text-xs font-semibold text-course-600 hover:text-course-700",
    remove: "text-caption font-medium text-slate-400 transition-colors hover:text-danger-600",
    hint: "text-caption text-slate-400",
    error: "mt-1 text-caption text-danger-600",
    day: "h-8 w-8 text-xs",
    dayOn: "bg-course-500 text-white",
    dayOff: "bg-slate-100 text-slate-600 hover:bg-slate-200",
    row: "text-sm text-slate-700",
    segmented: "grid w-40",
    segment: "px-2",
    primary: "rounded-lg bg-course-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-course-600 disabled:opacity-40 disabled:shadow-none disabled:hover:bg-course-500",
    secondary: "rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700",
    outline: "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300",
    danger: "rounded-lg px-3 py-2 text-sm font-medium text-danger-600 transition-colors hover:bg-danger-500/10",
    dangerSolid: "rounded-lg bg-danger-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-danger-500",
  },
  mobile: {
    label: "mb-1.5 block text-[13px] font-medium text-slate-500",
    input: "mobile-sheet-field",
    title: "mobile-sheet-field font-medium",
    textarea: "mobile-sheet-field resize-none leading-snug",
    notesMax: 136,
    select: "mobile-sheet-field appearance-none truncate pr-10!",
    selectPad: "",
    selectPadDot: "pl-9!",
    dot: "left-3.5 h-3 w-3",
    countPad: "pr-20!",
    unit: "text-[15px]",
    gap: "mt-4",
    gapInner: "pt-4",
    group: "mt-5 border-t border-slate-100 pt-5",
    slot: "flex min-h-12 w-full items-center justify-center gap-1.5 rounded-[var(--mobile-radius-control)] border border-dashed border-slate-300 text-[15px] text-slate-500",
    link: "inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-[var(--tint)]",
    remove: "mobile-hit text-[13px] font-medium text-slate-400",
    hint: "text-[13px] text-slate-400",
    error: "mt-1.5 text-[13px] text-danger-600",
    day: "h-11 w-11 text-sm",
    dayOn: "bg-[var(--tint)] text-white",
    dayOff: "bg-slate-100 text-slate-600",
    row: "text-[15px] text-slate-800",
    segmented: "grid w-44",
    segment: "px-2 py-1.5 text-[13px]",
    primary: "mobile-sheet-primary",
    secondary: "mobile-sheet-secondary",
    outline: "mobile-sheet-secondary",
    danger: "min-h-12 w-full rounded-full text-base font-semibold text-danger-600 active:bg-danger-500/10",
    dangerSolid: "min-h-[50px] w-full rounded-full bg-danger-600 text-base font-semibold text-white",
  },
};

function formFor(item) {
  return {
    type: item.type ?? "task",
    title: item.title ?? "",
    courseId: item.courseId ?? "",
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
    projectId: item.projectId ?? "",
    milestoneId: item.milestoneId ?? "",
  };
}

// What saving writes: empty fields become null, and fields that don't apply to the item's type
// are cleared rather than kept out of sight (an event isn't part of a project)
function patchFor(form) {
  const title = form.title.trim();
  const description = form.description.trim() || null;
  if (form.type === "milestone") {
    return { title, courseId: form.courseId || null, dueDate: form.dueDate || null, description, projectId: form.projectId || null };
  }
  const event = form.type === "event";
  const repeats = form.repeat !== "none";
  return {
    type: form.type,
    title,
    courseId: form.courseId || null,
    dueDate: form.dueDate || null,
    endDate: event ? form.endDate || null : null,
    startTime: form.startTime || null,
    endTime: form.endTime || null,
    priority: form.priority,
    description,
    repeat: form.repeat,
    repeatDays: form.repeat === "weekly" && form.repeatDays.length ? form.repeatDays : null,
    repeatUntil: repeats ? form.repeatUntil || null : null,
    repeatCount: repeats && form.repeatCount ? Number(form.repeatCount) : null,
    projectId: event ? null : form.projectId || null,
    milestoneId: !event && form.projectId ? form.milestoneId || null : null,
  };
}

function Field({ id, label, s, action, className = "", children }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={s.label}>{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}

function Select({ id, value, onChange, s, dot, children }) {
  return (
    <div className="relative">
      {dot && <span aria-hidden="true" className={`pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full ${s.dot}`} style={{ backgroundColor: dot }} />}
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={`${s.select} ${dot ? s.selectPadDot : s.selectPad}`}>
        {children}
      </select>
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400">
        <path d="M5 6.5l3 3 3-3" />
      </svg>
    </div>
  );
}

function DayPicker({ labelId, days, onToggle, s, mobile }) {
  return (
    <div role="group" aria-labelledby={labelId} className={`flex ${mobile ? "justify-between" : "gap-1.5"}`}>
      {DAYS.map((day, index) => {
        const on = days.includes(day);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            aria-label={dayName(index, "long")}
            onClick={() => onToggle(day)}
            className={`grid shrink-0 place-items-center rounded-full font-semibold transition-colors ${s.day} ${on ? s.dayOn : s.dayOff}`}
          >
            {dayName(index, "narrow")}
          </button>
        );
      })}
    </div>
  );
}

// Editing an item after it's been created. Desktop gets a dialog anchored near the top; a phone
// gets a bottom sheet with its actions pinned to the bottom edge. Closing with unsaved changes
// asks first, and a repeating item asks whether Delete means this date or every repeat.
// `tip` is the app's one-time tip for the first repeating item edited ({ text, onDismiss }), shown
// above the fields.
export default function EditItemModal({ item, courses, projects = [], milestones = [], onSave, onDelete, onSkipOccurrence, onClose, tip = null }) {
  const mobile = isMobile();
  const s = STYLES[mobile ? "mobile" : "desktop"];
  const open = Boolean(item);
  // `active` mirrors the prop; `current` is the item being edited, kept while the sheet slides away
  const [active, setActive] = useState(null);
  const [current, setCurrent] = useState(null);
  const [initial, setInitial] = useState(null);
  const [form, setForm] = useState(null);
  const [extra, setExtra] = useState({ endDate: false, endTime: false, repeat: "weekly" });
  const [confirm, setConfirm] = useState(null);
  // A new item resets the form. Only the item's identity counts: the app re-renders for many
  // reasons (a sync, the clock), and none of them may wipe what's being typed.
  if (item !== active) {
    setActive(item);
    if (item) {
      const next = formFor(item);
      setCurrent(item);
      setInitial(next);
      setForm(next);
      setExtra({ endDate: Boolean(item.endDate), endTime: Boolean(item.endTime), repeat: item.repeat && item.repeat !== "none" ? item.repeat : "weekly" });
      setConfirm(null);
    }
  }

  const ids = useId();
  const id = (name) => `${ids}-${name}`;
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const notesRef = useRef(null);
  const endDateRef = useRef(null);
  const endTimeRef = useRef(null);
  const confirmOpenerRef = useRef(null);
  const pressedBackdropRef = useRef(false);

  const patch = form ? patchFor(form) : null;
  const dirty = Boolean(form && initial) && JSON.stringify(patch) !== JSON.stringify(patchFor(initial));

  // A phone keeps its keyboard down until a field is tapped; a desktop starts in the title
  useDialogFocus(
    open,
    () => dialogRef.current?.closest("[role='dialog']") ?? dialogRef.current,
    () => {
      if (isMobile()) return dialogRef.current;
      const title = titleRef.current;
      title?.setSelectionRange(title.value.length, title.value.length);
      return title;
    },
  );

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      if (confirm) closeConfirm();
      else if (dirty) openConfirm("discard");
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, confirm, dirty, onClose]);

  // Notes grow with what's in them, up to a point, then scroll
  const description = form?.description;
  useLayoutEffect(() => {
    const notes = notesRef.current;
    if (!notes) return;
    notes.style.height = "auto";
    const height = notes.scrollHeight + notes.offsetHeight - notes.clientHeight;
    notes.style.height = `${Math.min(height, s.notesMax)}px`;
    notes.style.overflowY = height > s.notesMax ? "auto" : "hidden";
  }, [description, current, open, s.notesMax]);

  if (!current || !form) return null;
  if (!mobile && !open) return null;

  const isMilestone = form.type === "milestone";
  const isEvent = form.type === "event";
  const isTask = form.type === "task";
  const storedRepeats = Boolean(current.repeat && current.repeat !== "none");
  const canSkip = storedRepeats && Boolean(current.occurrenceDate);
  const canSave = Boolean(form.title.trim());
  const titleMissing = !canSave;
  const course = courses.find((candidate) => candidate.id === form.courseId);
  const projectsShown = projects.length > 0 && (isTask || isMilestone);
  const leavingProject = isEvent ? projects.find((project) => project.id === form.projectId) : null;
  const projectMilestones = milestones.filter((milestone) => milestone.projectId === form.projectId && milestone.id !== current.id);
  const selectedDays = form.repeatDays.length ? form.repeatDays : [DAYS[(form.dueDate ? parseDateKey(form.dueDate) : new Date()).getDay()]];
  const canvasEdited = current.canvas?.synced && !isMilestone ? canvasEditedFields(patch, current.canvas.synced) : [];
  const occurrenceLabel = current.occurrenceDate ? parseDateKey(current.occurrenceDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "";
  const heading = `Edit ${form.type}`;
  const subtitle = isMilestone ? "Reached when its tasks are done" : storedRepeats ? "Changes apply to every repeat" : null;
  const deleteLabel = canSkip ? "Delete…" : storedRepeats ? "Delete all repeats" : mobile ? `Delete ${form.type}` : "Delete";

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  // A task moved into a project takes on the project's category; leaving the project drops its milestone
  function changeProject(projectId) {
    const project = projects.find((candidate) => candidate.id === projectId);
    setForm((previous) => ({
      ...previous,
      projectId,
      milestoneId: "",
      courseId: project?.courseId && courses.some((candidate) => candidate.id === project.courseId) ? project.courseId : previous.courseId,
    }));
  }

  // An event always shows its end time; a task only when it has one
  function changeType(type) {
    update("type", type);
    if (type === "task") setExtra((previous) => ({ ...previous, endTime: Boolean(form.endTime) }));
  }

  function changeRepeat(repeat) {
    update("repeat", repeat);
    if (repeat !== "none") setExtra((previous) => ({ ...previous, repeat }));
  }

  // A weekly repeat keeps at least one day
  function toggleDay(day) {
    const next = selectedDays.includes(day) ? selectedDays.filter((candidate) => candidate !== day) : [...selectedDays, day];
    if (next.length) update("repeatDays", DAYS.filter((candidate) => next.includes(candidate)));
  }

  function reveal(field, ref) {
    setExtra((previous) => ({ ...previous, [field]: true }));
    if (!mobile) requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
  }

  function hide(field) {
    update(field, "");
    setExtra((previous) => ({ ...previous, [field]: false }));
  }

  function revertToCanvas() {
    const version = canvasVersion(current.canvas.synced);
    setForm((previous) => ({ ...previous, ...version }));
    setExtra((previous) => ({ ...previous, endDate: Boolean(version.endDate), endTime: Boolean(version.endTime) }));
  }

  function openConfirm(kind) {
    confirmOpenerRef.current = document.activeElement;
    setConfirm(kind);
  }

  // Back to the form, with focus where it was before the question
  function closeConfirm() {
    setConfirm(null);
    const opener = confirmOpenerRef.current;
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
  }

  function requestClose() {
    if (dirty) openConfirm("discard");
    else onClose();
  }

  function startDelete() {
    if (canSkip) openConfirm("delete");
    else onDelete(current.id);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (canSave) onSave(current.id, patch);
  }

  function saveShortcut(event) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) handleSubmit(event);
  }

  const removeButton = (field, label) => (
    <button type="button" onClick={() => hide(field)} aria-label={`Remove ${label}`} className={s.remove}>Remove</button>
  );

  // The row as the list will draw it once saved, chips and all. It's only a picture, so it can't
  // be focused or clicked and screen readers skip it; the fields below say the same thing.
  const previewTodo = resolveTask({ ...current, ...patch, title: patch.title || "Untitled" });
  const previewProjectItem = projects.find((project) => project.id === previewTodo.projectId);
  const previewProject = previewProjectItem && {
    ...previewProjectItem,
    accentColor: projectColor(previewProjectItem, Object.fromEntries(courses.map((candidate) => [candidate.id, candidate]))),
  };
  const previewRow = (
    <div inert aria-hidden="true" className={`edit-preview ${mobile ? "rounded-[var(--mobile-radius-panel)] bg-[#f2f2f7] p-2" : ""}`}>
      <ul>
        <TodoItem
          preview
          mobile={mobile}
          todo={previewTodo}
          course={course}
          project={previewProject}
          onToggle={() => {}}
          onDelete={() => {}}
          onEdit={() => {}}
        />
      </ul>
    </div>
  );

  const body = (
    <>
      {mobile && subtitle && <p id={id("subtitle")} className="-mt-2 mb-4 text-[13px] text-slate-500">{subtitle}</p>}
      {mobile && <div className="mb-5">{previewRow}</div>}
      {tip && storedRepeats && <Tip mobile={mobile} className={mobile ? "mb-5" : "mb-4"} onDismiss={tip.onDismiss}>{tip.text}</Tip>}
      {current.canvas && (
        <div className={mobile ? "mb-5" : "mb-4"}>
          <CanvasEditPanel todo={current} edited={canvasEdited} onRevert={revertToCanvas} mobile={mobile} />
        </div>
      )}

      <Field id={id("title")} label="Title" s={s}>
        <input
          ref={titleRef}
          id={id("title")}
          value={form.title}
          onChange={(event) => update("title", event.target.value)}
          aria-invalid={titleMissing || undefined}
          aria-describedby={titleMissing ? id("title-error") : undefined}
          enterKeyHint="done"
          className={s.title}
        />
        {titleMissing && <p id={id("title-error")} className={s.error}>Add a title to save.</p>}
      </Field>

      <div className={s.group}>
        <div className="grid grid-cols-2 gap-3">
          <Field id={id("date")} label={isMilestone ? "Date" : isEvent ? (extra.endDate ? "Start date" : "Date") : "Due date"} s={s}>
            <input id={id("date")} type="date" value={form.dueDate} onChange={(event) => update("dueDate", event.target.value)} className={s.input} />
          </Field>
          {!isMilestone && (
            <Field id={id("start")} label={isEvent || extra.endTime ? "Start time" : "Due time"} s={s}>
              <input id={id("start")} type="time" value={form.startTime} onChange={(event) => update("startTime", event.target.value)} className={s.input} />
            </Field>
          )}
          {isEvent && (extra.endDate ? (
            <Field id={id("end-date")} label="End date" s={s} action={removeButton("endDate", "end date")}>
              <input ref={endDateRef} id={id("end-date")} type="date" min={form.dueDate || undefined} value={form.endDate} onChange={(event) => update("endDate", event.target.value)} className={s.input} />
            </Field>
          ) : (
            <div className="flex flex-col justify-end">
              <button type="button" onClick={() => reveal("endDate", endDateRef)} className={s.slot}>
                <PlusIcon className="h-3.5 w-3.5" />
                End date
              </button>
            </div>
          ))}
          {isEvent && (
            <Field id={id("end-time")} label="End time" s={s}>
              <input id={id("end-time")} type="time" value={form.endTime} onChange={(event) => update("endTime", event.target.value)} className={s.input} />
            </Field>
          )}
        </div>
        {isTask && (
          <>
            <Collapsible open={!extra.endTime && Boolean(form.startTime)}>
              <div className={`flex justify-end ${mobile ? "" : "pt-1.5"}`}>
                <button type="button" onClick={() => reveal("endTime", endTimeRef)} className={s.link}>
                  <PlusIcon className="h-3.5 w-3.5" />
                  End time
                </button>
              </div>
            </Collapsible>
            <Collapsible open={extra.endTime}>
              <div className={`grid grid-cols-2 gap-3 ${s.gapInner}`}>
                <Field id={id("task-end")} label="End time" s={s} className="col-start-2" action={removeButton("endTime", "end time")}>
                  <input ref={endTimeRef} id={id("task-end")} type="time" value={form.endTime} onChange={(event) => update("endTime", event.target.value)} className={s.input} />
                </Field>
              </div>
            </Collapsible>
          </>
        )}

        {!isMilestone && (
          <>
            <Field id={id("repeat")} label="Repeat" s={s} className={s.gap}>
              <Select id={id("repeat")} value={form.repeat} onChange={changeRepeat} s={s}>
                {REPEAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </Field>
            <Collapsible open={form.repeat === "weekly"}>
              <div className={s.gapInner}>
                <p id={id("days")} className={s.label}>Repeats on</p>
                <DayPicker labelId={id("days")} days={selectedDays} onToggle={toggleDay} s={s} mobile={mobile} />
              </div>
            </Collapsible>
            <Collapsible open={form.repeat !== "none"}>
              <div className={s.gapInner}>
                <div className="grid grid-cols-2 gap-3">
                  <Field id={id("until")} label="Repeat until" s={s}>
                    <input id={id("until")} type="date" min={form.dueDate || undefined} value={form.repeatUntil} onChange={(event) => update("repeatUntil", event.target.value)} className={s.input} />
                  </Field>
                  <Field id={id("count")} label="Stop after" s={s}>
                    <div className="relative">
                      <input id={id("count")} type="number" min="1" inputMode="numeric" value={form.repeatCount} onChange={(event) => update("repeatCount", event.target.value)} className={`${s.input} ${s.countPad}`} />
                      <span aria-hidden="true" className={`pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 ${s.unit}`}>{REPEAT_UNITS[form.repeat !== "none" ? form.repeat : extra.repeat]}</span>
                    </div>
                  </Field>
                </div>
                <p className={`mt-1.5 ${s.hint}`}>{form.dueDate ? "Leave both empty to keep repeating." : "Pick a date above for the repeats to start from."}</p>
              </div>
            </Collapsible>
          </>
        )}
      </div>

      <div className={s.group}>
        <div className={projectsShown ? "grid grid-cols-2 gap-3" : ""}>
          <Field id={id("category")} label="Category" s={s}>
            <Select id={id("category")} value={form.courseId} onChange={(value) => update("courseId", value)} s={s} dot={course ? course.color || FALLBACK_COLOR : null}>
              {(!initial.courseId || !form.courseId) && <option value="">No category</option>}
              {form.courseId && !course && <option value={form.courseId} disabled>Deleted category</option>}
              {courses.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.archived ? `${candidate.name} (archived)` : candidate.name}</option>)}
            </Select>
          </Field>
          {projectsShown && (
            <Field id={id("project")} label="Project" s={s}>
              <Select id={id("project")} value={form.projectId} onChange={changeProject} s={s}>
                <option value="">No project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
        {isTask && projectsShown && (
          <Collapsible open={Boolean(form.projectId)}>
            <div className={s.gapInner}>
              <Field id={id("milestone")} label="Milestone" s={s}>
                <Select id={id("milestone")} value={form.milestoneId} onChange={(value) => update("milestoneId", value)} s={s}>
                  <option value="">No milestone</option>
                  {projectMilestones.map((milestone) => <option key={milestone.id} value={milestone.id}>◆ {milestone.title}</option>)}
                </Select>
              </Field>
            </div>
          </Collapsible>
        )}
        <Collapsible open={Boolean(leavingProject)}>
          <p className={`${s.gapInner} ${s.hint} text-slate-500!`}>Events aren't part of projects, so saving takes this out of “{leavingProject?.name}”.</p>
        </Collapsible>
      </div>

      {!isMilestone && (
        <div className={`${s.group} pt-2!`}>
          <SwitchRow label="Urgent" detail="Adds an Urgent tag" checked={form.priority === "urgent"} onChange={(on) => update("priority", on ? "urgent" : "normal")} />
          <div className="flex items-center justify-between gap-4 py-1.5">
            <span className={s.row}>Type</span>
            <SegmentedControl label="Type" options={TYPE_OPTIONS} value={form.type} onChange={changeType} className={s.segmented} segmentClassName={s.segment} />
          </div>
        </div>
      )}

      <div className={s.group}>
        <Field id={id("notes")} label="Notes" s={s}>
          <textarea
            ref={notesRef}
            id={id("notes")}
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
            onKeyDown={saveShortcut}
            placeholder="Optional"
            rows={1}
            className={s.textarea}
          />
        </Field>
      </div>

      {mobile && (
        <div className="mt-6">
          <button type="button" onClick={startDelete} className={s.danger}>{deleteLabel}</button>
        </div>
      )}
    </>
  );

  // On a phone the date is on the button itself
  const prompt = confirm === "discard"
    ? "Discard your changes?"
    : mobile ? `“${current.title}” repeats. Delete only this date, or every repeat?` : `Delete only ${occurrenceLabel}, or every repeat of “${current.title}”?`;

  const confirmButtons = confirm === "discard"
    ? [
        <button key="keep" type="button" autoFocus aria-describedby={id("prompt")} onClick={closeConfirm} className={s.secondary}>Keep editing</button>,
        <button key="discard" type="button" onClick={onClose} className={s.dangerSolid}>Discard</button>,
      ]
    : [
        <button key="cancel" type="button" autoFocus aria-describedby={id("prompt")} onClick={closeConfirm} className={mobile ? "min-h-11 text-[15px] font-medium text-slate-500" : s.secondary}>Cancel</button>,
        <button key="one" type="button" onClick={() => onSkipOccurrence(current.id, current.occurrenceDate)} className={s.outline}>{mobile ? `Only ${occurrenceLabel}` : "Only this one"}</button>,
        <button key="all" type="button" onClick={() => onDelete(current.id)} className={s.dangerSolid}>Every repeat</button>,
      ];

  if (mobile) {
    return (
      <BottomSheet
        open={open}
        onClose={onClose}
        label={heading}
        title={heading}
        className="has-footer"
        canDismiss={() => {
          if (!dirty) return true;
          openConfirm("discard");
          return false;
        }}
      >
        {() => (
          <form ref={dialogRef} tabIndex={-1} onSubmit={handleSubmit} aria-describedby={subtitle ? id("subtitle") : undefined} className="outline-none">
            {body}
            <div className="mobile-sheet-footer">
              {confirm ? (
                <>
                  <p id={id("prompt")} className="mb-3 text-center text-[15px] text-slate-600">{prompt}</p>
                  {/* Most likely first, and Cancel last where a thumb expects it */}
                  <div className={confirm === "discard" ? "grid grid-cols-2 gap-3" : "grid gap-2"}>
                    {confirm === "discard" ? confirmButtons : [confirmButtons[1], confirmButtons[2], confirmButtons[0]]}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={requestClose} className={s.secondary}>Cancel</button>
                  <button type="submit" disabled={!canSave} className={s.primary}>Save</button>
                </div>
              )}
            </div>
          </form>
        )}
      </BottomSheet>
    );
  }

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 px-4 pt-16 pb-8"
      onPointerDown={(event) => { pressedBackdropRef.current = event.target === event.currentTarget; }}
      // A drag that starts inside (selecting text) and ends out here isn't a click on the backdrop
      onClick={(event) => { if (event.target === event.currentTarget && pressedBackdropRef.current) requestClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id("heading")}
        aria-describedby={subtitle ? id("subtitle") : undefined}
        className="modal-surface flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-sheet border border-slate-200 bg-white shadow-xl"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start gap-3 px-5 pt-5 pb-3">
            <div className="min-w-0 flex-1">
              <h2 id={id("heading")} className="text-base leading-tight font-semibold text-slate-900">{heading}</h2>
              {subtitle && <p id={id("subtitle")} className="mt-1 text-caption text-slate-400">{subtitle}</p>}
            </div>
            <button type="button" onClick={requestClose} aria-label="Close" className="-mt-1 -mr-1.5 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
              <CloseIcon />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* On a tall enough screen it stays in view while the fields scroll, so every change
                shows up in it; on a short one it scrolls away and leaves the room to the fields */}
            <div className="z-20 border-y border-slate-100 bg-slate-50 px-5 py-3 [@media(min-height:720px)]:sticky [@media(min-height:720px)]:top-0">{previewRow}</div>
            <div className="px-5 pt-4 pb-5">{body}</div>
          </div>
          <div className="border-t border-slate-100 px-5 py-3">
            {confirm === "discard" && (
              <div className="flex items-center gap-2">
                <p id={id("prompt")} className="min-w-0 flex-1 text-sm text-slate-600">{prompt}</p>
                {confirmButtons}
              </div>
            )}
            {confirm === "delete" && (
              <>
                <p id={id("prompt")} className="text-sm text-slate-600">{prompt}</p>
                <div className="mt-2.5 flex justify-end gap-2">{confirmButtons}</div>
              </>
            )}
            {!confirm && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={startDelete} className={`${s.danger} -ml-3`}>{deleteLabel}</button>
                <div className="flex-1" />
                <button type="button" onClick={requestClose} className={s.secondary}>Cancel</button>
                <button type="submit" disabled={!canSave} className={s.primary}>Save</button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
