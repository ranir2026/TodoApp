import { useId } from "react";
import { passwordResetEnabled } from "./authEmails";
import { CloseIcon } from "./icons";

// Shown once to existing accounts after a release, above the list, so they find new things the
// way new accounts do. Bump RELEASE in prefs.js and change these lines for the next one.
export function whatsNewItems({ mobile }) {
  return [
    { id: "guide", text: mobile ? "The User Guide, in Profile, lists every feature and where it is." : "The User Guide, at the bottom left, lists every feature and where it is.", action: "Open" },
    !mobile && { id: "shortcuts", text: "Press ? to see every keybind, and change any of them." },
    passwordResetEnabled() && { id: "reset", text: "Forgot your password? Sign in now sends a reset link." },
    { id: "privacy", text: mobile ? "Privacy, in Profile, says what's stored and lets you delete your account." : "Privacy, under your email, says what's stored and lets you delete your account." },
  ].filter(Boolean);
}

export default function WhatsNew({ mobile = false, onOpenGuide, onClose }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={mobile ? "mb-5 rounded-[var(--mobile-radius-panel)] bg-white px-4 py-3.5" : "mb-4 rounded-card border border-slate-200 bg-white p-4 shadow-sm"}>
      <div className="flex items-start gap-3">
        <h2 id={titleId} className={`min-w-0 flex-1 font-semibold text-slate-900 ${mobile ? "text-[15px]" : "text-sm"}`}>What's new</h2>
        <button type="button" onClick={onClose} className={`-mt-1 -mr-1.5 grid shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 ${mobile ? "mobile-hit h-9 w-9" : "h-7 w-7"}`} aria-label="Close What's new">
          <CloseIcon />
        </button>
      </div>
      <ul className={`mt-1.5 space-y-1.5 ${mobile ? "text-[14px]" : "text-subhead"}`}>
        {whatsNewItems({ mobile }).map((item) => (
          <li key={item.id} className="flex items-baseline gap-2.5 text-slate-600">
            <span aria-hidden="true" className="h-1 w-1 shrink-0 -translate-y-0.5 rounded-full bg-slate-400" />
            <span className="min-w-0 flex-1">
              {item.text}
              {item.action && (
                <button type="button" onClick={onOpenGuide} className="ml-1.5 font-medium text-course-600 hover:text-course-700">{item.action}</button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
