import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";

const isMobile = () => window.matchMedia("(max-width: 767px)").matches;

export default function QuickLinkModal({ open, onAdd, onClose }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (open) {
      setLabel("");
      setUrl("");
    }
  }, [open]);

  function submit(e) {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;
    onAdd(label.trim(), url.trim());
    onClose();
  }

  if (isMobile()) {
    return (
      <BottomSheet open={open} onClose={onClose} label="Add quick link" eyebrow="Quick link" title="Save a website">
        {() => (
          <form onSubmit={submit} className="space-y-3">
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Link name" className="mobile-sheet-field" />
            <input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" enterKeyHint="done" className="mobile-sheet-field" />
            <button type="submit" disabled={!label.trim() || !url.trim()} className="mobile-sheet-primary">Add link</button>
          </form>
        )}
      </BottomSheet>
    );
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 pt-24" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="modal-surface w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Add quick link</h2>
            <p className="mt-1 text-xs text-slate-400">Save a website for fast access.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            ×
          </button>
        </div>
        <div className="space-y-2">
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Link name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-course-400" />
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-course-400" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:border-slate-300">Cancel</button>
          <button type="submit" className="rounded-lg bg-course-500 px-4 py-2 text-sm font-semibold text-white hover:bg-course-600">Add link</button>
        </div>
      </form>
    </div>
  );
}
