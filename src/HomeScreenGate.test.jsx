// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HomeScreenGate from "./HomeScreenGate";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_HOME_SCREEN = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

function onBrowser(userAgent) {
  Object.defineProperty(window.navigator, "userAgent", { value: userAgent, configurable: true });
}

afterEach(() => {
  cleanup();
  // Back to jsdom's own user agent, and no hash
  delete window.navigator.userAgent;
  window.history.replaceState({}, "", window.location.pathname);
});

const renderGate = () => render(<HomeScreenGate><p>The app</p></HomeScreenGate>);

describe("The Home Screen gate", () => {
  it("shows the app as usual away from an iPhone", () => {
    renderGate();
    expect(screen.getByText("The app").closest("[hidden]")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Add Todo to your Home Screen" })).toBeNull();
  });

  it("shows the app as usual when it's opened from the Home Screen", () => {
    onBrowser(IPHONE_HOME_SCREEN);
    renderGate();
    expect(screen.getByText("The app").closest("[hidden]")).toBeNull();
  });

  it("in Safari on an iPhone, shows how to add it to the Home Screen and keeps the app out of reach", () => {
    onBrowser(IPHONE_SAFARI);
    renderGate();
    expect(screen.getByRole("heading", { name: "Add Todo to your Home Screen" })).toBeTruthy();
    const steps = screen.getAllByRole("listitem").map((step) => step.textContent);
    expect(steps).toEqual([
      expect.stringContaining("Tap Share"),
      expect.stringContaining("Tap Add to Home Screen"),
      expect.stringContaining("Open Todo from your Home Screen"),
    ]);
    // Still running, so it keeps syncing, but nothing in it can be seen or used
    expect(screen.getByText("The app").closest("[hidden]")).toBeTruthy();
    expect(screen.queryByText("Your email is confirmed.")).toBeNull();
  });

  it("says so when the email link brought them here, and that they sign in from the Home Screen", () => {
    window.history.replaceState({}, "", "#access_token=x&type=signup");
    onBrowser(IPHONE_SAFARI);
    renderGate();
    expect(screen.getByText("Your email is confirmed.")).toBeTruthy();
    expect(screen.getByText("Then sign in there.")).toBeTruthy();
  });
});
