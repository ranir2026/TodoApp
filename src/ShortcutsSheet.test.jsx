// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShortcutsSheet from "./ShortcutsSheet";
import { DEFAULT_KEYMAP, shortcutClashes } from "./keybinds";

afterEach(cleanup);

function Sheet({ onClose = () => {}, initial = DEFAULT_KEYMAP }) {
  const [keymap, setKeymap] = useState(initial);
  return <ShortcutsSheet open keymap={keymap} setKeymap={setKeymap} onClose={onClose} />;
}

describe("ShortcutsSheet", () => {
  it("changes a key in place: click it, press the new one", () => {
    render(<Sheet />);
    fireEvent.click(screen.getByRole("button", { name: "Open quick add: N. Change" }));
    fireEvent.keyDown(screen.getByRole("button", { name: /Press the new key for Open quick add/ }), { key: "q" });
    expect(screen.getByRole("button", { name: "Open quick add: Q. Change" })).toBeTruthy();
    // Changed from the default, so it can go back
    fireEvent.click(screen.getByRole("button", { name: "Reset all to default" }));
    expect(screen.getByRole("button", { name: "Open quick add: N. Change" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset all to default" })).toBeNull();
  });

  it("keeps the key, and stays open, when Escape is pressed while changing it", () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Open quick add: N. Change" }));
    fireEvent.keyDown(screen.getByRole("button", { name: /Press the new key/ }), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open quick add: N. Change" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says when two shortcuts share a key", () => {
    render(<Sheet initial={{ ...DEFAULT_KEYMAP, quickLink: "n" }} />);
    expect(screen.getByText("Same key as Add quick link")).toBeTruthy();
    expect(screen.getByText("Same key as Open quick add")).toBeTruthy();
  });

  it("leaves the command palette off the sheet, though Ctrl+K still opens it", () => {
    render(<Sheet initial={{ ...DEFAULT_KEYMAP, openPalette: "ctrl+j" }} />);
    expect(screen.queryByText("Open command palette")).toBeNull();
    // Not under Other either, and a change to it alone doesn't offer a reset nobody could see the reason for
    expect(screen.queryByText("Other")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset all to default" })).toBeNull();
    expect(DEFAULT_KEYMAP.openPalette).toBe("ctrl+k");
  });

  it("has no separate settings shortcut any more", () => {
    render(<Sheet />);
    expect(screen.queryByText(/keybind settings/i)).toBeNull();
    expect("openSettings" in DEFAULT_KEYMAP).toBe(false);
  });
});

describe("shortcutClashes", () => {
  it("is empty for the defaults, and names the others on the same key", () => {
    expect(shortcutClashes(DEFAULT_KEYMAP)).toEqual({});
    expect(shortcutClashes({ ...DEFAULT_KEYMAP, toggleView: "n", toggleSort: "n" })).toEqual({
      quickAdd: ["toggleView", "toggleSort"],
      toggleView: ["quickAdd", "toggleSort"],
      toggleSort: ["quickAdd", "toggleView"],
    });
  });
});
