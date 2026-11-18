import { useEffect, useMemo, useRef, useState } from "react";
import BottomSheet from "./BottomSheet";
import { feedErrorMessage, fetchCanvasFeed } from "./canvasClient";
import { listFeedCourses, suggestCategory } from "./canvasCourses";
import { planCanvasImport } from "./canvasImport";
import { deviceTimeZone, isAssignmentKind, isPastDue } from "./canvasSync";
import { maskFeedUrl, validateFeedUrl } from "../supabase/functions/_shared/canvasFeedUrl.js";

const isMobile = () => window.matchMedia("(max-width: 767px)").matches;
const STEPS = ["Connect", "Match courses", "Review"];
const NEW = "__new";
const SKIP = "__skip";

const STYLES = {
  desktop: {
    input: "field-tint w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none",
    select: "field-tint w-44 shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 outline-none",
    primary: "rounded-lg bg-course-500 px-4 py-2 text-sm font-semibold text-white hover:bg-course-600 disabled:opacity-40 disabled:hover:bg-course-500",
    secondary: "rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:border-slate-300",
    small: "shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:border-slate-300",
  },
  mobile: {
    input: "mobile-sheet-field",
    select: "mobile-sheet-field mt-2",
    primary: "mobile-sheet-primary",
    secondary: "min-h-[44px] w-full rounded-full px-4 text-sm font-medium text-slate-500",
    small: "shrink-0 rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-600",
  },
};

// A Canvas host the user already uses, so step 1 can link straight to its calendar
function knownCanvasHost(canvas, quickLinks) {
  if (canvas.feeds?.[0]?.domain) return canvas.feeds[0].domain;
  for (const link of quickLinks ?? []) {
    try {
      const host = new URL(link.url).hostname.toLowerCase();
      if (host.endsWith(".instructure.com") || host.startsWith("canvas.")) return host;
    } catch {
      // not a URL
    }
  }
  return null;
}

// An earlier mapping wins over a fresh suggestion, unless its category is gone
function initialChoice(row, canvas, courses) {
  const mapped = canvas.courseMap?.[row.key];
  if (mapped === null) return { type: "skip" };
  if (mapped && courses.some((course) => course.id === mapped)) return { type: "existing", categoryId: mapped };
  return suggestCategory(row.courseId ? row.label : null, courses);
}

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

function StepDots({ step }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
      {STEPS.map((label, index) => (
        <li key={label} aria-hidden="true" className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${index === step ? "w-5 bg-course-500" : index < step ? "w-1.5 bg-course-300" : "w-1.5 bg-slate-200"}`} />
      ))}
    </ol>
  );
}

function ConnectStep({ styles, host, input, onInput, onBlur, onPaste, onPasteButton, onChange, status, feed, inputRef }) {
  const [school, setSchool] = useState(host ?? "");
  const schoolHost = school.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  const canOpen = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(schoolHost);
  const canPaste = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText);

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 marker:text-slate-400">
        <li>
          Open <strong className="font-semibold text-slate-800">Calendar</strong> in your school's Canvas.
          <span className="mt-1.5 flex items-center gap-2">
            <input
              value={school}
              onChange={(event) => setSchool(event.target.value)}
              placeholder="school.instructure.com"
              aria-label="Your school's Canvas address"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={`${styles.input} py-1.5! text-xs`}
            />
            <a
              href={canOpen ? `https://${schoolHost}/calendar` : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!canOpen}
              className={`shrink-0 text-xs font-semibold ${canOpen ? "text-course-600 hover:text-course-700" : "pointer-events-none text-slate-300"}`}
            >
              Open Calendar ↗
            </a>
          </span>
        </li>
        <li>At the bottom of the right sidebar, choose <strong className="font-semibold text-slate-800">Calendar Feed</strong>.</li>
        <li>Copy the link it shows, then paste it here.</li>
      </ol>

      {feed ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <span aria-hidden="true" className="font-semibold text-success-600">✓</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-xs text-slate-700">{maskFeedUrl(feed.url)}</span>
            <span className="block text-caption text-slate-500">
              Found {plural(feed.items.filter(isAssignmentKind).length, "assignment")}
              {feed.items.some((item) => !isAssignmentKind(item)) && ` and ${plural(feed.items.filter((item) => !isAssignmentKind(item)).length, "event")}`} in {plural(feed.rows.filter((row) => row.courseId).length, "course")}
            </span>
          </span>
          <button type="button" onClick={onChange} className="shrink-0 text-xs font-medium text-course-600 hover:text-course-700">Change</button>
        </div>
      ) : status.state === "checking" ? (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
          <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-course-500 motion-reduce:animate-none" />
          Checking with Canvas…
        </div>
      ) : (
        <div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => onInput(event.target.value)}
              onBlur={onBlur}
              onPaste={onPaste}
              type="url"
              inputMode="url"
              placeholder="Paste your Calendar Feed link"
              aria-label="Canvas Calendar Feed link"
              aria-invalid={status.state === "error"}
              aria-describedby="canvas-feed-status"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={styles.input}
            />
            {canPaste && <button type="button" onClick={onPasteButton} className={styles.small}>Paste</button>}
          </div>
          <p id="canvas-feed-status" role={status.state === "error" ? "alert" : undefined} className={`mt-1.5 min-h-4 text-xs ${status.state === "error" ? "text-danger-600" : "text-slate-400"}`}>
            {status.state === "error" ? status.message : "The link stays private: it's saved only to your account."}
          </p>
        </div>
      )}

      <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
        <strong className="font-semibold text-slate-600">You'll still check things off yourself.</strong> Canvas's feed doesn't say whether you've submitted something, and it can take a while to catch up with changes made in Canvas.
      </p>
    </div>
  );
}

