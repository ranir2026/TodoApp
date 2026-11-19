import { useEffect, useMemo, useRef, useState } from "react";
import BottomSheet from "./BottomSheet";
import { feedErrorMessage, fetchCanvasFeed } from "./canvasClient";
import { listFeedCourses, suggestCategory } from "./canvasCourses";
import { planCanvasImport } from "./canvasImport";
import { deviceTimeZone, isAssignmentKind, isPastDue } from "./canvasSync";
import { CheckIcon, CloseIcon, ExternalLinkIcon, SchoolIcon } from "./icons";
import CategorySelect from "./CategorySelect";
import SwitchRow from "./SwitchRow";
import { maskFeedUrl, validateFeedUrl } from "../supabase/functions/_shared/canvasFeedUrl.js";

const isMobile = () => window.matchMedia("(max-width: 767px)").matches;
const FALLBACK_COLOR = "#94a3b8";

const STYLES = {
  desktop: {
    input: "field-tint w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400",
    primary: "rounded-lg bg-course-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-course-600 disabled:opacity-40 disabled:shadow-none disabled:hover:bg-course-500",
    secondary: "rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700",
    small: "flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-800",
  },
  mobile: {
    input: "mobile-sheet-field",
    primary: "mobile-sheet-primary",
    secondary: "min-h-[44px] w-full rounded-full px-4 text-sm font-medium text-slate-500",
    small: "flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600",
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

function StepDots({ step, count }) {
  return (
    <ol className="flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out ${index === step ? "w-4 bg-course-500" : index < step ? "w-1.5 bg-course-300" : "w-1.5 bg-slate-200"}`} />
      ))}
    </ol>
  );
}

// One step: what to do, in the body color, then a quieter line on where exactly to look
function Instruction({ n, children, detail }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-100 text-caption font-semibold text-slate-500 tabular-nums">{n}</span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-slate-700">
        {children}
        {detail && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{detail}</p>}
      </div>
    </li>
  );
}

