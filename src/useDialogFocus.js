import { useEffect } from "react";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function focusables(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter((element) => !element.closest("[inert]") && element.getClientRects().length > 0);
}

// Keeps keyboard focus with an open dialog: moves it in when the dialog opens, wraps Tab and
// Shift+Tab at the ends, and hands it back to whatever had it before (usually the row that
// opened the dialog) when it closes. getContainer and getInitial are read when the dialog opens.
export default function useDialogFocus(open, getContainer, getInitial) {
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const target = getInitial?.() ?? getContainer();
    target?.focus({ preventScroll: true });

    function onKeyDown(event) {
      if (event.key !== "Tab") return;
      const container = getContainer();
      if (!container) return;
      const items = focusables(container);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!container.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    };
    // Read once per opening; the getters close over refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
