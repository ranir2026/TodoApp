// Password reset needs Supabase to send email to anyone who signs up, which takes a custom email
// provider (Authentication, Emails, SMTP Settings). Until one is set up, "Forgot password?" and
// everything that points to it stays hidden. Turn it on with VITE_PASSWORD_RESET=on in .env.local.
export function passwordResetEnabled() {
  return import.meta.env.VITE_PASSWORD_RESET === "on";
}
