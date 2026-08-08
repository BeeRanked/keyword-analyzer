// Turn extracted slots into the report: the terms and phrases a page emphasises
// and where each one appears, with counts and placements only. The tool does not
// know what a page means or judge its quality.

import {
  decodeHtml, tokenize, stopwordsFor, buildFoldMap, countTerms,
  rank, dedupeContained, slotsFor, SLOTS, WORD_PATTERN,
} from './text.js';

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export function analyzeSlots(extracted, url) {
  const clean = (s) => decodeHtml(String(s || '')).replace(/\s+/g, ' ').trim();
  const title = clean(extracted.title);
  const h1 = clean(extracted.h1s[0] || '');
  const metaDesc = clean(extracted.metaDesc);
  // Body text keeps its newlines: the extractor emits one at every block-level
  // boundary, and those newlines are what stop an n-gram from running across a
  // card, list item or paragraph edge. Collapsing them (as the single-line slots
  // do) would silently let phrases straddle unrelated blocks.
  const bodyText = decodeHtml(String(extracted.bodyText || ''))
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n[\s\n]*/g, '\n')
    .trim();
  const lang = extracted.lang || '';
  let slug = '/';
  try { slug = new URL(url).pathname; } catch { /* keep default */ }

  const sentenceTokens = tokenize(bodyText);
  const stop = stopwordsFor(lang);
  const rawCounts = countTerms(sentenceTokens, stop).uni;
  const fold = buildFoldMap(rawCounts, lang);
  const { uni, bi, tri, total } = countTerms(sentenceTokens, stop, fold);

  const foldTokens = (s) => (String(s || '').toLowerCase().match(WORD_PATTERN) || []).map((w) => fold.get(w) || w);
  const introTokens = sentenceTokens.flat().slice(0, 100).map((w) => fold.get(w) || w);
  const slotTokens = {
    title: foldTokens(title),
    meta: foldTokens(metaDesc),
    slug: foldTokens(slug.replace(/[-_/]+/g, ' ')),
    h1: foldTokens(h1),
    h2: foldTokens(extracted.heads.map(clean).join(' . ')),
    intro: introTokens,
    alt: foldTokens(extracted.alts.map(clean).join(' . ')),
    anchor: foldTokens(extracted.anchors.map(clean).join(' . ')),
  };

  const minPhrase = total > 400 ? 2 : 1;
  const trigrams = rank(tri, slotTokens, minPhrase, 8);
  const bigrams = dedupeContained(rank(bi, slotTokens, minPhrase, 20), trigrams).slice(0, 12);
  const terms = rank(uni, slotTokens, 1, 20);

  const variantsOf = new Map();
  for (const [plural, base] of fold) {
    if (!variantsOf.has(base)) variantsOf.set(base, []);
    variantsOf.get(base).push(plural);
  }
  const withVariants = (list) => list.map((t) => ({ ...t, variants: [...new Set(t.term.split(' ').flatMap((w) => variantsOf.get(w) || []))] }));

  const phrases = [...trigrams, ...bigrams].sort((a, b) => b.score - a.score).slice(0, 12);
  const primary = phrases[0] || terms[0] || null;

  return {
    url, host: hostOf(url),
    page: {
      title, h1, metaDescription: metaDesc, canonical: clean(extracted.canonical) || null, lang: lang || null, slug,
      words: total, headings: extracted.heads.length, images: extracted.alts.length, links: extracted.anchors.length,
      textChars: bodyText.length,
    },
    primary: primary ? primary.term : null,
    phrases: withVariants(phrases),
    terms: withVariants(terms),
    slots: SLOTS,
    notes: {
      data: 'This report is counts and placements only. The tool does not know what your page means or intends, and it does not judge quality. What to change, if anything, is your call.',
      ranking: 'Ranked by how often a term appears, lifted by how many parts of the page it appears in. That is this tool\'s heuristic, not a search engine ranking.',
      folded: fold.size ? 'Plurals were merged into their singular only where the singular also appears on the page.' : null,
      noVolume: 'This describes the page you wrote. It has no search volume or competition data, so it cannot tell you what to target.',
    },
  };
}
