// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import LandingPreview from "./LandingPreview";

afterEach(cleanup);

const picture = (container) => container.querySelector(".landing-preview");

describe("The sign-in page's picture of the app", () => {
  it("starts on the list, with a task whose notes link to GitHub", () => {
    const { container } = render(<LandingPreview />);
    expect(screen.getByRole("radio", { name: "List" }).getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('[title="https://github.com/"]').textContent).toContain("GitHub");
  });

  it("switches between the views, and says in words what each one shows", () => {
    const { container } = render(<LandingPreview />);
    fireEvent.click(screen.getByRole("radio", { name: "Day plan" }));
    expect(picture(container).textContent).toContain("Lab 4: sorting");
    expect(screen.getByText("Give tasks a time and see your day hour by hour.")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Timeline" }));
    expect(picture(container).textContent).toContain("Draft due");

    fireEvent.click(screen.getByRole("radio", { name: "Calendar" }));
    // This week, Sunday first
    const sunday = new Date();
    sunday.setDate(sunday.getDate() - sunday.getDay());
    expect(picture(container).textContent).toContain(sunday.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    expect(picture(container).textContent).toContain("Study group");
    expect(screen.getByText("Your week at a glance, classes and repeats included.").closest("[aria-live]")).toBeTruthy();
  });

  it("is only a picture: nothing in it can be focused, and it's hidden from assistive tech", () => {
    const { container } = render(<LandingPreview />);
    expect(picture(container).hasAttribute("inert")).toBe(true);
    expect(picture(container).getAttribute("aria-hidden")).toBe("true");
  });
});
