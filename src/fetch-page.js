// Fetch an HTML page safely and with a hard size cap. Runtime-agnostic: pass any
// fetch implementation.

export const USER_AGENT = 'keyword-analyzer (+https://github.com/BeeRanked/keyword-analyzer)';

export function isSafeUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const h = url.hostname.toLowerCase();
    // IPv6 literal (URL keeps the brackets). Block loopback (::1), unspecified
    // (::), link-local (fe80::/10), unique-local (fc00::/7) and any IPv4-mapped
    // address (::ffff:.../96), which can smuggle a private v4 in v6 clothing.
    if (h.startsWith('[')) {
      const v6 = h.slice(1, -1);
      if (v6 === '::1' || v6 === '::') return false;
      if (/^fe[89ab][0-9a-f]:/.test(v6)) return false;
      if (/^f[cd][0-9a-f][0-9a-f]:/.test(v6)) return false;
      if (/^::ffff:/i.test(v6)) return false;
      return true;
    }
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
    // Integer, hex and octal IPv4 are normalized to dotted-decimal by URL, so
    // these dotted-form checks catch every notation.
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
  if (!/text\/html|application\/xhtml\+xml/i.test(res.headers.get('content-type') || '')) throw new Error('That URL is not an HTML page.');
  if (!res.body) return '';

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
