// iOS-style segmented control: equal-width segments and a single white pill that slides to the selection.
// options: strings, or { id, label } objects
export default function SegmentedControl({ options, value, onChange, label, className = "grid w-full", segmentClassName = "px-2" }) {
  const items = options.map((option) => (typeof option === "string" ? { id: option, label: option } : option));
  const index = Math.max(0, items.findIndex((item) => item.id === value));

  return (
    <div role="radiogroup" aria-label={label} className={`segmented relative auto-cols-fr grid-flow-col rounded-lg bg-slate-100 p-1 ${className}`}>
      <div
        aria-hidden="true"
        className="segmented-pill absolute inset-y-1 left-1 rounded-md bg-white shadow-sm"
        style={{ width: `calc((100% - 0.5rem) / ${items.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {items.map((item) => (
        <button
          key={item.id}
          role="radio"
          aria-checked={item.id === value}
          onClick={() => onChange(item.id)}
          className={`segmented-option relative z-10 rounded-md py-1 text-xs font-medium capitalize ${segmentClassName} ${
            item.id === value ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
