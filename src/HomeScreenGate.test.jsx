// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomeScreenGate from "./HomeScreenGate";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1";
const IPHONE_HOME_SCREEN = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

function onBrowser(userAgent, { standalone } = {}) {
  Object.defineProperty(window.navigator, "userAgent", { value: userAgent, configurable: true });
  if (standalone) Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
}

function withClipboard(writeText) {
  Object.defineProperty(window.navigator, "clipboard", { value: writeText && { writeText }, configurable: true });
}

afterEach(() => {
  cleanup();
  // Back to jsdom's own navigator and address
  delete window.navigator.userAgent;
  delete window.navigator.standalone;
  delete window.navigator.clipboard;
  window.history.replaceState({}, "", "/");
});

const renderGate = () => render(<HomeScreenGate><p>The app</p></HomeScreenGate>);
const appIsHidden = () => Boolean(screen.getByText("The app").closest("[hidden]"));

describe("The Home Screen gate", () => {
  it("shows the app as usual away from an iPhone", () => {
    renderGate();
    expect(appIsHidden()).toBe(false);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("shows the app as usual when it's opened from the Home Screen", () => {
    onBrowser(IPHONE_HOME_SCREEN, { standalone: true });
    renderGate();
    expect(appIsHidden()).toBe(false);
  });

  it("in Safari on an iPhone, shows how to add it to the Home Screen and keeps the app out of reach", () => {
    onBrowser(IPHONE_SAFARI);
    renderGate();
    expect(screen.getByRole("heading", { name: "Add Todo to your Home Screen" })).toBeTruthy();
    expect(screen.getByText(/works better outside Safari/)).toBeTruthy();
    const steps = screen.getAllByRole("listitem").map((step) => step.textContent);
    expect(steps).toEqual([
      expect.stringContaining("Tap Share"),
      expect.stringContaining("Tap Add to Home Screen"),
      expect.stringContaining("Open Todo from your Home Screen"),
    ]);
    // Still running, so it keeps syncing, but nothing in it can be seen or used
    expect(appIsHidden()).toBe(true);
    expect(screen.queryByText("Your email is confirmed.")).toBeNull();
  });

  it("says so when the email link brought them here, and that they sign in from the Home Screen", () => {
    window.history.replaceState({}, "", "#access_token=x&type=signup");
    onBrowser(IPHONE_SAFARI);
    renderGate();
    expect(screen.getByText("Your email is confirmed.")).toBeTruthy();
    expect(screen.getByText("Then sign in there.")).toBeTruthy();
  });

  describe("in another browser on an iPhone", () => {
    it("sends them to Safari, or to a computer, and keeps the app out of reach", () => {
      onBrowser(IPHONE_CHROME);
      renderGate();
      expect(screen.getByRole("heading", { name: "Open Todo in Safari" })).toBeTruthy();
      expect(screen.getByText(/on the web from a computer/)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Open in Safari" }).getAttribute("href")).toBe(`x-safari-http://${window.location.host}/`);
      expect(appIsHidden()).toBe(true);
    });

    it("never hands an email link's sign-in tokens to Safari or the clipboard", async () => {
      window.history.replaceState({}, "", "/TodoApp/#access_token=secret&type=signup");
      onBrowser(IPHONE_CHROME);
      const writeText = vi.fn().mockResolvedValue();
      withClipboard(writeText);
      renderGate();
      expect(screen.getByText("Your email is confirmed.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Open in Safari" }).getAttribute("href")).not.toContain("secret");
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
      expect(await screen.findByText("Now paste it into Safari.")).toBeTruthy();
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/TodoApp/`);
      expect(screen.getByRole("button", { name: "Link copied" })).toBeTruthy();
    });

    it("shows the link to copy by hand when the browser won't copy it", async () => {
      onBrowser(IPHONE_CHROME);
      withClipboard(undefined);
      renderGate();
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
      expect(await screen.findByText(/Copy this link into Safari/)).toBeTruthy();
      expect(screen.getByText(`${window.location.origin}/`)).toBeTruthy();
    });
  });
});
