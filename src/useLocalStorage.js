import { useCallback, useEffect, useState } from "react";

function read(key, initialValue) {
  if (key == null) return initialValue;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : initialValue;
  } catch {
    return initialValue;
  }
}

// A value that belongs to one owner at a time. When the owner changes it starts over from `load`,
// in the same render, so nothing one owner had is ever shown to, or saved for, the next.
function useOwnedState(owner, load) {
  const [state, setState] = useState(() => ({ owner, value: load() }));
  let current = state;
  if (state.owner !== owner) {
    current = { owner, value: load() };
    setState(current);
  }
  const setValue = useCallback((next) => setState((prev) => ({ owner: prev.owner, value: typeof next === "function" ? next(prev.value) : next })), []);
  return [current, setValue];
}

// State kept in localStorage under `key`. A new key reads what's stored under it (the old key's data
// stays where it is), and a null key keeps the value in memory only.
export function useLocalStorage(key, initialValue) {
  const [state, setValue] = useOwnedState(key, () => read(key, initialValue));

  useEffect(() => {
    if (state.owner == null) return;
    try {
      localStorage.setItem(state.owner, JSON.stringify(state.value));
    } catch {
      // Storage full or unavailable: the value still works for this visit
    }
  }, [state]);

  return [state.value, setValue];
}

// State held in memory for one account, back to `initialValue` whenever the account changes
export function useAccountState(accountId, initialValue) {
  const [state, setValue] = useOwnedState(accountId, () => initialValue);
  return [state.value, setValue];
}
