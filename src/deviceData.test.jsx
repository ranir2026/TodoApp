// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A pretend Supabase project: each account's saved row, and every row saved
const cloud = vi.hoisted(() => ({ rows: {}, saved: [] }));
vi.mock("./supabase", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { access_token: "token" } } }),
        refreshSession: async () => ({ error: null }),
      },
      channel: () => channel,
      removeChannel: () => {},
      from: () => ({
        select: () => ({
          eq: (_column, userId) => ({ maybeSingle: async () => ({ data: cloud.rows[userId] ?? null, error: null }) }),
        }),
        upsert: async (row) => {
          cloud.saved.push(row);
          return { error: null };
        },
      }),
    },
  };
});

const { useAccountState, useLocalStorage } = await import("./useLocalStorage");
const { accountDataKey } = await import("./deviceData");
const { useSyncedData } = await import("./useSyncedData");

// Stable, as App's is (a new one each render would restart syncing)
const ignoreErrors = () => {};
const alex = { id: "account-alex" };
const sam = { id: "account-sam" };
const now = new Date().toISOString();
const alexRow = {
  todos: [{ id: "a1", title: "Alex's essay", createdAt: now }],
  courses: [{ id: "c-alex", name: "Alex's class" }],
  quick_links: [{ id: "q-alex", label: "Alex's link", url: "https://example.com" }],
  planner: { projects: [{ id: "p-alex" }] },
  canvas: { feeds: [{ id: "f1", domain: "school.example" }], courseMap: {}, dismissedIds: [] },
};

// Wired the way App wires it
function Account({ user }) {
  const accountId = user?.id ?? null;
  const key = (name) => accountDataKey(name, { accountsEnabled: true, accountId });
  const [todos, setTodos] = useLocalStorage(key("todos"), []);
  const [courses, setCourses] = useLocalStorage(key("courses"), [{ id: "general", name: "General" }]);
  const [quickLinks, setQuickLinks] = useLocalStorage(key("quickLinks"), []);
  const [planner, setPlanner] = useLocalStorage(key("planner"), {});
  const [canvas, setCanvas] = useAccountState(accountId, {});
  const { lastSyncedAt } = useSyncedData(user, todos, setTodos, courses, setCourses, quickLinks, setQuickLinks, planner, setPlanner, canvas, setCanvas, ignoreErrors);
  return (
    <div>
      <ul>{todos.map((todo) => <li key={todo.id}>{todo.title}</li>)}</ul>
      <p>{courses.map((course) => course.name).join(", ")}</p>
      <p>{canvas.feeds?.length ? "Canvas connected" : "No Canvas"}</p>
      <p>{lastSyncedAt ? "Synced" : "Not synced yet"}</p>
    </div>
  );
}

const savedFor = (user) => cloud.saved.filter((row) => row.user_id === user.id);

beforeEach(() => {
  localStorage.clear();
  cloud.rows = { [alex.id]: alexRow };
  cloud.saved = [];
});
afterEach(cleanup);

describe("Switching accounts on one device", () => {
  async function signOutAlexThenSignIn(user) {
    const view = render(<Account user={alex} />);
    await screen.findByText("Alex's essay");
    expect(screen.getByText("Canvas connected")).toBeTruthy();
    view.rerender(<Account user={null} />);
    expect(screen.queryByText("Alex's essay")).toBeNull();
    view.rerender(<Account user={user} />);
    return view;
  }

  it("gives a brand-new account an empty start, not the last account's tasks", async () => {
    await signOutAlexThenSignIn(sam);
    await waitFor(() => expect(savedFor(sam).length).toBeGreaterThan(0));
    const first = savedFor(sam)[0];
    expect(first.todos).toEqual([]);
    expect(first.courses).toEqual([{ id: "general", name: "General" }]);
    expect(first.quick_links).toEqual([]);
    // Alex's Canvas settings (with the feed link) are never written to Sam's row
    expect(first).not.toHaveProperty("canvas");
    expect(screen.queryByText("Alex's essay")).toBeNull();
    expect(screen.getByText("No Canvas")).toBeTruthy();
    // And Alex's row was never written to
    expect(savedFor(alex)).toEqual([]);
  });

  it("shows an existing account only its own tasks, and saves nothing of the last account's into it", async () => {
    cloud.rows[sam.id] = { todos: [{ id: "s1", title: "Sam's lab report" }], courses: [{ id: "c-sam", name: "Sam's class" }], quick_links: [], planner: {}, canvas: {} };
    await signOutAlexThenSignIn(sam);
    await screen.findByText("Sam's lab report");
    expect(screen.queryByText("Alex's essay")).toBeNull();
    expect(screen.getByText("No Canvas")).toBeTruthy();
    expect(JSON.stringify(savedFor(sam))).not.toContain("a1");
  });

  it("doesn't show the last account as synced before this one has loaded", async () => {
    const view = render(<Account user={alex} />);
    await screen.findByText("Synced");
    cloud.rows[sam.id] = { todos: [], courses: [], quick_links: [], planner: {}, canvas: {} };
    view.rerender(<Account user={sam} />);
    expect(screen.getByText("Not synced yet")).toBeTruthy();
    await screen.findByText("Synced");
  });

  it("keeps each account's copy on the device, so signing back in finds it", async () => {
    await signOutAlexThenSignIn(sam);
    await waitFor(() => expect(savedFor(sam).length).toBeGreaterThan(0));
    expect(JSON.parse(localStorage.getItem(`todos:${alex.id}`))).toEqual(alexRow.todos);
    expect(JSON.parse(localStorage.getItem(`todos:${sam.id}`))).toEqual([]);
  });
});

