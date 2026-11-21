import { useRef, useState } from "react";
import InfoDialog, { Keys } from "./InfoDialog";
import { ACTION_LABELS, DEFAULT_KEYMAP, comboLabel, normalizeCombo, shortcutClashes } from "./keybinds";

// Every shortcut, grouped by what it's for. Anything not listed here still shows up, under Other,
// so a new shortcut is never left out.
export const SHORTCUT_GROUPS = [
  { title: "Adding", actions: ["quickAdd", "newTask", "quickLink"] },
  { title: "Getting around", actions: ["openPalette", "showShortcuts", "focusSearch", "toggleView", "openPlanner", "plannerSwitchTab", "toggleToday"] },
  { title: "The list", actions: ["moveDown", "moveUp", "toggleComplete", "deleteSelected", "filterActive", "filterCompleted", "filterAll", "toggleSort"] },
  { title: "The calendar", actions: ["calendarMonth", "calendarWeek", "calendarDay", "calendarPrevious", "calendarNext"] },
];

export function shortcutGroups() {
  const listed = new Set(SHORTCUT_GROUPS.flatMap((group) => group.actions));
  const other = Object.keys(ACTION_LABELS).filter((action) => !listed.has(action));
  return other.length ? [...SHORTCUT_GROUPS, { title: "Other", actions: other }] : SHORTCUT_GROUPS;
}

const MODIFIERS = ["Control", "Meta", "Alt", "Shift"];

// Keybinds, the one place for shortcuts, behind "?": what each key does, and changing it. Click a key, then
// press the new one; Escape leaves it as it was.
export default function ShortcutsSheet({ open, keymap, setKeymap, onClose }) {
  const [capturing, setCapturing] = useState(null);
  const listRef = useRef(null);
  const changed = Object.keys(ACTION_LABELS).some((action) => keymap[action] !== DEFAULT_KEYMAP[action]);
  const clashes = shortcutClashes(keymap);

  // Back on the key that was being changed, so the keyboard carries on from there
  function finishCapture(action) {
    setCapturing(null);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-shortcut="${action}"]`)?.focus());
  }

  function capture(event, action) {
    // Nothing else hears it: not the dialog (Escape would close it), not the app's own shortcuts
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") return finishCapture(action);
    if (MODIFIERS.includes(event.key)) return;
    const combo = normalizeCombo(event);
    setKeymap((current) => ({ ...current, [action]: combo }));
    finishCapture(action);
  }

  function close() {
    setCapturing(null);
    onClose();
  }

  return (
    <InfoDialog
      open={open}
      title="Keybinds"
      subtitle="They work anywhere except while you're typing in a field. Click a key to change it."
      onClose={close}
      footer={
        <>
          {changed && (
            <button type="button" onClick={() => setKeymap(DEFAULT_KEYMAP)} className="mr-auto rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              Reset all to default
            </button>
          )}
          <button type="button" onClick={close} className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800">Done</button>
        </>
      }
    >
      <div ref={listRef} className="columns-2 gap-8">
        {shortcutGroups().map((group) => (
          <section key={group.title} className="mb-5 break-inside-avoid">
            <h3 className="mb-1.5 text-xs font-semibold text-slate-500">{group.title}</h3>
            <ul>
              {group.actions.map((action) => {
                const label = ACTION_LABELS[action];
                const clash = clashes[action];
                return (
                  <li key={action} className="py-0.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-subhead text-slate-700">{label}</span>
                      {capturing === action ? (
                        <button
                          type="button"
                          autoFocus
                          onKeyDown={(event) => capture(event, action)}
                          onBlur={() => setCapturing(null)}
                          className="shrink-0 rounded-md border border-todo-400 bg-todo-50 px-2 py-0.5 text-caption font-medium text-todo-700 outline-none"
                          aria-label={`Press the new key for ${label}, or Escape to keep ${comboLabel(keymap[action])}`}
                        >
                          Press a key…
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-shortcut={action}
                          onClick={() => setCapturing(action)}
                          className="-mr-1 shrink-0 rounded-md p-0.5 hover:bg-slate-100 focus-visible:bg-slate-100"
                          aria-label={`${label}: ${comboLabel(keymap[action])}. Change`}
                          title="Click to change"
                        >
                          <Keys combo={keymap[action]} />
                        </button>
                      )}
                    </div>
                    {clash && <p className="text-caption text-todo-700">Same key as {clash.map((other) => ACTION_LABELS[other]).join(", ")}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </InfoDialog>
  );
}
