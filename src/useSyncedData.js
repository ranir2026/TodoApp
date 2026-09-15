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
