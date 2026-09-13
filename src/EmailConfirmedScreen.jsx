export default function EmailConfirmedScreen({ onContinue }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <section className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-500/10 text-success-600" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-6 w-6">
            <path d="m5 12 4 4L19 6" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">Email confirmed</h1>
        <p className="mt-2 text-sm text-slate-500">Your account is ready. Continue to open your synced todo list.</p>
        <button onClick={onContinue} className="mt-5 w-full rounded-lg bg-todo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-todo-600">
          Continue to Todo
        </button>
      </section>
    </main>
  );
}
