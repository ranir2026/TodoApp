import { useState } from "react";
import InfoDialog from "./InfoDialog";

function Section({ title, mobile, children }) {
  return (
    <section>
      <h3 className={`font-semibold text-slate-800 ${mobile ? "text-[15px]" : "text-sm"}`}>{title}</h3>
      <div className={`mt-1 space-y-2 leading-relaxed text-slate-600 ${mobile ? "text-[14px]" : "text-subhead"}`}>{children}</div>
    </section>
  );
}

// What the app keeps, why, who can see it, and how to remove it, ending with deleting the account.
// onDeleteAccount resolves to an error message, or null once the account is gone.
export default function PrivacyDialog({ open, mobile = false, email, canDelete, onDeleteAccount, onClose }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function close() {
    if (busy) return;
    setConfirming(false);
    setError(null);
    onClose();
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const message = await onDeleteAccount();
    setBusy(false);
    if (message) setError(message);
  }

  const danger = mobile
    ? "min-h-11 w-full rounded-full bg-danger-600 px-4 text-[15px] font-semibold text-white disabled:opacity-60"
    : "rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-danger-500 disabled:opacity-60";
  const quiet = mobile
    ? "min-h-11 w-full rounded-full bg-slate-100 px-4 text-[15px] font-semibold text-slate-700"
    : "rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100";

  return (
    <InfoDialog open={open} mobile={mobile} title="Privacy and your data" subtitle="What Todo keeps, why, and how to delete it." onClose={close} width="max-w-xl">
      <div className={mobile ? "space-y-5" : "space-y-5"}>
        <Section title="What's stored" mobile={mobile}>
          <p>Your email address, and your password in a form that can't be read back. Your tasks, events, categories, day plans, projects and quick links.</p>
          <p>If you connect Canvas: your feed link, which course goes to which category, and the assignments it brings in (their titles, due dates and links back to Canvas).</p>
        </Section>
        <Section title="Why" mobile={mobile}>
          <p>So your list is the same on every device you sign in on. This device also keeps a copy so the app opens quickly and keeps working offline.</p>
        </Section>
        <Section title="Who can see it" mobile={mobile}>
          <p>Only you. Each account's data is kept in its own row, and the database lets an account read and change only its own. The Canvas feed link is shown masked and is only ever sent to Todo's server to fetch your feed.</p>
        </Section>
        <Section title="Deleting it" mobile={mobile}>
          <p>Delete tasks, categories and projects one at a time anywhere in the app. A deleted project is kept in Recently deleted, at the bottom of the timeline, for 30 days so it can be restored, then it's gone; delete it there to remove it sooner. Disconnect Canvas from its settings, and choose whether its assignments go too.</p>
          {canDelete && <p>Or delete your account, which removes all of the above for good, on every device.</p>}
        </Section>

        {canDelete && (
          <div className={`rounded-xl border ${confirming ? "border-danger-500/30 bg-danger-500/5" : "border-slate-200"} ${mobile ? "p-4" : "p-3.5"}`}>
            {confirming ? (
              <>
                <p className={`font-semibold text-slate-900 ${mobile ? "text-[15px]" : "text-sm"}`}>Delete your account?</p>
                <p className={`mt-1 leading-relaxed text-slate-600 ${mobile ? "text-[14px]" : "text-subhead"}`}>
                  This deletes <span className="font-medium break-all text-slate-800">{email}</span> and everything in it, on every device. It can't be undone.
                </p>
                {error && <p role="alert" className={`mt-2 text-danger-600 ${mobile ? "text-[14px]" : "text-xs"}`}>{error}</p>}
                <div className={mobile ? "mt-4 grid gap-2" : "mt-3 flex justify-end gap-2"}>
                  <button type="button" onClick={() => { setConfirming(false); setError(null); }} disabled={busy} className={quiet}>Cancel</button>
                  <button type="button" onClick={remove} disabled={busy} className={danger}>{busy ? "Deleting…" : "Delete account"}</button>
                </div>
              </>
            ) : (
              <div className={mobile ? "" : "flex items-center justify-between gap-3"}>
                <div className="min-w-0">
                  <p className={`font-medium text-slate-800 ${mobile ? "text-[15px]" : "text-sm"}`}>Delete account</p>
                  <p className={`truncate text-slate-500 ${mobile ? "text-[13px]" : "text-xs"}`}>{email}</p>
                </div>
                <button type="button" onClick={() => setConfirming(true)} className={mobile ? "mt-3 min-h-11 w-full rounded-full bg-danger-500/10 text-[15px] font-semibold text-danger-600" : "shrink-0 rounded-lg border border-danger-500/30 px-3 py-1.5 text-xs font-medium text-danger-600 hover:bg-danger-500/5"}>
                  Delete account…
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </InfoDialog>
  );
}
