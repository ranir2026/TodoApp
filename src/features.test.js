import { describe, expect, it } from "vitest";
import { featureGuide } from "./features";
import { ACTION_LABELS, DEFAULT_KEYMAP, comboKeys, comboLabel } from "./keybinds";
import { SHORTCUT_GROUPS, shortcutGroups } from "./ShortcutsSheet";

const titles = (groups) => groups.map((group) => group.title);
const itemIds = (groups) => groups.flatMap((group) => group.items.map((item) => item.id));

describe("featureGuide", () => {
  it("lists only what this account can use", () => {
    expect(titles(featureGuide({ desktop: true, canvas: true }))).toEqual(["Basics", "Planning", "Canvas", "Shortcuts"]);
    expect(titles(featureGuide({ desktop: true, canvas: false }))).toEqual(["Basics", "Planning", "Shortcuts"]);
  });

  it("leaves out what a phone doesn't have, and shortcuts with it", () => {
    const phone = featureGuide({ desktop: false, canvas: true });
    expect(titles(phone)).toEqual(["Basics", "Planning", "Canvas"]);
    expect(itemIds(phone)).not.toContain("dayPlanner");
    expect(itemIds(phone)).toContain("swipe");
    expect(phone.flatMap((group) => group.items).every((item) => item.keys === undefined)).toBe(true);
  });

  it("says where each one is on this device", () => {
    const find = (groups, id) => groups.flatMap((group) => group.items).find((item) => item.id === id);
    expect(find(featureGuide({ desktop: true }), "categories").where).toBe("Categories, on the left");
    expect(find(featureGuide({ desktop: false }), "categories").where).toBe("Profile, Categories");
  });

  it("names real shortcuts", () => {
    const keys = featureGuide({ desktop: true, canvas: true }).flatMap((group) => group.items).map((item) => item.keys).filter(Boolean);
    for (const action of keys) expect(DEFAULT_KEYMAP).toHaveProperty(action);
  });
});

describe("comboKeys", () => {
  it("splits a combo into keycaps", () => {
    expect(comboKeys("ctrl+k")).toEqual(["Ctrl", "K"]);
    expect(comboKeys("shift+p")).toEqual(["Shift", "P"]);
    expect(comboKeys("arrowleft")).toEqual(["←"]);
    expect(comboKeys("")).toEqual([]);
  });

  it("drops Shift in front of a key that's typed with Shift anyway", () => {
    expect(comboKeys("shift+?")).toEqual(["?"]);
    expect(comboLabel("shift+?")).toBe("?");
  });

  it("handles + as the key itself", () => {
    expect(comboKeys("ctrl++")).toEqual(["Ctrl", "+"]);
  });

  it("keeps the old label format", () => {
    expect(comboLabel("ctrl+shift+k")).toBe("Ctrl + Shift + K");
    expect(comboLabel(null)).toBe("Unset");
  });
});

describe("shortcutGroups", () => {
  it("lists every shortcut exactly once", () => {
    const listed = shortcutGroups().flatMap((group) => group.actions);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(Object.keys(ACTION_LABELS).sort());
  });

  it("only names actions that exist", () => {
    for (const action of SHORTCUT_GROUPS.flatMap((group) => group.actions)) expect(ACTION_LABELS).toHaveProperty(action);
  });
});
