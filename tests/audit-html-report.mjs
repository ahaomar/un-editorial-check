// un-editorial-check — HTML report contract suite (Phase 7, Agent 2).
//
// The contract under test, from the Phase 7 plan row for the HTML report:
// `--report review.html` writes a lane-aware HTML report parallel to the PDF —
// five lanes, quoted material counted separately, the audits section, every
// finding carrying source / profile / confidence / limitation / recommended
// human action, the framing disclaimer, and the exact clean-run sentence
// "No findings under the enabled, documented local rules." on a clean run.
// Deterministic output (same input, identical bytes), zero dependencies, no
// external assets or network, one self-contained file. The `--report` help text
// names both formats and an unsupported extension fails closed with exit 2.
//
// Two layers are exercised, deliberately:
//   * renderHtml() directly, for the parts of the model a live scan cannot
//     produce (quoted context, a hand-built finding with no captured copy),
//   * the real CLI, for everything about dispatch: extension routing, exit
//     codes, what actually lands on disk.
//
// Fixtures are copied out of the repository before use: the scanner never
// reads files inside its own skill root unless --self-scan is given. Every
// rendered report collected here is swept at the end for the banned phrases
// ("UN approved", "fully compliant", "finds all errors", "factual
// verification", "legal advice").

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { run } from '../bin/check.mjs';
import { renderHtml } from '../lib/html.mjs';
import { buildReport } from '../lib/report.mjs';
import { CATEGORY_LEGEND, legendRows } from '../lib/legend.mjs';
import { creditLine, footerLine, headerRows } from '../lib/furniture.mjs';
import { LANE_NAMES } from '../lib/output.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'check.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'un-editorial-html-'));

fs.cpSync(path.join(root, 'tests', 'fixtures'), path.join(tmp, 'fixtures'), { recursive: true });
const fixture = (...parts) => path.join(tmp, 'fixtures', ...parts);

