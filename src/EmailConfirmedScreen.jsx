import BrandMark from "./BrandMark";

export default function EmailConfirmedScreen({ onContinue }) {
  return (
    <main className="auth-screen grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="auth-rise flex items-center justify-center gap-3">
          <BrandMark size={44} />
          <span className="text-lg font-semibold tracking-tight text-slate-900">Todo</span>
        </div>
        <section className="auth-card auth-rise mt-8 rounded-dialog p-7 text-center" style={{ "--rise-delay": "80ms" }}>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success-500/10 text-success-600" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="auth-confirm-check h-7 w-7">
              <path d="m5 12.5 4.5 4.5L19 7.5" pathLength="1" />
            </svg>
          </div>
          <h1 className="mt-5 text-xl font-semibold text-slate-900">Email confirmed</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">Your account is ready. Your tasks will stay in sync on every device you sign in on.</p>
          <button type="button" onClick={onContinue} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-course-500 text-[15px] font-semibold text-white shadow-sm transition-colors outline-none hover:bg-course-600 focus-visible:ring-4 focus-visible:ring-course-500/30 md:h-11 md:text-sm">
            Open Todo
          </button>
        </section>
      </div>
    </main>
  );
}
