# keyword-analyzer

See the words and phrases a web page actually emphasises, and exactly **where**
each one appears: title, meta description, URL slug, H1, subheadings, intro,
image alt text and link anchors. It reads one page in one request and reports the
terms and n-grams it genuinely repeats, with the placement of each, so you can
tell a real topic from a stray turn of phrase.

No API key, no browser. Runs as a library, a CLI, or a self-hosted HTTP endpoint.

## What it does, and what it refuses to do

- **No keyword-density target.** Repeating a word to hit a density number is what
  search engines call keyword stuffing. This tool reports repetition as a fact,
  never as a goal.
- **No invented per-element weights.** Nobody publishes how much an H1 counts
  versus body text, so this tool does not pretend to. It shows placement as a
  fact (which of eight slots contain a term) and lets you weigh it. The ranking
  is this tool's own heuristic and is labelled as such.
- **No fabricated search volume.** It describes the page you wrote. It has no
  volume or competition data, so it never tells you what to "target".
- **Careful plural folding.** "pages" folds into "page" only when "page" also
  appears on the page, and only for English, so it never silently merges two
  different words.

## Install

```bash
npm install keyword-analyzer
npx keyword-analyzer https://example.com/some-page
```

Requires Node 18 or newer.

## CLI

```bash
keyword-analyzer https://example.com/pricing
keyword-analyzer https://example.com/pricing --json
```

## Library

```js
import { analyzeUrl, analyzeHtml } from 'keyword-analyzer';

const report = await analyzeUrl('https://example.com/pricing');
console.log(report.primary);   // the strongest phrase on the page
console.log(report.phrases);   // [{ term, count, slots, score, variants }]
console.log(report.terms);     // single words, same shape
console.log(report.page);      // words, headings, images, links, slug, lang

// or analyze HTML you already have, no network:
const offline = analyzeHtml('<html>...</html>', 'https://example.com/pricing');
```

The tokeniser and counters are exported from `keyword-analyzer/text` if you want
to build on them.

## The eight slots

`title`, `meta`, `slug`, `h1`, `h2` (subheadings), `intro` (first ~100 words),
`alt` (image alt text), `anchor` (link text). A term that appears across many
slots is more likely to be a real topic than one buried in body text alone,
which is exactly what the placement column shows you.

## Self-host as an HTTP endpoint

`worker.js` is a ready Cloudflare Worker:

```bash
npm install
cp wrangler.toml.example wrangler.toml
npx wrangler deploy
```

Current wrangler (v4) needs Node 22 or newer; on Node 18 or 20, deploy with
`npx wrangler@3 deploy` instead.

Then `POST /` with `{ "url": "https://example.com/page" }`, or `GET /?url=...`.

## Hosted version

There is a free hosted version with a visual report at
[beeranked.online/keyword-analyzer](https://beeranked.online/keyword-analyzer),
from the team that maintains this project.

## License

MIT. See [LICENSE](LICENSE).
