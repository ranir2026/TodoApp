import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

export function useSyncedData(user, todos, setTodos, courses, setCourses, quickLinks, setQuickLinks, onError) {
  const loadedUserRef = useRef(null);
  const saveTimerRef = useRef(null);
  const isRemoteUpdateRef = useRef(false);
  const lastSyncedPayloadRef = useRef(null);
  const latestDataRef = useRef({ todos, courses, quickLinks });

  useEffect(() => {
    latestDataRef.current = { todos, courses, quickLinks };
  }, [todos, courses, quickLinks]);

  useEffect(() => {
    let cancelled = false;

    if (!supabase || !user) {
      loadedUserRef.current = null;
      lastSyncedPayloadRef.current = null;
      return undefined;
    }

    loadedUserRef.current = null;

    function applyRemoteState(nextState) {
      if (!nextState) return;

      const nextTodos = Array.isArray(nextState.todos) ? nextState.todos : [];
      const nextCourses = Array.isArray(nextState.courses) && nextState.courses.length
        ? nextState.courses
        : latestDataRef.current.courses;
      const nextQuickLinks = Array.isArray(nextState.quick_links)
        ? nextState.quick_links
        : latestDataRef.current.quickLinks;

      const current = latestDataRef.current;
      const hasTodosDiff = JSON.stringify(nextTodos) !== JSON.stringify(current.todos);
      const hasCoursesDiff = JSON.stringify(nextCourses) !== JSON.stringify(current.courses);
      const hasQuickLinksDiff = JSON.stringify(nextQuickLinks) !== JSON.stringify(current.quickLinks);

      if (hasTodosDiff || hasCoursesDiff || hasQuickLinksDiff) {
        isRemoteUpdateRef.current = true;
        lastSyncedPayloadRef.current = JSON.stringify({
          todos: nextTodos,
          courses: nextCourses,
          quickLinks: nextQuickLinks,
        });

        if (hasTodosDiff) setTodos(nextTodos);
        if (hasCoursesDiff) setCourses(nextCourses);
        if (hasQuickLinksDiff) setQuickLinks(nextQuickLinks);
      }
    }

    const fetchRemoteState = async () => {
      const { data, error } = await supabase
        .from("app_state")
        .select("todos, courses, quick_links")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        onError?.(error.message);
        return;
      }

      if (data) {
        applyRemoteState(data);
      } else {
        const payload = {
          todos: latestDataRef.current.todos,
          courses: latestDataRef.current.courses,
          quickLinks: latestDataRef.current.quickLinks,
        };
        lastSyncedPayloadRef.current = JSON.stringify(payload);
        saveToCloud(user.id, payload.todos, payload.courses, payload.quickLinks, onError);
      }
      loadedUserRef.current = user.id;
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
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        fetchRemoteState();
      }
    };
    const handleOnline = () => {
      fetchRemoteState();
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
  }, [user, setTodos, setCourses, setQuickLinks, onError]);

  // Debounced save to Supabase
  useEffect(() => {
    if (!supabase || !user || loadedUserRef.current !== user.id) return undefined;

    // If state change came from remote sync, do not echo it back as a save
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return undefined;
    }

    const currentPayloadString = JSON.stringify({ todos, courses, quickLinks });
    if (currentPayloadString === lastSyncedPayloadRef.current) {
      return undefined;
    }

    clearTimeout(saveTimerRef.current);

    const saveAction = async () => {
      lastSyncedPayloadRef.current = currentPayloadString;
      await saveToCloud(user.id, todos, courses, quickLinks, onError);
    };

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
  }, [user, todos, courses, quickLinks, onError]);
}

async function saveToCloud(userId, todos, courses, quickLinks, onError) {
  try {
    const { error } = await supabase.from("app_state").upsert(
      {
        user_id: userId,
        todos: todos ?? [],
        courses: courses ?? [],
        quick_links: quickLinks ?? [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) onError?.(error.message);
  } catch (err) {
    onError?.(err?.message || "Failed to save data");
  }
}
