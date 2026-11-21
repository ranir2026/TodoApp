export const DEFAULT_KEYMAP = {
  openPalette: "ctrl+k",
  quickAdd: "n",
  newTask: "shift+n",
  toggleView: "v",
  moveDown: "j",
  moveUp: "shift+j",
  toggleComplete: "x",
  deleteSelected: "d",
  filterActive: "1",
  filterCompleted: "2",
  filterAll: "3",
  calendarMonth: "alt+1",
  calendarWeek: "alt+2",
  calendarDay: "alt+3",
  calendarPrevious: "arrowleft",
  calendarNext: "arrowright",
  focusSearch: "ctrl+space",
  toggleSort: "c",
  quickLink: "shift+l",
  openPlanner: "p",
  plannerSwitchTab: "t",
  toggleToday: "shift+p",
  showShortcuts: "shift+?",
};

export const ACTION_LABELS = {
  openPalette: "Open command palette",
  quickAdd: "Open quick add",
  newTask: "Focus new task form",
  toggleView: "Toggle list / calendar view",
  moveDown: "Scroll task list down",
  moveUp: "Scroll task list up",
  toggleComplete: "Toggle complete on selected task",
  deleteSelected: "Delete selected task",
  filterActive: "Show active tasks",
  filterCompleted: "Show completed tasks",
  filterAll: "Show all tasks",
  calendarMonth: "Show month calendar",
  calendarWeek: "Show week calendar",
  calendarDay: "Show day calendar",
  calendarPrevious: "Previous calendar period",
  calendarNext: "Next calendar period",
  focusSearch: "Focus task search",
  toggleSort: "Toggle date/category sort",
  quickLink: "Add quick link",
  openPlanner: "Open planner",
  plannerSwitchTab: "Switch planner between Day and Timeline",
  toggleToday: "Show or hide today's plan",
  showShortcuts: "Show keybinds",
};

// Left off the Keybinds sheet: Ctrl+K still opens the command palette, and the User Guide says so
export const HIDDEN_SHORTCUTS = ["openPalette"];

// action -> the other actions on the same keys
export function shortcutClashes(keymap) {
  const byCombo = new Map();
  for (const action of Object.keys(ACTION_LABELS)) {
    const combo = keymap[action];
    if (combo) byCombo.set(combo, [...(byCombo.get(combo) ?? []), action]);
  }
  const clashes = {};
  for (const actions of byCombo.values()) {
    if (actions.length < 2) continue;
    for (const action of actions) clashes[action] = actions.filter((other) => other !== action);
  }
  return clashes;
}

export function normalizeCombo(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  const key = e.key.toLowerCase();
  if (e.shiftKey && !["control", "meta", "alt", "shift"].includes(key)) parts.push("shift");
  if (key === " ") parts.push("space");
  else if (key !== "control" && key !== "meta" && key !== "alt" && key !== "shift") parts.push(key);
  return parts.join("+");
}

const KEY_NAMES = { ctrl: "Ctrl", shift: "Shift", alt: "Alt", space: "Space", arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓", escape: "Esc", enter: "Enter" };
// Keys that are typed with Shift on most keyboards, so "Shift" in front of them says nothing new
const SHIFTED = new Set(["?", "!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "_", "+", "{", "}", "|", ":", "\"", "<", ">", "~"]);

// The keys of a combo, one label each, for drawing as keycaps: "ctrl+k" is ["Ctrl", "K"]
export function comboKeys(combo) {
  if (!combo) return [];
  // Split on the "+" between keys, not a "+" that is itself the key ("shift++")
  const parts = combo.split(/\+(?=.)/);
  const key = parts.at(-1);
  return parts
    .filter((part, index) => !(part === "shift" && index < parts.length - 1 && SHIFTED.has(key)))
    .map((part) => KEY_NAMES[part] ?? part.toUpperCase());
}

export function comboLabel(combo) {
  if (!combo) return "Unset";
  return comboKeys(combo).join(" + ");
}
