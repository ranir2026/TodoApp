import { describe, expect, it } from "vitest";
import { isHomeScreenApp, isIphoneSafari, needsHomeScreen } from "./homeScreen";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
// Opened from the Home Screen, the same phone leaves Safari's name out
const IPHONE_HOME_SCREEN = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1";
const IPHONE_FIREFOX = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15";
const IPHONE_EDGE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/138.0.3351.83 Mobile/15E148 Safari/605.1.15";
const IPHONE_INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85";
const IPAD_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

// A stand-in for window: what the browser says about itself and which display modes match
function browser({ userAgent = IPHONE_SAFARI, standalone, modes = ["browser"], matchMedia = true } = {}) {
  return {
    navigator: { userAgent, standalone },
    matchMedia: matchMedia ? (query) => ({ matches: modes.some((mode) => query === `(display-mode: ${mode})`) }) : undefined,
  };
}

describe("isHomeScreenApp", () => {
  it("is false in a browser tab", () => {
    expect(isHomeScreenApp(browser())).toBe(false);
  });

  it("is true when the app has a window of its own", () => {
    expect(isHomeScreenApp(browser({ modes: ["standalone"] }))).toBe(true);
    expect(isHomeScreenApp(browser({ modes: ["fullscreen"] }))).toBe(true);
    expect(isHomeScreenApp(browser({ modes: ["minimal-ui"] }))).toBe(true);
  });

  it("is true on an older iPhone that only reports it through navigator.standalone", () => {
    expect(isHomeScreenApp(browser({ standalone: true, matchMedia: false }))).toBe(true);
  });

  it("is false in a browser that can't say", () => {
    expect(isHomeScreenApp(browser({ matchMedia: false }))).toBe(false);
  });
});

describe("isIphoneSafari", () => {
  it("knows Safari on an iPhone", () => {
    expect(isIphoneSafari(IPHONE_SAFARI)).toBe(true);
  });

  it("leaves out the other iPhone browsers and in-app browsers, which name themselves", () => {
    for (const userAgent of [IPHONE_CHROME, IPHONE_FIREFOX, IPHONE_EDGE, IPHONE_INSTAGRAM]) expect(isIphoneSafari(userAgent)).toBe(false);
  });

  it("leaves out iPads, Macs and Android", () => {
    for (const userAgent of [IPAD_SAFARI, ANDROID_CHROME, ""]) expect(isIphoneSafari(userAgent)).toBe(false);
  });
});

describe("needsHomeScreen", () => {
  it("is true only for a Safari tab on an iPhone", () => {
    expect(needsHomeScreen(browser())).toBe(true);
  });

  it("is false once the app is opened from the Home Screen", () => {
    expect(needsHomeScreen(browser({ userAgent: IPHONE_HOME_SCREEN, standalone: true, modes: ["standalone"] }))).toBe(false);
    // Even if the phone kept Safari's name in its user agent
    expect(needsHomeScreen(browser({ modes: ["standalone"] }))).toBe(false);
  });

  it("is false in other browsers and on other devices", () => {
    for (const userAgent of [IPHONE_CHROME, IPAD_SAFARI, ANDROID_CHROME]) expect(needsHomeScreen(browser({ userAgent }))).toBe(false);
  });
});
