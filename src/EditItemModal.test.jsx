// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasActionsContext } from "./canvasStatus";
import EditItemModal from "./EditItemModal";

const COURSES = [{ id: "c1", name: "General", color: "#6366f1" }, { id: "phys", name: "Physics", color: "#f59e0b" }];
const PROJECTS = [{ id: "p1", name: "Lab report", courseId: "phys" }];
const TASK = { id: "t1", type: "task", title: "Problem set 7", courseId: "phys", dueDate: "2026-11-20", startTime: "23:59", priority: "normal", repeat: "none" };
// 2026-11-16 is a Monday
const WEEKLY = { id: "w1", type: "event", title: "Gym", courseId: "c1", dueDate: "2026-11-16", startTime: "07:00", endTime: "08:00", repeat: "weekly", repeatDays: [], occurrenceDate: "2026-11-23" };
const CANVAS_TASK = {
  ...TASK,
  id: "canvas:example.instructure.com:assignment-1",
  description: "Chapter 4",
  canvas: {
    domain: "example.instructure.com",
    url: "https://example.instructure.com/courses/1/assignments/1",
    synced: { title: "Problem set 7", description: "Chapter 4", courseId: "phys", dueDate: "2026-11-20", startTime: "23:59", endDate: null, endTime: null },
    dueMoved: { from: "2026-11-19T04:59:00Z", to: "2026-11-21T04:59:00Z", at: "2026-11-17T12:00:00Z" },
  },
};

function setViewport(mobile) {
  window.matchMedia = () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} });
}

function renderEditor(item, props = {}) {
  const handlers = { onSave: vi.fn(), onDelete: vi.fn(), onSkipOccurrence: vi.fn(), onClose: vi.fn() };
  const ui = (next, extra = {}) => (
    <CanvasActionsContext.Provider value={{ enabled: true, dismissDueMoved: vi.fn() }}>
      <EditItemModal item={next} courses={COURSES} projects={PROJECTS} milestones={[]} {...handlers} {...props} {...extra} />
    </CanvasActionsContext.Provider>
  );
  const result = render(ui(item));
  return { ...handlers, rerender: (next, extra) => result.rerender(ui(next, extra)) };
}

const escape = () => fireEvent.keyDown(window, { key: "Escape" });
const inert = (element) => Boolean(element.closest("[inert]"));

afterEach(() => {
  cleanup();
});

