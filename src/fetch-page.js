// Fetch an HTML page safely and with a hard size cap. Runtime-agnostic: pass any
// fetch implementation.

export const USER_AGENT = 'keyword-analyzer (+https://github.com/BeeRanked/keyword-analyzer)';

export function isSafeUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const h = url.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    return true;
  } catch { return false; }
}

const MAX_BYTES = 1_500_000;

export async function fetchHtml(url, opts = {}) {
  const doFetch = opts.fetch || globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 12000;
  if (typeof doFetch !== 'function') throw new Error('No fetch implementation available; pass opts.fetch on Node < 18.');

  let res;
  try {
    res = await doFetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new Error('That page took too long or refused the request; it may be slow or blocking automated visits.');
  }
  if (!res.ok) throw new Error(`That page returned HTTP ${res.status}, so there is nothing to read.`);
  if (!/text\/html/i.test(res.headers.get('content-type') || '')) throw new Error('That URL is not an HTML page.');

  const reader = res.body.getReader();
  const dec = new TextDecoder('utf-8', { fatal: false });
  let html = '';
  let total = 0;
  const start = Date.now();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      html += dec.decode(value, { stream: true });
      if (total >= MAX_BYTES || Date.now() - start > 8000) { try { await reader.cancel(); } catch {} break; }
    }
    html += dec.decode();
  } catch { /* tolerate read errors, analyze what we got */ }
  return html;
}
