import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHtml, extractSlots } from '../src/index.js';
import { isSafeUrl } from '../src/fetch-page.js';
import { tokenize, countTerms, stopwordsFor, buildFoldMap, decodeHtml, dedupeContained } from '../src/text.js';

test('tokenize splits on punctuation and never straddles boundaries', () => {
  const toks = tokenize('Fast, reliable hosting. Reliable support!');
  assert.deepEqual(toks, [['fast'], ['reliable', 'hosting'], ['reliable', 'support']]);
});

test('countTerms builds uni/bi/tri without starting or ending on stopwords', () => {
  const stop = stopwordsFor('en');
  const toks = tokenize('content for online stores and content for online shops');
  const { uni, bi, tri } = countTerms(toks, stop);
  assert.equal(uni.get('content'), 2);
  assert.equal(uni.get('online'), 2);
  assert.ok(!uni.has('for'), 'stopword excluded from unigrams');
  assert.ok(bi.has('online stores'));
  assert.ok(tri.has('content for online'), 'phrase may contain an interior stopword');
});

test('buildFoldMap folds plurals only when the singular is present, English only', () => {
  const stop = stopwordsFor('en');
  const { uni } = countTerms(tokenize('page page pages'), stop);
  const fold = buildFoldMap(uni, 'en');
  assert.equal(fold.get('pages'), 'page');
  const { uni: u2 } = countTerms(tokenize('widgets widgets'), stop);
  assert.equal(buildFoldMap(u2, 'en').size, 0, 'no singular present, no fold');
  assert.equal(buildFoldMap(uni, 'fr').size, 0, 'non-English, no fold');
});

test('decodeHtml turns entities into characters', () => {
  assert.equal(decodeHtml('caf&eacute; &amp; co'), decodeHtml('caf') + String.fromCodePoint(0xE9) + ' & co');
});

test('extractSlots pulls slots and does not concatenate adjacent cards', () => {
  const html = `<!doctype html><html lang="en"><head><title>Hosting for stores</title>
    <meta name="description" content="Reliable hosting"></head>
    <body>
      <nav><a>Ignore me nav</a></nav>
      <h1>Managed hosting</h1>
      <main>
        <p>Managed hosting keeps your store fast.</p>
        <div class="cards"><a href="/a">Aziz</a><a href="/b">Startup</a></div>
        <img alt="a dashboard screenshot">
      </main>
      <footer><a>Footer link</a></footer>
    </body></html>`;
  const s = extractSlots(html);
  assert.equal(s.title, 'Hosting for stores');
  assert.equal(s.h1s[0], 'Managed hosting');
  assert.ok(s.bodyText.includes('Managed hosting keeps your store fast'));
  // "Aziz" and "Startup" are separate anchors and must not merge into a token.
  const toks = tokenize(s.bodyText).flat();
  assert.ok(!toks.includes('azizstartup'), 'adjacent anchors must not concatenate');
  // nav/footer text is excluded from body flow.
  assert.ok(!s.bodyText.toLowerCase().includes('ignore me nav'));
});

test('phrases do not run across card or paragraph boundaries', () => {
  const html = `<!doctype html><html lang="en"><head><title>t</title></head><body><main>
    <div class="card"><a href="/a">Blue Widgets</a></div>
    <div class="card"><a href="/b">Green Sprockets</a></div>
  </main></body></html>`;
  const r = analyzeHtml(html, 'https://x.example/');
  const phrases = r.phrases.map((p) => p.term);
  assert.ok(!phrases.includes('widgets green'), 'no bigram spanning two cards');
  assert.ok(phrases.includes('blue widgets') || r.terms.some((t) => t.term === 'widgets'), 'within-card content still counted');
});

test('inline emphasis mid-sentence does not split a phrase', () => {
  const html = `<!doctype html><html lang="en"><head><title>t</title></head><body><main>
    <p>the <strong>best</strong> managed hosting, the best managed hosting</p>
  </main></body></html>`;
  const r = analyzeHtml(html, 'https://x.example/');
  const terms = [...r.phrases, ...r.terms].map((p) => p.term);
  assert.ok(terms.some((t) => t.includes('best managed')), 'phrase survives the <strong> wrapper');
});

test('nav and footer links are excluded from the anchor slot', () => {
  const html = `<!doctype html><html lang="en"><head><title>t</title></head><body>
    <nav><a href="/p">Pricing Nav</a></nav>
    <main><p>Body about hosting.</p><a href="/x">Real Body Link</a></main>
    <footer><a href="/c">Footer Contact</a></footer></body></html>`;
  const s = extractSlots(html);
  const anchors = s.anchors.join(' | ');
  assert.ok(!/Pricing Nav|Footer Contact/.test(anchors), 'nav/footer anchors dropped');
  assert.ok(/Real Body Link/.test(anchors), 'main-content anchor kept');
});

test('dedupeContained matches whole words, not substrings', () => {
  const shorter = [{ term: 'online store', count: 5, score: 5 }];
  assert.equal(dedupeContained(shorter, [{ term: 'online storefront', count: 6, score: 6 }]).length, 1, 'distinct term kept');
  assert.equal(dedupeContained(shorter, [{ term: 'best online store', count: 6, score: 6 }]).length, 0, 'true fragment dropped');
});

test('isSafeUrl blocks IPv6 private forms', () => {
  assert.equal(isSafeUrl('http://[::1]/'), false);
  assert.equal(isSafeUrl('http://[::ffff:127.0.0.1]/'), false);
  assert.equal(isSafeUrl('https://example.com/'), true);
});

test('analyzeHtml ranks a clear theme first and records placements', () => {
  const html = `<!doctype html><html lang="en"><head>
    <title>Managed hosting for online stores</title></head>
    <body><main>
      <h1>Managed hosting</h1>
      <p>Our managed hosting runs online stores. Managed hosting scales with your store, and managed hosting stays fast.</p>
    </main></body></html>`;
  const r = analyzeHtml(html, 'https://example.com/managed-hosting');
  assert.ok(r.primary && r.primary.includes('hosting'), `primary was ${r.primary}`);
  const hosting = r.terms.find((t) => t.term === 'hosting');
  assert.ok(hosting.count >= 3);
  assert.ok(hosting.slots.includes('title') && hosting.slots.includes('h1') && hosting.slots.includes('slug'));
});
