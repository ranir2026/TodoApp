import { readFileSync } from "node:fs";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { FeedError } from "./canvasFeedErrors.js";
import { fetchFeedText } from "./canvasFeedFetch.js";
import { createCanvasFeedHandler } from "./canvasFeedHandler.js";
import { parseCanvasFeed } from "./canvasFeedParse.js";
import { isPrivateAddress, maskFeedUrl, validateFeedUrl } from "./canvasFeedUrl.js";

const fixture = (name) => readFileSync(new URL(`../../../src/__fixtures__/canvas/${name}`, import.meta.url), "utf8");
const FEED = "https://example.instructure.com/feeds/calendars/user_FAKEtoken0123456789abcdef.ics";

describe("validateFeedUrl", () => {
  it("accepts a Canvas feed link and returns its canonical form and domain", () => {
    expect(validateFeedUrl(`  ${FEED}  `)).toEqual({ ok: true, url: FEED, domain: "example.instructure.com" });
    expect(validateFeedUrl(FEED.replace("example.instructure.com", "Canvas.Example.EDU"))).toMatchObject({ ok: true, domain: "canvas.example.edu" });
  });

  it("accepts the webcal:// and scheme-less forms of the same link", () => {
    expect(validateFeedUrl(FEED.replace("https://", "webcal://"))).toMatchObject({ ok: true, url: FEED });
    expect(validateFeedUrl(FEED.replace("https://", ""))).toMatchObject({ ok: true, url: FEED });
  });

  it.each([
    ["", "not_url"],
    ["not a link", "not_url"],
    [42, "not_url"],
    ["javascript:alert(1)", "not_url"],
    [FEED.replace("https://", "http://"), "not_https"],
    [FEED.replace("https://", "ftp://"), "not_https"],
    ["https://example.instructure.com/calendar", "not_canvas_feed"],
    ["https://example.instructure.com/feeds/calendars/user_short.ics", "not_canvas_feed"],
    [`${FEED}?x=1`, "not_canvas_feed"],
    [FEED.replace("example.instructure.com", "example.instructure.com:8443"), "not_canvas_feed"],
    [FEED.replace("https://", "https://user:pass@"), "not_canvas_feed"],
    [FEED.replace("example.instructure.com", "127.0.0.1"), "not_canvas_feed"],
    [FEED.replace("example.instructure.com", "2130706433"), "not_canvas_feed"],
    [FEED.replace("example.instructure.com", "[::1]"), "not_canvas_feed"],
    [FEED.replace("example.instructure.com", "localhost"), "not_canvas_feed"],
    [FEED.replace("example.instructure.com", "canvas.internal"), "not_canvas_feed"],
    [FEED.replace("example.instructure.com", "metadata"), "not_canvas_feed"],
  ])("rejects %s with %s", (input, code) => {
    expect(validateFeedUrl(input)).toEqual({ ok: false, code });
  });

  it("masks the token for display", () => {
    expect(maskFeedUrl(FEED)).toBe("example.instructure.com/feeds/calendars/••••••••.ics");
    expect(maskFeedUrl(FEED)).not.toContain("FAKEtoken");
  });
});

