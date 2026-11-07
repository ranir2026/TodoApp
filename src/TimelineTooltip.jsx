import { useImperativeHandle, useState } from "react";

const WIDTH = 248;
const GAP = 10;
const EDGE = 8;

const TONES = {
  success: "bg-success-500/12 text-success-600",
  danger: "bg-danger-500/12 text-danger-600",
  urgent: "bg-urgent-500/15 text-urgent-700",
  neutral: "bg-slate-100 text-slate-600",
};

// The hover card for timeline items. It sits above the item (below it near the top edge), and its
// arrow points at the exact spot it describes. Driven through `ref` (show / move / hide) so hovering
// never re-renders the whole timeline.
//   content: { kind, color, title, lines: string[], status?: { label, tone }, progress?: { done, total },
//              items?: { id, title, done, overdue, meta?, onSelect }[] }
// An `interactive` card (points) can be hovered: it reaches down over the gap to its item, so the
// pointer can travel onto it, and reports enter / leave so the timeline keeps it open meanwhile.
export default function TimelineTooltip({ ref, onPointerEnter, onPointerLeave, onWheel }) {
  const [tip, setTip] = useState(null);

  useImperativeHandle(ref, () => ({
    show: (next) => setTip(next),
    move: (x) => setTip((current) => (current ? { ...current, x } : current)),
    hide: () => setTip(null),
  }), []);

  if (!tip) return null;
  const { content, x, top, bottom, width, interactive } = tip;
  const below = top < 150;
  const left = Math.min(Math.max(x - WIDTH / 2, EDGE), width - WIDTH - EDGE);
  const arrowX = Math.min(Math.max(x - left, 14), WIDTH - 14);
  // An interactive card's wrapper spans the gap too (as padding), so there's no dead strip to cross
  const placement = interactive
    ? { top: below ? bottom : top, paddingTop: below ? GAP : 0, paddingBottom: below ? 0 : GAP }
    : { top: below ? bottom + GAP : top - GAP };

  return (
    <div
      aria-hidden="true"
      className={`absolute z-50 ${interactive ? "" : "pointer-events-none"}`}
      style={{ left, width: WIDTH, transform: below ? undefined : "translateY(-100%)", ...placement }}
      onPointerEnter={interactive ? onPointerEnter : undefined}
      onPointerLeave={interactive ? onPointerLeave : undefined}
      onWheel={interactive ? onWheel : undefined}
    >
      <div key={tip.key} className="timeline-tip relative" style={{ transformOrigin: `${arrowX}px ${below ? "0%" : "100%"}` }}>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
          <div className="flex items-center gap-1.5">
            {content.kind === "Milestone"
              ? <span className="h-2 w-2 rotate-45 rounded-[1px]" style={{ backgroundColor: content.color }} />
              : <span className={`h-2 w-2 ${content.kind.startsWith("Task") ? "rounded-full" : "rounded-sm"}`} style={{ backgroundColor: content.color }} />}
            <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: content.color }}>{content.kind}</span>
            {content.status && (
              <span className={`ml-auto rounded-full px-1.5 py-px text-[11px] font-medium ${TONES[content.status.tone] ?? TONES.neutral}`}>{content.status.label}</span>
            )}
          </div>
          <p className="mt-1 text-[13px] leading-snug font-semibold break-words text-slate-900">{content.title}</p>
          {content.lines?.map((line) => <p key={line} className="mt-0.5 text-xs leading-snug text-slate-600">{line}</p>)}
          {content.items?.length > 0 && (
            <ul className="-mx-1.5 mt-1.5 max-h-52 overflow-y-auto border-t border-slate-100 pt-1.5">
              {content.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={item.onSelect}
                    title={`Edit ${item.title}`}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-slate-50"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full border-[1.5px]"
                      style={{ borderColor: item.overdue ? "var(--color-danger-500)" : content.color, backgroundColor: item.done ? content.color : "white" }}
                    />
                    <span className={`min-w-0 flex-1 truncate text-xs ${item.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{item.title}</span>
                    {item.meta && <span className={`shrink-0 text-[11px] tabular-nums ${item.overdue ? "text-danger-600" : "text-slate-500"}`}>{item.meta}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {content.progress && content.progress.total > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full rounded-full" style={{ width: `${(content.progress.done / content.progress.total) * 100}%`, backgroundColor: content.color }} />
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">{content.progress.done}/{content.progress.total} tasks</span>
            </div>
          )}
        </div>
        {/* The arrow: a rotated square sharing the card's border, so the card points right at the item */}
        <span
          className={`absolute h-2.5 w-2.5 rotate-45 border-slate-200 bg-white ${below ? "-top-[5px] border-t border-l" : "-bottom-[5px] border-r border-b"}`}
          style={{ left: arrowX - 5 }}
        />
      </div>
    </div>
  );
}
