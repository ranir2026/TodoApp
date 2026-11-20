// Whether the app was opened from its icon on the home screen, in a window of its own without the
// browser's address bar, rather than in a browser tab
export function isHomeScreenApp(win = window) {
  // Older iPhones only report it this way
  if (win.navigator?.standalone === true) return true;
  const shownAs = (mode) => Boolean(win.matchMedia?.(`(display-mode: ${mode})`).matches);
  return shownAs("standalone") || shownAs("fullscreen") || shownAs("minimal-ui");
}

// Every iPhone browser is built on Safari's engine, so the others are told apart by the name each one
// adds to the user agent. There's no feature to test instead: the question is which browser's menus
// to explain, not what the browser can do.
const OTHER_IPHONE_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|Ddg\/|YaBrowser|FBAN|FBAV|Instagram|Line\//;

// Safari itself on an iPhone. An iPad's Safari presents itself as a Mac's, so it never matches.
export function isIphoneSafari(userAgent) {
  return /\b(iPhone|iPod)\b/.test(userAgent) && /Version\/[\d.]+.*Safari\//.test(userAgent) && !OTHER_IPHONE_BROWSERS.test(userAgent);
}

// On an iPhone, Todo is used from the Home Screen, so a Safari tab shows how to put it there instead
export function needsHomeScreen(win = window) {
  return isIphoneSafari(win.navigator?.userAgent ?? "") && !isHomeScreenApp(win);
}
