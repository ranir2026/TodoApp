import { useCallback, useRef, useState } from "react";
import { supabase } from "./supabase";

// How long signing out waits for the save before saying it couldn't
export const SIGN_OUT_SAVE_TIMEOUT_MS = 10000;

// Signing out first saves the changes still on their way to the cloud: once signed out they can't
// be saved, and the next sign-in loads the cloud copy. When they can't be saved (offline, say), it
// stays signed in and leaves the choice to the person: try again, or sign out without them.
// status: "idle" | "saving" | "unsaved"
export function useSignOut(saveNow) {
  const [status, setStatus] = useState("idle");
  const busyRef = useRef(false);

  const finish = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    // Couldn't reach the server to end the session everywhere: still sign out on this device
    if (error) await supabase.auth.signOut({ scope: "local" });
    setStatus("idle");
  }, []);

  const signOut = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus("saving");
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), SIGN_OUT_SAVE_TIMEOUT_MS);
    });
    const saved = await Promise.race([saveNow().catch(() => false), timeout]);
    clearTimeout(timer);
    if (saved) await finish();
    else setStatus("unsaved");
    busyRef.current = false;
  }, [saveNow, finish]);

  const signOutAnyway = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    await finish();
    busyRef.current = false;
  }, [finish]);

  return { status, signOut, signOutAnyway };
}
