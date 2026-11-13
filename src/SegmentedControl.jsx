import { useEffect, useState } from "react";

// iOS-style segmented control: equal-width segments and a single white pill that slides to the selection.
// options: strings, or { id, label, title } objects (title names an icon-only segment)
// fromValue: for a control that appears as the result of a choice (it replaces another copy of itself),
// the pill first sits on this option, then slides to `value`, so the choice still reads as one motion
export default function SegmentedControl({ options, value, fromValue = null, onChange, label, className = "grid w-full", segmentClassName = "px-2" }) {
  const items = options.map((option) => (typeof option === "string" ? { id: option, label: option } : option));
  const indexOf = (id) => Math.max(0, items.findIndex((item) => item.id === id));
  const [arriving, setArriving] = useState(() => fromValue != null && fromValue !== value);
  const index = indexOf(arriving ? fromValue : value);

  // Let the starting position paint for a frame, then release the pill to slide
  useEffect(() => {
    if (!arriving) return undefined;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setArriving(false)));
    return () => cancelAnimationFrame(id);
  }, [arriving]);

  return (
    <div role="radiogroup" aria-label={label} className={`segmented relative auto-cols-fr grid-flow-col rounded-lg bg-slate-100 p-1 ${className}`}>
      <div
        aria-hidden="true"
        className="segmented-pill absolute inset-y-1 left-1 rounded bg-white shadow-sm"
        style={{ width: `calc((100% - 0.5rem) / ${items.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={item.id === value}
          aria-label={item.title}
          title={item.title}
          onClick={() => onChange(item.id)}
          className={`segmented-option relative z-10 rounded py-1 text-xs font-medium capitalize ${segmentClassName} ${
            item.id === value ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
