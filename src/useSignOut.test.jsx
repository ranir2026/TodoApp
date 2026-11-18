// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A pretend Supabase project that records, in order, each save and each sign-out
const cloud = vi.hoisted(() => ({ rows: {}, events: [], failSaves: false, signOutError: null }));
vi.mock("./supabase", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { access_token: "token" } } }),
        refreshSession: async () => ({ error: null }),
        signOut: vi.fn(async (options) => {
          cloud.events.push({ type: "signOut", scope: options?.scope ?? "global" });
          return { error: options?.scope === "local" ? null : cloud.signOutError };
        }),
      },
      channel: () => channel,
      removeChannel: () => {},
      from: () => ({
        select: () => ({ eq: (_column, userId) => ({ maybeSingle: async () => ({ data: cloud.rows[userId] ?? null, error: null }) }) }),
        upsert: async (row) => {
          if (cloud.failSaves) return { error: { message: "Failed to fetch" } };
          cloud.events.push({ type: "save", todos: row.todos });
          return { error: null };
        },
      }),
    },
  };
});

const { useState } = await import("react");
const { useSyncedData } = await import("./useSyncedData");
const { useSignOut } = await import("./useSignOut");
const { default: SignOutNotice } = await import("./SignOutNotice");

// Stable, as App's is (a new one each render would restart syncing)
const ignoreErrors = () => {};
const sam = { id: "account-sam" };

function SignedIn() {
  const [todos, setTodos] = useState([]);
  const [courses, setCourses] = useState([{ id: "general", name: "General" }]);
  const [quickLinks, setQuickLinks] = useState([]);
  const [planner, setPlanner] = useState({});
  const [canvas, setCanvas] = useState({});
  const { lastSyncedAt, saveNow } = useSyncedData(sam, todos, setTodos, courses, setCourses, quickLinks, setQuickLinks, planner, setPlanner, canvas, setCanvas, ignoreErrors);
  const signOutFlow = useSignOut(saveNow);
  return (
    <div>
      <p>{lastSyncedAt ? "Loaded" : "Loading"}</p>
      <button type="button" onClick={() => setTodos((current) => [...current, { id: `t${current.length + 1}`, title: "Lab report" }])}>Add</button>
      <button type="button" onClick={signOutFlow.signOut}>{signOutFlow.status === "saving" ? "Signing out…" : "Sign out"}</button>
      {signOutFlow.status === "unsaved" && <SignOutNotice onRetry={signOutFlow.signOut} onSignOutAnyway={signOutFlow.signOutAnyway} />}
    </div>
  );
}

beforeEach(() => {
  cloud.rows = { [sam.id]: { todos: [], courses: [{ id: "general", name: "General" }], quick_links: [], planner: {}, canvas: {} } };
  cloud.events = [];
  cloud.failSaves = false;
  cloud.signOutError = null;
});
afterEach(cleanup);

async function addRightBeforeSigningOut() {
  render(<SignedIn />);
  await screen.findByText("Loaded");
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  // Well inside the pause before the change would normally be saved
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
}

describe("Signing out", () => {
  it("saves a change made a moment before, and only then signs out", async () => {
    await addRightBeforeSigningOut();
    await waitFor(() => expect(cloud.events.some((event) => event.type === "signOut")).toBe(true));
    const save = cloud.events.findIndex((event) => event.type === "save" && event.todos.length === 1);
    const signOut = cloud.events.findIndex((event) => event.type === "signOut");
    expect(save).toBeGreaterThanOrEqual(0);
    expect(save).toBeLessThan(signOut);
  });

  it("stays signed in when the change can't be saved, and says what signing out anyway costs", async () => {
    cloud.failSaves = true;
    await addRightBeforeSigningOut();
    const notice = await screen.findByRole("alert");
    expect(notice.textContent).toContain("haven't saved yet, so you're still signed in");
    expect(notice.textContent).toContain("those changes will be lost");
    expect(cloud.events.some((event) => event.type === "signOut")).toBe(false);

    // Back online: trying again saves, then signs out
    cloud.failSaves = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(cloud.events.map((event) => event.type)).toEqual(["save", "signOut"]));
  });

  it("signs out without the change only when asked to", async () => {
    cloud.failSaves = true;
    await addRightBeforeSigningOut();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out anyway" }));
    await waitFor(() => expect(cloud.events.some((event) => event.type === "signOut")).toBe(true));
    expect(cloud.events.some((event) => event.type === "save")).toBe(false);
  });

  it("still signs out on this device when the server can't be reached to end the session", async () => {
    cloud.signOutError = { message: "Failed to fetch" };
    render(<SignedIn />);
    await screen.findByText("Loaded");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(cloud.events.filter((event) => event.type === "signOut").map((event) => event.scope)).toEqual(["global", "local"]));
  });

  it("signs straight out when everything is already saved", async () => {
    render(<SignedIn />);
    await screen.findByText("Loaded");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(cloud.events.map((event) => event.type)).toEqual(["signOut"]));
  });
});
