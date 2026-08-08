#!/usr/bin/env node
import { analyzeUrl } from '../src/index.js';

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s);
const dim = (s) => c('2', s);

function usage(code = 0) {
  process.stdout.write(`keyword-analyzer , see the terms a page emphasises and where each one appears

Usage:
  keyword-analyzer <url> [--json]

Options:
  --json      print the full report as JSON
  -h, --help  show this help
`);
  process.exit(code);
}

const args = process.argv.slice(2);
if (!args.length || args.includes('-h') || args.includes('--help')) usage(args.length ? 0 : 1);
const asJson = args.includes('--json');
const url = args.find((a) => !a.startsWith('-'));
if (!url) usage(1);

const row = (t) => `  ${String(t.count).padStart(3)}x  ${t.term.padEnd(34)} ${dim(t.slots.join(', ') || 'body only')}`;

try {
  const r = await analyzeUrl(url);
  if (asJson) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); process.exit(0); }

  process.stdout.write(`\n${bold(r.host)}   ${dim(r.page.words + ' words, ' + r.page.headings + ' headings, ' + r.page.links + ' links')}\n`);
  process.stdout.write(`${dim('primary theme')}  ${bold(r.primary || 'none found')}\n\n`);

  if (r.phrases.length) {
    process.stdout.write(bold('Top phrases  ') + dim('(count, and which slots contain it)\n'));
    for (const p of r.phrases.slice(0, 8)) process.stdout.write(row(p) + '\n');
    process.stdout.write('\n');
  }
  process.stdout.write(bold('Top terms\n'));
  for (const t of r.terms.slice(0, 12)) process.stdout.write(row(t) + '\n');
  process.stdout.write('\n' + dim('Slots: ' + r.slots.join(', ')) + '\n');
  process.stdout.write(dim('Counts and placements only. No search-volume or competition data.') + '\n');
} catch (e) {
  process.stderr.write((e && e.message ? e.message : String(e)) + '\n');
  process.exit(1);
}
