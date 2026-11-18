// Where a Canvas course goes: one of the user's categories, a new one, or nowhere. The dot in
// front shows the destination at a glance: the category's color, dashed for a new category,
// an empty ring for "Don't import".
const NEW_CATEGORY = "__new";
const SKIP_COURSE = "__skip";
const FALLBACK_COLOR = "#94a3b8";

function choiceValue(choice) {
  if (!choice || choice.type === "skip") return SKIP_COURSE;
  return choice.type === "new" ? NEW_CATEGORY : choice.categoryId;
}

function choiceFromValue(value, newName) {
  if (value === NEW_CATEGORY) return { type: "new", name: newName };
  if (value === SKIP_COURSE) return { type: "skip" };
  return { type: "existing", categoryId: value };
}

export default function CategorySelect({ choice, onChange, courses, label, newName, variant = "desktop", className = "" }) {
  const options = courses.filter((course) => !course.archived);
  const selected = choice?.type === "existing" ? courses.find((course) => course.id === choice.categoryId) : null;
  const archived = selected?.archived ? selected : null;
  const mobile = variant === "mobile";
  const dot = choice?.type === "new" ? "border-[1.5px] border-dashed border-slate-400" : choice?.type === "existing" ? "" : "border-[1.5px] border-slate-300";
  return (
    <div className={`relative ${className}`}>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full ${mobile ? "left-3.5 h-3 w-3" : "left-2.5 h-2.5 w-2.5"} ${dot}`}
        style={choice?.type === "existing" ? { backgroundColor: selected?.color || FALLBACK_COLOR } : undefined}
      />
      <select
        value={choiceValue(choice)}
        onChange={(event) => onChange(choiceFromValue(event.target.value, newName))}
        aria-label={label}
        className={mobile ? "mobile-sheet-field appearance-none pl-9!" : "field-tint w-full appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pr-7 pl-7 text-sm text-slate-700 outline-none"}
      >
        <optgroup label="Your categories">
          {options.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          {archived && <option value={archived.id}>{archived.name} (archived)</option>}
        </optgroup>
        <option value={NEW_CATEGORY}>New category</option>
        <option value={SKIP_COURSE}>Don't import</option>
      </select>
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 ${mobile ? "right-3.5" : "right-2"}`}>
        <path d="M5 6.5l3 3 3-3" />
      </svg>
    </div>
  );
}
