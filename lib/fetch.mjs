// HTTP(S) retrieval for --url.
//
// The pipeline itself is synchronous, but retrieval happens before it: the
// named URLs are fetched on the main thread with the platform's own fetch
// (await), streamed under a hard byte cap, and the recovered documents then
// enter the ordinary scan pipeline through lib/cli.mjs. Keeping the fetch on
// the main thread is deliberate: a worker thread would run the request under
// a different execution context than the process's own, and sandboxed
// environments allow the process's own sockets but not a worker's.
//
// Everything here is a Node builtin. Only the URL the user named is fetched;
// nothing is uploaded, no cookies or credentials are attached, and the
// User-Agent names this tool.

export const FETCH_CODES = {
  NOT_HTTP: 'only absolute http and https URLs are fetched',
  NETWORK: 'the request failed before a response arrived',
  TIMEOUT: 'the response did not arrive within the time limit',
  STATUS: 'the server returned an error status',
  CONTENT_TYPE: 'the response is not HTML or plain text',
  TOO_LARGE: 'the response body exceeds the size limit',
};

export class FetchError extends Error {
  constructor(message, { code, detail = {} } = {}) {
    super(message);
    this.name = 'FetchError';
    this.code = code;
    this.detail = detail;
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 8;
const USER_AGENT = 'un-editorial-check (editorial review CLI)';

/**
 * Fetch `url` and return { status, contentType, text }. Throws a FetchError
 * whose code is one of FETCH_CODES on every failure path.
 */
export async function fetchText(url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  userAgent = USER_AGENT,
} = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchError(`not an absolute URL: ${url}`, { code: 'NOT_HTTP' });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new FetchError(`unsupported scheme "${parsed.protocol}"`, { code: 'NOT_HTTP' });
  }

  // Redirects are followed manually and re-validated: "only the URL the user
  // named is fetched" would otherwise be silently untrue of a named URL that
  // 302s anywhere at all — the platform's own `follow` chases an unbounded
  // chain, to any scheme and any host, without a re-check. Each hop re-applies
  // the scheme check, and the chain is bounded.
  let response;
  let hopUrl = parsed;
  try {
    for (let hop = 0; ; hop += 1) {
      if (hop > MAX_REDIRECTS) {
        throw new FetchError(`more than ${MAX_REDIRECTS} redirects were followed`, { code: 'NETWORK' });
      }
      if (hopUrl.protocol !== 'https:' && hopUrl.protocol !== 'http:') {
        throw new FetchError(`unsupported scheme "${hopUrl.protocol}"`, { code: 'NOT_HTTP' });
      }
      // eslint-disable-next-line no-await-in-loop
      const hopResponse = await fetch(hopUrl.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': userAgent, accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
      });
      const location = hopResponse.status >= 300 && hopResponse.status < 400
        ? hopResponse.headers.get('location')
        : null;
      if (!location) {
        response = hopResponse;
        break;
      }
      try { hopResponse.body?.cancel(); } catch { /* a redirect body is irrelevant */ }
      hopUrl = new URL(location, hopUrl);
    }
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if (err && err.name === 'TimeoutError') {
      throw new FetchError('the response did not arrive within the time limit', { code: 'TIMEOUT' });
    }
    if (err instanceof TypeError && /Invalid URL/.test(err.message)) {
      throw new FetchError('a redirect location is not a valid URL', { code: 'NETWORK' });
    }
    throw new FetchError((err && err.cause && err.cause.message) || (err && err.message) || 'the request failed', { code: 'NETWORK' });
  }
  if (!response.ok) {
    throw new FetchError(`the server returned HTTP ${response.status}`, { code: 'STATUS', detail: { status: response.status } });
  }
  const contentType = (response.headers.get('content-type') || '').trim();
  if (!/^(text\/html|text\/plain|application\/xhtml\+xml)\b/i.test(contentType)) {
    throw new FetchError(`content type "${contentType || 'unknown'}" is not HTML or plain text`, { code: 'CONTENT_TYPE', detail: { status: response.status } });
  }

  let total = 0;
  const chunks = [];
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.length > maxBytes) {
        reader.cancel().catch(() => {});
        throw new FetchError(`the response body exceeds ${maxBytes} bytes`, { code: 'TOO_LARGE', detail: { status: response.status } });
      }
      chunks.push(value);
      total += value.length;
    }
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError((err && err.message) || 'the body could not be read', { code: 'NETWORK' });
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.includes('\u0000')) {
    throw new FetchError('the response body is not text', { code: 'CONTENT_TYPE', detail: { status: response.status } });
  }
  return { status: response.status, contentType, text };
}
