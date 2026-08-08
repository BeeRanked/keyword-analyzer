import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHtml, extractSlots } from '../src/index.js';
import { tokenize, countTerms, stopwordsFor, buildFoldMap, decodeHtml } from '../src/text.js';

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
