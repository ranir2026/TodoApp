import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { hasRecoveredOutageEdits, markOutageEditsRecovered, mergeOutageEdits } from "./outageRecovery";
import { hasCanvasData } from "./canvasSync";

// Columns added after launch. A Supabase project that hasn't run the latest schema yet is missing
// some of them; those are switched off and the rest of the data keeps syncing.
export const OPTIONAL_COLUMNS = ["quick_links", "planner", "canvas"];

export function missingColumn(error, columns) {
  if (!error) return null;
  const named = Object.keys(columns).find((column) => columns[column] && error.message?.includes(column));
  if (named) return named;
  // Unknown column without a name in the message: drop the optional columns still enabled, one at a time
  if (error.code === "42703" || error.code === "PGRST204") return Object.keys(columns).find((column) => columns[column]) ?? null;
  return null;
}

// The planner column defaults to {} for rows that predate it; that means "never synced", not "cleared"
function hasPlannerData(planner) {
  return Boolean(planner) && typeof planner === "object" && !Array.isArray(planner) && Object.keys(planner).length > 0;
}

// Same rule for the Canvas settings: {} is "never connected", so it never replaces real settings
export { hasCanvasData };

export function useSyncedData(user, todos, setTodos, courses, setCourses, quickLinks, setQuickLinks, planner, setPlanner, canvas, setCanvas, onError) {
  const loadedUserRef = useRef(null);
  const saveTimerRef = useRef(null);
  const isRemoteUpdateRef = useRef(false);
  const lastSyncedPayloadRef = useRef(null);
  const latestDataRef = useRef({ todos, courses, quickLinks, planner, canvas });
  const columnsRef = useRef(Object.fromEntries(OPTIONAL_COLUMNS.map((column) => [column, true])));
  const hasPendingSaveRef = useRef(false);
  // The account the refs above describe
  const accountRef = useRef(null);
  // Both belong to one account, so another account signing in never inherits them
  const [synced, setSynced] = useState({ userId: null, at: null });
  // When the cloud copy was last pulled in (on load, focus, or coming back online), so work that
  // should run against fresh data, like a Canvas check, can follow it
  const [pulled, setPulled] = useState({ userId: null, at: 0 });

  useEffect(() => {
    latestDataRef.current = { todos, courses, quickLinks, planner, canvas };
  }, [todos, courses, quickLinks, planner, canvas]);

  useEffect(() => {
    let cancelled = false;

    if (!supabase || !user) {
      loadedUserRef.current = null;
      lastSyncedPayloadRef.current = null;
      return undefined;
    }

    loadedUserRef.current = null;
    if (accountRef.current !== user.id) {
      // A save still waiting belongs to the account before (it keeps it on this device), so it must
      // neither hold back this account's cloud copy nor count as this account's change
      accountRef.current = user.id;
      hasPendingSaveRef.current = false;
      isRemoteUpdateRef.current = false;
      lastSyncedPayloadRef.current = null;
    }

    function remotePlanner(nextState) {
      return columnsRef.current.planner && hasPlannerData(nextState.planner) ? nextState.planner : latestDataRef.current.planner;
    }

    function remoteCanvas(nextState) {
      return columnsRef.current.canvas && hasCanvasData(nextState.canvas) ? nextState.canvas : latestDataRef.current.canvas;
    }

    function applyRemoteState(nextState) {
      // Nothing from a sync that belonged to an account since signed out
      if (!nextState || cancelled) return;
      // Don't let stale remote data overwrite local edits that haven't been saved yet
      if (hasPendingSaveRef.current) return;

      const nextTodos = Array.isArray(nextState.todos) ? nextState.todos : [];
      const nextCourses = Array.isArray(nextState.courses) && nextState.courses.length
        ? nextState.courses
        : latestDataRef.current.courses;
      const nextQuickLinks = columnsRef.current.quick_links && Array.isArray(nextState.quick_links)
        ? nextState.quick_links
        : latestDataRef.current.quickLinks;
      const nextPlanner = remotePlanner(nextState);
      const nextCanvas = remoteCanvas(nextState);

      const current = latestDataRef.current;
      const hasTodosDiff = JSON.stringify(nextTodos) !== JSON.stringify(current.todos);
      const hasCoursesDiff = JSON.stringify(nextCourses) !== JSON.stringify(current.courses);
      const hasQuickLinksDiff = JSON.stringify(nextQuickLinks) !== JSON.stringify(current.quickLinks);
      const hasPlannerDiff = JSON.stringify(nextPlanner) !== JSON.stringify(current.planner);
      const hasCanvasDiff = JSON.stringify(nextCanvas) !== JSON.stringify(current.canvas);

      if (hasTodosDiff || hasCoursesDiff || hasQuickLinksDiff || hasPlannerDiff || hasCanvasDiff) {
        isRemoteUpdateRef.current = true;
        lastSyncedPayloadRef.current = JSON.stringify({
          todos: nextTodos,
          courses: nextCourses,
          quickLinks: nextQuickLinks,
          planner: nextPlanner,
          canvas: nextCanvas,
        });

        if (hasTodosDiff) setTodos(nextTodos);
        if (hasCoursesDiff) setCourses(nextCourses);
        if (hasQuickLinksDiff) setQuickLinks(nextQuickLinks);
        if (hasPlannerDiff) setPlanner(nextPlanner);
        if (hasCanvasDiff) setCanvas(nextCanvas);
      }
    }

    const fetchRemoteState = async () => {
      let res;
      for (;;) {
        const enabled = OPTIONAL_COLUMNS.filter((column) => columnsRef.current[column]);
        res = await supabase
          .from("app_state")
          .select(["todos", "courses", ...enabled].join(", "))
          .eq("user_id", user.id)
          .maybeSingle();
        const missing = missingColumn(res.error, columnsRef.current);
        if (!missing) break;
        columnsRef.current[missing] = false;
      }

      if (cancelled) return;
      if (res.error) {
        onError?.(res.error.message);
        return;
      }

      // Only claim "synced" when this device has nothing waiting to be saved
      if (!hasPendingSaveRef.current) setSynced({ userId: user.id, at: new Date() });
      if (res.data) {
        const merged = hasRecoveredOutageEdits(user.id) ? null : mergeOutageEdits(res.data, latestDataRef.current);
        if (merged) {
          const quickLinksToSave = Array.isArray(res.data.quick_links) ? res.data.quick_links : latestDataRef.current.quickLinks;
          const plannerToSave = remotePlanner(res.data);
          const canvasToSave = remoteCanvas(res.data);
          applyRemoteState({ ...res.data, todos: merged.todos, courses: merged.courses });
          const ok = await saveToCloud(user.id, { todos: merged.todos, courses: merged.courses, quickLinks: quickLinksToSave, planner: plannerToSave, canvas: canvasToSave }, columnsRef, onError);
          if (cancelled) return;
          if (ok) markOutageEditsRecovered(user.id);
        } else {
          markOutageEditsRecovered(user.id);
          applyRemoteState(res.data);
        }
      } else {
        // A new account: what's on this device is its own copy (see deviceData.js), usually empty
        const payload = { ...latestDataRef.current };
        lastSyncedPayloadRef.current = JSON.stringify(payload);
        saveToCloud(user.id, payload, columnsRef, onError);
      }
      loadedUserRef.current = user.id;
      setPulled({ userId: user.id, at: Date.now() });
    };

    fetchRemoteState();

    const channel = supabase
      .channel(`app-state-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "app_state", filter: `user_id=eq.${user.id}` },
        ({ new: nextState }) => applyRemoteState(nextState),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_state", filter: `user_id=eq.${user.id}` },
        ({ new: nextState }) => applyRemoteState(nextState),
      )
      .subscribe();

    // Re-fetch data when window/tab regains focus or comes back online (e.g. switching back to phone or desktop)
    // If a save failed (e.g. offline or expired session), push local data before pulling remote
    const syncNow = async () => {
      if (hasPendingSaveRef.current && loadedUserRef.current === user.id) {
        const data = latestDataRef.current;
        const payload = JSON.stringify(data);
        const ok = await saveToCloud(user.id, data, columnsRef, onError);
        if (!ok || cancelled) return;
        lastSyncedPayloadRef.current = payload;
        if (JSON.stringify(latestDataRef.current) === payload) hasPendingSaveRef.current = false;
      }
      fetchRemoteState();
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        syncNow();
      }
    };
    const handleOnline = () => {
      syncNow();
    };

    window.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      window.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, [user, setTodos, setCourses, setQuickLinks, setPlanner, setCanvas, onError]);

  // Debounced save to Supabase
  useEffect(() => {
    if (!supabase || !user || loadedUserRef.current !== user.id) return undefined;

    // If state change came from remote sync, do not echo it back as a save
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return undefined;
    }

    const data = { todos, courses, quickLinks, planner, canvas };
    const currentPayloadString = JSON.stringify(data);
    if (currentPayloadString === lastSyncedPayloadRef.current) {
      hasPendingSaveRef.current = false;
      return undefined;
    }

    clearTimeout(saveTimerRef.current);

    const saveAction = async () => {
      lastSyncedPayloadRef.current = currentPayloadString;
      const ok = await saveToCloud(user.id, data, columnsRef, onError);
      if (!ok) {
        // Keep the change pending so it is retried instead of being overwritten by stale remote data
        if (lastSyncedPayloadRef.current === currentPayloadString) lastSyncedPayloadRef.current = null;
        return;
      }
      if (lastSyncedPayloadRef.current === currentPayloadString) hasPendingSaveRef.current = false;
      setSynced({ userId: user.id, at: new Date() });
    };

    hasPendingSaveRef.current = true;
    saveTimerRef.current = setTimeout(saveAction, 400);

    // Save immediately before page unload / navigation on mobile or desktop
    const handlePageHide = () => {
      clearTimeout(saveTimerRef.current);
      saveAction();
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      clearTimeout(saveTimerRef.current);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [user, todos, courses, quickLinks, planner, canvas, onError]);

  // Saves what's still waiting right away (signing out can't wait for the pause). True once the
  // cloud has everything this device has.
  const saveNow = useCallback(async () => {
    if (!supabase || !user || !hasPendingSaveRef.current) return true;
    clearTimeout(saveTimerRef.current);
    const data = latestDataRef.current;
    const payload = JSON.stringify(data);
    const ok = await saveToCloud(user.id, data, columnsRef, onError);
    if (!ok) return false;
    lastSyncedPayloadRef.current = payload;
    if (JSON.stringify(latestDataRef.current) === payload) hasPendingSaveRef.current = false;
    setSynced({ userId: user.id, at: new Date() });
    return true;
  }, [user, onError]);

  const mine = (entry, none) => (user && entry.userId === user.id ? entry.at : none);
  return { lastSyncedAt: mine(synced, null), pulledAt: mine(pulled, 0), saveNow };
}

function isAuthError(error) {
  return error?.code === "42501" || error?.code === "PGRST301" || error?.status === 401 || /row-level security|JWT/i.test(error?.message ?? "");
}

// Returns true when the data was saved
export async function saveToCloud(userId, { todos, courses, quickLinks, planner, canvas }, columnsRef, onError) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    onError?.("Offline");
    return false;
  }
  try {
    // getSession refreshes an expired access token (e.g. after the computer slept)
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      onError?.("Signed out. Sign in again to sync.");
      return false;
    }

    const row = {
      user_id: userId,
      todos: todos ?? [],
      courses: courses ?? [],
      updated_at: new Date().toISOString(),
    };
    const optionalValues = { quick_links: quickLinks ?? [], planner: planner ?? {}, canvas: canvas ?? {} };
    for (const column of OPTIONAL_COLUMNS) {
      if (columnsRef.current[column]) row[column] = optionalValues[column];
    }
    // Canvas settings live only in memory until the cloud copy loads, so an empty {} here means
    // "not loaded or never connected". Leave the column out so it can't wipe saved settings.
    if (!hasCanvasData(row.canvas)) delete row.canvas;

    let { error } = await supabase.from("app_state").upsert(row, { onConflict: "user_id" });

    if (error && isAuthError(error)) {
      // Token was stale: refresh once and retry
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error) {
        onError?.(refreshed.error.message || "Session expired. Sign in again to sync.");
        return false;
      }
      ({ error } = await supabase.from("app_state").upsert(row, { onConflict: "user_id" }));
    }

    // A column this project doesn't have yet: stop sending it and retry with the rest
    let missing = missingColumn(error, columnsRef.current);
    while (missing) {
      columnsRef.current[missing] = false;
      delete row[missing];
      ({ error } = await supabase.from("app_state").upsert(row, { onConflict: "user_id" }));
      missing = missingColumn(error, columnsRef.current);
    }

    if (error) {
      onError?.(error.message);
      return false;
    }
    onError?.("");
    return true;
  } catch (err) {
    onError?.(err?.message || "Failed to save data");
    return false;
  }
}
