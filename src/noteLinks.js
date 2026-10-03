const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

const KNOWN_SITES = {
  "docs.google.com": "Google Docs",
  "drive.google.com": "Drive",
  "calendar.google.com": "Calendar",
  "meet.google.com": "Meet",
  "mail.google.com": "Gmail",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "github.com": "GitHub",
  "notion.so": "Notion",
  "zoom.us": "Zoom",
  "canvas.northeastern.edu": "Canvas",
  "northeastern.instructure.com": "Canvas",
};

function siteLabel(host) {
  if (KNOWN_SITES[host]) return KNOWN_SITES[host];
  const match = Object.keys(KNOWN_SITES).find((site) => host.endsWith(`.${site}`));
  if (match) return KNOWN_SITES[match];
  // "news.ycombinator.com" -> "ycombinator", "en.wikipedia.org" -> "wikipedia"
  const parts = host.split(".");
  const name = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return name.length > 16 ? `${name.slice(0, 15)}…` : name;
}

// Finds URLs in a note and returns [{ href, label }] with short, unique labels
export function extractLinks(text) {
  if (!text) return [];
  const seen = new Set();
  const links = [];
  for (const raw of text.match(URL_PATTERN) ?? []) {
    const cleaned = raw.replace(/[.,;:!?)\]}]+$/, "");
    const href = cleaned.startsWith("www.") ? `https://${cleaned}` : cleaned;
    let url;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    links.push({ href: url.href, label: siteLabel(url.hostname.replace(/^www\./, "").toLowerCase()) });
  }
  const totals = {};
  for (const link of links) totals[link.label] = (totals[link.label] || 0) + 1;
  const counts = {};
  for (const link of links) {
    if (totals[link.label] > 1) {
      counts[link.label] = (counts[link.label] || 0) + 1;
      link.label = `${link.label} ${counts[link.label]}`;
    }
  }
  return links;
}
