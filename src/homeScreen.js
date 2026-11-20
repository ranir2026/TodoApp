// Whether the app was opened from its icon on the home screen, in a window of its own without the
// browser's address bar, rather than in a browser tab
export function isHomeScreenApp(win = window) {
  // Older iPhones only report it this way
  if (win.navigator?.standalone === true) return true;
  const shownAs = (mode) => Boolean(win.matchMedia?.(`(display-mode: ${mode})`).matches);
  return shownAs("standalone") || shownAs("fullscreen") || shownAs("minimal-ui");
}

// An iPad's browsers present themselves as a Mac's, so an iPad never matches
export function isIphone(userAgent) {
  return /\b(iPhone|iPod)\b/.test(userAgent);
}

// Every iPhone browser is built on Safari's engine, so the others are told apart by the name each one
// adds to the user agent. There's no feature to test instead: the question is which browser's menus
// to explain, not what the browser can do.
const OTHER_IPHONE_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|Ddg\/|YaBrowser|FBAN|FBAV|Instagram|Line\//;

// Safari itself on an iPhone, not another browser or an app's built-in one
export function isIphoneSafari(userAgent) {
  return isIphone(userAgent) && /Version\/[\d.]+.*Safari\//.test(userAgent) && !OTHER_IPHONE_BROWSERS.test(userAgent);
}

// On an iPhone, Todo is used from the Home Screen, so a browser tab shows something else in its place:
// in Safari, how to add it to the Home Screen ("add"); in any other browser, a way over to Safari,
// where that's done ("open-in-safari"). null everywhere else.
export function homeScreenPrompt(win = window) {
  const userAgent = win.navigator?.userAgent ?? "";
  if (!isIphone(userAgent) || isHomeScreenApp(win)) return null;
  return isIphoneSafari(userAgent) ? "add" : "open-in-safari";
}

// This page's address without the parts after ? and #: an email link puts sign-in tokens there,
// and they mustn't travel to another browser or the clipboard
export function pageLink(location = window.location) {
  return `${location.origin}${location.pathname}`;
}

// Opens this page in Safari from another iPhone browser (iOS 17 and later)
export function safariLink(location = window.location) {
  return `x-safari-${location.protocol.replace(/:$/, "")}://${location.host}${location.pathname}`;
}
