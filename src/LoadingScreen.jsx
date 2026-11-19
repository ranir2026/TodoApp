import { useState } from "react";

// The splash in index.html shows from the first paint, before any script has run, and its styles live
// there too. When React takes over it draws the same spinner, carried on from where the splash's had
// got to instead of starting again, so the hand-over can't be seen.
const LABEL_DELAY_MS = 600;

// When the splash's spinner started, read before React replaces it
const bootStartedAt = typeof document !== "undefined"
  ? document.querySelector(".boot-spinner")?.getAnimations?.()[0]?.startTime ?? 0
  : 0;

export default function LoadingScreen() {
  // Measured once, on the first render: a later render mustn't move the spinner
  const [elapsed] = useState(() => Math.max(0, performance.now() - bootStartedAt));
  return (
    <div className="boot" role="status">
      <svg className="boot-spinner" viewBox="0 0 20 20" aria-hidden="true" style={{ animationDelay: `-${elapsed}ms` }}>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M17.5 10A7.5 7.5 0 0 0 10 2.5" />
      </svg>
      {/* A quick load never shows the words; a slow one says what's happening */}
      <p className="boot-label" style={{ animationDelay: `${LABEL_DELAY_MS - elapsed}ms` }}>Loading…</p>
    </div>
  );
}
