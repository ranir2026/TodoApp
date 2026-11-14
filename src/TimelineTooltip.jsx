import { useImperativeHandle, useState } from "react";

const WIDTH = 248;
const GAP = 10;
const EDGE = 8;
const CARD_GAP = 6;

const TONES = {
  success: "bg-success-500/12 text-success-600",
  danger: "bg-danger-500/12 text-danger-600",
  urgent: "bg-urgent-500/15 text-urgent-700",
  // Due within a couple of days: amber, as "due soon" is everywhere
  soon: "bg-todo-500/15 text-todo-700",
  neutral: "bg-slate-100 text-slate-600",
};

// Rough height of a card, to decide whether there's room above the item
function estimateHeight(card) {
  const list = card.items?.length ? Math.min(card.items.length * 30, 208) + 10 : 0;
  return 92 + list;
}

// The hover card for timeline items. It sits above the item (below it near the top edge), and its
// arrow points at the exact spot it describes. Driven through `ref` (show / move / hide) so hovering
// never re-renders the whole timeline.
//   content: one card, or several stacked (one per task in a small stack). A card is
//            { kind, color, title, lines: string[], status?: { label, tone }, progress?: { done, total },
//              items?: { id, title, done, overdue, meta?, onSelect }[], onSelect? }
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
  const cards = Array.isArray(content) ? content : [content];
  const needed = cards.reduce((sum, card) => sum + estimateHeight(card), (cards.length - 1) * CARD_GAP) + GAP + EDGE;
  const below = top < Math.max(150, needed);
  const left = Math.min(Math.max(x - WIDTH / 2, EDGE), width - WIDTH - EDGE);
  const arrowX = Math.min(Math.max(x - left, 14), WIDTH - 14);
  // An interactive card's wrapper spans the gap too (as padding), so there's no dead strip to cross
  const placement = interactive
    ? { top: below ? bottom : top, paddingTop: below ? GAP : 0, paddingBottom: below ? 0 : GAP }
    : { top: below ? bottom + GAP : top - GAP };
  // The arrow hangs off whichever card is nearest the item
  const arrowCard = below ? 0 : cards.length - 1;

  return (
    <div
      aria-hidden="true"
      className={`absolute z-50 ${interactive ? "" : "pointer-events-none"}`}
      style={{ left, width: WIDTH, transform: below ? undefined : "translateY(-100%)", ...placement }}
      onPointerEnter={interactive ? onPointerEnter : undefined}
      onPointerLeave={interactive ? onPointerLeave : undefined}
      onWheel={interactive ? onWheel : undefined}
    >
      <div key={tip.key} className="flex flex-col" style={{ gap: CARD_GAP }}>
        {cards.map((card, index) => (
          <div
            key={index}
            className="timeline-tip relative"
            // Stacked cards arrive one after another, starting from the one nearest the item
            style={{ transformOrigin: `${arrowX}px ${below ? "0%" : "100%"}`, animationDelay: `${Math.abs(index - arrowCard) * 35}ms` }}
          >
            <Card card={card} />
            {index === arrowCard && (
              // The arrow: a rotated square sharing the card's border, so the card points right at the item
              <span
                className={`pointer-events-none absolute h-2.5 w-2.5 rotate-45 border-slate-200 bg-white ${below ? "-top-[5px] border-t border-l" : "-bottom-[5px] border-r border-b"}`}
                style={{ left: arrowX - 5 }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ card }) {
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        {card.kind === "Milestone"
          ? <span className="h-2 w-2 shrink-0 rotate-45 rounded-[1px]" style={{ backgroundColor: card.color }} />
          : <span className={`h-2 w-2 shrink-0 ${card.kind.startsWith("Task") ? "rounded-full" : "rounded-sm"}`} style={{ backgroundColor: card.color }} />}
        <span className="text-caption font-semibold tracking-wide uppercase" style={{ color: card.color }}>{card.kind}</span>
        {card.status && (
          <span className={`ml-auto rounded-full px-1.5 py-px text-caption font-medium ${TONES[card.status.tone] ?? TONES.neutral}`}>{card.status.label}</span>
        )}
      </div>
      <p className="mt-1 text-subhead leading-snug font-semibold break-words text-slate-900">{card.title}</p>
      {card.lines?.map((line) => <p key={line} className="mt-0.5 text-xs leading-snug text-slate-600">{line}</p>)}
      {card.items?.length > 0 && (
        <ul className="-mx-1.5 mt-1.5 max-h-52 overflow-y-auto border-t border-slate-100 pt-1.5">
          {card.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                tabIndex={-1}
                onClick={item.onSelect}
                title={`Edit ${item.title}`}
                className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-slate-50"
              >
                <span
                  className="mt-[4px] h-2 w-2 shrink-0 rounded-full border-[1.5px]"
                  style={{ borderColor: item.overdue ? "var(--color-danger-500)" : card.color, backgroundColor: item.done ? card.color : "white" }}
                />
                <span className={`min-w-0 flex-1 text-xs leading-snug break-words ${item.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{item.title}</span>
                {item.meta && <span className={`shrink-0 text-caption leading-snug tabular-nums ${item.overdue ? "text-danger-600" : "text-slate-500"}`}>{item.meta}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {card.progress && card.progress.total > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full" style={{ width: `${(card.progress.done / card.progress.total) * 100}%`, backgroundColor: card.color }} />
          </span>
          <span className="text-caption text-slate-500 tabular-nums">{card.progress.done}/{card.progress.total} tasks</span>
        </div>
      )}
    </>
  );
  const surface = "block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-lg";
  // A card for one task of a stack opens that task when clicked
  return card.onSelect
    ? <button type="button" tabIndex={-1} onClick={card.onSelect} title={`Edit ${card.title}`} className={`${surface} transition-colors hover:border-slate-300`}>{body}</button>
    : <div className={surface}>{body}</div>;
}
