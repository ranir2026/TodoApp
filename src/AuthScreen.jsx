import { useEffect, useId, useRef, useState } from "react";
import BrandMark from "./BrandMark";
import LandingPreview from "./LandingPreview";
import SegmentedControl from "./SegmentedControl";
import { supabase } from "./supabase";

const MODES = [{ id: "sign-in", label: "Sign in" }, { id: "sign-up", label: "Create account" }];
const MIN_PASSWORD = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const redirectTo = () => import.meta.env.VITE_APP_URL || `${window.location.origin}/`;

const FIELD = "field-tint block h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-base text-slate-900 outline-none placeholder:text-slate-400 aria-[invalid=true]:border-danger-500/60 md:h-11 md:text-sm";
// A visible ring for the keyboard only, in the app's tint
const FOCUS = "outline-none focus-visible:ring-4 focus-visible:ring-course-500/30";
const PRIMARY = `flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-course-500 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-course-600 aria-disabled:opacity-70 md:h-11 md:text-sm ${FOCUS}`;
const SECONDARY = `flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-medium text-slate-600 transition-colors hover:bg-slate-100 md:h-11 md:text-sm ${FOCUS}`;

// What Supabase said, put plainly, with the next step when there is one
function describeError(error) {
  const message = error?.message ?? "";
  if (error?.status === 429 || /rate limit|too many/i.test(message)) return { text: "Too many tries for now. Wait a minute, then try again." };
  if (/invalid login credentials/i.test(message)) return { text: "That email and password don't match." };
  if (/email not confirmed/i.test(message)) return { text: "Confirm your email first. The link is in the email we sent when you signed up.", action: "resend" };
  if (/already registered|already exists/i.test(message)) return { text: "There's already an account with this email.", action: "sign-in" };
  if (error?.name === "AuthRetryableFetchError" || /failed to fetch|network/i.test(message)) return { text: "Can't reach the server. Check your connection and try again." };
  return { text: message || "Something went wrong. Try again." };
}

function fieldErrors(mode, email, password) {
  const errors = {};
  if (!email.trim()) errors.email = "Enter your email.";
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = "Check the email address. It looks incomplete.";
  if (!password) errors.password = mode === "sign-up" ? "Choose a password." : "Enter your password.";
  else if (mode === "sign-up" && password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  return errors;
}

function Spinner() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="auth-spinner h-4 w-4">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
      <path d="M17.5 10A7.5 7.5 0 0 0 10 2.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-7 w-7">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7.5 8 5.5 8-5.5" />
    </svg>
  );
}

