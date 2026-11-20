// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthScreen from "./AuthScreen";
import LoadingScreen from "./LoadingScreen";

const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signUp: vi.fn(), resend: vi.fn(), resetPasswordForEmail: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: { auth } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const fill = (email, password) => {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
};
const submit = (name) => fireEvent.click(screen.getByRole("button", { name }));

describe("Sign in", () => {
  it("has labeled fields that password managers understand, and can show the password", () => {
    render(<AuthScreen />);
    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(password.getAttribute("autocomplete")).toBe("current-password");
    expect(password.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("says what's missing before sending anything", () => {
    render(<AuthScreen />);
    submit("Sign in");
    expect(screen.getByText("Enter your email.")).toBeTruthy();
    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true");
    fill("sam@example", "secret1");
    expect(screen.getByText("Check the email address. It looks incomplete.")).toBeTruthy();
    expect(screen.queryByText("Enter your password.")).toBeNull();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("puts a wrong password plainly", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials", status: 400 } });
    render(<AuthScreen />);
    fill(" sam@example.com ", "secret1");
    submit("Sign in");
    expect((await screen.findByRole("alert")).textContent).toContain("That email and password don't match.");
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "sam@example.com", password: "secret1" });
  });

  it("offers to send the link again to an account that isn't confirmed yet", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed", status: 400 } });
    auth.resend.mockResolvedValue({ error: null });
    render(<AuthScreen />);
    fill("sam@example.com", "secret1");
    submit("Sign in");
    fireEvent.click(await screen.findByRole("button", { name: "Send the link again" }));
    expect(await screen.findByText("Check your email")).toBeTruthy();
    expect(auth.resend).toHaveBeenCalledWith(expect.objectContaining({ type: "signup", email: "sam@example.com" }));
  });
});

describe("Create account", () => {
  it("asks for a new password, then says where the link went", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    render(<AuthScreen />);
    fireEvent.click(screen.getByRole("radio", { name: "Create account" }));
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("new-password");
    fill("sam@example.com", "abc");
    submit("Create account");
    expect(screen.getByText("Use at least 6 characters.")).toBeTruthy();
    fill("sam@example.com", "abcdef");
    submit("Create account");
    expect(await screen.findByText("Check your email")).toBeTruthy();
    expect(screen.getByText("sam@example.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByLabelText("Email").value).toBe("sam@example.com");
  });

  it("points an address that already has an account to signing in", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    render(<AuthScreen />);
    fireEvent.click(screen.getByRole("radio", { name: "Create account" }));
    fill("sam@example.com", "abcdef");
    submit("Create account");
    expect((await screen.findByRole("alert")).textContent).toContain("There's already an account with this email.");
    fireEvent.click(screen.getByRole("button", { name: "Sign in instead" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Sign in" }).getAttribute("aria-checked")).toBe("true"));
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
  });
});

describe("Forgot password", () => {
  beforeEach(() => vi.stubEnv("VITE_PASSWORD_RESET", "on"));
  afterEach(() => vi.unstubAllEnvs());

  it("is hidden until an email provider is set up", () => {
    vi.stubEnv("VITE_PASSWORD_RESET", "");
    render(<AuthScreen />);
    expect(screen.queryByRole("button", { name: "Forgot password?" })).toBeNull();
  });

  it("sends a reset link to the address from sign in, and can send it again", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<AuthScreen />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sam@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeTruthy();
    expect(screen.getByLabelText("Email").value).toBe("sam@example.com");
    expect(screen.queryByLabelText("Password")).toBeNull();
    submit("Send reset link");
    expect(await screen.findByText("Check your email")).toBeTruthy();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("sam@example.com", expect.objectContaining({ redirectTo: expect.any(String) }));
    submit("Send it again");
    expect(await screen.findByText("Sent again. It can take a minute to arrive.")).toBeTruthy();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
  });

  it("checks the address first", () => {
    render(<AuthScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    submit("Send reset link");
    expect(screen.getByText("Enter your email.")).toBeTruthy();
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("goes back to sign in", () => {
    render(<AuthScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("isn't offered while creating an account", () => {
    render(<AuthScreen />);
    fireEvent.click(screen.getByRole("radio", { name: "Create account" }));
    expect(screen.queryByRole("button", { name: "Forgot password?" })).toBeNull();
  });
});

describe("Notice", () => {
  it("shows a line at the top of the card, such as after an expired link", () => {
    render(<AuthScreen notice="That link has expired or was already used." />);
    expect(screen.getByRole("status").textContent).toBe("That link has expired or was already used.");
  });
});

describe("Loading", () => {
  it("tells assistive tech it's loading, and keeps the spinner out of its way", () => {
    render(<LoadingScreen />);
    expect(screen.getByRole("status").textContent).toContain("Loading");
    expect(document.querySelector(".boot-spinner").getAttribute("aria-hidden")).toBe("true");
  });
});
