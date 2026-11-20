import { useState } from "react";
import BrandMark from "./BrandMark";
import { needsHomeScreen } from "./homeScreen";

// Drawn to look like the buttons Safari shows, so each step points at something on screen
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block h-[1.15em] w-[1.15em] -translate-y-px align-middle text-course-600">
      <path d="M12 14V3.5M8 7.5l4-4 4 4" />
      <path d="M8.5 10.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5a2 2 0 0 0-2-2h-1.5" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block h-[1.15em] w-[1.15em] -translate-y-px align-middle text-course-600">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

function Step({ number, children, hint }) {
  return (
    <li className="flex gap-3.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-course-500/10 text-sm font-semibold text-course-600 tabular-nums" aria-hidden="true">{number}</span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[15px] leading-snug font-medium text-slate-900">{children}</p>
        {hint && <p className="mt-1 text-sm leading-snug text-slate-500">{hint}</p>}
      </div>
    </li>
  );
}

export function AddToHomeScreen({ emailConfirmed = false }) {
  return (
    <main className="auth-screen grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="auth-rise flex items-center justify-center gap-3">
          <BrandMark size={44} />
          <span className="text-lg font-semibold tracking-tight text-slate-900">Todo</span>
        </div>
        <section className="auth-card auth-rise mt-8 rounded-dialog p-7" style={{ "--rise-delay": "80ms" }} aria-labelledby="home-screen-heading">
          {emailConfirmed && (
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-success-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
              Your email is confirmed.
            </p>
          )}
          <h1 id="home-screen-heading" className="text-xl font-semibold text-balance text-slate-900">Add Todo to your Home Screen</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">On iPhone, Todo opens from your Home Screen, like an app.</p>
          <ol className="mt-6 space-y-5">
            <Step number={1} hint="Don't see it? Tap ••• first.">
              Tap Share <ShareIcon />
            </Step>
            <Step number={2} hint="Then tap Add.">
              {/* The icon stays with the word before it, never alone on a line */}
              Tap Add to Home <span className="whitespace-nowrap">Screen <AddIcon /></span>
            </Step>
            <Step number={3} hint={emailConfirmed ? "Then sign in there." : undefined}>
              Open Todo from your Home Screen
            </Step>
          </ol>
        </section>
      </div>
    </main>
  );
}

// In Safari on an iPhone, the app can't be used in the tab: this shows how to add it to the Home
// Screen instead. Everywhere else, the app as usual.
export default function HomeScreenGate({ children }) {
  // A tab never turns into a home-screen app while it's open, so this is read once
  const [required] = useState(needsHomeScreen);
  // Confirming an email opens the link in Safari, so say it worked before sending them back
  const [emailConfirmed] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("type") === "signup");
  if (!required) return children;
  return (
    <>
      {/* The app still runs, out of sight and out of reach, and syncs as it would in any tab, so work
          saved in Safari before this screen existed isn't stranded there */}
      <div hidden>{children}</div>
      <AddToHomeScreen emailConfirmed={emailConfirmed} />
    </>
  );
}
