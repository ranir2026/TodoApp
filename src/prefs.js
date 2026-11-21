// What the app remembers about how someone is getting on with it: the Getting started checklist, the
// one-time tips they've seen, and the last "What's new" note shown. It's saved with the account (the
// `prefs` column), so a finished checklist or a dismissed tip doesn't come back on another device.
// {} means nothing has been decided yet, the same as a row from before the column existed.
import { startingExamplesOpen } from "./starterData";

// Bump when there's a new "What's new" note to show existing accounts once
export const RELEASE = "2026-11-launch";

// How many tasks someone adds by hand (the form, not quick add) before the "Press N" tip
export const MANUAL_ADDS_FOR_TIP = 3;

export const EMPTY_PREFS = {};

export function normalizePrefs(prefs) {
  return prefs && typeof prefs === "object" && !Array.isArray(prefs) ? prefs : {};
}

export function hasPrefsData(prefs) {
  return Object.keys(normalizePrefs(prefs)).length > 0;
}

// The first time an account's data has loaded: a new account (nothing in its list but the example
// tasks) starts the checklist and has nothing to catch up on, so it skips "What's new". An account
// that already has tasks never sees the checklist (it's in "What you can do" instead) and gets
// "What's new" once. Returns the prefs to save, or null when there's nothing to decide.
export function startPrefs(prefs, { todos, now = new Date() }) {
  const current = normalizePrefs(prefs);
  if (current.onboarding) return null;
  if (todos.every((todo) => todo.example)) {
    return { ...current, onboarding: { status: "active", startedAt: now.toISOString(), done: {} }, seenRelease: RELEASE };
  }
  return { ...current, onboarding: { status: "existing" } };
}

export function checklistShown(prefs) {
  return normalizePrefs(prefs).onboarding?.status === "active";
}

// The steps, each ticked off by what the person has actually done. `done` in prefs remembers a
// step once it's been done, so deleting the first task doesn't untick it.
// context: { todos, canvas, planner, canvasAvailable, desktop, quickAddKey }. Two steps have no
// button, since what does them is right there: the circle on a task, and quick add's key (on a
// computer, shown as `combo`) or the + button (on a phone). With quick add's key unset, Try it opens it.
export function checklistSteps(prefs, context) {
  const onboarding = normalizePrefs(prefs).onboarding ?? {};
  const remembered = onboarding.done ?? {};
  const skipped = onboarding.skipped ?? {};
  const observed = observedSteps(context);
  const press = context.desktop ? "Click" : "Tap";
  const examplesLeft = startingExamplesOpen(context.todos ?? []);
  const quickAdd = !context.desktop
    ? { detail: "Tap + at the bottom, then type it in one line, like Essay fri urgent." }
    : { detail: "Words like fri and urgent turn into a date and a flag as you type.", ...(context.quickAddKey ? { combo: context.quickAddKey } : { action: "Try it" }) };
  const steps = [
    { id: "checkOff", label: "Check off a task", detail: examplesLeft ? `${press} the circle beside one of the examples below.` : `${press} the circle beside any task.` },
    { id: "firstTask", label: "Quick add your first task", ...quickAdd },
    context.canvasAvailable && { id: "canvas", label: "Connect Canvas", detail: "Optional. Brings in your assignments and keeps their dates up to date.", action: "Connect", optional: true },
    context.desktop && { id: "planDay", label: "Plan your day in Today", detail: "Give tasks a time, like Study 3-5pm.", action: "Open Today" },
    context.desktop && { id: "shortcuts", label: "Learn the shortcuts", detail: "Press ? any time to see them.", action: "Show them" },
  ].filter(Boolean);
  return steps.map((step) => ({
    ...step,
    done: Boolean(remembered[step.id] || observed[step.id]),
    skipped: Boolean(skipped[step.id]) && !(remembered[step.id] || observed[step.id]),
  }));
}

// Steps that can be read off the data itself
export function observedSteps({ todos = [], canvas = {}, planner = {} }) {
  return {
    checkOff: todos.some((todo) => todo.completed || Object.keys(todo.completions ?? {}).length > 0),
    firstTask: todos.some((todo) => !todo.canvas && !todo.example),
    canvas: (canvas?.feeds?.length ?? 0) > 0,
    planDay: Object.values(planner?.days ?? {}).some((day) => (day?.blocks?.length ?? 0) > 0),
  };
}

// Records newly observed steps, so they stay ticked. Returns null when nothing changes.
export function rememberSteps(prefs, steps) {
  const current = normalizePrefs(prefs);
  const onboarding = current.onboarding;
  if (onboarding?.status !== "active") return null;
  const done = onboarding.done ?? {};
  const fresh = steps.filter((step) => step.done && !done[step.id]);
  if (!fresh.length) return null;
  return { ...current, onboarding: { ...onboarding, done: { ...done, ...Object.fromEntries(fresh.map((step) => [step.id, true])) } } };
}

export function markStep(prefs, id) {
  const current = normalizePrefs(prefs);
  const onboarding = current.onboarding ?? { status: "active", done: {} };
  return { ...current, onboarding: { ...onboarding, done: { ...onboarding.done, [id]: true } } };
}

export function skipStep(prefs, id, skipped = true) {
  const current = normalizePrefs(prefs);
  const onboarding = current.onboarding ?? { status: "active", done: {} };
  const next = { ...onboarding.skipped };
  if (skipped) next[id] = true;
  else delete next[id];
  return { ...current, onboarding: { ...onboarding, skipped: next } };
}

// The day the example planner items were put in the tray (see withExamplePlannerItems), so
// they're offered once a day at most, and not again after they've been removed
export function plannerItemsAdded(prefs, dateKey) {
  return normalizePrefs(prefs).onboarding?.plannerItems === dateKey;
}

export function markPlannerItemsAdded(prefs, dateKey) {
  const current = normalizePrefs(prefs);
  if (!current.onboarding) return null;
  return { ...current, onboarding: { ...current.onboarding, plannerItems: dateKey } };
}

// status: "dismissed" (closed early) or "done" (closed after finishing)
export function closeChecklist(prefs, status) {
  const current = normalizePrefs(prefs);
  return { ...current, onboarding: { ...current.onboarding, status } };
}

export function reopenChecklist(prefs) {
  const current = normalizePrefs(prefs);
  return { ...current, onboarding: { done: {}, ...current.onboarding, status: "active" } };
}

export function whatsNewShown(prefs) {
  const current = normalizePrefs(prefs);
  return current.onboarding?.status === "existing" && current.seenRelease !== RELEASE;
}

export function markWhatsNewSeen(prefs) {
  return { ...normalizePrefs(prefs), seenRelease: RELEASE };
}

export function tipSeen(prefs, id) {
  return Boolean(normalizePrefs(prefs).tips?.[id]);
}

export function markTipSeen(prefs, id) {
  const current = normalizePrefs(prefs);
  return { ...current, tips: { ...current.tips, [id]: true } };
}

export function countManualAdd(prefs) {
  const current = normalizePrefs(prefs);
  return { ...current, manualAdds: (current.manualAdds ?? 0) + 1 };
}
