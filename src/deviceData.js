// What this device keeps of an account's data (tasks, categories, quick links, the planner): its own
// copy for each account, so one account's data can never show up in, or be saved to, another one
// signed in on the same device. Without Supabase there are no accounts and the one copy keeps the
// plain name. Signed out, there is no key: nothing is read and nothing is kept.
//
// Earlier versions kept a single copy under the plain names for whoever was signed in. Nothing can
// say whose it is (a confirmation link, for one, opens the app already signed in to a brand-new
// account), so it's given to no account and left where it is. Nothing is lost: each account's
// cloud copy loads on sign-in, and those versions replaced the device copy with it on every load.
export function accountDataKey(name, { accountsEnabled, accountId }) {
  if (!accountsEnabled) return name;
  return accountId ? `${name}:${accountId}` : null;
}
