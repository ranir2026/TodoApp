// iOS-style segmented control: a single white pill slides to the selected option
export default function SegmentedControl({ options, value, onChange, label }) {
  const index = Math.max(0, options.indexOf(value));

  return (
    <div role="radiogroup" aria-label={label} className="segmented relative flex rounded-lg bg-slate-100 p-1">
      <div
        aria-hidden="true"
        className="segmented-pill absolute inset-y-1 left-1 rounded-md bg-white shadow-sm"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={option === value}
          onClick={() => onChange(option)}
          className={`segmented-option relative z-10 flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize ${
            option === value ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
