import InfoDialog, { Keys } from "./InfoDialog";
import { ACTION_LABELS } from "./keybinds";

// Every shortcut in Keybind settings, grouped by what it's for. Anything not listed here still
// shows up, under Other, so a new shortcut is never left out.
export const SHORTCUT_GROUPS = [
  { title: "Adding", actions: ["quickAdd", "newTask", "quickLink"] },
  { title: "Getting around", actions: ["openPalette", "showShortcuts", "focusSearch", "toggleView", "openPlanner", "plannerSwitchTab", "toggleToday"] },
  { title: "The list", actions: ["moveDown", "moveUp", "toggleComplete", "deleteSelected", "filterActive", "filterCompleted", "filterAll", "toggleSort"] },
  { title: "The calendar", actions: ["calendarMonth", "calendarWeek", "calendarDay", "calendarPrevious", "calendarNext"] },
  { title: "Settings", actions: ["openSettings"] },
];

export function shortcutGroups() {
  const listed = new Set(SHORTCUT_GROUPS.flatMap((group) => group.actions));
  const other = Object.keys(ACTION_LABELS).filter((action) => !listed.has(action));
  return other.length ? [...SHORTCUT_GROUPS, { title: "Other", actions: other }] : SHORTCUT_GROUPS;
}

// The read-only list behind "?": what each key does. Changing them is in Keybind settings.
export default function ShortcutsSheet({ open, keymap, onClose, onEdit }) {
  return (
    <InfoDialog
      open={open}
      title="Keyboard shortcuts"
      subtitle="They work anywhere except while you're typing in a field."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onEdit} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800">Change shortcuts</button>
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800">Done</button>
        </>
      }
    >
      <div className="columns-2 gap-8">
        {shortcutGroups().map((group) => (
          <section key={group.title} className="mb-5 break-inside-avoid">
            <h3 className="mb-1.5 text-xs font-semibold text-slate-500">{group.title}</h3>
            <ul>
              {group.actions.map((action) => (
                <li key={action} className="flex items-center justify-between gap-3 py-1">
                  <span className="text-subhead text-slate-700">{ACTION_LABELS[action]}</span>
                  <Keys combo={keymap[action]} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </InfoDialog>
  );
}
