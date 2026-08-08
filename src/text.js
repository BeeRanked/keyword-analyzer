// The pure text logic: entity decoding, tokenising, stopwords, plural folding,
// n-gram counting, slot matching and ranking. No I/O, no HTML parsing, so it is
// easy to test in isolation.
//
// Typographic characters are built from code points rather than written as
// literals, so this source file stays plain ASCII. They are not decoration: real
// pages are full of curly quotes, bullets and ellipses, and both the decoder and
// the phrase splitter below need the actual characters.

const CH = (n) => String.fromCharCode(n);
const RSQUO = CH(0x2019), LSQUO = CH(0x2018), LDQUO = CH(0x201C), RDQUO = CH(0x201D);
const HELLIP = CH(0x2026), BULL = CH(0x2022), MIDDOT = CH(0x00B7), NBSP = CH(0x00A0);

const ENT = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: RSQUO, lsquo: LSQUO, ldquo: LDQUO, rdquo: RDQUO, hellip: HELLIP, bull: BULL, middot: MIDDOT,
  mdash: '-', ndash: '-', times: CH(0x00D7), deg: CH(0x00B0), euro: CH(0x20AC), pound: CH(0x00A3),
  copy: CH(0x00A9), reg: CH(0x00AE), trade: CH(0x2122), szlig: CH(0x00DF),
};
// Latin-1 accented letters, generated rather than hand-listed (the uppercase
// forms are exactly 0x20 below the lowercase ones).
for (const [suffix, letters] of Object.entries({
  grave: { a: 0xE0, e: 0xE8, i: 0xEC, o: 0xF2, u: 0xF9 },
  acute: { a: 0xE1, e: 0xE9, i: 0xED, o: 0xF3, u: 0xFA, y: 0xFD },
  circ: { a: 0xE2, e: 0xEA, i: 0xEE, o: 0xF4, u: 0xFB },
  uml: { a: 0xE4, e: 0xEB, i: 0xEF, o: 0xF6, u: 0xFC, y: 0xFF },
  tilde: { a: 0xE3, n: 0xF1, o: 0xF5 },
  cedil: { c: 0xE7 }, ring: { a: 0xE5 }, slash: { o: 0xF8 },
})) {
  for (const [letter, code] of Object.entries(letters)) {
    ENT[letter + suffix] = CH(code);
    ENT[letter.toUpperCase() + suffix] = CH(code - 0x20);
  }
}

export function decodeHtml(s, depth = 0) {
  if (s == null || depth > 3) return s || '';
  const out = String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return _; } })
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n) => (ENT[n] != null ? ENT[n] : (ENT[n.toLowerCase()] != null ? ENT[n.toLowerCase()] : m)));
  return out !== s && /&[a-zA-Z#]/.test(out) ? decodeHtml(out, depth + 1) : out;
}

// Stopwords per language. Deliberately small: these are function words, not a
// blocklist of "boring" terms. Chosen from the page's own lang attribute.
const STOPWORDS = {
  en: 'the a an and or of to in for on with is are was were be been being it its this that these those as at by from you your yours we our ours they their them he she his her i me my but if then than so can could will would should may might must just also more most other some such only own same too very not no nor do does did done have has had what which who whom when where why how all any both each few there here about into over under again further once up down out off now new get like make made use used using one two',
  fr: 'le la les un une des du de et ou a au aux en dans pour sur avec est sont etait etaient ce cette ces qui que quoi dont son sa ses leur leurs il elle ils elles nous vous je tu me te se ne pas plus tres bien tout tous toute toutes comme mais donc car si par ete etre avoir fait faire aussi',
  de: 'der die das ein eine einen einem eines und oder von zu in fur auf mit ist sind war waren dieser diese dieses als bei aus nach auch noch nur wie wenn aber doch man sich sie er es ich wir ihr den dem des im am um vom zum zur nicht kein sehr mehr schon werden wird haben hat sein',
  es: 'el la los las un una unos unas y o de del a al en para por con es son era eran este esta estos estas que quien cuyo como pero si mas muy todo todos toda todas no ni se su sus lo le les nos yo tu ella ellos ellas ser estar hacer tambien',
  nl: 'de het een en of van naar in voor op met is zijn was waren dit dat deze die als bij uit na ook nog maar toch men zich zij hij ik wij jij niet geen zeer meer al worden wordt hebben heeft te om door over aan dan wel',
};
export function stopwordsFor(lang) {
  const key = String(lang || 'en').slice(0, 2).toLowerCase();
  return new Set((STOPWORDS[key] || STOPWORDS.en).split(/\s+/));
}

// A word may contain an internal apostrophe (straight or curly) or hyphen.
const WORD_RE = new RegExp("[\\p{L}\\p{N}][\\p{L}\\p{N}'" + RSQUO + "\\-]*", 'gu');
// Phrase boundaries: any run of punctuation ends a chunk, so an n-gram can never
// straddle a sentence, a comma or a list item.
const BOUNDARY_RE = new RegExp('[.,!?;:|()\\[\\]{}"' + BULL + LDQUO + RDQUO + LSQUO + RSQUO + HELLIP + MIDDOT + NBSP + '\\n\\r\\t/]+', 'g');

