import { useEffect, useId, useRef, useState } from "react";
import BrandMark from "./BrandMark";
import { FIELD, MIN_PASSWORD, PRIMARY, SECONDARY, Spinner, describeError } from "./AuthScreen";
import { supabase } from "./supabase";

// Where a password reset link lands: the link has already signed the person in, so this only asks
// for the new password, then opens the app. The same card and wording as sign in.
export default function NewPasswordScreen({ email, onDone }) {
  const ids = useId();
  const id = (name) => `${ids}-${name}`;
  const fieldRef = useRef(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const problem = !attempted ? null : !password ? "Choose a password." : password.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : null;

  useEffect(() => {
    if (window.matchMedia?.("(min-width: 768px)").matches) fieldRef.current?.focus();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (!password || password.length < MIN_PASSWORD) {
      fieldRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(describeError(updateError));
    setSaved(true);
  }

  return (
    <main className="auth-screen grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="auth-rise flex items-center justify-center gap-3">
          <BrandMark size={44} />
          <span className="text-lg font-semibold tracking-tight text-slate-900">Todo</span>
        </div>
        <section className="auth-card auth-rise mt-8 rounded-dialog p-7" style={{ "--rise-delay": "80ms" }}>
          {saved ? (
            <div className="auth-swap text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success-500/10 text-success-600" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="auth-confirm-check h-7 w-7">
                  <path d="m5 12.5 4.5 4.5L19 7.5" pathLength="1" />
                </svg>
              </div>
              <h1 className="mt-5 text-xl font-semibold text-slate-900">Password changed</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">Use it the next time you sign in, on any device.</p>
              <button type="button" onClick={onDone} className={`${PRIMARY} mt-6`}>Open Todo</button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate aria-labelledby={id("heading")}>
              <h1 id={id("heading")} className="text-xl font-semibold text-slate-900">Choose a new password</h1>
              <p className="mt-1 text-sm break-words text-slate-500">{email ? <>For <span className="font-medium text-slate-700">{email}</span>.</> : "For your Todo account."}</p>
              {/* For password managers: which account this new password belongs to */}
              {email && <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />}
              <div className="mt-5">
                <label htmlFor={id("password")} className="mb-1.5 block text-[13px] font-medium text-slate-600">New password</label>
                <div className="relative">
                  <input
                    ref={fieldRef}
                    id={id("password")}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="done"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={Boolean(problem)}
                    aria-describedby={problem ? id("error") : id("hint")}
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
                {problem
                  ? <p id={id("error")} className="mt-1.5 text-[13px] text-danger-600">{problem}</p>
                  : <p id={id("hint")} className="mt-1.5 text-[13px] text-slate-400">At least {MIN_PASSWORD} characters.</p>}
              </div>
              {error && <p role="alert" className="mt-4 rounded-xl bg-danger-500/8 px-3.5 py-2.5 text-[13px] leading-snug text-danger-600">{error.text}</p>}
              <div className="mt-6 grid gap-1.5">
                <button type="submit" aria-disabled={busy || undefined} className={PRIMARY}>
                  {busy && <Spinner />}
                  {busy ? "Saving…" : "Save password"}
                </button>
                <button type="button" onClick={onDone} className={SECONDARY}>Not now</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