export default function AuthScreen() {
  const ids = useId();
  const id = (name) => `${ids}-${name}`;
  const emailRef = useRef(null);
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Field messages wait for the first try, then follow along as the fields are fixed
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // The address a sign-up link went to; the card then says to check it
  const [sentTo, setSentTo] = useState(null);
  const [resent, setResent] = useState(false);

  const signingUp = mode === "sign-up";
  const errors = attempted ? fieldErrors(mode, email, password) : {};

  // A desktop starts in the email field; a phone waits for a tap rather than covering the screen with a keyboard
  useEffect(() => {
    if (window.matchMedia?.("(min-width: 768px)").matches) emailRef.current?.focus();
  }, []);

  function switchMode(next) {
    setMode(next);
    setError(null);
    setAttempted(false);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    const problems = fieldErrors(mode, email, password);
    if (Object.keys(problems).length) {
      document.getElementById(id(problems.email ? "email" : "password"))?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const address = email.trim();
    const result = signingUp
      ? await supabase.auth.signUp({ email: address, password, options: { emailRedirectTo: redirectTo() } })
      : await supabase.auth.signInWithPassword({ email: address, password });
    setBusy(false);
    if (result.error) return setError(describeError(result.error));
    // Supabase answers a sign-up for an address that already has an account with a user that has no identities
    if (signingUp && result.data?.user?.identities?.length === 0) return setError(describeError({ message: "already registered" }));
    // Without email confirmation the session arrives and the app takes over; otherwise, say where the link went
    if (signingUp && !result.data?.session) {
      setSentTo(address);
      setResent(false);
    }
  }

  async function resend(address) {
    if (busy) return;
    setBusy(true);
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email: address, options: { emailRedirectTo: redirectTo() } });
    setBusy(false);
    if (resendError) return setError(describeError(resendError));
    setError(null);
    if (sentTo) setResent(true);
    else setSentTo(address);
  }

  function errorAction() {
    if (error?.action === "sign-in") return <button type="button" onClick={() => switchMode("sign-in")} className="font-semibold underline underline-offset-2">Sign in instead</button>;
    if (error?.action === "resend") return <button type="button" onClick={() => resend(email.trim())} className="font-semibold underline underline-offset-2">Send the link again</button>;
    return null;
  }

  const errorBox = error && (
    <p role="alert" className="rounded-xl bg-danger-500/8 px-3.5 py-2.5 text-[13px] leading-snug text-danger-600">
      {error.text} {errorAction()}
    </p>
  );

  const form = (
    <>
      <SegmentedControl label="Sign in or create an account" options={MODES} value={mode} onChange={switchMode} className="grid w-full" segmentClassName="px-2 py-1.5 text-[13px] normal-case!" />
      <div key={mode} className="auth-swap mt-6">
        <h2 id={id("heading")} className="text-xl font-semibold text-slate-900">{signingUp ? "Create your account" : "Welcome back"}</h2>
        <p className="mt-1 text-sm text-slate-500">{signingUp ? "Your tasks stay in sync on every device you use." : "Sign in to pick up where you left off."}</p>
      </div>
      <form onSubmit={submit} noValidate aria-labelledby={id("heading")} className="mt-5 space-y-4">
        <div>
          <label htmlFor={id("email")} className="mb-1.5 block text-[13px] font-medium text-slate-600">Email</label>
          <input
            ref={emailRef}
            id={id("email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? id("email-error") : undefined}
            className={FIELD}
          />
          {errors.email && <p id={id("email-error")} className="mt-1.5 text-[13px] text-danger-600">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor={id("password")} className="mb-1.5 block text-[13px] font-medium text-slate-600">Password</label>
          <div className="relative">
            <input
              id={id("password")}
              type={showPassword ? "text" : "password"}
              autoComplete={signingUp ? "new-password" : "current-password"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? id("password-error") : signingUp ? id("password-hint") : undefined}
              className={`${FIELD} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-1 right-1 rounded-lg px-3 text-[13px] font-semibold text-course-600 transition-colors hover:bg-course-50"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {errors.password
            ? <p id={id("password-error")} className="mt-1.5 text-[13px] text-danger-600">{errors.password}</p>
            : signingUp && <p id={id("password-hint")} className="mt-1.5 text-[13px] text-slate-400">At least {MIN_PASSWORD} characters.</p>}
        </div>
        {errorBox}
        <button type="submit" aria-disabled={busy || undefined} className={`${PRIMARY} mt-2`}>
          {busy && <Spinner />}
          {busy ? (signingUp ? "Creating account…" : "Signing in…") : signingUp ? "Create account" : "Sign in"}
        </button>
      </form>
    </>
  );

  const checkEmail = (
    <div className="auth-swap text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-course-50 text-course-600"><MailIcon /></div>
      <h2 className="mt-5 text-xl font-semibold text-slate-900">Check your email</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        We sent a link to <span className="font-medium break-all text-slate-800">{sentTo}</span>. Open it to finish creating your account.
      </p>
      <p className="mt-3 text-[13px] text-slate-400" aria-live="polite">
        {resent ? "Sent again. It can take a minute to arrive." : "Not there? Look in spam or promotions."}
      </p>
      {error && <div className="mt-4 text-left">{errorBox}</div>}
      <div className="mt-6 grid gap-1.5">
        <button type="button" onClick={() => resend(sentTo)} aria-disabled={busy || undefined} className={PRIMARY}>
          {busy && <Spinner />}
          Send it again
        </button>
        <button type="button" onClick={() => { setSentTo(null); setError(null); setPassword(""); }} className={SECONDARY}>Use a different email</button>
      </div>
    </div>
  );

  return (
    <main className="auth-screen min-h-dvh">
      {/* Anchored a little above center rather than centered, so a message appearing in the card
          grows it downward instead of moving everything */}
      <div className="mx-auto grid w-full max-w-5xl items-start gap-10 px-4 pt-[max(3rem,9vh)] pb-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-16 lg:px-10 lg:pt-[max(4rem,13vh)]">
        <section className="auth-rise text-center lg:text-left">
          <div className="flex items-center justify-center gap-3 lg:justify-start">
            <BrandMark size={44} />
            <span className="text-lg font-semibold tracking-tight text-slate-900">Todo</span>
          </div>
          <h1 className="mx-auto mt-6 max-w-md text-[1.75rem] leading-tight font-bold tracking-[-0.025em] text-balance text-slate-900 lg:mx-0 lg:mt-10 lg:text-5xl lg:leading-[1.05]">
            Every deadline, in one calm list.
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-pretty text-slate-500 lg:mx-0 lg:mt-5 lg:max-w-md lg:text-base">
            Tasks, day plans, timelines and a calendar, with your Canvas assignments brought in for you. Synced on every device.
          </p>
          <LandingPreview className="auth-rise mt-10 hidden max-w-md lg:block" style={{ "--rise-delay": "160ms" }} />
        </section>

        <section className="auth-card auth-rise mx-auto w-full max-w-sm rounded-dialog p-6 sm:p-7 lg:mx-0 lg:mt-[5.25rem] lg:justify-self-end" style={{ "--rise-delay": "80ms" }}>
          {sentTo ? checkEmail : form}
        </section>
      </div>
    </main>
  );
}
