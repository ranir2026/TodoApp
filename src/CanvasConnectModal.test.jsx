// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCanvasFeed } from "../supabase/functions/_shared/canvasFeedParse.js";
import { listFeedCourses } from "./canvasCourses";

const NOW = new Date("2026-11-17T17:00:00Z");
const FEED = "https://example.instructure.com/feeds/calendars/user_FAKEtoken0123456789abcdef.ics";
// jsdom gives import.meta.url an http: URL, so read the fixture by path (tests run from the repo root)
const items = parseCanvasFeed(readFileSync(join(process.cwd(), "src/__fixtures__/canvas/school-a.ics"), "utf8"));
const COURSES = [{ id: "c1", name: "General", color: "#6366f1" }, { id: "phys", name: "Physics", color: "#f59e0b" }];

const fetchCanvasFeed = vi.fn();
vi.mock("./supabase", () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock("./canvasClient", async (importOriginal) => ({ ...(await importOriginal()), fetchCanvasFeed: (...args) => fetchCanvasFeed(...args) }));
const { default: CanvasConnectModal } = await import("./CanvasConnectModal");

beforeAll(() => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fetchCanvasFeed.mockReset();
  fetchCanvasFeed.mockResolvedValue({ ok: true, url: FEED, domain: "example.instructure.com", items, fetchedAt: NOW.toISOString() });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function open(props = {}) {
  const handlers = { onClose: vi.fn(), onImport: vi.fn() };
  render(<CanvasConnectModal open canvas={{}} courses={COURSES} todos={[]} quickLinks={[]} {...handlers} {...props} />);
  return handlers;
}

function tokenVisible() {
  return document.body.textContent.includes("FAKEtoken") || [...document.querySelectorAll("input")].some((input) => input.value.includes("FAKEtoken"));
}

async function connect() {
  fireEvent.change(screen.getByLabelText("Canvas Calendar Feed link"), { target: { value: FEED } });
  await screen.findByText("example.instructure.com/feeds/calendars/••••••••.ics");
}

describe("Connect Canvas", () => {
  it("explains a bad link with a specific message", () => {
    open();
    const input = screen.getByLabelText("Canvas Calendar Feed link");
    fireEvent.change(input, { target: { value: "http://canvas.example.edu/feeds/calendars/user_abcdefghijkl.ics" } });
    fireEvent.blur(input);
    expect(screen.getByRole("alert").textContent).toMatch(/should start with https/);
    expect(fetchCanvasFeed).not.toHaveBeenCalled();
  });

  it("asks for nothing but the pasted link", () => {
    open();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    // It says where the link lives, step by step
    expect(screen.getAllByText("Calendar Feed", { selector: "strong" }).length).toBeGreaterThan(0);
    expect(screen.getByText(/ends in .ics/)).toBeTruthy();
    // With no school known yet there's nothing to link to; a known one gets a direct link
    expect(screen.queryByRole("link", { name: /Open your Canvas calendar/ })).toBeNull();
    cleanup();
    open({ quickLinks: [{ id: "q", label: "Canvas", url: "https://canvas.example.edu/courses" }] });
    expect(screen.getByRole("link", { name: /Open your Canvas calendar/ }).getAttribute("href")).toBe("https://canvas.example.edu/calendar");
  });

  it("fetches on paste, then shows the link masked", async () => {
    open();
    await connect();
    expect(fetchCanvasFeed).toHaveBeenCalledWith(FEED);
    expect(screen.getByText(/Found 17 assignments and 3 events in 8 courses/)).toBeTruthy();
    expect(tokenVisible()).toBe(false);
    expect(screen.getByText(/You'll still check things off yourself/)).toBeTruthy();
  });

  it("shows the server's error code as a message, without the link", async () => {
    fetchCanvasFeed.mockResolvedValue({ ok: false, code: "feed_not_found" });
    open();
    fireEvent.change(screen.getByLabelText("Canvas Calendar Feed link"), { target: { value: FEED } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/doesn't recognize this feed/);
    expect(document.body.textContent).not.toContain("FAKEtoken");
  });

  it("pre-selects Physics for PHYS1156, previews, and imports with no duplicate category", async () => {
    const { onImport, onClose } = open();
    await connect();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByLabelText("Category for PHYS 1156").value).toBe("phys");
    expect(screen.getByLabelText("Category for PHYS 1153").value).toBe("phys");
    // Two CHEM 1211 sections both suggest the same new category
    expect(screen.getAllByLabelText("Name for the new category for CHEM 1211").map((input) => input.value)).toEqual(["CHEM 1211", "CHEM 1211"]);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("assignments across 6 categories")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Include past-due assignments/));
    expect(screen.getByText("17")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Include past-due assignments/));

    fireEvent.click(screen.getByRole("button", { name: "Import 12" }));
    expect(onImport).toHaveBeenCalledTimes(1);
    const plan = onImport.mock.calls[0][0];
    expect(plan.addedIds).toHaveLength(12);
    expect(plan.courses.filter((course) => course.name === "Physics")).toHaveLength(1);
    expect(plan.courses.filter((course) => course.name === "CHEM 1211")).toHaveLength(1);
    expect(new Set(plan.courses.map((course) => course.name)).size).toBe(plan.courses.length);
    expect(plan.canvas.feeds[0]).toMatchObject({ url: FEED, domain: "example.instructure.com" });
    expect(onClose).toHaveBeenCalled();
  });

  it("imports nothing when closed partway through", async () => {
    const { onImport, onClose } = open();
    await connect();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(onImport).not.toHaveBeenCalled();
  });

  it("replaces a broken link without asking about matched courses again", async () => {
    const DOMAIN = "example.instructure.com";
    const courseMap = Object.fromEntries(listFeedCourses(items, DOMAIN, NOW, "America/New_York").map((row) => [row.key, "c1"]));
    const canvas = { feeds: [{ id: `feed:${DOMAIN}`, url: `https://${DOMAIN}/feeds/calendars/user_OLDtoken000000000000000.ics`, domain: DOMAIN, status: "feed_not_found" }], courseMap, dismissedIds: [] };
    const { onImport } = open({ canvas, replaceDomain: DOMAIN });
    expect(screen.getByRole("heading", { name: "Replace Canvas link" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open your Canvas calendar/ }).getAttribute("href")).toBe(`https://${DOMAIN}/calendar`);
    expect(screen.getByText(/Your imported tasks and course choices stay/)).toBeTruthy();

    await connect();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Review and import" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^(Import|Connect)/ }));
    const plan = onImport.mock.calls[0][0];
    expect(plan.canvas.feeds).toEqual([expect.objectContaining({ url: FEED, domain: DOMAIN, status: "ok" })]);
    expect(plan.canvas.courseMap).toEqual(courseMap);
    expect(plan.createdCategoryIds).toEqual([]);
  });

  it("says when a replacement link belongs to another school", async () => {
    const canvas = { feeds: [{ id: "feed:canvas.example.edu", url: "https://canvas.example.edu/feeds/calendars/user_OLDtoken000000000000000.ics", domain: "canvas.example.edu", status: "feed_not_found" }], courseMap: {} };
    open({ canvas, replaceDomain: "canvas.example.edu" });
    await connect();
    expect(screen.getByText(/This link is for example.instructure.com, so it will be added as another school/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Match your courses" })).toBeTruthy();
  });

  it("lets a course be skipped or renamed", async () => {
    const { onImport } = open();
    await connect();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Category for MATH 2010"), { target: { value: "__skip" } });
    fireEvent.change(screen.getByLabelText("Name for the new category for CS 2100"), { target: { value: "Data Structures" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: /^Import/ }));
    const plan = onImport.mock.calls[0][0];
    expect(plan.courses.some((course) => course.name === "Data Structures")).toBe(true);
    expect(plan.courses.some((course) => course.name === "MATH 2010")).toBe(false);
    expect(plan.todos.some((todo) => todo.canvas.courseId === "503")).toBe(false);
  });
});
