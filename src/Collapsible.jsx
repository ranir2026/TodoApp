// Animates height between 0 and the content's natural height (grid-row 0fr <-> 1fr), so no
// measuring is needed. Collapsed content is inert so it can't be tabbed into while hidden.
export default function Collapsible({ open, id, children }) {
  return (
    <div id={id} className={`collapsible ${open ? "" : "is-collapsed"}`} inert={!open}>
      <div className="collapsible-inner">{children}</div>
    </div>
  );
}

export function Chevron({ open }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`collapsible-chevron h-3.5 w-3.5 ${open ? "is-open" : ""}`}>
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
