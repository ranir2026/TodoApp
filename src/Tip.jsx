// A one-time tip, shown where it applies. Only one is ever on screen (see useTip in App.jsx), and
// each is shown once per account.
export default function Tip({ children, onDismiss, mobile = false, className = "" }) {
  return (
    <div role="note" className={`tip-enter flex items-start gap-3 rounded-xl border border-course-100 bg-course-50 text-slate-700 ${mobile ? "px-3.5 py-3 text-[14px]" : "px-3 py-2 text-xs"} ${className}`}>
      <p className="min-w-0 flex-1 leading-snug">{children}</p>
      <button type="button" onClick={onDismiss} className={`shrink-0 font-semibold text-course-600 hover:text-course-700 ${mobile ? "mobile-hit" : ""}`}>Got it</button>
    </div>
  );
}
