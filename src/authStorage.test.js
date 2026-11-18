import { describe, expect, it } from "vitest";
import { AUTH_STORAGE_KEY, moveEarlierSignIn } from "./authStorage";

const URL = "https://abcdefgh.supabase.co";
const DEFAULT_KEY = "sb-abcdefgh-auth-token";

function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    map,
  };
}

describe("moveEarlierSignIn", () => {
  it("moves the sign-in from Supabase's default key, so updating signs nobody out", () => {
    const storage = memoryStorage({ [DEFAULT_KEY]: '{"access_token":"a"}' });
    moveEarlierSignIn(URL, storage);
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBe('{"access_token":"a"}');
    // Gone from the key tabs on earlier versions share, so they can't pick it up
    expect(storage.getItem(DEFAULT_KEY)).toBeNull();
  });

  it("only ever moves it once, so signing out sticks even if an old tab writes the old key again", () => {
    const storage = memoryStorage({ [DEFAULT_KEY]: '{"access_token":"a"}' });
    moveEarlierSignIn(URL, storage);
    storage.removeItem(AUTH_STORAGE_KEY); // signed out
    storage.setItem(DEFAULT_KEY, '{"access_token":"from-an-old-tab"}');
    moveEarlierSignIn(URL, storage);
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("never replaces a sign-in already under the new key", () => {
    const storage = memoryStorage({ [DEFAULT_KEY]: '{"access_token":"old"}', [AUTH_STORAGE_KEY]: '{"access_token":"new"}' });
    moveEarlierSignIn(URL, storage);
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBe('{"access_token":"new"}');
  });

  it("does nothing when nobody was signed in", () => {
    const storage = memoryStorage();
    moveEarlierSignIn(URL, storage);
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
});
