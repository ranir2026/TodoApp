// Where the sign-in is kept. Supabase tells every open tab using the same key about each sign-in
// made in any of them. Versions before this one used Supabase's default key, and a tab still
// running one of them, told that a different account had signed in, saved what it held of the
// last account into the new one. With a key of its own, such a tab only ever sees the account it
// was already signed in to, whose data is its own.
export const AUTH_STORAGE_KEY = "todo-auth";
const MOVED_FLAG = "todo-auth-moved";

const defaultKey = (supabaseUrl) => `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;

// Once per device, the sign-in kept under the default key moves to this one, so updating doesn't
// sign anyone out. Only once: a tab still on an earlier version can write that key again later,
// and that must not sign back in someone who has since signed out.
export function moveEarlierSignIn(supabaseUrl, storage = globalThis.localStorage) {
  try {
    if (storage.getItem(MOVED_FLAG)) return;
    storage.setItem(MOVED_FLAG, "1");
    const key = defaultKey(supabaseUrl);
    const earlier = storage.getItem(key);
    if (earlier === null) return;
    if (storage.getItem(AUTH_STORAGE_KEY) === null) storage.setItem(AUTH_STORAGE_KEY, earlier);
    storage.removeItem(key);
  } catch {
    // Storage unavailable: there's no saved sign-in to move
  }
}
