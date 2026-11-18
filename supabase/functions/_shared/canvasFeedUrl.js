// Checks that a link is a Canvas calendar feed before anything fetches it. Shared by the
// canvas-feed Edge Function (the real gate) and the browser (instant feedback), so it has no
// dependencies. It returns error codes only and never echoes the link back.

// /feeds/calendars/user_<token>.ics (also course_ and group_ feeds)
const FEED_PATH = /^\/feeds\/calendars\/[a-z]+_[A-Za-z0-9_-]{10,}\.ics$/;
const HOST_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
// Names that only resolve inside a network, plus reserved ones (RFC 2606, 6761, 6762)
const PRIVATE_TLDS = new Set(["localhost", "local", "localdomain", "internal", "intranet", "lan", "home", "corp", "private", "test", "invalid", "arpa", "onion", "example"]);

export function isIpLiteral(hostname) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":") || hostname.startsWith("[");
}

export function isPublicHostname(hostname) {
  if (!hostname || hostname.length > 253 || isIpLiteral(hostname)) return false;
  const labels = hostname.split(".");
  if (labels.length < 2 || !labels.every((label) => HOST_LABEL.test(label))) return false;
  const tld = labels[labels.length - 1];
  return /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld) && !PRIVATE_TLDS.has(tld);
}

// Returns { ok: true, url, domain } with the link in canonical form, or { ok: false, code }.
export function validateFeedUrl(input) {
  if (typeof input !== "string") return { ok: false, code: "not_url" };
  let text = input.trim();
  if (!text || text.length > 2048 || /\s/.test(text)) return { ok: false, code: "not_url" };
  // Calendar apps show the same link as webcal://; a bare host/path is the link without its scheme
  text = text.replace(/^webcals?:\/\//i, "https://");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text) && /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(text)) text = `https://${text}`;

  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, code: "not_url" };
  }
  if (url.protocol !== "https:") return { ok: false, code: /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) && url.host ? "not_https" : "not_url" };
  if (url.username || url.password || url.port || url.search) return { ok: false, code: "not_canvas_feed" };

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!isPublicHostname(hostname)) return { ok: false, code: "not_canvas_feed" };
  if (!FEED_PATH.test(url.pathname)) return { ok: false, code: "not_canvas_feed" };
  return { ok: true, url: `https://${hostname}${url.pathname}`, domain: hostname };
}

// For display: the school and the fact that it's a feed, with the token hidden
export function maskFeedUrl(feedUrl) {
  try {
    const { hostname } = new URL(feedUrl);
    return `${hostname}/feeds/calendars/••••••••.ics`;
  } catch {
    return "Canvas calendar feed";
  }
}

function ipv4ToInt(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

const PRIVATE_V4 = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
].map(([base, bits]) => [ipv4ToInt(base), bits]);

function isPrivateIpv4(ip) {
  const value = ipv4ToInt(ip);
  if (value === null) return true;
  return PRIVATE_V4.some(([base, bits]) => (value >>> (32 - bits)) === (base >>> (32 - bits)));
}

// Expands an IPv6 address to its 8 groups, or null if it isn't one
function ipv6Groups(ip) {
  let text = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const v4 = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const value = ipv4ToInt(v4[1]);
    if (value === null) return null;
    text = `${text.slice(0, -v4[1].length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array(Math.max(fill, 0)).fill("0"), ...tail];
  if (groups.length !== 8 || !groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

// True for loopback, private, link-local, multicast and other non-public addresses, and for
// anything that doesn't parse (fail closed).
export function isPrivateAddress(ip) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return isPrivateIpv4(ip);
  const g = ipv6Groups(ip);
  if (!g) return true;
  const embeddedV4 = () => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPrivateIpv4(embeddedV4()); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPrivateIpv4(embeddedV4()); // NAT64
  if (g.slice(0, 7).every((x) => x === 0)) return true; // :: and ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  return false;
}
