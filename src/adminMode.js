// Features still being tested (Canvas import) show only on the /admin copy of the page.
// This is a hidden page, not access control: anyone with the link can open it, and they
// still sign in and see only their own data.
export function isAdminPath(pathname) {
  return /\/admin\/?$/.test(pathname);
}

export const isAdminPage = typeof window !== "undefined" && isAdminPath(window.location.pathname);
