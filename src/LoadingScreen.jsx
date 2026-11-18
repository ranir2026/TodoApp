import { useState } from "react";

// The splash in index.html shows from the first paint, before any script has run, and its styles live
// there too. When React takes over it draws the same thing, and picks the animation up where the
// splash had got to instead of starting it again, so the hand-over can't be seen.
const CYCLE_MS = 1800;
const LABEL_DELAY_MS = 600;

// When the splash's animation started, read before React replaces it
const bootStartedAt = typeof document !== "undefined"
  ? document.querySelector(".boot-ring")?.getAnimations?.()[0]?.startTime ?? 0
  : 0;

export default function LoadingScreen() {
  // Measured once, on the first render: a later render mustn't move the animation
  const [elapsed] = useState(() => Math.max(0, performance.now() - bootStartedAt));
  const loop = { animationDelay: `-${elapsed % CYCLE_MS}ms` };
  return (
    <div className="boot" role="status">
      <div className="boot-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle className="boot-ring" cx="12" cy="12" r="8" pathLength="1" style={loop} />
          <path className="boot-check" d="M8.6 12.4l2.3 2.3 4.6-5.1" pathLength="1" style={loop} />
        </svg>
      </div>
      {/* A quick load never shows the words; a slow one says what's happening */}
      <p className="boot-label" style={{ animationDelay: `${LABEL_DELAY_MS - elapsed}ms` }}>Loading…</p>
    </div>
  );
}
