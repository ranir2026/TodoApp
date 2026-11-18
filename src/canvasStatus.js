// Shared by the Canvas surfaces: what the chips can do, and how a school's feed is doing in words.
import { createContext } from "react";
import { feedErrorMessage } from "./canvasClient";
import { LINK_BROKEN_CODES } from "./canvasManage";

// Provided by App: whether Canvas features are on for this page, and the actions chips can take
export const CanvasActionsContext = createContext({ enabled: false, dismissDueMoved: () => {} });

export function formatClock(date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatCheckedAt(iso, now = new Date()) {
  if (!iso) return null;
  const date = new Date(iso);
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? formatClock(date) : `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${formatClock(date)}`;
}

// One line on how a school's feed is doing, plus the specific reason when it isn't fine
export function feedStatus(feed, sync) {
  if (sync.syncing) return { text: "Checking…", tone: "text-slate-400" };
  if (LINK_BROKEN_CODES.has(feed.status)) return { text: "This link stopped working", tone: "text-danger-600", detail: feedErrorMessage(feed.status), broken: true };
  if (sync.error?.domain === feed.domain) return { text: "Couldn't check just now", tone: "text-slate-500", detail: feedErrorMessage(sync.error.code) };
  const checked = formatCheckedAt(feed.lastSyncedAt);
  return { text: checked ? `Checked at ${checked}` : "Not checked yet", tone: "text-slate-400" };
}
