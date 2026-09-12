import { useState } from "react";
import { ACTION_LABELS, DEFAULT_KEYMAP, comboLabel, normalizeCombo } from "./keybinds";

export default function KeybindSettings({ open, keymap, setKeymap, onClose }) {
  const [capturing, setCapturing] = useState(null);

  if (!open) return null;

  function startCapture(action) {
    setCapturing(action);
  }

  function handleKeyDown(e, action) {
    e.preventDefault();
    if (e.key === "Escape") {
      setCapturing(null);
      return;
    }
    if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return;
    const combo = normalizeCombo(e);
    setKeymap((prev) => ({ ...prev, [action]: combo }));
    setCapturing(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Keyboard shortcuts</h2>
          <button
            onClick={() => setKeymap(DEFAULT_KEYMAP)}
            className="text-xs font-medium text-slate-400 hover:text-slate-600"
          >
            Reset all
          </button>
        </div>

        <ul className="max-h-96 space-y-1 overflow-y-auto">
          {Object.entries(ACTION_LABELS).map(([action, label]) => (
            <li key={action} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50">
              <span className="text-sm text-slate-700">{label}</span>
              {capturing === action ? (
                <input
                  autoFocus
                  readOnly
                  value="Press any key..."
                  onKeyDown={(e) => handleKeyDown(e, action)}
                  onBlur={() => setCapturing(null)}
                  className="w-32 rounded-md border border-todo-400 bg-todo-50 px-2 py-1 text-center text-xs text-todo-700 outline-none"
                />
              ) : (
                <button
                  onClick={() => startCapture(action)}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-600 hover:border-todo-400"
                >
                  {comboLabel(keymap[action])}
                </button>
              )}
            </li>
          ))}
        </ul>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Done
        </button>
      </div>
    </div>
  );
}