// Where to find the link, then one field to paste it in. Nothing to type: when the app already
// knows the school (an earlier connection, or a Canvas quick link), step 1 links straight to it.
function ConnectStep({ variant, styles, host, replaceDomain, input, onInput, onBlur, onPaste, onPasteButton, onChange, status, feed, inputRef }) {
  const canPaste = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText);
  const strong = "font-semibold text-slate-800";
  const assignments = feed ? feed.items.filter(isAssignmentKind).length : 0;
  const events = feed ? feed.items.length - assignments : 0;

  return (
    <div className="space-y-5">
      {replaceDomain && (
        <p className="rounded-card bg-course-50 p-3 text-xs leading-relaxed text-course-700">
          Paste the new Calendar Feed link for <strong className="font-semibold">{replaceDomain}</strong>. Your imported tasks and course choices stay as they are.
        </p>
      )}
      <div>
        <p className="mb-3 text-sm leading-relaxed text-slate-600">
          Canvas gives every student a private <strong className={strong}>Calendar Feed</strong> link. Here's where to find yours:
        </p>
        <ol className="space-y-3">
          <Instruction n={1} detail={host ? "Or jump straight there:" : "Use the same Canvas site you open for classes. The Canvas phone app doesn't show this link, so a computer is easiest."}>
            Open Canvas in a web browser and sign in.
            {host && (
              <a href={`https://${host}/calendar`} target="_blank" rel="noreferrer" className="mt-1 flex w-fit items-center gap-1 text-xs font-semibold text-course-600 hover:text-course-700">
                Open your Canvas calendar
                <ExternalLinkIcon className="h-3.5 w-3.5" />
              </a>
            )}
          </Instruction>
          <Instruction n={2} detail="It's in the dark menu down the left edge of Canvas, next to Dashboard and Courses.">
            Click <strong className={strong}>Calendar</strong>.
          </Instruction>
          <Instruction n={3} detail="Look in the panel on the right side of the calendar and scroll to its very bottom, below your list of calendars. If there's no right-hand panel, make the window wider.">
            Click <strong className={strong}>Calendar Feed</strong>.
          </Instruction>
          <Instruction n={4} detail="A small window opens with a link that starts with https:// and ends in .ics. Select all of it and copy it (Ctrl+C, or ⌘C on a Mac). Copy it rather than opening it; opening it just downloads a file.">
            Copy the link it shows.
          </Instruction>
          <Instruction n={5}>Paste it in the box below.</Instruction>
        </ol>
      </div>

      {feed ? (
        <div className="flex items-center gap-3 rounded-card border border-slate-200 bg-white p-3 shadow-sm">
          <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-success-500 text-white"><CheckIcon className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-xs text-slate-700">{maskFeedUrl(feed.url)}</span>
            <span className="mt-0.5 block text-caption text-slate-500">
              {feed.items.length === 0
                ? "The calendar is empty right now, which is normal between terms. Work appears as it's posted."
                : <>Found {plural(assignments, "assignment")}{events > 0 && ` and ${plural(events, "event")}`} in {plural(feed.rows.filter((row) => row.courseId).length, "course")}</>}
            </span>
            {replaceDomain && feed.domain !== replaceDomain && (
              <span className="mt-0.5 block text-caption font-medium text-todo-700">This link is for {feed.domain}, so it will be added as another school.</span>
            )}
          </span>
          <button type="button" onClick={onChange} className="press-tint shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-course-600 hover:text-course-700">Change</button>
        </div>
      ) : status.state === "checking" ? (
        <div role="status" className="flex min-h-[3.25rem] items-center gap-3 rounded-card border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
          <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-course-500 motion-reduce:animate-none" />
          Checking with Canvas…
        </div>
      ) : (
        <div>
          <div className="relative flex gap-2">
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
              className={variant === "desktop" ? `${styles.input} py-2.5 aria-invalid:border-danger-500/60 ${canPaste ? "pr-20" : ""}` : styles.input}
            />
            {canPaste && (
              <button
                type="button"
                onClick={onPasteButton}
                className={variant === "desktop" ? "absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800" : `${styles.small} min-h-12`}
              >
                Paste
              </button>
            )}
          </div>
          <p id="canvas-feed-status" role={status.state === "error" ? "alert" : undefined} className={`mt-2 min-h-4 text-xs leading-relaxed ${status.state === "error" ? "text-danger-600" : "text-slate-400"}`}>
            {status.state === "error" ? status.message : "The link stays private: it's saved only to your account."}
          </p>
        </div>
      )}

      <p className="rounded-card bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
        <strong className="font-semibold text-slate-700">You'll still check things off yourself.</strong> Canvas's feed doesn't say whether you've submitted something, and it can take a while to catch up with changes made in Canvas.
      </p>
    </div>
  );
}