describe("Edit item (desktop)", () => {
  it("is a labeled dialog whose fields all have names, and Escape closes it when nothing changed", () => {
    setViewport(false);
    const { onClose } = renderEditor(TASK);
    expect(screen.getByRole("dialog", { name: "Edit task" })).toBeTruthy();
    for (const label of ["Title", "Notes", "Due date", "Due time", "Repeat", "Category", "Project"]) expect(screen.getByLabelText(label)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Title"));
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks before throwing away changes", () => {
    setViewport(false);
    const { onClose } = renderEditor(TASK);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Problem set 8" } });
    escape();
    expect(screen.getByText("Discard your changes?")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard your changes?")).toBeNull();
    expect(screen.getByLabelText("Title").value).toBe("Problem set 8");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("says why it won't save without a title", () => {
    setViewport(false);
    const { onSave } = renderEditor(TASK);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  " } });
    expect(screen.getByText("Add a title to save.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(true);
    fireEvent.submit(screen.getByLabelText("Title").closest("form"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps what's being typed when the app re-renders", () => {
    setViewport(false);
    const { rerender } = renderEditor(TASK);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Problem set 8" } });
    rerender(TASK, { courses: [...COURSES] });
    expect(screen.getByLabelText("Title").value).toBe("Problem set 8");
  });

  it("gives focus back to what opened it", () => {
    setViewport(false);
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { rerender } = renderEditor(TASK);
    expect(document.activeElement).not.toBe(opener);
    rerender(null);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("shows a task's end time only when it has one, and can add one", () => {
    setViewport(false);
    renderEditor(TASK);
    expect(inert(screen.getByLabelText("End time"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "End time" }));
    expect(inert(screen.getByLabelText("End time"))).toBe(false);
    expect(screen.getByLabelText("Start time")).toBeTruthy();
    cleanup();
    renderEditor({ ...TASK, startTime: "14:00", endTime: "16:00" });
    expect(screen.getByLabelText("End time").value).toBe("16:00");
    expect(inert(screen.getByLabelText("End time"))).toBe(false);
  });

  it("edits which days a weekly repeat falls on", () => {
    setViewport(false);
    const { onSave } = renderEditor(WEEKLY);
    // With no days saved, it repeats on its date's weekday
    expect(screen.getByRole("button", { name: "Monday" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Wednesday" }));
    // The last day can't be turned off
    fireEvent.click(screen.getByRole("button", { name: "Monday" }));
    fireEvent.click(screen.getByRole("button", { name: "Wednesday" }));
    expect(screen.getByRole("button", { name: "Wednesday" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Friday" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0][1].repeatDays).toEqual(["wed", "fri"]);
  });

  it("offers an optional end date for an event instead of an empty field", () => {
    setViewport(false);
    const { onSave } = renderEditor(WEEKLY);
    expect(screen.queryByLabelText("End date")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "End date" }));
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-11-17" } });
    expect(screen.getByLabelText("Start date")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove end date" }));
    expect(screen.queryByLabelText("End date")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0][1].endDate).toBeNull();
  });

  it("says that an event leaves its project, and saves it that way", () => {
    setViewport(false);
    const { onSave } = renderEditor({ ...TASK, projectId: "p1", milestoneId: "m1" });
    fireEvent.click(screen.getByRole("radio", { name: "Event" }));
    expect(screen.getByText(/Events aren't part of projects, so saving takes this out of “Lab report”/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0][1]).toMatchObject({ type: "event", projectId: null, milestoneId: null });
  });

  it("uses a switch for Urgent", () => {
    setViewport(false);
    const { onSave } = renderEditor(TASK);
    const urgent = screen.getByRole("switch", { name: /Urgent/ });
    expect(urgent.checked).toBe(false);
    fireEvent.click(urgent);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0][1].priority).toBe("urgent");
  });

  it("previews the row as the list will show it, and keeps the preview out of reach", () => {
    setViewport(false);
    renderEditor({ ...TASK, projectId: "p1" });
    const preview = document.querySelector(".edit-preview");
    expect(preview.hasAttribute("inert")).toBe(true);
    expect(within(preview).getByText("Problem set 7")).toBeTruthy();
    expect(within(preview).getByText("Physics")).toBeTruthy();
    expect(within(preview).getByText("▸ Lab report")).toBeTruthy();
    expect(within(preview).queryByText("Urgent")).toBeNull();
    // A preview isn't a list row: nothing in it deletes, and the list can't mistake it for the real one
    expect(preview.querySelector("[data-task-id]")).toBeNull();
    expect(within(preview).queryByLabelText(/Delete/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Problem set 8" } });
    fireEvent.click(screen.getByRole("switch", { name: /Urgent/ }));
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "c1" } });
    fireEvent.change(screen.getByLabelText("Repeat"), { target: { value: "weekly" } });
    expect(within(preview).getByText("Problem set 8")).toBeTruthy();
    expect(within(preview).getByText("Urgent")).toBeTruthy();
    expect(within(preview).getByText("General")).toBeTruthy();
    expect(within(preview).getByText("↻ weekly")).toBeTruthy();
  });

  it("keeps notes to one line at the end of the form", () => {
    setViewport(false);
    renderEditor(TASK);
    const notes = screen.getByLabelText("Notes");
    expect(notes.rows).toBe(1);
    const fields = [...document.querySelectorAll("input, select, textarea")];
    expect(fields.at(-1)).toBe(notes);
  });

  it("asks a repeating item whether to delete one date or every repeat", () => {
    setViewport(false);
    const { onDelete, onSkipOccurrence } = renderEditor(WEEKLY);
    expect(screen.getByText("Changes apply to every repeat")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete…" }));
    expect(screen.getByText(/Delete only Mon, Nov 23, or every repeat of “Gym”/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Only this one" }));
    expect(onSkipOccurrence).toHaveBeenCalledWith("w1", "2026-11-23");
    fireEvent.click(screen.getByRole("button", { name: "Every repeat" }));
    expect(onDelete).toHaveBeenCalledWith("w1");
    cleanup();
    const plain = renderEditor(TASK);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(plain.onDelete).toHaveBeenCalledWith("t1");
  });

  it("shows a Canvas task's link, what Canvas keeps up to date, and can put Canvas's version back", () => {
    setViewport(false);
    const { onSave } = renderEditor(CANVAS_TASK);
    const panel = screen.getByRole("region", { name: "From Canvas" });
    expect(within(panel).getByRole("link", { name: /Open in Canvas/ }).getAttribute("href")).toBe(CANVAS_TASK.canvas.url);
    expect(within(panel).getByText(/Canvas keeps the title, notes and due date up to date/)).toBeTruthy();
    expect(within(panel).getByText(/Canvas moved the due date from/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "PS 7" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-11-19" } });
    expect(within(panel).getByText("You've changed the title and due date, so Canvas won't update them.")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Use Canvas's version" }));
    expect(screen.getByLabelText("Title").value).toBe("Problem set 7");
    expect(screen.getByLabelText("Due date").value).toBe("2026-11-20");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0][1]).toMatchObject({ title: "Problem set 7", description: "Chapter 4", dueDate: "2026-11-20", startTime: "23:59", endTime: null });
  });
});

describe("Edit item (phone)", () => {
  it("is a sheet that keeps the keyboard down and asks before a tap outside throws changes away", () => {
    setViewport(true);
    const { onClose, onSave } = renderEditor(TASK);
    const sheet = screen.getByRole("dialog", { name: "Edit task" });
    expect(sheet.classList.contains("mobile-add-sheet")).toBe(true);
    expect(document.activeElement).not.toBe(screen.getByLabelText("Title"));
    expect(sheet.contains(document.activeElement)).toBe(true);

    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Bring the lab book" } });
    fireEvent.click(document.querySelector(".mobile-sheet-backdrop"));
    expect(screen.getByText("Discard your changes?")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0][1].description).toBe("Bring the lab book");
  });

  it("names what Delete removes", () => {
    setViewport(true);
    renderEditor(TASK);
    expect(screen.getByRole("button", { name: "Delete task" })).toBeTruthy();
    cleanup();
    renderEditor({ ...WEEKLY, occurrenceDate: null });
    expect(screen.getByRole("button", { name: "Delete all repeats" })).toBeTruthy();
  });
});