const write = (name, value) => {
  const file = path.join(tmp, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
  return file;
};
// An explicit config keeps the suite independent of any .un-editorial.json in
// the working directory.
const config = write('config.json', '{}');

const capture = (argv, configPath = config) => {
  const out = [];
  const err = [];
  const args = argv.includes('--config') ? argv : [...argv, '--config', configPath];
  const code = run(args, {
    log: line => out.push(String(line)),
    error: line => err.push(String(line)),
  });
  return { code, stdout: out.join('\n'), stderr: err.join('\n') };
};
const json = result => {
  try { return JSON.parse(result.stdout); }
  catch { return assert.fail(`stdout is not JSON:\n${result.stdout}\n${result.stderr}`); }
};
const scan = (file, ...extra) => capture([file, '--format', 'json', ...extra]);
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');

// --- model fixtures ---------------------------------------------------------

const MANUAL_SUFFIX = ' — manual / agent rewrite; not --fix-able';
const FIXABLE_SUFFIX = ' — --fix-able';
const CLEAN = 'No findings under the enabled, documented local rules.';

// The six fields every finding must carry, in the order the card renders them.
const SIX_FIELDS = ['Lane', 'Source', 'Profile', 'Confidence', 'Limitation', 'Action'];

// Long enough to prove the review queue cuts an excerpt at 80 characters.
const LONG_MESSAGE =
  'Each finding explains why the wording was flagged and what a reviewer should consider before any change is made in the source document.';
assert(LONG_MESSAGE.length > 80, 'fixture message must exceed the queue excerpt limit');

function finding(overrides = {}) {
  return {
    file: 'docs/page.md',
    line: 12,
    column: 5,
    ruleId: 'UE-GR002',
    category: 'grammar',
    severity: 'warning',
    confidence: 'deterministic',
    scope: 'user-visible-copy',
    message: 'The full stop runs into the next word.',
    suggestion: null,
    current: null,
    proposed: null,
    _replacement: null,
    ...overrides,
  };
}

function makeInput(overrides = {}) {
  return {
    version: '1.1.0',
    date: '2026-09-28',
    targets: ['docs'],
    profiles: [],
    filesCount: 4,
    findings: [finding()],
    sources: [],
    ...overrides,
  };
}

const render = (input, opts = { version: '1.1.0' }) => renderHtml(input, opts);

// One finding per lane, plus a quoted finding. Hand-built because a live scan
// masks quoted spans before the rules run, and because it lets every lane be
// present in a single document without waiting for five separate corpora.
// The lane follows lib/output.mjs laneOf(): category beats confidence, so the
// heuristic finding carries a non-safety, non-diplomacy category.
const ALL_LANES = [
  finding({ file: 'a.txt', line: 1, column: 1, ruleId: 'UE-SP001', category: 'spelling', severity: 'error' }),
  finding({ file: 'b.txt', line: 3, column: 1, ruleId: 'UE-GR002', category: 'grammar',
    severity: 'error', confidence: 'heuristic', message: LONG_MESSAGE }),
  finding({ file: 'c.txt', line: 4, column: 1, ruleId: 'UE-DM001', category: 'discriminatory', severity: 'error' }),
  finding({ file: 'd.txt', line: 5, column: 1, ruleId: 'UE-DP001', category: 'diplomacy', severity: 'warning' }),
  finding({ file: 'e.html', line: 6, column: 1, ruleId: 'UE-EO001', category: 'publishing',
    severity: 'warning', audit: 'publishing' }),
  finding({ file: 'f.md', line: 7, column: 1, ruleId: 'UE-TE003', category: 'terminology',
    severity: 'warning', context: 'quoted' }),
];
const allLanes = render(makeInput({ findings: ALL_LANES, profiles: ['publishing'] }));

// --- 1: the document is well formed and self-contained -----------------------

assert(allLanes.startsWith('<!DOCTYPE html>\n<html lang="en">\n'), 'the file opens as an HTML document');
assert(allLanes.endsWith('</html>') && !allLanes.endsWith('\n'), 'the file closes the document and adds nothing after it');
assert.equal((allLanes.match(/<html\b/g) || []).length, 1, 'exactly one html element');
assert.equal((allLanes.match(/<body\b/g) || []).length, 1, 'exactly one body element');
assert.equal((allLanes.match(/<\/body>/g) || []).length, 1, 'the body is closed');
assert.match(allLanes, /<meta charset="utf-8">/, 'the encoding is declared, so copy is not re-decoded');

// Self-contained: no network, no external assets, no script. This is the whole
// point of the file being a single artefact a reviewer can forward.
assert(!/<script\b/i.test(allLanes), 'no script element may be emitted');
assert(!/\son\w+\s*=/i.test(allLanes), 'no inline event-handler attribute may be emitted');
assert(!/<(iframe|object|embed|link|img|svg)\b/i.test(allLanes), 'no element that fetches an external resource');
assert(!/@import/i.test(allLanes), 'the style block may not import another stylesheet');
assert(!/url\(/i.test(allLanes), 'the style block may not reference an external url()');
assert(!/<link\b/i.test(allLanes), 'no external stylesheet link');
assert.equal((allLanes.match(/<style>/g) || []).length, 1, 'exactly one inline style block');
assert(!/\bhttps?:\/\/(?!www\.un\.org|www\.ohchr\.org|www\.un\.org)/i.test(allLanes.replace(/<li>[^]*?<\/li>/g, '')),
  'outside the sources appendix no http(s) URL may appear: nothing may be fetched or linked');

// --- 2: all five lanes render, with quoted material reported separately ------

for (const lane of LANE_NAMES) {
  assert(allLanes.includes(`id="lane-${lane}"`),
    `the ${lane} lane must have its own section`);
}
assert.match(allLanes, /<h2>Deterministic violations \(1\)<\/h2>/, 'the deterministic lane renders its count');
assert.match(allLanes, /<h2>Heuristic editorial review \(1\)<\/h2>/, 'the heuristic lane renders its count');
assert.match(allLanes, /<h2>Harmful-discriminatory review \(1\)<\/h2>/, 'the harmful lane renders its count');
assert.match(allLanes, /<h2>Diplomatic sensitivity \(1\)<\/h2>/, 'the diplomacy lane renders its count');
assert.match(allLanes, /<h2>Optional audits \(1\)<\/h2>/, 'the audits lane renders its count');
assert.match(allLanes, /<h2>Quoted material \(1\)<\/h2>/, 'quoted material has its own section and its own count');

// Every non-quoted finding is inside a lane section; the quoted one is not.
{
  const quotedAt = allLanes.indexOf('id="quoted-material"');
  const laneStart = allLanes.indexOf('id="lane-deterministic"');
  assert(laneStart < quotedAt, 'lane sections precede the quoted section');
  for (const [rule, beforeQuote] of [['UE-SP001', true], ['UE-GR002', true], ['UE-DM001', true],
    ['UE-DP001', true], ['UE-EO001', true], ['UE-TE003', false]]) {
    const at = allLanes.indexOf(`] ${rule} ·`);
    assert(at > 0, `${rule} must be rendered`);
    assert.equal(at < quotedAt, beforeQuote, `${rule}: quoted findings leave the lane sections`);
  }
}

// Quoted material is counted on its own, never inside a lane count.
assert.match(allLanes,
  /lanes: deterministic 1 · heuristic-review 1 · harmful-discriminatory 1 · diplomacy 1 · audit 1 · quoted 1/,
  'the lane counts name all five lanes plus quoted');
assert.equal((allLanes.match(/<article class="finding/g) || []).length, 6,
  'every finding, quoted included, renders as its own block (one issue per group in the default detail)');

// --- 3: six fields on every finding -----------------------------------------

// Parse the cards and check the field tail of each: the six rows must be
// present, in order, non-empty, and must close the card.
const CARD_RE = /<article class="finding[^"]*"[^>]*>[\s\S]*?<\/article>/g;
const cards = [...allLanes.matchAll(CARD_RE)].map(m => m[0]);
assert.equal(cards.length, 6, 'six cards to inspect');

// The card-shape contract, applied to every layout the renderer can draw.
// The default detail renders grouped issue blocks here and `detail: 'full'`
// renders one card per finding (asserted further down), and both must close
// with the six lane fields in order — so a provenance field dropped from
// either mode fails the suite, whichever layout the reader asks for.
const assertCardShape = (list, label) => {
  for (const [index, card] of list.entries()) {
    const rows = [...card.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map(m => [m[1], m[2]]);
    const tail = rows.slice(-SIX_FIELDS.length);
    assert.deepEqual(tail.map(([name]) => name), SIX_FIELDS,
      `${label} ${index + 1} must close with the six lane fields, in order: ${rows.map(([l]) => l).join(', ')}`);
    for (const [field, value] of tail) {
      assert(value.length > 0, `${label} ${index + 1} ${field} must not be empty`);
      assert(value !== 'undefined', `${label} ${index + 1} ${field} must never render the string "undefined"`);
    }
    // Nothing may follow the six rows inside the card: the Action row is the
    // last field row, and the card closes straight after it.
    const actionRow = `<dt>${SIX_FIELDS[5]}</dt>`;
    const actionAt = card.indexOf(actionRow);
    assert(actionAt > 0, `${label} ${index + 1} must render its Action row`);
    assert(!/<dt>/.test(card.slice(actionAt + actionRow.length)),
      `${label} ${index + 1} may carry no field row after Action`);
  }
};
assertCardShape(cards, 'grouped issue card');

// The lane row names the lane the section is in, and the source row names the
// rule file, for every lane — the metadata is real, not a placeholder.
const cardFields = (ruleId) => {
  const card = cards.find(part => part.includes(`] ${ruleId} ·`));
  assert(card, `no card for ${ruleId}`);
  return Object.fromEntries([...card.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map(m => [m[1], m[2]]));
};
assert.equal(cardFields('UE-SP001').Lane, 'deterministic');
assert.equal(cardFields('UE-GR002').Lane, 'heuristic-review');
assert.equal(cardFields('UE-DM001').Lane, 'harmful-discriminatory');
assert.equal(cardFields('UE-DP001').Lane, 'diplomacy');
assert.equal(cardFields('UE-EO001').Lane, 'audit');
assert.equal(cardFields('UE-SP001').Source, 'rules/spelling.md', 'the source names the rule file');
assert.equal(cardFields('UE-EO001').Source, 'config/profiles/publishing.json', 'an audit cites its profile file');
assert.equal(cardFields('UE-EO001').Profile, 'publishing', 'an audit names itself as the profile');
assert.equal(cardFields('UE-GR002').Confidence, 'heuristic', 'confidence is rendered, not implied');
assert.match(cardFields('UE-GR002').Limitation, /\S/, 'a heuristic finding states its limitation');
assert.match(cardFields('UE-DP001').Action, /diplomatic review/i,
  'the recommended action routes the reader to diplomatic review');
// A hand-built finding with no metadata still gets every row: annotate() supplies
// the lane defaults, so a row can never be dropped as undefined.
{
  const bare = render(makeInput({ findings: [finding({ lane: undefined, source: undefined,
    profile: undefined, limitation: undefined, action: undefined })] }));
  const rows = [...bare.matchAll(/<dt>(Lane|Source|Profile|Limitation|Action)<\/dt><dd>([^<]*)<\/dd>/g)]
    .map(m => [m[1], m[2]]);
  assert.deepEqual(rows.map(([label]) => label), ['Lane', 'Source', 'Profile', 'Limitation', 'Action']);
  for (const [label, value] of rows) {
    assert(value.length > 0 && value !== 'undefined', `the default ${label} must render a real value`);
  }
}

// --- 4: current-to-should-be parity with the PDF block -----------------------

{
  const card = cards.find(part => part.includes('] UE-SP001 ·'));
  assert.match(card, /<dt>Current<\/dt><dd>organization<\/dd>|Current<\/dt><dd>\(not applicable\)<\/dd>/,
    'the Current row is present');
  assert(card.includes(MANUAL_SUFFIX) || card.includes(FIXABLE_SUFFIX),
    'the Should be row carries the same fixability marker the PDF prints');
}
{
  // A finding with no captured copy must not show a developer placeholder in a
  // director-facing report (the rule lib/report.mjs states).
  const auditCard = cards.find(part => part.includes('] UE-EO001 ·'));
  assert.match(auditCard, /<dt>Current<\/dt><dd>\(not applicable\)<\/dd>/, 'the audit card states no context');
  assert(!auditCard.includes('whole line context'), 'no developer placeholder may reach the report');
  assert.match(auditCard, /<dt>Audit<\/dt><dd>publishing<\/dd>/, 'an audit card names its audit');
}
{
  const detCard = cards.find(part => part.includes('] UE-SP001 ·'));
  assert(!/<dt>Audit<\/dt>/.test(detCard), 'an editorial card carries no audit row');
  assert.match(cards.find(part => part.includes('] UE-GR002 ·')),
    /Heuristic finding — routed to review\./, 'a heuristic card states that it is routed to review');
  assert(!/Heuristic finding — routed to review\./.test(detCard),
    'a deterministic card must not claim to be routed to review');
}
{
  // The PDF's review queue is carried over, so no content is dropped.
  assert.match(allLanes, /<h2>Review queue \(heuristic findings\) \(1\)<\/h2>/);
  const queue = allLanes.slice(allLanes.indexOf('id="review-queue"'),
    allLanes.indexOf('id="sources"') === -1 ? undefined : allLanes.indexOf('id="sources"'));
  assert(queue.includes('b.txt:3:1 UE-GR002 — '), 'the queue line names file, position and rule');
  assert(queue.includes(`${LONG_MESSAGE.slice(0, 80)}...`), 'a long message is cut at 80 characters and marked');
  assert(!queue.includes(LONG_MESSAGE.slice(0, 81)), 'the queue excerpt stops at 80 characters');
  assert(!queue.includes(LONG_MESSAGE), 'the queue never carries the whole message');
  // The full message still reaches the reader in the finding card itself.
  assert(allLanes.includes(LONG_MESSAGE), 'the finding card carries the untruncated explanation');
  // The quoted finding is deterministic, and a quoted heuristic would stay out:
  // neither can add itself to the queue.
  const noQueue = render(makeInput({ findings: [finding({ confidence: 'deterministic' })] }));
  assert(!noQueue.includes('Review queue'), 'the queue section is skipped when nothing is heuristic');
  const quotedHeuristic = render(makeInput({ findings: [finding({ confidence: 'heuristic',
    context: 'quoted', message: LONG_MESSAGE })] }));
  assert(!quotedHeuristic.includes('Review queue'),
    'a quoted heuristic stays out of the review queue');
}

// --- 5: framing, legend and the clean-run sentence --------------------------

{
  // Sanctioned wording, reused from the shipped surfaces.
  assert.match(allLanes,
    /Deterministic finding: the wording proves the defect\./,
    'the deterministic promise from lib/report.mjs is present');
  assert.match(allLanes,
    /Heuristic finding: routed to review; this report never asserts that a claim is true or false, or that any legal threshold is met\./,
    'the heuristic promise from lib/report.mjs is present verbatim');
  assert.match(allLanes, /This report changes nothing; re-run the checker to verify corrections\./,
    'the report-only promise from lib/report.mjs is present');
  assert.match(allLanes,
    /The report never presents itself as verification of facts, legal opinion or United Nations endorsement\./,
    'the framing disclaimer is present');
  assert.match(allLanes, /report only; findings are not changed by this report\./,
    'the footer promise from lib/pdf.mjs is present');
  // The three promises must be in the shipped order.
  const atDeterministic = allLanes.indexOf('Deterministic finding: the wording proves the defect.');
  const atHeuristic = allLanes.indexOf('Heuristic finding: routed to review;');
  const atReportOnly = allLanes.indexOf('This report changes nothing;');
  const atDisclaimer = allLanes.indexOf('The report never presents itself as verification of facts');
  assert(atDeterministic < atHeuristic && atHeuristic < atReportOnly && atReportOnly < atDisclaimer,
    'the framing block keeps the shipped order');
}

// The clean sentence appears on a clean report and on nothing else.
{
  const clean = render(makeInput({ findings: [] }));
  assert(clean.includes(CLEAN), 'a clean report states the canonical clean-run sentence');
  assert.equal((clean.match(new RegExp(CLEAN.replace(/\./g, '\\.'), 'g')) || []).length, 1,
    'the clean-run sentence is stated once, not twice');
  assert(!clean.includes('lane-deterministic'), 'a clean report renders no lane section');
  assert.match(clean, /<p class="counts">0 errors · 0 warnings · 0 notes<\/p>/,
    'a clean report still states its zero counts');
  assert(!clean.includes('lanes:'), 'a clean report states no lane counts');
  // The sentence must not appear on any report that carries a finding. This is
  // the CLI's rule from lib/output.mjs, enforced on the document too.
  for (const [label, document] of [['all lanes', allLanes], ['one finding', render(makeInput())],
    ['quoted only', render(makeInput({ findings: [finding({ context: 'quoted' })] }))]]) {
    assert(!document.includes(CLEAN), `${label}: the clean-run sentence must never accompany a finding`);
  }
}

// --- 5b: grouped issues, the occurrence table and counts ---------------------

// The default detail renders each group as one issue block carrying a real
// <table> with exactly the four contract columns, and every issue carries all
// six provenance fields whatever its count.
{
  const issueCards = [...allLanes.matchAll(/<article class="finding issue[^"]*"[^>]*>[\s\S]*?<\/article>/g)]
    .map(m => m[0]);
  assert.equal(issueCards.length, 6, 'the default detail renders one issue per group');
  const tables = [...allLanes.matchAll(/<table class="occurrences">[\s\S]*?<\/table>/g)].map(m => m[0]);
  assert.equal(tables.length, 6, 'every grouped issue renders its occurrence table');
  for (const [index, table] of tables.entries()) {
    const columns = [...table.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map(m => m[1]);
    assert.deepEqual(columns, ['File', 'Location', 'Content', 'Should be'],
      `occurrence table ${index + 1} has exactly the four contract columns: ${columns.join(', ')}`);
    const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table);
    assert(body, `occurrence table ${index + 1} has a body`);
    assert.equal((body[1].match(/<tr>/g) || []).length, 1,
      `a group of one lists exactly one occurrence`);
  }
  for (const [index, card] of issueCards.entries()) {
    const fields = /<dl class="fields">([\s\S]*?)<\/dl>/.exec(card);
    assert(fields, `issue ${index + 1} carries its provenance block`);
    const labels = [...fields[1].matchAll(/<dt>([^<]*)<\/dt>/g)].map(m => m[1]);
    assert.deepEqual(labels, SIX_FIELDS,
      `issue ${index + 1} carries all six provenance fields, in order: ${labels.join(', ')}`);
    for (const [, value] of fields[1].matchAll(/<dd>([^<]*)<\/dd>/g)) {
      assert(value.length > 0 && value !== 'undefined',
        `issue ${index + 1}: every provenance value must be real, got "${value}"`);
    }
  }
}

// A count is shown only when it is greater than one, the banner keeps its
// location only for a lone occurrence, and grouping never regroups a file
// away: three occurrences of one defect are one issue with three table rows.
{
  const duplicates = [
    finding({ file: 'docs/a.md', line: 1, column: 3, excerpt: 'The »delegation« reviewed the draft.' }),
    finding({ file: 'docs/b.md', line: 4, column: 7, excerpt: 'The »delegation« signed the report.' }),
    finding({ file: 'docs/a.md', line: 9, column: 2, excerpt: 'The »delegation« paused.' }),
  ];
  const grouped = render(makeInput({ findings: duplicates }));
  const full = render(makeInput({ findings: duplicates }), { version: '1.1.0', detail: 'full' });

  assert.equal((grouped.match(/<article class="finding issue/g) || []).length, 1,
    'the same defect in three places is one issue');
  assert.match(grouped, /<p class="count">3 occurrences<\/p>/,
    'a group of three shows its count');
  assert(!/· line \d+:\d+<\/h3>/.test(grouped),
    'a group banner omits the location when several occurrences share the block');
  const body = /<tbody>([\s\S]*?)<\/tbody>/
    .exec(/<table class="occurrences">[\s\S]*?<\/table>/.exec(grouped)[0]);
  const rows = [...body[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map(m => [...m[1].matchAll(/<td>([^<]*)<\/td>/g)].map(cell => cell[1]));
  assert.deepEqual(rows, [
    ['docs/a.md', '1:3', 'The »delegation« reviewed the draft.', 'The full stop runs into the next word.'],
    ['docs/b.md', '4:7', 'The »delegation« signed the report.', 'The full stop runs into the next word.'],
    ['docs/a.md', '9:2', 'The »delegation« paused.', 'The full stop runs into the next word.'],
  ], 'each row carries file, location, the marked excerpt and the should-be text');

  // A lone grouped finding: its occurrence table still shows the one row, but
  // no count — a group of one is not a summary.
  const single = render(makeInput());
  assert.match(single, /<h3>.*\] UE-GR002 · grammar · deterministic · line 12:5<\/h3>/,
    'a lone grouped issue keeps its location in the banner');
  assert(!/class="count"/.test(single), 'a lone finding shows no count');
  assert.match(single, /<table class="occurrences">/, 'a lone grouped issue still shows its occurrence row');

  // Full detail never groups and never counts.
  assert.equal((full.match(/<article class="finding severity-/g) || []).length, 3,
    'full detail keeps one card per finding');
  assert.equal((full.match(/<article class="finding issue/g) || []).length, 0,
    'full detail renders no grouped issue block');
  assert(!full.includes('<table class="occurrences">'), 'full detail carries no occurrence table');
  assert(!/class="count"/.test(full), 'full detail never prints a group count');
  assert.match(full, /<dt>File<\/dt><dd>docs\/a\.md<\/dd>/,
    'full detail keeps the per-card File row the grouped table replaces');

  // Both formats agree on what one issue is: the shared model groups these
  // same findings into exactly one issue of three occurrences.
  const model = buildReport(makeInput({ findings: duplicates }), { detail: 'grouped' })
    .filter(element => element.type === 'issue');
  assert.equal(model.length, 1, 'the shared model groups the same three findings into one issue');
  assert.equal(model[0].count, 3, 'the shared model counts three occurrences');
  assert.equal(model[0].occurrences.length, rows.length,
    'the HTML table lists exactly the occurrences the shared model grouped');
  assert.deepEqual(
    model[0].occurrences.map(o => [o.file, `${o.line}:${o.column}`, o.content, o.should]),
    rows,
    'the HTML table matches the shared model occurrence for occurrence, in the same order');

  // The banner is the model's own text, not a rewrite of it: severity, rule,
  // category, confidence, and the location only on a group of one.
  assert(grouped.includes(model[0].text),
    `the grouped banner carries the model's issue text: ${model[0].text}`);
  const lone = render(makeInput());
  const loneIssue = buildReport(makeInput(), { detail: 'grouped' })
    .filter(element => element.type === 'issue')[0];
  assert(loneIssue && /· line \d+:\d+$/.test(loneIssue.text),
    'the model puts the location on the banner of a group of one');
  assert(lone.includes(loneIssue.text),
    'a lone issue banner is the model text, location included');
}

// Grouping is presentation, never arithmetic: the summary counts are computed
// from the findings before either layout runs and are identical in both modes.
{
  const sample = { findings: ALL_LANES, profiles: ['publishing'], sources: ['House style guide, chapter 4'] };
  const grouped = render(makeInput(sample), { version: '1.1.0', detail: 'grouped' });
  const full = render(makeInput(sample), { version: '1.1.0', detail: 'full' });
  const summaryOf = html => ({
    counts: /<p class="counts">([^<]*)<\/p>/.exec(html)[1],
    lanes: /<p class="lanes">([^<]*)<\/p>/.exec(html)[1],
    audits: /<dt>Audits<\/dt><dd>([^<]*)<\/dd>/.exec(html)[1],
    sections: (html.match(/<h2>[^<]*\(\d+\)<\/h2>/g) || []).join('\n'),
  });
  assert.deepEqual(summaryOf(grouped), summaryOf(full),
    'grouping changes presentation only: both detail modes report identical summary counts');
  assert.equal(summaryOf(grouped).counts, '3 errors · 2 warnings · 0 notes',
    'the severity counts are computed from the findings, audits excluded');
  assert.equal(summaryOf(grouped).lanes,
    'lanes: deterministic 1 · heuristic-review 1 · harmful-discriminatory 1 · diplomacy 1 · audit 1 · quoted 1',
    'the lane line names all five lanes plus quoted');
  assert.equal(summaryOf(grouped).audits, 'publishing 1', 'the audits row is unaffected by detail');

  // Full detail keeps the pre-Phase-9 card layout, provenance lock included.
  const fullCards = [...full.matchAll(CARD_RE)].map(m => m[0]);
  assert.equal(fullCards.length, 6, 'full detail renders one card per finding');
  assertCardShape(fullCards, 'full-detail card');
  assert.equal((full.match(/<article class="finding issue/g) || []).length, 0,
    'full detail renders no grouped issue block');
  assert.match(full, /<dt>File<\/dt><dd>a\.txt<\/dd>/, 'full detail keeps the per-card File row');
}

// --- 5c: the category legend, twelve rows, text labels always ----------------

{
  const legendRowsOf = html => {
    const table = /<table class="legend">[\s\S]*?<\/table>/.exec(html);
    assert(table, 'the category legend renders as a table');
    const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table[0]);
    assert(body, 'the legend table has a body');
    return { table: table[0], rows: [...body[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => m[1]) };
  };
  const { table, rows } = legendRowsOf(allLanes);
  const heads = [...table.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map(m => m[1]);
  assert.deepEqual(heads, ['Marker', 'Category', 'What it covers', 'Findings'],
    'the legend table names its columns for a screen reader');
  assert.equal(rows.length, 12, 'the legend lists exactly twelve categories');
  const expected = legendRows(ALL_LANES);
  for (const [index, entry] of CATEGORY_LEGEND.entries()) {
    const row = rows[index];
    assert(row, `legend row ${index + 1} missing`);
    assert(row.includes(`background:${entry.colour}`),
      `legend row ${index + 1} (${entry.category}) carries its marker colour`);
    assert(row.includes(`>${entry.code}<`),
      `legend row ${index + 1} prints the ${entry.category} marker code as text`);
    assert(row.includes(`>${entry.category}<`),
      `legend row ${index + 1} prints the category name beside its marker, so colour is never the only signal`);
    assert(row.includes(`>${entry.intent}<`),
      `legend row ${index + 1} states what the category covers`);
    assert(row.includes(`<td>${expected[index].count}</td>`),
      `legend row ${index + 1} reports its count (${expected[index].count})`);
  }
  // Categories absent from the scan keep their row rather than being dropped.
  assert(rows.some(row => row.includes('<td>0</td>')),
    'zero-count categories keep their legend row');
  // The legend appears in both detail modes.
  const full = render(makeInput({ findings: ALL_LANES, profiles: ['publishing'] }),
    { version: '1.1.0', detail: 'full' });
  assert.equal(legendRowsOf(full).rows.length, 12, 'the twelve-row legend appears in full detail too');
}

// --- 5d: UN-style header and footer, in both detail modes --------------------

{
  const headerRowsOf = html => {
    const block = /<header class="doc-header">[\s\S]*?<\/header>/.exec(html);
    assert(block, 'the document header renders');
    return [...block[0].matchAll(/<p>([^<]*)<\/p>/g)].map(m => m[1]);
  };
  // headerRows over the same input the render received: if the renderer
  // hand-wrote its own masthead, this comparison is where it drifts.
  const expectedHeader = headerRows(makeInput());
  const groupedHeader = headerRowsOf(allLanes);
  assert.deepEqual(groupedHeader, expectedHeader,
    'the header is drawn from lib/furniture.mjs headerRows, in order');
  assert.equal(groupedHeader[0], 'EDITORIAL REVIEW', 'the header reads EDITORIAL REVIEW');
  assert.match(groupedHeader[2], /^Document symbol: UE\/\d{4}\/\d{4} {3}Date: 28 September 2026$/,
    'the document symbol and date line are derived from the scan input');
  assert.equal(groupedHeader[3], 'Distribution: General', 'the distribution marking is printed');

  const footerText = footerLine({ version: '1.1.0', page: 1, pages: 1 });
  assert(allLanes.includes(`<p>${footerText}</p>`), 'the footer line is drawn from footerLine');
  assert(allLanes.includes(`<p>${creditLine()}</p>`), 'the credit line is drawn from creditLine');
  assert(allLanes.includes('<p>report only; findings are not changed by this report.</p>'),
    'the report-only promise from lib/pdf.mjs still closes the page');

  // Both surfaces appear in full detail too.
  const full = render(makeInput({ findings: ALL_LANES, profiles: ['publishing'] }),
    { version: '1.1.0', detail: 'full' });
  assert.deepEqual(headerRowsOf(full), expectedHeader, 'the header appears in full detail');
  assert(full.includes(`<p>${footerText}</p>`) && full.includes(`<p>${creditLine()}</p>`),
    'the footer appears in full detail');
}

// --- 5e: the endorsement boundary --------------------------------------------

{
  // Claim row 22: the report never presents itself as United Nations
  // endorsement. The header says EDITORIAL REVIEW, and the uppercase masthead
  // UNITED NATIONS appears nowhere in either detail mode.
  const framingSentence =
    'The report never presents itself as verification of facts, legal opinion or United Nations endorsement.';
  const full = render(makeInput({ findings: ALL_LANES, profiles: ['publishing'] }),
    { version: '1.1.0', detail: 'full' });
  for (const [label, doc] of [['grouped', allLanes], ['full', full]]) {
    assert(!doc.includes('UNITED NATIONS'),
      `${label}: no rendered report may print the UNITED NATIONS masthead`);
    const headerBlock = /<header class="doc-header">[\s\S]*?<\/header>/.exec(doc)[0];
    assert(!/united nations/i.test(headerBlock.replace(/EDITORIAL REVIEW/, '')),
      `${label}: the header block itself never names the United Nations`);
  }
  // Beyond the one sanctioned disclaimer sentence there is no United Nations
  // wording at all — the report never presents itself as endorsement.
  assert(allLanes.includes(framingSentence), 'the framing disclaimer is present');
  assert(!allLanes.replace(framingSentence, '').toLowerCase().includes('united nations'),
    'the only United Nations wording in the report is the framing disclaimer itself');
}

// --- 6: escaping hostile input ----------------------------------------------

// Only the tags the renderer itself emits may exist in a document. This is the
// structural form of the escaping contract: strip every tag the renderer is
// allowed to write and no angle bracket may survive, so no piece of user text
// can become a tag no matter what it contains. Phase 9 adds the header block,
// the marker span and the tables (legend and occurrence), so those tags are
// whitelisted too — the whitelist is the set of tags this renderer writes, and
// user text still cannot forge one because it never reaches the document
// unescaped (locked by the "<td>injected cell</td>" fixture below).
const KNOWN_TAG = /<!DOCTYPE html>|<\/?(?:html|head|header|meta|title|style|body|main|h1|h2|h3|hr|dl|dt|dd|p|article|section|table|thead|tbody|tr|th|td|span|ul|li|footer)\b[^<>]*>/;
const assertNoInjectedMarkup = (document, label) => {
  const stripped = document.replace(new RegExp(KNOWN_TAG.source, 'g'), '');
  assert(!stripped.includes('<'), `${label}: an unescaped "<" reached the document`);
  assert(!stripped.includes('>'), `${label}: an unescaped ">" reached the document`);
  return stripped;
};
// The premise must be live: this check would catch an unescaped tag today.
assert(!new RegExp(KNOWN_TAG.source).test('<script>alert(1)</script>'),
  'the tag whitelist must not accept a script element, or the check below is vacuous');
assert(new RegExp(KNOWN_TAG.source).test('<dd>value</dd>'),
  'the tag whitelist must accept a row the renderer writes');
assert(new RegExp(KNOWN_TAG.source).test('<table class="occurrences">'),
  'the tag whitelist must accept the occurrence table the renderer writes');
// The same check over an ordinary report, so it is not only the hostile fixture
// that is proved clean.
assertNoInjectedMarkup(allLanes, 'ordinary report');

{
  // A file whose own name and copy carry markup, quotes, control characters and
  // a bidi override. Nothing here may reach the document as markup — including
  // into the occurrence table, whose Content cell carries the excerpt with its
  // » … « match marks.
  const hostile = 'docs/<script>alert(1)</script>.md';
  const message = '</dd></dl><script>alert(2)</script> & "quoted" \'apos\' <img src=x onerror=alert(3)> <td>injected cell</td>';
  const html = render(makeInput({
    targets: [hostile],
    findings: [finding({ file: hostile, message, current: '<b>bold</b>',
      excerpt: 'Say »<td>injected cell</td>« twice', category: 'grammar' })],
    sources: ['<script>alert(4)</script> house style'],
  }));

  assertNoInjectedMarkup(html, 'hostile input');
  // The renderer writes <td> itself now, so the whitelist would strip a raw
  // one: this is the assertion that proves user text never becomes one.
  assert(html.includes('Say »&lt;td&gt;injected cell&lt;/td&gt;« twice'),
    'the occurrence Content cell carries the escaped excerpt with its match marks intact');
  assert(!html.includes('<td>injected cell</td>'),
    'a table tag from user text never reaches the document unescaped');
  assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
    'the hostile file path is displayed, escaped');
  assert(html.includes('&lt;/dd&gt;&lt;/dl&gt;&lt;script&gt;alert(2)&lt;/script&gt;'),
    'a message that closes the surrounding markup is neutralised');
  assert(html.includes('&amp;') && html.includes('&quot;') && html.includes('&#39;'),
    'ampersand, double quote and apostrophe are escaped');
  assert(html.includes('&lt;b&gt;bold&lt;/b&gt;'), 'the Current excerpt is escaped');
  assert(html.includes('&lt;script&gt;alert(4)&lt;/script&gt; house style'),
    'a source citation is escaped too');
  // The escaped text must not be able to close its own element: the card still
  // has exactly the expected number of rows and cards.
  assert.equal((html.match(/<dd>/g) || []).length, (html.match(/<\/dd>/g) || []).length,
    'every dd is closed: no injected tag escaped its row');
  assert.equal((html.match(/<article class="finding/g) || []).length, 1,
    'hostile text cannot start a second finding card');
  // Attribute context: a value in quotes must not break out of its attribute.
  const hostileAttribute = render(makeInput({ targets: ['x" onmouseover="alert(5)'] }));
  assertNoInjectedMarkup(hostileAttribute, 'attribute-breaking target');
  assert(hostileAttribute.includes('&quot; onmouseover=&quot;alert(5)'),
    'a quote inside a rendered value stays inside its own text');
}

// Control characters and bidi overrides are neutralised, as in the text report.
{
  const html = render(makeInput({ findings: [finding({
    file: 'ctl\u001bname.txt',
    message: 'A\u0007 B\u202e C',
  })] }));
  assert(!/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(html),
    'no control or bidi character may reach the document');
  assert(html.includes('\\u001b') && html.includes('\\u202e'),
    'the control and bidi characters are shown in their escaped form');
}

// --- 7: determinism ----------------------------------------------------------

{
  const sample = { findings: ALL_LANES, sources: ['House style guide, chapter 4'], profiles: ['publishing'] };
  const one = render(makeInput(sample));
  const two = render(makeInput(sample));
  assert.equal(one, two, 'the same input renders byte-identical HTML');
  assert.equal(sha(one), sha(two), 'the same input renders the same digest');
  // Output depends only on input data, never on object identity or mutation
  // order: a JSON round trip renders identically.
  assert.equal(render(JSON.parse(JSON.stringify(makeInput(sample)))), one,
    'the render depends only on the input data');
  // A deep-frozen input renders identically and is never mutated.
  const freeze = value => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const frozen = freeze(makeInput(sample));
  const snapshot = JSON.stringify(frozen);
  assert.equal(render(frozen), one, 'a deep-frozen input renders identically');
  assert.equal(JSON.stringify(frozen), snapshot, 'the input findings are never mutated');
  // Nothing clock-derived or random may be in the output.
  const body = one.replace(/2026-09-28/g, '');
  assert(!/Date\.|Date\.now|new Date|Math\.random|uuid|generated at|timestamp/i.test(body),
    'no clock call, random source or generated-at marker may appear in the output');
}

// --- 8: CLI dispatch, exit codes and the file on disk -----------------------

const rendered = [allLanes];

// A live corpus that fires across several lanes at once.
{
  const corpus = write('lanes.txt', [
    'The organization uses color in this report.',            // deterministic
    'The delegation reviewed the the same draft.',            // deterministic
    'Foreigners are vermin in the annex.',                    // harmful-discriminatory
    'Kashmir is part of India, per the note.',                // diplomacy
    '',
  ].join('\n'));
  const parsed = json(scan(corpus));
  const lanesHit = new Set(parsed.findings.map(entry => entry.lane));
  for (const lane of ['deterministic', 'harmful-discriminatory', 'diplomacy']) {
    assert(lanesHit.has(lane), `the live corpus must fire the ${lane} lane: ${parsed.lanes}`);
  }
  assert.equal(parsed.lanes.quoted, 0, 'authored copy produces no quoted finding');

  const out = path.join(tmp, 'lanes.html');
  const result = capture([corpus, '--report', out, '--quiet']);
  assert.equal(result.code, 1, 'the error-severity corpus still fails the run with --report');
  assert(fs.existsSync(out), 'the HTML report must be written to the requested path');
  const html = fs.readFileSync(out, 'utf8');
  rendered.push(html);
  assert(html.startsWith('<!DOCTYPE html>'), 'the written file is an HTML document');
  for (const lane of ['deterministic', 'harmful-discriminatory', 'diplomacy']) {
    assert(html.includes(`id="lane-${lane}"`), `the live report renders the ${lane} lane`);
  }
  for (const field of SIX_FIELDS) {
    assert(html.includes(`<dt>${field}</dt>`), `the live report renders the ${field} field`);
  }
  assert(!html.includes(CLEAN), 'a report carrying findings must not state the clean-run sentence');
}

// A clean corpus: the exact clean-run sentence, and no finding block at all.
{
  const clean = write('clean.txt', 'The organisation reports the figure.\n');
  const plain = capture([clean]);
  assert.equal(plain.code, 0, 'the clean corpus must scan clean');
  assert(plain.stdout.includes(CLEAN), 'the text report states the canonical clean sentence');

  const out = path.join(tmp, 'clean.html');
  const result = capture([clean, '--report', out]);
  assert.equal(result.code, 0, '--report must not move a clean exit code');
  const html = fs.readFileSync(out, 'utf8');
  rendered.push(html);
  assert(html.includes(CLEAN), 'the clean HTML report states the canonical clean sentence');
  assert(!html.includes('<article class="finding'), 'a clean report carries no finding card');
  assert(!html.includes('lane-deterministic'), 'a clean report renders no lane section');
  assert.equal((html.match(new RegExp(CLEAN.replace(/\./g, '\\.'), 'g')) || []).length, 1,
    'the clean sentence is stated exactly once');
}

// The audits section renders only when audits were requested.
{
  const page = fixture('audits', 'publishing-missing.html');
  const without = capture([page, '--report', path.join(tmp, 'no-audit.html'), '--quiet']);
  assert.equal(without.code, 0, 'the audit fixture exits 0 without the audit profile');
  const plain = fs.readFileSync(path.join(tmp, 'no-audit.html'), 'utf8');
  rendered.push(plain);
  assert(!plain.includes('id="lane-audit"'), 'no audits requested means no audits lane');
  assert(!plain.includes('<dt>Audits</dt>'), 'no audits requested means no audits row');
  assert.equal((plain.match(/<article class="finding/g) || []).length, 0,
    'the audit fixture produces no editorial findings either');

  const withAudit = capture([page, '--profile', 'publishing',
    '--report', path.join(tmp, 'with-audit.html'), '--quiet']);
  assert.equal(withAudit.code, 0, 'audits never change the exit code');
  const auditHtml = fs.readFileSync(path.join(tmp, 'with-audit.html'), 'utf8');
  rendered.push(auditHtml);
  assert(auditHtml.includes('id="lane-audit"'), 'a requested audit renders the audits lane');
  assert.match(auditHtml, /<dt>Audits<\/dt><dd>publishing 5<\/dd>/,
    'the audits row names the audit and its count');
  const auditCards = [...auditHtml.matchAll(CARD_RE)];
  assert.equal(auditCards.length, 5, 'every audit finding gets its own card');
  for (const [card] of auditCards) {
    const tail = [...card.matchAll(/<dt>([^<]*)<\/dt>/g)].map(m => m[1]).slice(-SIX_FIELDS.length);
    assert.deepEqual(tail, SIX_FIELDS, 'every audit card carries the six fields');
  }
}

// PDF behaviour is unchanged: the same path still renders a PDF.
{
  const corpus = fixture('positive', 'sp001.txt');
  const pdf = path.join(tmp, 'still.pdf');
  const result = capture([corpus, '--report', pdf]);
  assert.equal(result.code, 1, 'the spelling fixture exits 1');
  const bytes = fs.readFileSync(pdf, 'latin1');
  assert(bytes.startsWith('%PDF-1.4'), '--report path.pdf still writes a PDF');
  assert(bytes.trimEnd().endsWith('%%EOF'), 'the PDF is structurally complete');
  assert.match(bytes, /UN Editorial Review/, 'the PDF still carries its title');
  assert.match(bytes, /report only; findings are not changed by this report\./,
    'the PDF footer promise is unchanged');
  // The report is written before --fix, recording the pre-fix wording.
  const target = write('prefix.txt', 'We noted the the point twice.\n');
  const fixPdf = path.join(tmp, 'prefix.pdf');
  const applied = capture([target, '--report', fixPdf, '--fix', '--apply']);
  assert.equal(applied.code, 0, 'the fixable corpus exits 0 after the fix');
  assert.match(fs.readFileSync(fixPdf, 'latin1'), /the the/,
    'the PDF still records the pre-fix wording');
}

// An unsupported extension fails closed, and no file is written.
{
  for (const name of ['out.txt', 'out.docx', 'out', 'out.PDFX', 'out.markdown']) {
    const target = path.join(tmp, name);
    const result = capture([fixture('positive', 'sp001.txt'), '--report', target, '--quiet']);
    assert.equal(result.code, 2, `--report ${name} must fail closed with exit 2: ${result.stderr}`);
    assert.match(result.stderr, /--report/, 'the refusal names the option');
    assert.match(result.stderr, /\.pdf/, 'the refusal lists the supported extensions');
    assert.match(result.stderr, /\.html/, 'the refusal lists the supported extensions');
    assert(!fs.existsSync(target), `--report ${name} must not create a file`);
  }
  // A refusal is a usage failure, whatever the scan would have found.
  const refused = capture([fixture('positive', 'sp001.txt'), '--report', path.join(tmp, 'r.txt')]);
  assert.equal(refused.code, 2, 'the usage refusal outranks the finding exit code');
}

// An unwritable HTML path is still a write refusal (exit 2), as for the PDF.
{
  const result = capture([fixture('positive', 'sp001.txt'),
    '--report', path.join(tmp, 'no-such-dir', 'x.html')]);
  assert.equal(result.code, 2, 'an unwritable HTML report path must refuse with exit 2');
  assert.match(result.stderr, /cannot write report/);
}

// The extension match is case-insensitive and the pre-existing refusals keep
// their own precedence.
{
  const upper = path.join(tmp, 'upper.HTML');
  const result = capture([fixture('positive', 'sp001.txt'), '--report', upper, '--quiet']);
  assert.equal(result.code, 1, 'an uppercase extension still renders the report');
  assert(fs.readFileSync(upper, 'utf8').startsWith('<!DOCTYPE html>'),
    'an uppercase .HTML path is dispatched to the HTML renderer');
  assert(!fs.existsSync(path.join(tmp, 'upper.PDFX')), 'a near-miss extension is refused, not guessed');
}

// --report composes with --format json: stdout stays JSON, the file is written.
{
  const out = path.join(tmp, 'both.html');
  const result = capture([fixture('positive', 'sp001.txt'), '--report', out, '--format', 'json']);
  assert.equal(result.code, 1, 'the failing fixture still exits 1');
  assert(json(result).findings.length > 0, 'stdout must still be the JSON report');
  assert(fs.readFileSync(out, 'utf8').startsWith('<!DOCTYPE html>'),
    '--report must write the file alongside --format json');
}

// The help text names both formats.
{
  const help = capture(['--help']);
  assert.equal(help.code, 0, '--help exits 0');
  assert.match(help.stdout, /--report <path>/);
  assert.match(help.stdout, /\.pdf/, 'the help text names the PDF format');
  assert.match(help.stdout, /\.html/, 'the help text names the HTML format');
}

// --- 9: banned-phrase sweep over every rendered report ----------------------

const BANNED = /UN approved|fully compliant|finds all errors|factual verification|legal advice/i;
for (const output of rendered) {
  assert(!BANNED.test(output), `banned phrase in a rendered report:\n${output.slice(0, 400)}`);
  // The endorsement boundary again, at the document level: no report this
  // suite writes — either detail mode, live corpus or hand-built — may print
  // the uppercase masthead. Only the framing disclaimer may name the United
  // Nations, and it never does so in capitals.
  assert(!output.includes('UNITED NATIONS'),
    `the UNITED NATIONS masthead reached a rendered report:\n${output.slice(0, 400)}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok — html report: five lanes, grouped issues with occurrence tables, twelve-row '
  + 'legend, UN-style header/footer, six fields, framing, clean sentence, escaping, '
  + 'determinism, dispatch, fail-closed extension, PDF unchanged, banned phrases');
