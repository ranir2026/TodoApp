// Keeps imported Canvas tasks current while the app is open (CANVAS_INTEGRATION.md, Phase 5).
// It checks each connected feed after the cloud copy is pulled in (on load, on focus, coming back
// online), at most every AUTO_SYNC_INTERVAL_MS, and whenever the user asks. A failed check
// changes nothing: tasks are only ever touched by a feed that loaded and parsed.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCanvasFeed } from "./canvasClient";
import { applyFeedSync, LINK_BROKEN_CODES, markFeedStatus, shouldAutoSync } from "./canvasManage";
import { deviceTimeZone, reconcile } from "./canvasSync";

export function useCanvasSync({ enabled, userId, pulledAt, todos, courses, canvas, setTodos, setCourses, setCanvas }) {
  const latestRef = useRef({ todos, courses, canvas });
  const runningRef = useRef(false);
  const attemptsRef = useRef({});
  // Bumped when the account changes, so a check that was in flight is thrown away
  const generationRef = useRef(0);
  const [status, setStatus] = useState({ syncing: false, error: null });
  // The last feed each school sent this session (never saved), keyed by account
  const [cache, setCache] = useState({ userId: null, feeds: {} });

  useEffect(() => {
    latestRef.current = { todos, courses, canvas };
  }, [todos, courses, canvas]);

  useEffect(() => {
    generationRef.current += 1;
    attemptsRef.current = {};
  }, [userId]);

  const feeds = useMemo(() => (cache.userId === userId ? cache.feeds : {}), [cache, userId]);

  const syncNow = useCallback(async ({ manual = false } = {}) => {
    if (!enabled || runningRef.current) return;
    const startedAt = Date.now();
    const due = (latestRef.current.canvas.feeds ?? []).filter((feed) => manual || (!LINK_BROKEN_CODES.has(feed.status) && shouldAutoSync({ feed, lastAttemptAt: attemptsRef.current[feed.domain], now: startedAt })));
    if (!due.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Offline is already said by the sync pill; only a check the user asked for answers here
      if (manual) setStatus({ syncing: false, error: { code: "offline", manual } });
      return;
    }

    runningRef.current = true;
    const generation = generationRef.current;
    setStatus((current) => ({ ...current, syncing: true }));
    let error = null;
    for (const feed of due) {
      attemptsRef.current[feed.domain] = Date.now();
      const result = await fetchCanvasFeed(feed.url);
      if (generation !== generationRef.current) break;
      const latest = latestRef.current;
      // Disconnected, or given a new link, while the check was running
      if (!latest.canvas.feeds?.some((item) => item.domain === feed.domain && item.url === feed.url)) continue;
      if (!result.ok) {
        error = { code: result.code, domain: feed.domain, manual };
        if (LINK_BROKEN_CODES.has(result.code)) {
          const next = markFeedStatus(latest.canvas, feed.domain, result.code);
          latestRef.current = { ...latest, canvas: next };
          setCanvas(next);
        }
        continue;
      }
      const applied = applyFeedSync({ domain: feed.domain, items: result.items, todos: latest.todos, courses: latest.courses, canvas: latest.canvas, now: new Date(), timeZone: deviceTimeZone() });
      latestRef.current = { todos: applied.todos, courses: applied.courses, canvas: applied.canvas };
      if (applied.todos !== latest.todos) setTodos(applied.todos);
      if (applied.courses !== latest.courses) setCourses(applied.courses);
      setCanvas(applied.canvas);
      setCache((current) => ({ userId, feeds: { ...(current.userId === userId ? current.feeds : {}), [feed.domain]: { items: result.items, fetchedAt: new Date().toISOString() } } }));
    }
    runningRef.current = false;
    if (generation === generationRef.current) setStatus({ syncing: false, error });
  }, [enabled, userId, setTodos, setCourses, setCanvas]);

  // After every pull of the cloud copy: a fresh load, focus, or coming back online. Pulls that
  // land close together (focus and visibility fire as a pair) start one check.
  useEffect(() => {
    if (!enabled || !pulledAt) return undefined;
    const timer = setTimeout(() => syncNow(), 300);
    return () => clearTimeout(timer);
  }, [enabled, pulledAt, syncNow]);

  /**
   * Applies a settings change (mapping, toggles) and runs it against the feeds already loaded
   * this session, so newly included work appears at once. A school with no loaded feed is
   * checked instead.
   */
  const commit = useCallback(({ todos: nextTodos, courses: nextCourses, canvas: nextCanvas }) => {
    let state = { todos: nextTodos, courses: nextCourses, canvas: nextCanvas };
    let needsCheck = false;
    for (const feed of nextCanvas.feeds ?? []) {
      const loaded = feeds[feed.domain];
      if (!loaded) {
        needsCheck = true;
        continue;
      }
      const applied = applyFeedSync({ domain: feed.domain, items: loaded.items, ...state, now: new Date(), fetchedAt: loaded.fetchedAt, timeZone: deviceTimeZone() });
      state = { todos: applied.todos, courses: applied.courses, canvas: applied.canvas };
    }
    latestRef.current = state;
    setTodos(state.todos);
    setCourses(state.courses);
    setCanvas(state.canvas);
    if (needsCheck) setTimeout(() => syncNow({ manual: true }), 0);
    const before = new Set(nextTodos.map((todo) => todo.id));
    return { addedIds: state.todos.filter((todo) => !before.has(todo.id)).map((todo) => todo.id) };
  }, [feeds, setTodos, setCourses, setCanvas, syncNow]);

  // Courses with work waiting for a category: new ones (say, a new semester) and ones whose
  // category was deleted. Worked out from the loaded feeds, so it updates as soon as they're matched.
  const unmapped = useMemo(() => {
    if (!enabled) return [];
    const result = [];
    for (const feed of canvas.feeds ?? []) {
      const loaded = feeds[feed.domain];
      if (!loaded) continue;
      const { unmappedCourses } = reconcile({ domain: feed.domain, feedItems: loaded.items, todos, courses, canvasState: canvas, now: new Date(), timeZone: deviceTimeZone() });
      result.push(...unmappedCourses);
    }
    return result;
  }, [enabled, feeds, canvas, todos, courses]);

  return {
    syncing: status.syncing,
    error: status.error,
    unmapped,
    feedItems: (domain) => feeds[domain]?.items ?? null,
    syncNow,
    commit,
  };
}