function MatchStep({ variant, styles, feed, choices, setChoice, courses, matchOnly }) {
  if (!feed.rows.length) {
    return <p className="rounded-card bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">No courses yet. Once Canvas lists work for a course, the app asks where it should go.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-slate-600">
        {matchOnly ? "Canvas has courses you haven't placed yet. " : ""}Choose where each course goes. Suggestions are filled in; nothing is imported until you confirm.
      </p>
      <ul className="space-y-2">
        {feed.rows.map((row) => {
          const choice = choices[row.key];
          const skipped = choice.type === "skip";
          const detail = [row.label && row.label !== row.name ? row.label : null, row.upcoming ? `${row.upcoming} upcoming` : row.assignments ? "nothing upcoming" : null, row.events ? plural(row.events, "event") : null].filter(Boolean).join(" · ");
          return (
            <li key={row.key} className={`rounded-card border p-3 transition-colors ${skipped ? "border-slate-100 bg-slate-50" : "border-slate-200 bg-white"}`}>
              <div className={variant === "mobile" ? "" : "flex items-center justify-between gap-3"}>
                <div className="min-w-0">
                  <p className={`truncate text-sm font-medium transition-colors ${skipped ? "text-slate-400" : "text-slate-800"}`}>{row.name}</p>
                  {detail && <p className="truncate text-caption text-slate-400">{detail}</p>}
                </div>
                <CategorySelect
                  choice={choice}
                  onChange={(next) => setChoice(row.key, next)}
                  courses={courses}
                  label={`Category for ${row.name}`}
                  newName={row.courseId ? row.name : "Canvas"}
                  variant={variant}
                  className={variant === "mobile" ? "mt-2" : "w-48 shrink-0"}
                />
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
  const created = plan.createdCategoryIds.map((id) => plan.courses.find((course) => course.id === id)).filter(Boolean);
  const noun = options.includeNonAssignments ? "item" : "assignment";
  const added = plan.summary.added;
  const toggles = [
    { key: "includeNonAssignments", label: "Include calendar events", detail: events ? `${plural(events, "event")} in this feed` : "None in this feed right now", disabled: !events && !options.includeNonAssignments },
    { key: "includePastDue", label: "Include past-due assignments", detail: pastDue ? `${pastDue} already past due` : "None right now", disabled: !pastDue && !options.includePastDue },
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-card bg-slate-50 px-3 py-5 text-center">
        <p className="text-4xl font-semibold text-slate-900 tabular-nums">{added}</p>
        <p className="mt-1 text-sm text-slate-500">
          {added === 0 ? `No new ${noun}s to add` : `${added === 1 ? noun : `${noun}s`} across ${plural(plan.categoryCount, "category", "categories")}`}
        </p>
        {plan.summary.updated + plan.summary.unchanged > 0 && <p className="mt-1.5 text-caption text-slate-400">{plural(plan.summary.updated + plan.summary.unchanged, "task")} already imported will be kept in step with Canvas.</p>}
      </div>
      <div className="divide-y divide-slate-100">
        {toggles.map((toggle) => (
          <SwitchRow
            key={toggle.key}
            label={toggle.label}
            detail={toggle.detail}
            checked={options[toggle.key]}
            disabled={toggle.disabled}
            onChange={(checked) => setOptions((current) => ({ ...current, [toggle.key]: checked }))}
          />
        ))}
      </div>
      {(created.length > 0 || plan.deferredCount > 0) && (
        <div className="space-y-2 text-xs text-slate-500">
          {created.length > 0 && (
            <div>
              <p>New {created.length === 1 ? "category" : "categories"}:</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {created.map((course) => (
                  <li key={course.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pr-2 pl-1.5 font-medium text-slate-700">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: course.color || FALLBACK_COLOR }} />
                    {course.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.deferredCount > 0 && <p>{plural(plan.deferredCount, "course")} with nothing to import right now won't get a category yet.</p>}
        </div>
      )}
      {courses.length === 0 && <p className="text-xs text-slate-400">Your categories will appear here once they load.</p>}
    </div>
  );
}

// The flow's starting point: a pasted link, or (from the "new courses" notice) a feed the app
// already loaded, opened straight at matching with only the courses that need a category
function initialFeed(matchRequest, canvas, now, timeZone) {
  if (!matchRequest?.items) return null;
  const feed = canvas.feeds?.find((item) => item.domain === matchRequest.domain);
  if (!feed) return null;
  const keys = new Set(matchRequest.keys);
  const rows = listFeedCourses(matchRequest.items, feed.domain, now, timeZone).filter((row) => keys.has(row.key));
  return rows.length ? { url: feed.url, domain: feed.domain, items: matchRequest.items, rows } : null;
}

function ConnectFlow({ variant, canvas, courses, todos, quickLinks, matchRequest, replaceDomain, onImport, onCancel, titleId }) {
  const styles = STYLES[variant];
  const [now] = useState(() => new Date());
  const [timeZone] = useState(deviceTimeZone);
  const [startFeed] = useState(() => initialFeed(matchRequest, canvas, now, timeZone));
  const matchOnly = Boolean(startFeed);
  const firstStep = matchOnly ? 1 : 0;
  const [step, setStep] = useState(firstStep);
  // Which way the last step change went, so the next step slides in from that side
  const [direction, setDirection] = useState(0);
  const [input, setInput] = useState("");
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState({ state: startFeed ? "ready" : "idle" });
  const [feed, setFeed] = useState(startFeed);
  const [choices, setChoices] = useState(() => (startFeed ? Object.fromEntries(startFeed.rows.map((row) => [row.key, initialChoice(row, canvas, courses)])) : {}));
  const [options, setOptions] = useState({ includeNonAssignments: Boolean(canvas.includeNonAssignments), includePastDue: Boolean(canvas.includePastDue) });
  const requestRef = useRef(0);
  const inputRef = useRef(null);
  const headingRef = useRef(null);
  const host = useMemo(() => replaceDomain ?? knownCanvasHost(canvas, quickLinks), [replaceDomain, canvas, quickLinks]);
  const replacing = Boolean(replaceDomain) && !matchOnly;

  useEffect(() => {
    if (variant === "desktop" && !matchOnly) inputRef.current?.focus();
  }, [variant, matchOnly]);

  // Moving between steps puts focus on the new step's title, so keyboard and screen reader users
  // land at its start instead of on a button that may no longer exist
  useEffect(() => {
    if (direction !== 0) headingRef.current?.focus({ preventScroll: true });
  }, [step, direction]);

  function go(nextStep) {
    setDirection(nextStep > step ? 1 : -1);
    setStep(nextStep);
  }

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

  const titles = [replacing ? "Replace Canvas link" : "Connect Canvas", matchOnly ? `Match ${plural(feed?.rows.length ?? 0, "new course")}` : "Match your courses", "Review and import"];
  const stepCount = 3 - firstStep;
  // A new link for a school that's already set up: when every course is matched, matching is skipped
  const alreadyMatched = replacing && feed?.domain === replaceDomain && feed.rows.every((row) => Object.hasOwn(canvas.courseMap ?? {}, row.key));
  const next = step === 0 ? { label: "Next", disabled: !feed, run: () => go(alreadyMatched ? 2 : 1) }
    : step === 1 ? { label: "Next", disabled: !namesValid, run: () => go(2) }
    : { label: plan?.summary.added ? `Import ${plan.summary.added}` : matchOnly ? "Save" : "Connect", disabled: !plan, run: confirmImport };
  const back = step === firstStep ? { label: "Cancel", run: onCancel } : { label: "Back", run: () => go(step - 1) };
  const progress = `Step ${step - firstStep + 1} of ${stepCount}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {variant === "desktop" ? (
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-course-50 text-course-600"><SchoolIcon className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 ref={headingRef} tabIndex={-1} id={titleId} className="text-base leading-tight font-semibold text-slate-900 outline-none">{titles[step]}</h2>
            <div className="mt-1.5 flex items-center gap-2">
              <StepDots step={step - firstStep} count={stepCount} />
              <span className="text-caption text-slate-400">{progress}</span>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="-mt-1 -mr-1.5 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
      ) : (
        <div className="-mt-1 mb-4 flex items-center justify-between gap-3">
          {/* The sheet's own title already says "Connect Canvas", so the first step names its place instead */}
          <p ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-slate-700 outline-none">{step === 0 ? progress : titles[step]}</p>
          <span className="flex items-center gap-2" aria-label={progress}>
            <StepDots step={step - firstStep} count={stepCount} />
          </span>
        </div>
      )}

      <div className={variant === "desktop" ? "min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pb-4" : ""}>
        <div key={step} className={direction ? "canvas-step" : ""} style={{ "--step-shift": `${direction * 16}px` }}>
          {step === 0 && (
            <ConnectStep
              variant={variant}
              styles={styles}
              host={host}
              replaceDomain={replacing ? replaceDomain : null}
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
          {step === 1 && feed && <MatchStep variant={variant} styles={styles} feed={feed} choices={choices} setChoice={(key, choice) => setChoices((current) => ({ ...current, [key]: choice }))} courses={courses} matchOnly={matchOnly} />}
          {step === 2 && plan && <ReviewStep feed={feed} plan={plan} options={options} setOptions={setOptions} courses={courses} now={now} timeZone={timeZone} />}
        </div>
      </div>

      <div className={variant === "desktop" ? "flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3" : "mt-6 flex flex-col-reverse gap-2"}>
        <button type="button" onClick={back.run} className={styles.secondary}>{back.label}</button>
        <button type="button" onClick={next.run} disabled={next.disabled} className={styles.primary}>{next.label}</button>
      </div>
    </div>
  );
}

// "Connect Canvas": paste the feed link, match courses to categories, review, import. With a
// matchRequest it opens at matching, for courses that appeared after connecting.
// Closing at any point imports nothing; all of the flow's state is dropped.
export default function CanvasConnectModal({ open, onClose, onImport, canvas, courses, todos, quickLinks, matchRequest = null, replaceDomain = null }) {
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

  const shared = { canvas, courses, todos, quickLinks, matchRequest, replaceDomain };
  const label = matchRequest ? "Match Canvas courses" : replaceDomain ? "Replace Canvas link" : "Connect Canvas";

  if (isMobile()) {
    return (
      <BottomSheet open={open} onClose={onClose} label={label} title={label}>
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
