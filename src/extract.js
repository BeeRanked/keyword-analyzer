// Extract the page's text per structural slot with a portable parser
// (node-html-parser). The body text is produced by a tree walk that mirrors how
// a browser flows inline vs block content, so phrases never run across card or
// list boundaries and hidden furniture (script, style, nav, footer, aside) is
// never counted.

import { parse } from 'node-html-parser';

// Elements whose content flows INSIDE a sentence. Everything else is a boundary:
// without this, "<span>July</span><span>Company news</span>" concatenates into
// "julycompany", and phrases run across card edges. span and a are deliberately
// boundaries, not inline; card and label markup uses them far more often than
// prose does mid-word.
const INLINE = new Set(['em', 'strong', 'b', 'i', 'code', 'small', 'sup', 'sub', 'mark', 'u', 'abbr', 'time', 's', 'q', 'cite', 'var', 'kbd']);
const EXCLUDE = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'object', 'form', 'nav', 'footer', 'aside']);

const NODE_TEXT = 3;
const NODE_ELEMENT = 1;

function tagOf(node) {
  return (node.rawTagName || node.tagName || '').toLowerCase();
}

// Recursive text flow: append raw text, insert a newline boundary around any
// non-inline element, and skip excluded subtrees entirely.
function flowText(node, sink) {
  for (const child of node.childNodes) {
    if (child.nodeType === NODE_TEXT) { sink.push(child.rawText || child.text || ''); continue; }
    if (child.nodeType !== NODE_ELEMENT) continue;
    const tag = tagOf(child);
    if (EXCLUDE.has(tag)) continue;
    const inline = INLINE.has(tag);
    if (!inline) sink.push('\n');
    flowText(child, sink);
    if (!inline) sink.push('\n');
  }
}

const textOf = (el) => (el ? (el.rawText != null ? el.rawText : el.text) : '') || '';

export function extractSlots(html) {
  const root = parse(html, {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: { script: false, style: false, noscript: false },
  });

  const title = textOf(root.querySelector('title')).trim();
  const lang = root.querySelector('html')?.getAttribute('lang') || '';

  let metaDesc = '';
  for (const el of root.querySelectorAll('meta')) {
    const k = (el.getAttribute('name') || el.getAttribute('property') || '').toLowerCase();
    const v = el.getAttribute('content');
    if (v && (k === 'description' || k === 'og:description') && !metaDesc) metaDesc = v;
  }
  let canonical = '';
  for (const el of root.querySelectorAll('link')) {
    if ((el.getAttribute('rel') || '').toLowerCase() === 'canonical') { canonical = el.getAttribute('href') || canonical; }
  }

  const h1s = root.querySelectorAll('h1').map((el) => textOf(el).trim()).filter(Boolean);
  const heads = root.querySelectorAll('h2, h3').map((el) => textOf(el).trim()).filter(Boolean);
  const alts = root.querySelectorAll('img').map((el) => (el.getAttribute('alt') || '').trim()).filter(Boolean);
  const anchors = root.querySelectorAll('a').map((el) => textOf(el).trim()).filter(Boolean);

  const bodyRoot = root.querySelector('body') || root;
  const sink = [];
  flowText(bodyRoot, sink);
  const bodyText = sink.join('');

  return { title, lang, metaDesc, canonical, h1s, heads, alts, anchors, bodyText };
}
