export const DEFAULT_KEYMAP = {
  openPalette: "ctrl+k",
  newTask: "n",
  toggleView: "v",
  moveDown: "j",
  moveUp: "k",
  toggleComplete: "x",
  deleteSelected: "d",
  openSettings: "ctrl+,",
  filterActive: "1",
  filterCompleted: "2",
  filterAll: "3",
};

export const ACTION_LABELS = {
  openPalette: "Open command palette",
  newTask: "Focus new task input",
  toggleView: "Toggle list / calendar view",
  moveDown: "Select next task",
  moveUp: "Select previous task",
  toggleComplete: "Toggle complete on selected task",
  deleteSelected: "Delete selected task",
  openSettings: "Open keybind settings",
  filterActive: "Show active tasks",
  filterCompleted: "Show completed tasks",
  filterAll: "Show all tasks",
};

export function normalizeCombo(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  const key = e.key.toLowerCase();
  if (e.shiftKey && key.length > 1 && key !== "shift") parts.push("shift");
  if (key === " ") parts.push("space");
  else if (key !== "control" && key !== "meta" && key !== "alt" && key !== "shift") parts.push(key);
  return parts.join("+");
}

export function comboLabel(combo) {
  if (!combo) return "Unset";
  return combo
    .split("+")
    .map((p) => (p === "ctrl" ? "Ctrl" : p === "shift" ? "Shift" : p === "alt" ? "Alt" : p.toUpperCase()))
    .join(" + ");
}
