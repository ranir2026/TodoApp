// Error codes the canvas-feed function returns. Responses and logs carry only these codes,
// never the feed link, which is a secret.
export const FEED_ERROR_STATUS = {
  bad_request: 400,
  not_url: 400,
  not_https: 400,
  not_canvas_feed: 400,
  unauthorized: 401,
  method_not_allowed: 405,
  feed_not_found: 422,
  redirected: 422,
  unparseable: 422,
  too_large: 422,
  rate_limited: 429,
  internal_error: 500,
  not_configured: 503,
  upstream_error: 502,
  fetch_failed: 502,
  timeout: 504,
};

export class FeedError extends Error {
  constructor(code) {
    super(code);
    this.name = "FeedError";
    this.code = code;
  }
}

export function feedErrorStatus(code) {
  return FEED_ERROR_STATUS[code] ?? 500;
}
