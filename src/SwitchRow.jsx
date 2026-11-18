// A labeled on/off setting. The whole row is the hit target, and the input is a real checkbox with
// role="switch", so it keeps native keyboard and form behavior.
export default function SwitchRow({ label, detail, checked, disabled, onChange }) {
  return (
    <label className={`flex items-center justify-between gap-4 py-2.5 ${disabled ? "" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className={`block text-sm ${disabled ? "text-slate-400" : "text-slate-700"}`}>{label}</span>
        {detail && <span className="block text-caption text-slate-400">{detail}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="switch" />
    </label>
  );
}
