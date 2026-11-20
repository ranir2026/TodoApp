import { useEffect, useId, useRef } from "react";
import BottomSheet from "./BottomSheet";
import useDialogFocus from "./useDialogFocus";
import { CloseIcon } from "./icons";
import { comboKeys } from "./keybinds";

// A combo drawn as keycaps: Ctrl K
export function Keys({ combo, className = "" }) {
  const keys = comboKeys(combo);
  if (!keys.length) return <span className="text-caption text-slate-400">Unset</span>;
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 ${className}`}>
      {keys.map((key, index) => (
        <kbd key={index} className="min-w-[1.375rem] rounded-md border border-slate-200 border-b-slate-300 bg-white px-1.5 py-px text-center font-sans text-caption font-medium text-slate-600">
          {key}
        </kbd>
      ))}
    </span>
  );
}

// A dialog for reading rather than editing (help pages, the shortcuts list, privacy): a centered
// panel on a computer, a bottom sheet on a phone. Escape, the backdrop and the close button close it.
export default function InfoDialog({ open, mobile = false, title, subtitle, onClose, footer, width = "max-w-2xl", children }) {
  const headingId = useId();
  const panelRef = useRef(null);
  const pressStartedOnBackdrop = useRef(false);
  useDialogFocus(open && !mobile, () => panelRef.current, () => panelRef.current);

  useEffect(() => {
    if (!open || mobile) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, mobile, onClose]);

  if (mobile) {
    return (
      <BottomSheet open={open} onClose={onClose} label={title} title={title}>
        {() => (
          <div className="pb-[calc(16px+env(safe-area-inset-bottom))]">
            {subtitle && <p className="-mt-2 mb-4 text-sm text-slate-500">{subtitle}</p>}
            {children}
            {footer && <div className="mt-5">{footer}</div>}
          </div>
        )}
      </BottomSheet>
    );
  }

  if (!open) return null;
  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-6"
      onPointerDown={(event) => { pressStartedOnBackdrop.current = event.target === event.currentTarget; }}
      onClick={(event) => { if (event.target === event.currentTarget && pressStartedOnBackdrop.current) onClose(); }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={`modal-surface flex max-h-[85vh] w-full ${width} flex-col overflow-hidden rounded-dialog border border-slate-200 bg-white shadow-xl outline-none`}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-slate-100 px-6 pt-5 pb-4">
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="-mt-0.5 -mr-2 grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Close ${title}`}>
            <CloseIcon />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-6 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