describe("useLocalStorage", () => {
  function Value({ storageKey }) {
    const [value, setValue] = useLocalStorage(storageKey, "empty");
    return <button type="button" onClick={() => setValue((current) => `${current}!`)}>{value}</button>;
  }

  it("reads the new key's value when the key changes, and leaves the old one alone", () => {
    localStorage.setItem("a", JSON.stringify("first"));
    const view = render(<Value storageKey="a" />);
    act(() => screen.getByRole("button").click());
    expect(localStorage.getItem("a")).toBe(JSON.stringify("first!"));
    view.rerender(<Value storageKey="b" />);
    expect(screen.getByRole("button").textContent).toBe("empty");
    expect(localStorage.getItem("a")).toBe(JSON.stringify("first!"));
  });

  it("keeps the value in memory only when there's no key", () => {
    render(<Value storageKey={null} />);
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("empty!");
    expect(localStorage.length).toBe(0);
  });
});

describe("The single copy earlier versions kept on the device", () => {
  const seedSharedCopy = () => {
    localStorage.setItem("todos", JSON.stringify(alexRow.todos));
    localStorage.setItem("courses", JSON.stringify(alexRow.courses));
    localStorage.setItem("quickLinks", JSON.stringify(alexRow.quick_links));
    localStorage.setItem("planner", JSON.stringify(alexRow.planner));
  };

  it("isn't given to a new account the app opens already signed in to (a confirmation link)", async () => {
    seedSharedCopy();
    render(<Account user={sam} />);
    await waitFor(() => expect(savedFor(sam).length).toBeGreaterThan(0));
    expect(savedFor(sam)[0].todos).toEqual([]);
    expect(savedFor(sam)[0].quick_links).toEqual([]);
    expect(screen.queryByText("Alex's essay")).toBeNull();
    expect(screen.queryByText("Alex's class")).toBeNull();
  });

  it("isn't mixed into an existing account either, which gets its cloud copy", async () => {
    seedSharedCopy();
    cloud.rows[sam.id] = { todos: [{ id: "s1", title: "Sam's lab report" }], courses: [{ id: "c-sam", name: "Sam's class" }], quick_links: [], planner: {}, canvas: {} };
    render(<Account user={sam} />);
    await screen.findByText("Sam's lab report");
    await screen.findByText("Synced");
    expect(screen.queryByText("Alex's essay")).toBeNull();
    expect(JSON.stringify(savedFor(sam))).not.toContain("a1");
  });

  it("is left where it is, not deleted", async () => {
    seedSharedCopy();
    render(<Account user={sam} />);
    await waitFor(() => expect(savedFor(sam).length).toBeGreaterThan(0));
    expect(JSON.parse(localStorage.getItem("todos"))).toEqual(alexRow.todos);
  });

  it("keeps the plain names when there are no accounts", () => {
    expect(accountDataKey("todos", { accountsEnabled: false, accountId: null })).toBe("todos");
    expect(accountDataKey("todos", { accountsEnabled: true, accountId: null })).toBeNull();
    expect(accountDataKey("todos", { accountsEnabled: true, accountId: "x" })).toBe("todos:x");
  });
});