export function chunks(text) { return String(text).split(BOUNDARY_RE); }
export function tokenize(text) {
  return chunks(text).map((c) => c.toLowerCase().match(WORD_RE) || []).filter((a) => a.length);
}

export const WORD_PATTERN = WORD_RE;

/** Fold "pages" to "page", but only when "page" is itself present on the page,
 *  and only for English. Conservative on purpose: a wrong merge invents a topic. */
export function buildFoldMap(counts, lang) {
  const map = new Map();
  if (!/^en/i.test(String(lang || 'en'))) return map;
  for (const w of counts.keys()) {
    if (w.length < 4 || !/s$/.test(w) || /(ss|us|is)$/.test(w)) continue;
    let base = null;
    if (/ies$/.test(w)) base = w.slice(0, -3) + 'y';
    else if (/(ches|shes|xes|zes|sses)$/.test(w)) base = w.slice(0, -2);
    else base = w.slice(0, -1);
    if (base && base.length > 2 && counts.has(base)) map.set(w, base);
  }
  return map;
}

const isNumeric = (w) => /^[\p{N}]+$/u.test(w);
// Date and byline furniture ("Updated July 2026", "5 min read") repeats on every
// card of a listing page and must never be a candidate topic.
const NOISE = new Set((
  'january february march april may june july august september october november december ' +
  'jan feb mar apr jun jul aug sep sept oct nov dec ' +
  'monday tuesday wednesday thursday friday saturday sunday ' +
  'published updated posted edited reviewed read min mins share comments'
).split(/\s+/));
const contentWord = (w, stop) => w.length > 2 && !stop.has(w) && !NOISE.has(w) && !isNumeric(w) && !/^(19|20)\d\d$/.test(w);

/** Count unigrams, bigrams and trigrams. Phrases may contain interior function
 *  words ("content for online stores") but never start or end on one. */
export function countTerms(sentenceTokens, stop, fold = new Map()) {
  const f = (w) => fold.get(w) || w;
  const uni = new Map(), bi = new Map(), tri = new Map();
  let total = 0;
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const raw of sentenceTokens) {
    const t = raw.map(f);
    total += t.length;
    for (let i = 0; i < t.length; i++) {
      if (contentWord(t[i], stop)) bump(uni, t[i]);
      if (i + 1 < t.length && contentWord(t[i], stop) && contentWord(t[i + 1], stop)) bump(bi, t[i] + ' ' + t[i + 1]);
      if (i + 2 < t.length && contentWord(t[i], stop) && contentWord(t[i + 2], stop)) bump(tri, t.slice(i, i + 3).join(' '));
    }
  }
  return { uni, bi, tri, total };
}

export const SLOTS = ['title', 'meta', 'slug', 'h1', 'h2', 'intro', 'alt', 'anchor'];

/** Which of the structural slots contain this term. Matching is on folded tokens,
 *  so "pages" in the title still matches the term "page". */
export function slotsFor(term, slotTokens) {
  const parts = term.split(' ');
  const found = [];
  for (const s of SLOTS) {
    const toks = slotTokens[s] || [];
    for (let i = 0; i + parts.length <= toks.length; i++) {
      let ok = true;
      for (let j = 0; j < parts.length; j++) if (toks[i + j] !== parts[j]) { ok = false; break; }
      if (ok) { found.push(s); break; }
    }
  }
  return found;
}

// This tool's own ranking, not a search engine's: how often a term appears,
// lifted by how many parts of the page it appears in. Placement is what separates
// a real topic from a repeated turn of phrase.
const scoreOf = (count, slots) => count * (1 + 0.5 * slots.length);

export function rank(map, slotTokens, minCount, limit) {
  const out = [];
  for (const [term, count] of map) {
    if (count < minCount) continue;
    const slots = slotsFor(term, slotTokens);
    out.push({ term, count, slots, score: scoreOf(count, slots) });
  }
  out.sort((a, b) => b.score - a.score || b.count - a.count || a.term.localeCompare(b.term));
  return out.slice(0, limit);
}

/** Is the word sequence of `shortTerm` a contiguous run inside `longTerm`? Word
 *  based on purpose, so "online store" is not treated as part of "online
 *  storefront" (a substring match would wrongly merge two different terms). */
function wordsContained(shortTerm, longTerm) {
  const a = shortTerm.split(' ');
  const b = longTerm.split(' ');
  for (let i = 0; i + a.length <= b.length; i++) {
    let ok = true;
    for (let j = 0; j < a.length; j++) if (b[i + j] !== a[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

/** Drop a short phrase that is really just a fragment of a stronger longer one. */
export function dedupeContained(shorter, longer) {
  return shorter.filter((s) => !longer.some((l) => l.score >= s.score && wordsContained(s.term, l.term) && l.count >= s.count * 0.8));
}