function MatchStep({ styles, feed, choices, setChoice, courses }) {
  const options = courses.filter((course) => !course.archived);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Choose where each course goes. Suggestions are filled in; nothing is imported until you confirm.</p>
      <ul className="space-y-2">
        {feed.rows.map((row) => {
          const choice = choices[row.key];
          const value = choice.type === "existing" ? choice.categoryId : choice.type === "new" ? NEW : SKIP;
          const archived = choice.type === "existing" ? courses.find((course) => course.id === choice.categoryId && course.archived) : null;
          const detail = [row.label && row.label !== row.name ? row.label : null, row.upcoming ? `${row.upcoming} upcoming` : row.assignments ? "nothing upcoming" : null, row.events ? plural(row.events, "event") : null].filter(Boolean).join(" · ");
          return (
            <li key={row.key} className="rounded-xl border border-slate-200 p-2.5">
              <div className={styles === STYLES.mobile ? "" : "flex items-center justify-between gap-3"}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{row.name}</p>
                  {detail && <p className="truncate text-caption text-slate-400">{detail}</p>}
                </div>
                <select
                  value={value}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next === NEW) setChoice(row.key, { type: "new", name: row.courseId ? row.name : "Canvas" });
                    else if (next === SKIP) setChoice(row.key, { type: "skip" });
                    else setChoice(row.key, { type: "existing", categoryId: next });
                  }}
                  aria-label={`Category for ${row.name}`}
                  className={styles.select}
                >
                  <optgroup label="Your categories">
                    {options.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                    {archived && <option value={archived.id}>{archived.name} (archived)</option>}
                  </optgroup>
                  <option value={NEW}>New category</option>
                  <option value={SKIP}>Don't import</option>
                </select>
              </div>
              {choice.type === "new" && (
                <input
                  value={choice.name}
                  onChange={(event) => setChoice(row.key, { type: "new", name: event.target.value })}
                  aria-label={`Name for the new category for ${row.name}`}
                  placeholder="Category name"
                  className={`${styles.input} mt-2`}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReviewStep({ feed, plan, options, setOptions, courses, now, timeZone }) {
  const events = feed.items.filter((item) => !isAssignmentKind(item)).length;
  const pastDue = feed.items.filter((item) => isAssignmentKind(item) && isPastDue(item, now, timeZone)).length;
  const created = plan.createdCategoryIds.map((id) => plan.courses.find((course) => course.id === id)?.name).filter(Boolean);
  const noun = options.includeNonAssignments ? "item" : "assignment";
  const added = plan.summary.added;
  const toggles = [
    { key: "includeNonAssignments", label: "Include calendar events", detail: events ? `${plural(events, "event")} in this feed` : "None in this feed right now", disabled: !events && !options.includeNonAssignments },
    { key: "includePastDue", label: "Include past-due assignments", detail: pastDue ? `${pastDue} already past due` : "None right now", disabled: !pastDue && !options.includePastDue },
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-50 px-3 py-4 text-center">
        <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{added}</p>
        <p className="mt-0.5 text-sm text-slate-500">
          {added === 0 ? `No new ${noun}s to add` : `${added === 1 ? noun : `${noun}s`} across ${plural(plan.categoryCount, "category", "categories")}`}
        </p>
        {plan.summary.updated + plan.summary.unchanged > 0 && <p className="mt-1 text-caption text-slate-400">{plural(plan.summary.updated + plan.summary.unchanged, "task")} already imported will be kept in step with Canvas.</p>}
      </div>
      <div className="space-y-1">
        {toggles.map((toggle) => (
          <label key={toggle.key} className={`flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 ${toggle.disabled ? "opacity-50" : "cursor-pointer"}`}>
            <span>
              <span className="block text-sm text-slate-700">{toggle.label}</span>
              <span className="block text-caption text-slate-400">{toggle.detail}</span>
            </span>
            <input
              type="checkbox"
              checked={options[toggle.key]}
              disabled={toggle.disabled}
              onChange={(event) => setOptions((current) => ({ ...current, [toggle.key]: event.target.checked }))}
              className="h-4 w-4 shrink-0 accent-course-500"
            />
          </label>
        ))}
      </div>
      {(created.length > 0 || plan.deferredCount > 0) && (
        <div className="space-y-1 text-xs text-slate-500">
          {created.length > 0 && <p>New {created.length === 1 ? "category" : "categories"}: <span className="font-medium text-slate-700">{created.join(", ")}</span></p>}
          {plan.deferredCount > 0 && <p>{plural(plan.deferredCount, "course")} with nothing to import right now won't get a category yet.</p>}
        </div>
      )}
      {courses.length === 0 && <p className="text-xs text-slate-400">Your categories will appear here once they load.</p>}
    </div>
  );
}

function ConnectFlow({ variant, canvas, courses, todos, quickLinks, onImport, onCancel, titleId }) {
  const styles = STYLES[variant];
  const [step, setStep] = useState(0);
  const [input, setInput] = useState("");
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState({ state: "idle" });
  const [feed, setFeed] = useState(null);
  const [choices, setChoices] = useState({});
  const [options, setOptions] = useState({ includeNonAssignments: Boolean(canvas.includeNonAssignments), includePastDue: Boolean(canvas.includePastDue) });
  const [now] = useState(() => new Date());
  const [timeZone] = useState(deviceTimeZone);
  const requestRef = useRef(0);
  const inputRef = useRef(null);
  const host = useMemo(() => knownCanvasHost(canvas, quickLinks), [canvas, quickLinks]);

  useEffect(() => {
    if (variant === "desktop") inputRef.current?.focus();
  }, [variant]);

  async function check(text) {
    const local = validateFeedUrl(text);
    if (!local.ok) {
      setStatus({ state: "error", message: feedErrorMessage(local.code) });
      return;
    }
    const request = ++requestRef.current;
    setStatus({ state: "checking" });
    const result = await fetchCanvasFeed(local.url);
    if (request !== requestRef.current) return;
    if (!result.ok) {
      setStatus({ state: "error", message: feedErrorMessage(result.code) });
      return;
    }
    const rows = listFeedCourses(result.items, result.domain, now, timeZone);
    setFeed({ url: result.url, domain: result.domain, items: result.items, rows });
    setChoices(Object.fromEntries(rows.map((row) => [row.key, initialChoice(row, canvas, courses)])));
    setStatus({ state: "ready" });
    // From here the link lives only in `feed` and is shown masked
    setInput("");
  }

  function handleInput(value) {
    setInput(value);
    if (validateFeedUrl(value).ok) check(value);
    else if (touched && value.trim()) setStatus({ state: "error", message: feedErrorMessage(validateFeedUrl(value).code) });
    else setStatus({ state: "idle" });
  }

  async function pasteFromClipboard() {
    setTouched(true);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      setInput(text);
      check(text);
    } catch {
      setStatus({ state: "error", message: "Your browser didn't allow pasting from here. Paste into the field instead." });
      inputRef.current?.focus();
    }
  }

  function changeFeed() {
    requestRef.current += 1;
    setFeed(null);
    setStatus({ state: "idle" });
    setTouched(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const plan = useMemo(
    () => (feed ? planCanvasImport({ feed, rows: feed.rows, choices, options, todos, courses, canvas, now, timeZone }) : null),
    [feed, choices, options, todos, courses, canvas, now, timeZone],
  );
  const namesValid = Object.values(choices).every((choice) => choice.type !== "new" || choice.name.trim());

  function confirmImport() {
    // Planned again against the latest data, so anything that synced in meanwhile is kept
    onImport(planCanvasImport({ feed, rows: feed.rows, choices, options, todos, courses, canvas, now: new Date(), timeZone }));
  }

  const titles = ["Connect Canvas", "Match your courses", "Review and import"];
  const next = step === 0 ? { label: "Next", disabled: !feed, run: () => setStep(1) }
    : step === 1 ? { label: "Next", disabled: !namesValid, run: () => setStep(2) }
    : { label: plan?.summary.added ? `Import ${plan.summary.added}` : "Connect", disabled: !plan, run: confirmImport };
  const back = step === 0 ? { label: "Cancel", run: onCancel } : { label: "Back", run: () => setStep(step - 1) };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {variant === "desktop" && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-slate-900">{titles[step]}</h2>
            <p className="mt-0.5 text-xs text-slate-400">Bring in assignments from your Canvas calendar feed.</p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <StepDots step={step} />
            <button type="button" onClick={onCancel} className="-mt-1 rounded-full px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">×</button>
          </div>
        </div>
      )}
      {variant === "mobile" && <div className="-mt-2 mb-3 flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{titles[step]}</p><StepDots step={step} /></div>}

      <div className={variant === "desktop" ? "min-h-0 flex-1 overflow-y-auto px-5 pb-2" : ""}>
        {step === 0 && (
          <ConnectStep
            styles={styles}
            host={host}
            input={input}
            onInput={handleInput}
            onBlur={() => {
              setTouched(true);
              if (input.trim() && !validateFeedUrl(input).ok) setStatus({ state: "error", message: feedErrorMessage(validateFeedUrl(input).code) });
            }}
            onPaste={() => setTouched(true)}
            onPasteButton={pasteFromClipboard}
            onChange={changeFeed}
            status={status}
            feed={feed}
            inputRef={inputRef}
          />
        )}
        {step === 1 && feed && <MatchStep styles={styles} feed={feed} choices={choices} setChoice={(key, choice) => setChoices((current) => ({ ...current, [key]: choice }))} courses={courses} />}
        {step === 2 && plan && <ReviewStep feed={feed} plan={plan} options={options} setOptions={setOptions} courses={courses} now={now} timeZone={timeZone} />}
      </div>

      <div className={variant === "desktop" ? "flex justify-end gap-2 border-t border-slate-100 px-5 py-3" : "mt-5 flex flex-col-reverse gap-2"}>
        <button type="button" onClick={back.run} className={styles.secondary}>{back.label}</button>
        <button type="button" onClick={next.run} disabled={next.disabled} className={styles.primary}>{next.label}</button>
      </div>
    </div>
  );
}

// "Connect Canvas": paste the feed link, match courses to categories, review, import.
// Closing at any point imports nothing; all of the flow's state is dropped.
export default function CanvasConnectModal({ open, onClose, onImport, canvas, courses, todos, quickLinks }) {
  const [openCount, setOpenCount] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }

  useEffect(() => {
    if (!open || isMobile()) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const shared = { canvas, courses, todos, quickLinks };

  if (isMobile()) {
    return (
      <BottomSheet open={open} onClose={onClose} label="Connect Canvas" title="Connect Canvas">
        {(dismiss) => (
          <ConnectFlow key={openCount} variant="mobile" {...shared} onCancel={() => dismiss()} onImport={(plan) => dismiss(0, () => { onImport(plan); onClose(); })} />
        )}
      </BottomSheet>
    );
  }

  if (!open) return null;
  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 px-4 pt-16 pb-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="canvas-connect-title"
        onClick={(event) => event.stopPropagation()}
        className="modal-surface flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-sheet border border-slate-200 bg-white shadow-xl"
      >
        <ConnectFlow key={openCount} variant="desktop" titleId="canvas-connect-title" {...shared} onCancel={onClose} onImport={(plan) => { onImport(plan); onClose(); }} />
      </div>
    </div>
  );
}
