// Fetches a validated feed link with the SSRF limits from the brief: no redirects, a short
// timeout, a size cap, and (where the runtime can resolve DNS) no private addresses.
import { FeedError } from "./canvasFeedErrors.js";
import { isPrivateAddress } from "./canvasFeedUrl.js";

export const FEED_TIMEOUT_MS = 10_000;
export const FEED_MAX_BYTES = 3 * 1024 * 1024;

async function assertPublicDns(hostname, resolveDns) {
  const addresses = [];
  for (const type of ["A", "AAAA"]) {
    try {
      addresses.push(...(await resolveDns(hostname, type)));
    } catch {
      // No records of this type (or lookup unsupported); fetch will fail on its own if neither resolves
    }
  }
  if (addresses.some((address) => isPrivateAddress(String(address)))) throw new FeedError("not_canvas_feed");
}

async function readCapped(response, maxBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new FeedError("too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function isAbort(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError";
}

// `feedUrl` must already have passed validateFeedUrl. Throws FeedError with a code only.
export async function fetchFeedText(feedUrl, { fetchImpl = fetch, resolveDns, timeoutMs = FEED_TIMEOUT_MS, maxBytes = FEED_MAX_BYTES } = {}) {
  if (resolveDns) await assertPublicDns(new URL(feedUrl).hostname, resolveDns);
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetchImpl(feedUrl, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1", "user-agent": "TodoApp-CanvasFeed/1.0" },
    });
  } catch (error) {
    throw new FeedError(isAbort(error) ? "timeout" : "fetch_failed");
  }

  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    await response.body?.cancel().catch(() => {});
    throw new FeedError("redirected");
  }
  // Canvas answers a feed code it doesn't recognize (reset, mistyped, or for a course gone
  // private) with 400 and an HTML page (get_feed_context in canvas-lms), so 400 means a dead link
  if ([400, 401, 403, 404, 410].includes(response.status)) {
    await response.body?.cancel().catch(() => {});
    throw new FeedError("feed_not_found");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new FeedError("upstream_error");
  }
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new FeedError("too_large");
  }
  try {
    return await readCapped(response, maxBytes);
  } catch (error) {
    if (error instanceof FeedError) throw error;
    throw new FeedError(isAbort(error) || signal.aborted ? "timeout" : "fetch_failed");
  }
}
