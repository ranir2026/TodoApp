// Shown when signing out couldn't save the latest changes first. Staying signed in is the default;
// signing out anyway says plainly what it costs.
export default function SignOutNotice({ onRetry, onSignOutAnyway, className = "" }) {
  return (
    <div role="alert" className={`rounded-xl bg-danger-500/8 px-3 py-2.5 leading-snug text-danger-600 ${className}`}>
      <p className="font-medium">Your latest changes haven't saved yet, so you're still signed in.</p>
      <p className="mt-1">Check your connection and try again. If you sign out anyway, those changes will be lost.</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <button type="button" onClick={onRetry} className="rounded font-semibold underline-offset-2 hover:underline">Try again</button>
        <button type="button" onClick={onSignOutAnyway} className="rounded font-medium underline-offset-2 hover:underline">Sign out anyway</button>
      </div>
    </div>
  );
}
