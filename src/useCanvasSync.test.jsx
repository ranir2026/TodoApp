// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCanvasFeed } from "../supabase/functions/_shared/canvasFeedParse.js";
import { listFeedCourses, suggestCategory } from "./canvasCourses";
import { planCanvasImport } from "./canvasImport";

const NOW = new Date("2026-11-17T17:00:00Z");
const TZ = "America/New_York";
const DOMAIN = "example.instructure.com";
const FEED = `https://${DOMAIN}/feeds/calendars/user_FAKEtoken0123456789abcdef.ics`;
const items = parseCanvasFeed(readFileSync(join(process.cwd(), "src/__fixtures__/canvas/school-a.ics"), "utf8"));

const fetchCanvasFeed = vi.fn();
vi.mock("./supabase", () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock("./canvasClient", async (importOriginal) => ({ ...(await importOriginal()), fetchCanvasFeed: (...args) => fetchCanvasFeed(...args) }));
const { useCanvasSync } = await import("./useCanvasSync");

// A user connected an hour ago; one assignment has appeared in Canvas since
function connectedState({ lastSyncedAt = new Date(NOW.getTime() - 3600000).toISOString() } = {}) {
  const courses = [{ id: "gen", name: "General" }];
  const rows = listFeedCourses(items, DOMAIN, NOW, TZ);
  const choices = Object.fromEntries(rows.map((row) => [row.key, suggestCategory(row.courseId ? row.label : null, courses)]));
  const plan = planCanvasImport({ feed: { domain: DOMAIN, url: FEED, items }, rows, choices, options: {}, todos: [], courses, canvas: {}, now: NOW, timeZone: TZ });
  const missing = plan.todos.find((todo) => todo.canvas);
  return {
    todos: plan.todos.filter((todo) => todo.id !== missing.id),
    courses: plan.courses,
    canvas: { ...plan.canvas, feeds: plan.canvas.feeds.map((feed) => ({ ...feed, lastSyncedAt })) },
    missingId: missing.id,
  };
}

function useHarness({ initial, pulledAt, enabled = true }) {
  const [todos, setTodos] = useState(initial.todos);
  const [courses, setCourses] = useState(initial.courses);
  const [canvas, setCanvas] = useState(initial.canvas);
  const sync = useCanvasSync({ enabled, userId: "user-1", pulledAt, todos, courses, canvas, setTodos, setCourses, setCanvas });
  return { todos, courses, canvas, sync };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fetchCanvasFeed.mockReset();
  fetchCanvasFeed.mockResolvedValue({ ok: true, url: FEED, domain: DOMAIN, items, fetchedAt: NOW.toISOString() });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useCanvasSync", () => {
  it("checks the feed after the cloud copy is pulled in, and adds what's new", async () => {
    const initial = connectedState();
    const { result } = renderHook((props) => useHarness(props), { initialProps: { initial, pulledAt: 1 } });
    await waitFor(() => expect(result.current.todos.some((todo) => todo.id === initial.missingId)).toBe(true));
    expect(fetchCanvasFeed).toHaveBeenCalledTimes(1);
    expect(fetchCanvasFeed).toHaveBeenCalledWith(FEED);
    expect(result.current.canvas.feeds[0].lastSyncedAt).toBe(NOW.toISOString());
    expect(result.current.sync.syncing).toBe(false);
    expect(result.current.sync.error).toBeNull();
  });

  it("doesn't check again on the next focus within ten minutes, but does when asked", async () => {
    const { result, rerender } = renderHook((props) => useHarness(props), { initialProps: { initial: connectedState(), pulledAt: 1 } });
    await waitFor(() => expect(fetchCanvasFeed).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.sync.syncing).toBe(false));

    vi.setSystemTime(new Date(NOW.getTime() + 5 * 60000));
    rerender({ initial: connectedState(), pulledAt: 2 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchCanvasFeed).toHaveBeenCalledTimes(1);

    await act(() => result.current.sync.syncNow({ manual: true }));
    expect(fetchCanvasFeed).toHaveBeenCalledTimes(2);
  });

  it("skips the automatic check when another device checked recently", async () => {
    const initial = connectedState({ lastSyncedAt: new Date(NOW.getTime() - 60000).toISOString() });
    renderHook((props) => useHarness(props), { initialProps: { initial, pulledAt: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchCanvasFeed).not.toHaveBeenCalled();
  });

  it("changes no task when the check fails, and remembers a link that stopped working", async () => {
    fetchCanvasFeed.mockResolvedValue({ ok: false, code: "feed_not_found" });
    const initial = connectedState();
    const { result } = renderHook((props) => useHarness(props), { initialProps: { initial, pulledAt: 1 } });
    await waitFor(() => expect(result.current.canvas.feeds[0].status).toBe("feed_not_found"));
    expect(result.current.todos).toBe(initial.todos);
    expect(result.current.sync.error).toMatchObject({ code: "feed_not_found", domain: DOMAIN, manual: false });

    // A broken link isn't retried on its own; only the user's new link (or a manual check) tries again
    fetchCanvasFeed.mockClear();
    vi.setSystemTime(new Date(NOW.getTime() + 60 * 60000));
    await act(() => result.current.sync.syncNow());
    expect(fetchCanvasFeed).not.toHaveBeenCalled();
  });

  it("does nothing until Canvas is available on this page", async () => {
    renderHook((props) => useHarness(props), { initialProps: { initial: connectedState(), pulledAt: 1, enabled: false } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchCanvasFeed).not.toHaveBeenCalled();
  });

  it("applies a settings change against the loaded feed at once", async () => {
    const initial = connectedState();
    const { result } = renderHook((props) => useHarness(props), { initialProps: { initial, pulledAt: 1 } });
    await waitFor(() => expect(fetchCanvasFeed).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.sync.syncing).toBe(false));

    let outcome;
    act(() => {
      outcome = result.current.sync.commit({ todos: result.current.todos, courses: result.current.courses, canvas: { ...result.current.canvas, includePastDue: true } });
    });
    expect(outcome.addedIds.length).toBeGreaterThan(0);
    expect(result.current.canvas.includePastDue).toBe(true);
    expect(fetchCanvasFeed).toHaveBeenCalledTimes(1);
  });
});
