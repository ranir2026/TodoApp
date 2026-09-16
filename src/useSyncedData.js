import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

export function useSyncedData(user, todos, setTodos, courses, setCourses, quickLinks, setQuickLinks, onError) {
  const loadedUserRef = useRef(null);
  const saveTimerRef = useRef(null);
  const latestDataRef = useRef({ todos, courses, quickLinks });

  useEffect(() => {
    latestDataRef.current = { todos, courses, quickLinks };
  }, [todos, courses, quickLinks]);

  useEffect(() => {
    let cancelled = false;

    if (!supabase || !user) {
      loadedUserRef.current = null;
      return undefined;
    }

    loadedUserRef.current = null;
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
      );

    function applyRemoteState(nextState) {
          const nextTodos = Array.isArray(nextState.todos) ? nextState.todos : [];
          const nextCourses = Array.isArray(nextState.courses) && nextState.courses.length ? nextState.courses : latestDataRef.current.courses;
          const nextQuickLinks = Array.isArray(nextState.quick_links) ? nextState.quick_links : latestDataRef.current.quickLinks;
          if (JSON.stringify(nextTodos) !== JSON.stringify(latestDataRef.current.todos)) setTodos(nextTodos);
          if (JSON.stringify(nextCourses) !== JSON.stringify(latestDataRef.current.courses)) setCourses(nextCourses);
          if (JSON.stringify(nextQuickLinks) !== JSON.stringify(latestDataRef.current.quickLinks)) setQuickLinks(nextQuickLinks);
    }

    channel
      .subscribe();

    supabase
      .from("app_state")
      .select("todos, courses, quick_links")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          onError(error.message);
          return;
        }

        if (data) {
          setTodos(Array.isArray(data.todos) ? data.todos : []);
          setCourses(Array.isArray(data.courses) && data.courses.length ? data.courses : latestDataRef.current.courses);
          setQuickLinks(Array.isArray(data.quick_links) ? data.quick_links : latestDataRef.current.quickLinks);
        } else {
          saveToCloud(user.id, latestDataRef.current.todos, latestDataRef.current.courses, latestDataRef.current.quickLinks, onError);
        }
        loadedUserRef.current = user.id;
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, setTodos, setCourses, setQuickLinks, onError]);

  useEffect(() => {
    if (!supabase || !user || loadedUserRef.current !== user.id) return undefined;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveToCloud(user.id, todos, courses, quickLinks, onError);
    }, 500);
    return () => clearTimeout(saveTimerRef.current);
  }, [user, todos, courses, quickLinks, onError]);
}

async function saveToCloud(userId, todos, courses, quickLinks, onError) {
  const { error } = await supabase.from("app_state").upsert(
    { user_id: userId, todos, courses, quick_links: quickLinks, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) onError(error.message);
}
