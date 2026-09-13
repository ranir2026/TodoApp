import { useState } from "react";
import { supabase } from "./supabase";

export default function AuthScreen() {
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const result = mode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: import.meta.env.VITE_APP_URL || `${window.location.origin}/` },
        });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === "sign-up") setMessage("Check your email to confirm your account.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <section className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Todo sync</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to sync your tasks across devices.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-todo-500" />
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-todo-500" />
          <button disabled={busy} className="w-full rounded-lg bg-todo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-todo-600 disabled:opacity-50">
            {busy ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(""); }} className="mt-4 w-full text-xs font-medium text-course-600 hover:text-course-700">
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
        {message && <p className="mt-3 text-xs text-slate-500">{message}</p>}
      </section>
    </main>
  );
}