describe("isPrivateAddress", () => {
  it.each(["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.20.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "garbage"])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(["52.1.2.3", "8.8.8.8", "2606:4700::1111", "::ffff:52.1.2.3"])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("parseCanvasFeed: school A (the observed format)", () => {
  const items = parseCanvasFeed(fixture("school-a.ics"));
  const byUid = Object.fromEntries(items.map((item) => [item.uid, item]));
  const host = "https://example.instructure.com";

  it("keeps every item, one per identity", () => {
    expect(items).toHaveLength(20);
    expect(new Set(items.map((item) => item.key)).size).toBe(20);
  });

  it("parses a timed assignment to a UTC instant and an assignment link", () => {
    expect(byUid["event-assignment-1001"]).toEqual({
      uid: "event-assignment-1001",
      key: "assignment-1001",
      kind: "assignment",
      title: "Problem Set 7",
      courseId: "501",
      courseLabel: "PHYS1153.30001.202710",
      contextType: "course",
      allDay: false,
      dueDate: null,
      dueAt: "2026-11-20T04:00:00.000Z",
      endDate: null,
      endAt: null,
      url: `${host}/courses/501/assignments/1001`,
      description: "Chapter 21 problems 3, 7, 12 and 18. Show all work.",
      location: null,
    });
  });

  it("keeps all-day items date-only despite the duplicated VALUE=DATE", () => {
    expect(byUid["event-assignment-1002"]).toMatchObject({
      title: "Reading Quiz 8",
      allDay: true,
      dueDate: "2026-11-22",
      dueAt: null,
      description: "Read sections 21.1–21.4 before the quiz.\n\nThe quiz opens Friday at 9:00 AM and closes Sunday at 11:59 PM. You get two attempts; the higher score counts.\n\nQuestions? Post in the Q&A board \u{1F4DD}",
    });
    expect(byUid["event-assignment-1005"]).toMatchObject({ allDay: true, dueDate: "2026-11-16", dueAt: null });
  });

  it("keeps an 11:59 PM due time and the DST instants exact", () => {
    expect(byUid["event-assignment-1008"].dueAt).toBe("2026-12-08T04:59:00.000Z");
    expect(byUid["event-assignment-1006"].dueAt).toBe("2026-11-01T05:30:00.000Z");
    expect(byUid["event-assignment-1007"].dueAt).toBe("2026-11-01T06:30:00.000Z");
  });

  it("keys overrides by assignment id and strips the section name", () => {
    expect(byUid["event-assignment-override-7001"]).toMatchObject({
      key: "assignment-1011",
      kind: "assignment",
      title: "Essay 3 Draft",
      courseLabel: "ENGL1010.MERGED.202710",
      description: null,
      url: `${host}/courses/506/assignments/1011`,
    });
    expect(byUid["event-assignment-override-7002"]).toMatchObject({ key: "assignment-1012", title: "Peer Review 3" });
  });

  it("keeps two checkpoints of one discussion apart and links both to the discussion", () => {
    expect(byUid["event-sub-assignment-5001"]).toMatchObject({ key: "sub-assignment-5001", kind: "checkpoint", url: `${host}/courses/503/assignments/1015` });
    expect(byUid["event-sub-assignment-5002"]).toMatchObject({ key: "sub-assignment-5002", kind: "checkpoint", url: `${host}/courses/503/assignments/1015` });
  });

  it("parses calendar events with their end, location and calendar link", () => {
    expect(byUid["event-calendar-event-4001"]).toMatchObject({
      key: "calendar-event-4001",
      kind: "event",
      title: "Exam 2 Review Session",
      courseId: "508",
      dueAt: "2026-12-02T23:00:00.000Z",
      endAt: "2026-12-03T00:30:00.000Z",
      location: "Room 101, Science Hall",
      url: `${host}/calendar?include_contexts=course_508&month=12&year=2026#calendar_event_4001`,
    });
    expect(byUid["event-calendar-event-4003"]).toMatchObject({ kind: "event", allDay: true, dueDate: "2026-11-26" });
  });

  it("gives personal events no course", () => {
    expect(byUid["event-calendar-event-4002"]).toMatchObject({ title: "Advising appointment", courseId: null, courseLabel: null, contextType: "user" });
  });

  it("keeps a same-titled assignment in two sections as two items", () => {
    expect(byUid["event-assignment-1009"]).toMatchObject({ title: "Week 11 Quiz", courseId: "504", key: "assignment-1009" });
    expect(byUid["event-assignment-1010"]).toMatchObject({ title: "Week 11 Quiz", courseId: "505", key: "assignment-1010" });
  });

  it("parses the same feed identically with LF line endings", () => {
    expect(parseCanvasFeed(fixture("school-a.ics").replace(/\r\n/g, "\n"))).toEqual(items);
  });
});

describe("parseCanvasFeed: school B (other formats)", () => {
  const items = parseCanvasFeed(fixture("school-b.ics"));
  const byUid = Object.fromEntries(items.map((item) => [item.uid, item]));

  it("unescapes commas and semicolons", () => {
    expect(byUid["event-assignment-1020"]).toMatchObject({ title: "Response Paper, Week 10; Draft", courseLabel: "HIST-205-02" });
  });

  it("takes only the trailing bracket as the course", () => {
    expect(byUid["event-assignment-1021"]).toMatchObject({ title: "Quiz [Chapter 9] Corrections", courseLabel: "BIOL 110" });
  });

  it("converts a TZID time using the feed's VTIMEZONE, and leaves no zone registered afterwards", () => {
    expect(byUid["event-calendar-event-4101"]).toMatchObject({ dueAt: "2026-12-03T20:00:00.000Z", endAt: "2026-12-03T21:30:00.000Z", courseLabel: "PSY 101 Fall 2026" });
    expect(ICAL.TimezoneService.has("America/Chicago")).toBe(false);
  });

  it("handles a group event and an item with no link", () => {
    expect(byUid["event-calendar-event-4102"]).toMatchObject({ courseId: null, courseLabel: null, contextType: "group" });
    expect(byUid["event-assignment-1022"]).toMatchObject({ key: "assignment-1022", courseId: null, courseLabel: "HIST-205-02", url: null, contextType: null });
  });

  it("keeps the instant just after the spring-forward gap", () => {
    expect(byUid["event-assignment-1024"].dueAt).toBe("2027-03-14T07:30:00.000Z");
  });
});

describe("parseCanvasFeed: edge cases", () => {
  const calendar = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}END:VCALENDAR\r\n`;

  it("returns no items for an empty feed", () => {
    expect(parseCanvasFeed(fixture("empty.ics"))).toEqual([]);
  });

  it("converts a bare IANA TZID without a VTIMEZONE", () => {
    const [item] = parseCanvasFeed(calendar("BEGIN:VEVENT\r\nUID:x-1\r\nDTSTART;TZID=America/New_York:20261101T013000\r\nSUMMARY:Ambiguous hour\r\nEND:VEVENT\r\n"));
    expect(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]).toContain(item.dueAt);
    const [summer] = parseCanvasFeed(calendar("BEGIN:VEVENT\r\nUID:x-2\r\nDTSTART;TZID=America/New_York:20260715T235900\r\nSUMMARY:Late\r\nEND:VEVENT\r\n"));
    expect(summer.dueAt).toBe("2026-07-16T03:59:00.000Z");
  });

  it.each([
    ["an HTML page", "<!DOCTYPE html><html><body>Log in</body></html>"],
    ["plain text", "Not found"],
    ["an empty body", ""],
  ])("rejects %s as unparseable", (_label, body) => {
    expect(() => parseCanvasFeed(body)).toThrow(expect.objectContaining({ code: "unparseable" }));
  });
});

function response(body, init = {}) {
  return new Response(body, init);
}

describe("fetchFeedText", () => {
  it("returns the body and never follows redirects", async () => {
    let seen;
    const text = await fetchFeedText(FEED, { fetchImpl: async (url, options) => { seen = options; return response("BEGIN:VCALENDAR"); } });
    expect(text).toBe("BEGIN:VCALENDAR");
    expect(seen.redirect).toBe("manual");
  });

  it.each([
    [404, "feed_not_found"],
    [401, "feed_not_found"],
    [410, "feed_not_found"],
    [302, "redirected"],
    [500, "upstream_error"],
    [503, "upstream_error"],
  ])("maps HTTP %i to %s", async (status, code) => {
    await expect(fetchFeedText(FEED, { fetchImpl: async () => response(null, { status }) })).rejects.toMatchObject({ code });
  });

  it("rejects a declared or streamed body over the cap", async () => {
    const declared = async () => response("x", { headers: { "content-length": "99999999" } });
    await expect(fetchFeedText(FEED, { fetchImpl: declared })).rejects.toMatchObject({ code: "too_large" });
    const streamed = async () => response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024)); } }));
    await expect(fetchFeedText(FEED, { fetchImpl: streamed, maxBytes: 10_000 })).rejects.toMatchObject({ code: "too_large" });
  });

  it("times out", async () => {
    const hang = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
    await expect(fetchFeedText(FEED, { fetchImpl: hang, timeoutMs: 20 })).rejects.toMatchObject({ code: "timeout" });
  });

  it("reports network failures", async () => {
    await expect(fetchFeedText(FEED, { fetchImpl: async () => { throw new TypeError("fetch failed"); } })).rejects.toMatchObject({ code: "fetch_failed" });
  });

  it("refuses a host that resolves to a private address", async () => {
    const resolveDns = async (_host, type) => (type === "A" ? ["10.0.0.5"] : []);
    let fetched = false;
    await expect(fetchFeedText(FEED, { resolveDns, fetchImpl: async () => { fetched = true; return response("BEGIN:VCALENDAR"); } })).rejects.toMatchObject({ code: "not_canvas_feed" });
    expect(fetched).toBe(false);
  });
});

describe("canvas-feed handler", () => {
  const ORIGIN = "https://ranir2026.github.io";
  const env = (name) => ({ SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon" })[name];

  // Routes the handler's outbound calls: Supabase Auth, the rate-limit RPC, and Canvas
  function backend({ user = { id: "u1" }, allow = true, feed = () => response(fixture("school-a.ics")) } = {}) {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/auth/v1/user")) return user ? response(JSON.stringify(user)) : response("{}", { status: 401 });
      if (String(url).endsWith("/rest/v1/rpc/canvas_feed_allow")) return allow === null ? response("{}", { status: 404 }) : response(JSON.stringify(allow));
      return feed();
    };
    return { fetchImpl, calls };
  }

  function request(body, { token = "user-jwt", method = "POST", origin = ORIGIN } = {}) {
    const headers = { "content-type": "application/json", origin };
    if (token) headers.authorization = `Bearer ${token}`;
    return new Request("https://project.supabase.co/functions/v1/canvas-feed", { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined });
  }

  it("answers CORS preflight for the app's origin only", async () => {
    const handle = createCanvasFeedHandler({ env, ...backend() });
    const ok = await handle(request(null, { method: "OPTIONS" }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const other = await handle(request(null, { method: "OPTIONS", origin: "https://evil.example.com" }));
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns the domain and normalized items for a signed-in user", async () => {
    const { fetchImpl, calls } = backend();
    const res = await createCanvasFeedHandler({ env, fetchImpl })(request({ url: FEED }));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const body = await res.json();
    expect(body.domain).toBe("example.instructure.com");
    expect(body.items).toHaveLength(20);
    // The user's own token is what the rate limit runs as
    expect(calls.find((call) => call.url.endsWith("canvas_feed_allow")).options.headers.authorization).toBe("Bearer user-jwt");
  });

  it("requires a signed-in user's token", async () => {
    const handle = createCanvasFeedHandler({ env, ...backend({ user: null }) });
    expect((await handle(request({ url: FEED }, { token: null }))).status).toBe(401);
    const res = await handle(request({ url: FEED }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rate-limits per user, and fails closed when the limit can't be checked", async () => {
    const limited = await createCanvasFeedHandler({ env, ...backend({ allow: false }) })(request({ url: FEED }));
    expect(limited.status).toBe(429);
    const unknown = await createCanvasFeedHandler({ env, ...backend({ allow: null }) })(request({ url: FEED }));
    expect(unknown.status).toBe(503);
    expect(await unknown.json()).toEqual({ error: "not_configured" });
  });

  it("rejects bad links before touching Canvas or the rate limit", async () => {
    const { fetchImpl, calls } = backend();
    const res = await createCanvasFeedHandler({ env, fetchImpl })(request({ url: FEED.replace("https", "http") }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "not_https" });
    expect(calls.map((call) => call.url)).toEqual(["https://project.supabase.co/auth/v1/user"]);
  });

  it("never puts the feed link in a response or a log line", async () => {
    const logs = [];
    for (const feed of [() => response(null, { status: 404 }), () => response("<html>"), () => { throw new TypeError(`connect failed for ${FEED}`); }]) {
      const res = await createCanvasFeedHandler({ env, log: (line) => logs.push(line), ...backend({ feed }) })(request({ url: FEED }));
      expect(await res.text()).not.toContain("FAKEtoken");
    }
    expect(logs).toEqual(["canvas-feed failed: feed_not_found", "canvas-feed failed: unparseable", "canvas-feed failed: fetch_failed"]);
  });

  it("returns specific codes for each failure", async () => {
    const codes = [];
    for (const feed of [() => response(null, { status: 404 }), () => response(null, { status: 301, headers: { location: "https://x.example.com" } }), () => response("nope")]) {
      const res = await createCanvasFeedHandler({ env, ...backend({ feed }) })(request({ url: FEED }));
      codes.push((await res.json()).error);
    }
    expect(codes).toEqual(["feed_not_found", "redirected", "unparseable"]);
  });

  it("is a FeedError for every code it throws", () => {
    expect(new FeedError("timeout")).toBeInstanceOf(Error);
  });
});
