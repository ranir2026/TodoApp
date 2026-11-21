// The User Guide: every feature in one line, with where to find it. `where` names the
// place on a computer and on a phone; a feature with no place on one of them isn't listed there.
// `keys` is the shortcut (a keymap action) shown beside it, and `open` what its button opens.
// `needs` names an availability flag (see `featureFlags` in App.jsx): a feature this account can't
// use isn't listed, so nobody finds something that doesn't work for them.
const GROUPS = [
  {
    title: "Basics",
    items: [
      { id: "tasks", title: "Tasks and events", detail: "Tasks get checked off. Events are things at a set time, like a lecture, and show in the calendar.", where: { desktop: "Quick add, or Add manually on the left", mobile: "The + button" }, keys: "quickAdd", open: "quickAdd" },
      { id: "words", title: "Quick-add words", detail: "Type fri, tmrw, 3pm, urgent, weekly or @Category, then tk for a task or ev for an event. Each word becomes a chip as you type.", where: { desktop: "Quick add", mobile: "The + button, Quick syntax" }, keys: "quickAdd" },
      { id: "categories", title: "Categories", detail: "One per class or area, each with its own color. Archive one at the end of term to keep its tasks out of the way.", where: { desktop: "Categories, on the left", mobile: "Profile, Categories" }, open: "category" },
      { id: "repeats", title: "Repeats", detail: "Daily, weekly on chosen days, or monthly, with an optional end. Skip a single date without touching the rest.", where: { desktop: "Repeat, when adding or editing", mobile: "Repeat, when adding or editing" } },
      { id: "notes", title: "Notes and links", detail: "Add notes to anything. Links in a note become buttons on the task.", where: { desktop: "Notes, or [note] in quick add", mobile: "Notes, or [note] in quick add" } },
      { id: "find", title: "Search and filters", detail: "Search titles and notes, and narrow the list by category, type, priority or due date.", where: { desktop: "Above the list", mobile: "Search, and the category pills" }, keys: "focusSearch" },
      { id: "undo", title: "Undo", detail: "Completing, deleting or moving something shows Undo for a few seconds.", where: { desktop: "The bar at the bottom", mobile: "The bar at the bottom" } },
      { id: "swipe", title: "Swipe to delete", detail: "Swipe a task left to delete it.", where: { desktop: null, mobile: "Any task in the list" } },
    ],
  },
  {
    title: "Planning",
    items: [
      { id: "today", title: "Today", detail: "Your plan for today at the edge of the screen. Type a task with its time, like Study 3-5pm.", where: { desktop: "The date tab on the right edge", mobile: null }, keys: "toggleToday", open: "today" },
      { id: "dayPlanner", title: "Day planner", detail: "Drag tasks onto the hours of any day to plan when you'll do them.", where: { desktop: "Planner, Day", mobile: null }, keys: "openPlanner", open: "planner" },
      { id: "projects", title: "Projects and milestones", detail: "Lay out a big assignment over weeks: milestones with deadlines, and the tasks toward each. A milestone completes when its tasks do. Mark a project done to put it away under Completed. A deleted one waits in Recently deleted, at the bottom, for 30 days.", where: { desktop: "Planner, Timeline", mobile: null }, keys: "plannerSwitchTab", open: "projects" },
      { id: "calendar", title: "Calendar", detail: "Month, week and day views of everything with a date. Add straight onto a day in Month.", where: { desktop: "The calendar button above the list", mobile: "Calendar tab" }, keys: "toggleView", open: "calendar" },
      { id: "stats", title: "Stats", detail: "What's due soon and overdue, and what you finished each day. Click a count to see those tasks.", where: { desktop: "Right column", mobile: "Profile, Overview" } },
      { id: "links", title: "Quick links", detail: "The sites you open every day, one click away.", where: { desktop: "Right column", mobile: "Profile, Quick links" }, keys: "quickLink" },
    ],
  },
  {
    title: "Canvas",
    needs: "canvas",
    items: [
      { id: "canvasConnect", title: "Canvas assignments", detail: "Connect your school's Canvas calendar feed and your assignments come in as tasks, each linked back to Canvas.", where: { desktop: "Canvas card, right column", mobile: "Profile, Canvas" }, open: "canvas" },
      { id: "canvasSync", title: "Kept up to date", detail: "New assignments come in while the app is open, and a moved due date is flagged. Your own edits and check-offs stay yours.", where: { desktop: "Canvas card, Manage", mobile: "Profile, Canvas" } },
    ],
  },
  {
    title: "Keybinds",
    only: "desktop",
    items: [
      { id: "keyboard", title: "Keybinds", detail: "Move through the list with J, check off with X, switch views with V, and more. Click a key there to change it to one you'd rather press.", where: { desktop: "Keybinds, bottom left", mobile: null }, keys: "showShortcuts", open: "shortcuts" },
      { id: "palette", title: "Command palette", detail: "Every command, searchable by name.", where: { desktop: "From the keyboard", mobile: null }, keys: "openPalette", open: "palette" },
    ],
  },
];

// flags: { canvas, desktop }. Returns the groups this account can use on this device, each item with
// `where` resolved to the one place to show.
export function featureGuide(flags) {
  const device = flags.desktop ? "desktop" : "mobile";
  return GROUPS
    .filter((group) => (!group.needs || flags[group.needs]) && (!group.only || group.only === device))
    .map((group) => ({
      title: group.title,
      items: group.items
        .filter((item) => item.where[device])
        .map((item) => ({ ...item, where: item.where[device], keys: flags.desktop ? item.keys : undefined, open: item.open })),
    }))
    .filter((group) => group.items.length > 0);
}
