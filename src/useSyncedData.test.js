import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the Supabase client: records upserted rows and rejects columns the
// pretend project doesn't have, with the error PostgREST gives for an unknown column.
const state = vi.hoisted(() => ({ saved: [], missing: new Set() }));
vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "token" } } }),
      refreshSession: async () => ({ error: null }),
    },
    from: () => ({
      upsert: async (row) => {
        const unknown = Object.keys(row).find((column) => state.missing.has(column));
        if (unknown) return { error: { code: "PGRST204", message: `Could not find the '${unknown}' column of 'app_state' in the schema cache` } };
        state.saved.push(row);
        return { error: null };
      },
    }),
  },
}));

const { OPTIONAL_COLUMNS, hasCanvasData, saveToCloud } = await import("./useSyncedData");

const data = {
  todos: [{ id: "t1", title: "Essay" }],
  courses: [{ id: "c1", name: "General" }],
  quickLinks: [{ id: "q1", label: "Docs", url: "https://example.com" }],
  planner: { projects: [] },
  canvas: { feeds: [{ id: "f1", domain: "example.instructure.com" }], courseMap: {}, dismissedIds: [] },
};
const allColumns = () => ({ current: Object.fromEntries(OPTIONAL_COLUMNS.map((column) => [column, true])) });

beforeEach(() => {
  state.saved = [];
  state.missing = new Set();
});

describe("saveToCloud with the canvas column", () => {
  it("saves canvas settings when the project has the column", async () => {
    const ok = await saveToCloud("u1", data, allColumns(), () => {});
    expect(ok).toBe(true);
    expect(state.saved.at(-1).canvas).toEqual(data.canvas);
  });

  it("keeps syncing everything else on a project without the canvas column", async () => {
    state.missing = new Set(["canvas"]);
    const columns = allColumns();
    const ok = await saveToCloud("u1", data, columns, () => {});
    expect(ok).toBe(true);
    const row = state.saved.at(-1);
    expect(row).not.toHaveProperty("canvas");
    expect(row.todos).toEqual(data.todos);
    expect(row.courses).toEqual(data.courses);
    expect(row.quick_links).toEqual(data.quickLinks);
    expect(row.planner).toEqual(data.planner);
    // Later saves skip the column without another failed round trip
    expect(columns.current.canvas).toBe(false);
  });

  it("still saves todos on a project missing both planner and canvas", async () => {
    state.missing = new Set(["planner", "canvas"]);
    const ok = await saveToCloud("u1", data, allColumns(), () => {});
    expect(ok).toBe(true);
    expect(state.saved.at(-1).todos).toEqual(data.todos);
  });

  it("never writes an empty {}, so a device that hasn't loaded settings can't wipe them", async () => {
    await saveToCloud("u1", { ...data, canvas: {} }, allColumns(), () => {});
    expect(state.saved.at(-1)).not.toHaveProperty("canvas");
    await saveToCloud("u1", { ...data, canvas: undefined }, allColumns(), () => {});
    expect(state.saved.at(-1)).not.toHaveProperty("canvas");
  });
});

describe("hasCanvasData", () => {
  it("treats {} and non-objects as never connected", () => {
    expect(hasCanvasData({})).toBe(false);
    expect(hasCanvasData(null)).toBe(false);
    expect(hasCanvasData([])).toBe(false);
    expect(hasCanvasData({ feeds: [] })).toBe(true);
  });
});
