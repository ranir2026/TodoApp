const FALLBACK_COLOR = "#94a3b8";

function normalizeColor(color) {
  if (!color) return FALLBACK_COLOR;
  if (/^#[\da-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split("").map((part) => part + part).join("")}`;
  }
  return /^#[\da-f]{6}$/i.test(color) ? color : FALLBACK_COLOR;
}

export function getCourseColor(course) {
  return normalizeColor(course?.color);
}

export function courseChipStyle(course, completed = false) {
  if (completed) return undefined;
  const color = getCourseColor(course);
  return { backgroundColor: `${color}1f`, color };
}

export function courseAccentStyle(course) {
  return { borderLeftColor: getCourseColor(course) };
}
