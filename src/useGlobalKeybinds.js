import { useEffect } from "react";
import { normalizeCombo } from "./keybinds";

export function useGlobalKeybinds(keymap, actions, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function handler(e) {
      if (e.key === "Escape" && actions.escape) {
        actions.escape(e);
        return;
      }

      const tag = e.target.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable;
      const combo = normalizeCombo(e);

      if (isTyping && combo !== keymap.openPalette) return;

      for (const [action, actionCombo] of Object.entries(keymap)) {
        if (actionCombo && combo === actionCombo && actions[action]) {
          e.preventDefault();
          actions[action](e);
          return;
        }
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [keymap, actions, enabled]);
}
