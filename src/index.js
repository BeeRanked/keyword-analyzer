import { fetchHtml, isSafeUrl } from './fetch-page.js';
import { extractSlots } from './extract.js';
import { analyzeSlots } from './analyze.js';

/**
 * Analyze a live page: fetch, extract per-slot text, report terms and placements.
 * @param {string} input a page URL or bare host.
 * @param {object} [opts] { fetch, timeoutMs }
 */
export async function analyzeUrl(input, opts = {}) {
  let url = String(input || '').trim();
  if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
  if (!isSafeUrl(url)) throw new Error('Enter a valid public page URL.');
  const html = await fetchHtml(url, opts);
  return analyzeSlots(extractSlots(html), url);
}

/** Analyze an HTML string you already have, without any network. */
export function analyzeHtml(html, url = 'https://example.com/') {
  return analyzeSlots(extractSlots(String(html)), url);
}

export { extractSlots } from './extract.js';
export { analyzeSlots } from './analyze.js';
export { isSafeUrl, USER_AGENT } from './fetch-page.js';
export * from './text.js';
