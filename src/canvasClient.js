// Browser side of the canvas-feed function. The feed link goes only to that function, in the
// request body; errors come back as codes, and nothing here logs or shows the link.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { validateFeedUrl } from "../supabase/functions/_shared/canvasFeedUrl.js";

export const FEED_ERROR_MESSAGES = {
  not_url: "That doesn't look like a link. Copy the whole Calendar Feed link from Canvas.",
  not_https: "The link should start with https://. Copy it again from Canvas's Calendar Feed.",
  not_canvas_feed: "That isn't a Canvas calendar feed. The link ends in .ics and contains /feeds/calendars/.",
  feed_not_found: "Canvas doesn't recognize this feed. It may have been reset; copy the Calendar Feed link again.",
  redirected: "Canvas sent this link somewhere else. Copy the Calendar Feed link again from Canvas.",
  timeout: "Canvas took too long to answer. Try again in a minute.",
  too_large: "This feed is bigger than the app can import.",
  unparseable: "Canvas sent something that isn't a calendar. Check that you copied the Calendar Feed link.",
  upstream_error: "Canvas had a problem sending the feed. Try again in a few minutes.",
  fetch_failed: "Couldn't reach that Canvas site. Check the link and your connection.",
  rate_limited: "Too many tries in a short time. Wait a few minutes, then try again.",
  unauthorized: "Your session ran out. Sign in again, then retry.",
  not_configured: "Canvas import isn't set up on the server yet.",
  function_unavailable: "Couldn't reach the app's server. Try again in a moment.",
  offline: "You're offline. Connect to the internet and try again.",
  internal_error: "Something went wrong reading the feed. Try again.",
  bad_request: "Something went wrong reading the feed. Try again.",
};

export function feedErrorMessage(code) {
  return FEED_ERROR_MESSAGES[code] ?? FEED_ERROR_MESSAGES.internal_error;
}

// { ok: true, url, domain, items, fetchedAt } or { ok: false, code }
export async function fetchCanvasFeed(input) {
  const check = validateFeedUrl(input);
  if (!check.ok) return check;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, code: "offline" };
  if (!supabase) return { ok: false, code: "not_configured" };

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { ok: false, code: "unauthorized" };

  const { data, error } = await supabase.functions.invoke("canvas-feed", {
    body: { url: check.url },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context?.json?.().catch(() => null);
      return { ok: false, code: typeof body?.error === "string" ? body.error : "function_unavailable" };
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return { ok: false, code: "function_unavailable" };
    return { ok: false, code: "internal_error" };
  }
  if (!data || !Array.isArray(data.items) || typeof data.domain !== "string") return { ok: false, code: "internal_error" };
  return { ok: true, url: check.url, domain: data.domain, items: data.items, fetchedAt: data.fetchedAt };
}
