import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

export function useSyncedData(user, todos, setTodos, courses, setCourses, onError) {
  const loadedUserRef = useRef(null);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    if (!supabase || !user) {
      loadedUserRef.current = null;
      return undefined;
    }

    loadedUserRef.current = null;
    supabase
      .from("app_state")
      .select("todos, courses")
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
          setCourses(Array.isArray(data.courses) && data.courses.length ? data.courses : courses);
        } else {
          saveToCloud(user.id, todos, courses, onError);
        }
        loadedUserRef.current = user.id;
      });

    return () => {
      cancelled = true;
    };
  }, [user, todos, courses, setTodos, setCourses, onError]);

  useEffect(() => {
    if (!supabase || !user || loadedUserRef.current !== user.id) return undefined;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveToCloud(user.id, todos, courses, onError);
    }, 500);
    return () => clearTimeout(saveTimerRef.current);
  }, [user, todos, courses, onError]);
}

async function saveToCloud(userId, todos, courses, onError) {
  const { error } = await supabase.from("app_state").upsert(
    { user_id: userId, todos, courses, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) onError(error.message);
}
