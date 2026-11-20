// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NewPasswordScreen from "./NewPasswordScreen";

const auth = vi.hoisted(() => ({ updateUser: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: { auth } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const typePassword = (value) => fireEvent.change(screen.getByLabelText("New password"), { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save password" }));

describe("NewPasswordScreen", () => {
  it("says which account it's for, and fills the username for password managers", () => {
    const { container } = render(<NewPasswordScreen email="sam@example.com" onDone={() => {}} />);
    expect(screen.getByText("sam@example.com")).toBeTruthy();
    expect(container.querySelector("input[autocomplete=username]").value).toBe("sam@example.com");
    expect(screen.getByLabelText("New password").getAttribute("autocomplete")).toBe("new-password");
  });

  it("checks the length before sending anything", () => {
    render(<NewPasswordScreen email="sam@example.com" onDone={() => {}} />);
    save();
    expect(screen.getByText("Choose a password.")).toBeTruthy();
    typePassword("abc");
    expect(screen.getByText("Use at least 6 characters.")).toBeTruthy();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("saves the new password, then opens the app", async () => {
    auth.updateUser.mockResolvedValue({ error: null });
    const onDone = vi.fn();
    render(<NewPasswordScreen email="sam@example.com" onDone={onDone} />);
    typePassword("a-better-password");
    save();
    expect(await screen.findByText("Password changed")).toBeTruthy();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "a-better-password" });
    fireEvent.click(screen.getByRole("button", { name: "Open Todo" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("explains an expired link", async () => {
    auth.updateUser.mockResolvedValue({ error: { message: "Auth session missing!", status: 400 } });
    render(<NewPasswordScreen email="sam@example.com" onDone={() => {}} />);
    typePassword("a-better-password");
    save();
    expect((await screen.findByRole("alert")).textContent).toContain("This link has expired");
  });

  it("can be put off", () => {
    const onDone = vi.fn();
    render(<NewPasswordScreen email="sam@example.com" onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDone).toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
