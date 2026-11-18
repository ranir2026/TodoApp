// The canvas-feed request handler, kept free of Deno APIs so it runs under Node tests too.
// POST { url } with a signed-in user's JWT -> { domain, items, fetchedAt } or { error: code }.
// The feed link arrives only in the request body and is never logged or echoed back.
import { FeedError, feedErrorStatus } from "./canvasFeedErrors.js";
import { fetchFeedText } from "./canvasFeedFetch.js";
import { parseCanvasFeed } from "./canvasFeedParse.js";
import { validateFeedUrl } from "./canvasFeedUrl.js";

export const DEFAULT_ALLOWED_ORIGINS = [
  "https://ranir2026.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
];

function corsHeaders(origin, allowedOrigins) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowedOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function fail(code, cors) {
  return json({ error: code }, feedErrorStatus(code), cors);
}

// Asks Supabase Auth who the token belongs to; null when it isn't a signed-in user
async function getUserId({ supabaseUrl, apiKey, token, fetchImpl }) {
  try {
    const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: apiKey, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const user = await response.json();
    return typeof user?.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}

// true / false from canvas_feed_allow(), run as the caller so auth.uid() is the caller.
// null when the database function is missing or unreachable: the caller fails closed.
async function allowRequest({ supabaseUrl, apiKey, token, fetchImpl }) {
  try {
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/canvas_feed_allow`, {
      method: "POST",
      headers: { apikey: apiKey, authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const allowed = await response.json();
    return typeof allowed === "boolean" ? allowed : null;
  } catch {
    return null;
  }
}

export function createCanvasFeedHandler({ env, fetchImpl = fetch, resolveDns, log = () => {} }) {
  const allowedOrigins = env("ALLOWED_ORIGINS")
    ? env("ALLOWED_ORIGINS").split(",").map((origin) => origin.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;

  return async function handleCanvasFeed(request) {
    const cors = corsHeaders(request.headers.get("origin"), allowedOrigins);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return fail("method_not_allowed", cors);

    const token = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return fail("unauthorized", cors);
    const supabaseUrl = env("SUPABASE_URL");
    // The app's own public key, which works whether the project uses legacy or new API keys.
    // It's only ever sent back to this project's Auth and REST endpoints, so a wrong one just fails.
    const apiKey = request.headers.get("apikey") || env("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !apiKey) return fail("not_configured", cors);
    const auth = { supabaseUrl, apiKey, token, fetchImpl };
    if (!(await getUserId(auth))) return fail("unauthorized", cors);

    let body;
    try {
      body = await request.json();
    } catch {
      return fail("bad_request", cors);
    }
    const check = validateFeedUrl(body?.url);
    if (!check.ok) return fail(check.code, cors);

    // Counted only for requests that would reach Canvas
    const allowed = await allowRequest(auth);
    if (allowed === null) return fail("not_configured", cors);
    if (!allowed) return fail("rate_limited", cors);

    try {
      const feedText = await fetchFeedText(check.url, { fetchImpl, resolveDns });
      const items = parseCanvasFeed(feedText);
      return json({ domain: check.domain, items, fetchedAt: new Date().toISOString() }, 200, cors);
    } catch (error) {
      const code = error instanceof FeedError ? error.code : "internal_error";
      log(`canvas-feed failed: ${code}`);
      return fail(code, cors);
    }
  };
}
