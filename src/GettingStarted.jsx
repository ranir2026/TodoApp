import { useId } from "react";
import { CloseIcon } from "./icons";
import { Keys } from "./InfoDialog";

function StepMark({ done }) {
  if (done) {
    return (
      <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-success-500 text-white" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
          <path d="m4 8.5 2.5 2.5L12 5.5" />
        </svg>
      </span>
    );
  }
  return <span className="h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] border-slate-300" aria-hidden="true" />;
}

// The first thing a new account sees above its example tasks: a few things to try, most with a
// button that does it (or the key that does), ticking off as they're done. It stays until it's
// finished or closed, on every device.
// steps: from checklistSteps(); onAction(id) does a step, onSkip(id) skips an optional one, and
// onClose(finished) hides it, finished saying whether every step was done.
export default function GettingStarted({ steps, mobile = false, onAction, onSkip, onClose, onShowGuide }) {
  // Phone and computer layouts are both on the page, so each copy needs its own id
  const titleId = useId();
  const finished = steps.filter((step) => step.done || step.skipped).length;
  const allDone = finished === steps.length;
  const action = mobile
    ? "min-h-9 shrink-0 rounded-full bg-course-500/10 px-3.5 text-[13px] font-semibold text-course-700"
    : "shrink-0 rounded-full border border-course-100 bg-course-50 px-3 py-1 text-xs font-medium text-course-700 transition-colors hover:border-course-300";

  return (
    <section
      aria-labelledby={titleId}
      className={mobile ? "mb-5 rounded-[var(--mobile-radius-panel)] bg-white px-4 pt-3.5 pb-2" : "mb-4 rounded-card border border-slate-200 bg-white p-4 shadow-sm"}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className={`${mobile ? "text-[15px]" : "text-sm"} font-semibold text-slate-900`}>
            {allDone ? "You're set up" : "Getting started"}
            <span className={`ml-2 font-normal text-slate-400 tabular-nums ${mobile ? "text-[13px]" : "text-xs"}`}>{finished} of {steps.length}</span>
          </h2>
          <p className={`mt-0.5 text-slate-500 ${mobile ? "text-[13px]" : "text-xs"}`}>
            {allDone ? "That's the basics. Everything else is in the User Guide." : "A few things to try, in any order. Each one ticks off once it's done."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onClose(allDone)}
          className={`-mt-1 -mr-1.5 grid shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 ${mobile ? "mobile-hit h-9 w-9" : "h-7 w-7"}`}
          aria-label={allDone ? "Close Getting started" : "Hide Getting started"}
        >
          <CloseIcon />
        </button>
      </div>

      {allDone ? (
        <div className={`flex gap-2 ${mobile ? "mt-3 pb-2" : "mt-3"}`}>
          <button type="button" onClick={onShowGuide} className={action}>User Guide</button>
          <button type="button" onClick={() => onClose(allDone)} className={mobile ? "min-h-9 rounded-full px-3.5 text-[13px] font-medium text-slate-500" : "rounded-full px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-700"}>Close</button>
        </div>
      ) : (
        <ol className={mobile ? "mt-2" : "mt-3 divide-y divide-slate-100 border-t border-slate-100"}>
          {steps.map((step) => (
            <li key={step.id} className={`flex items-center gap-3 ${mobile ? "border-t border-slate-100 py-3" : "py-2.5"}`}>
              <StepMark done={step.done} />
              <div className="min-w-0 flex-1">
                <p className={`${mobile ? "text-[15px]" : "text-sm"} ${step.done || step.skipped ? "text-slate-400" : "font-medium text-slate-800"}`}>
                  {step.label}
                  {step.done && <span className="sr-only"> (done)</span>}
                  {step.skipped && <span className={`ml-1.5 ${mobile ? "text-[13px]" : "text-xs"}`}>Skipped</span>}
                </p>
                {!step.done && !step.skipped && <p className={`mt-0.5 leading-snug text-slate-500 ${mobile ? "text-[13px]" : "text-xs"}`}>{step.detail}</p>}
              </div>
              {!step.done && (
                <div className="flex shrink-0 items-center gap-1">
                  {step.optional && !step.skipped && (
                    <button type="button" onClick={() => onSkip(step.id)} className={mobile ? "min-h-9 px-2 text-[13px] font-medium text-slate-500" : "rounded-full px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-600"}>
                      Skip
                    </button>
                  )}
                  {step.action && <button type="button" onClick={() => onAction(step.id)} className={action}>{step.action}</button>}
                  {step.combo && (
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      Press <Keys combo={step.combo} />
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
