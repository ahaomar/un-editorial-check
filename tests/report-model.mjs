// Report model tests — plain node:assert, run with: node tests/report-model.mjs
//
// Covers the contract in .feedbacks/PHASE3-CONTRACT.md §2: the element union
// (unknown type throws), section order, per-finding blocks for every severity,
// the proposed/suggestion/message should-be fallback, the fixable markers,
// the heuristic paragraph and review queue, audits, sources, the empty scan,
// line/column sorting, file grouping, and purity (frozen input, deterministic
// output, no mutation of the findings array or its objects).

import assert from 'node:assert/strict';
import { buildReport, assertElements } from '../lib/report.mjs';

// --- fixtures ---------------------------------------------------------------

const severityTag = { error: 'ERROR', warning: 'WARNING', info: 'NOTE' };

function bannerText(severity, ruleId, category, confidence, line, column) {
  return `[${severityTag[severity]}] ${ruleId} · ${category} · ${confidence} · line ${line}:${column}`;
}

const LONG_MESSAGE =
  'Each finding explains why the wording was flagged and what a reviewer should consider before any change is made in the source document.';
assert(LONG_MESSAGE.length > 80, 'fixture message must exceed the queue excerpt limit');

const MANUAL_SUFFIX = ' — manual / agent rewrite; not --fix-able';
const FIXABLE_SUFFIX = ' — --fix-able';

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
    _unit: null,
    _index: 0,
    _matched: null,
    _offset: 0,
    _replacement: null,
    ...overrides,
  };
}

function makeInput(overrides = {}) {
  return {
    version: '0.7.0',
    date: '2026-09-27',
    targets: ['docs'],
    profiles: [],
    filesCount: 4,
    findings: [finding()],
    sources: [],
    ...overrides,
  };
}

function kvValue(report, label) {
  const row = report.find(e => e.type === 'kv' && e.label === label);
  assert(row, `missing kv row: ${label}`);
  return row.value;
}

function headingIndex(report, text) {
  const i = report.findIndex(e => (e.type === 'heading' || e.type === 'banner') && e.text === text);
  assert(i >= 0, `missing heading: ${text}`);
  return i;
}

function paragraphTexts(report) {
  return report.filter(e => e.type === 'paragraph').map(e => e.text);
}

function bannersFrom(report, index) {
  return report.slice(index).filter(e => e.type === 'banner');
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// --- element union: unknown type throws -------------------------------------

const probe = [
  { type: 'banner', kind: 'note', text: 'x' },
  { type: 'heading', level: 1, text: 'x' },
  { type: 'paragraph', text: 'x' },
  { type: 'kv', label: 'x', value: 'y' },
  { type: 'bullets', items: ['x'] },
  { type: 'spacer' },
  { type: 'rule' },
];
assert.deepEqual(assertElements(probe), probe, 'assertElements accepts every union member');
assert.throws(() => assertElements([{ type: 'widget' }]), /unknown element type: widget/);
assert.throws(
  () => assertElements([{ type: 'table', rows: [] }]),
  { name: 'Error', message: 'unknown element type: table' },
);
assert.throws(() => assertElements([{}]), /unknown element type/);
assert.throws(() => assertElements([null]), /unknown element type/);
assertElements(buildReport(makeInput()), 'buildReport output stays inside the union');

// --- cover block and kv rows ------------------------------------------------

const report = buildReport(makeInput({
  targets: ['docs', 'README.md'],
  profiles: ['publishing', 'accessibility'],
}));

assert.deepEqual(report[0], { type: 'banner', kind: 'title', text: 'UN Editorial Review' });
assert.deepEqual(
  report.slice(1, 6).map(e => e.label),
  ['Version', 'Date', 'Targets', 'Profiles', 'Files scanned'],
  'cover kv rows appear in contract order',
);
assert.equal(report[1].value, '0.7.0');
assert.equal(report[2].value, '2026-09-27');
assert.equal(report[3].value, 'docs README.md', 'targets joined with spaces');
assert.equal(report[4].value, 'publishing, accessibility');
assert.equal(report[5].value, '4', 'kv value coerced with String()');
assert.deepEqual(report[6], { type: 'rule' }, 'hairline rule closes the cover block');

const noProfiles = buildReport(makeInput());
assert(!noProfiles.some(e => e.type === 'kv' && e.label === 'Profiles'), 'empty profiles omits the row');
assert.deepEqual(
  noProfiles.slice(1, 5).map(e => e.label),
  ['Version', 'Date', 'Targets', 'Files scanned'],
);

// --- the full fixture: cover, counts, audits, findings, queue, sources ------

const fullFindings = [
  finding({
    line: 4,
    column: 9,
    ruleId: 'UE-RE005',
    category: 'register',
    severity: 'error',
    message: 'An exclamation mark is not used in formal copy.',
    current: 'A sentence with a misplaced mark',
  }),
  finding({ line: 12, column: 5 }),
  finding({
    line: 3,
    column: 7,
    ruleId: 'UE-HS002',
    category: 'hate-speech',
    severity: 'error',
    confidence: 'heuristic',
    message: LONG_MESSAGE,
  }),
  finding({
    file: 'index.html',
    line: 1,
    column: 1,
    ruleId: 'UE-EO001',
    category: 'publishing',
    severity: 'warning',
    audit: 'publishing',
    message: 'One first-level heading is required here.',
  }),
  finding({
    file: 'index.html',
    line: 2,
    column: 3,
    ruleId: 'UE-AX001',
    category: 'accessibility',
    severity: 'warning',
    confidence: 'heuristic',
    audit: 'accessibility',
    message: 'The image tag carries no alternative text.',
  }),
];
const fullSources = ['House style guide, chapter 4', 'United Nations editorial manual'];
const full = buildReport(makeInput({
  profiles: ['publishing'],
  findings: fullFindings,
  sources: fullSources,
}));

// section order
const iCounts = full.findIndex(e => e.type === 'paragraph' && e.text.endsWith(' notes'));
const iAudits = full.findIndex(e => e.type === 'kv' && e.label === 'Audits');
const iLegend1 = full.findIndex(e => e.type === 'paragraph' && e.text.includes('the wording proves the defect'));
const iLegend2 = full.findIndex(e => e.type === 'paragraph' && e.text.includes('never asserts'));
const iLegend3 = full.findIndex(e => e.type === 'paragraph' && e.text.includes('changes nothing'));
const iFindingsHeading = headingIndex(full, 'Findings by file');
const iQueueHeading = headingIndex(full, 'Review queue (heuristic findings)');
const iSourcesHeading = headingIndex(full, 'Sources');
assert(iCounts < iAudits && iAudits < iLegend1, 'counts and audit row precede the legend');
assert(iLegend1 < iLegend2 && iLegend2 < iLegend3, 'legend paragraphs keep their order');
assert(iLegend3 < iFindingsHeading, 'findings section follows the legend');
assert(iFindingsHeading < iQueueHeading && iQueueHeading < iSourcesHeading, 'queue before sources');

// the three legend promises must be present
assert(full.some(e => e.type === 'paragraph' && e.text.includes('the wording proves the defect')),
  'deterministic promise');
assert(full.some(e => e.type === 'paragraph' && e.text.includes('routed to review')
  && e.text.includes('never asserts') && e.text.includes('legal threshold')),
'heuristic promise');
assert(full.some(e => e.type === 'paragraph' && e.text.includes('changes nothing')),
  'report-only promise');

// counts exclude audits; audits get their own sorted row
assert.equal(full[iCounts].text, '2 errors · 1 warnings · 0 notes');
assert.equal(kvValue(full, 'Audits'), 'accessibility 1, publishing 1',
  'audit rows sorted by profile name, audits excluded from severity counts');

// every level-1 heading is preceded by a spacer; level-2 headings are files
for (let i = 1; i < full.length; i++) {
  if (full[i].type === 'heading' && full[i].level === 1) {
    assert.equal(full[i - 1].type, 'spacer', 'spacer precedes each level-1 heading');
  }
}
const level2 = full.filter(e => e.type === 'heading' && e.level === 2);
assert.deepEqual(level2.map(e => e.text), ['docs/page.md', 'index.html'], 'one heading per file');

// --- per-finding blocks: severity mapping and block shape -------------------

const hsIdx = full.findIndex(e => e.type === 'banner' && e.text.includes('UE-HS002'));
assert.deepEqual(full[hsIdx], {
  type: 'banner',
  kind: 'error',
  text: bannerText('error', 'UE-HS002', 'hate-speech', 'heuristic', 3, 7),
});
assert.deepEqual(full[hsIdx + 1], { type: 'kv', label: 'Current', value: '(whole line context not captured)' });
assert.deepEqual(full[hsIdx + 2], { type: 'kv', label: 'Should be', value: LONG_MESSAGE + MANUAL_SUFFIX });
assert.deepEqual(full[hsIdx + 3], { type: 'paragraph', text: LONG_MESSAGE });
assert.deepEqual(full[hsIdx + 4], { type: 'paragraph', text: 'Heuristic finding — routed to review.' },
  'heuristic finding carries the routed-to-review paragraph');
assert.equal(full[hsIdx + 5].type, 'banner', 'blocks follow each other directly');

const errIdx = full.findIndex(e => e.type === 'banner' && e.text.includes('UE-RE005'));
assert.deepEqual(full[errIdx], {
  type: 'banner',
  kind: 'error',
  text: bannerText('error', 'UE-RE005', 'register', 'deterministic', 4, 9),
});
assert.deepEqual(full[errIdx + 1], {
  type: 'kv',
  label: 'Current',
  value: 'A sentence with a misplaced mark',
});
assert.deepEqual(full[errIdx + 2], {
  type: 'kv',
  label: 'Should be',
  value: 'An exclamation mark is not used in formal copy.' + MANUAL_SUFFIX,
});
assert.deepEqual(full[errIdx + 3], {
  type: 'paragraph',
  text: 'An exclamation mark is not used in formal copy.',
});
assert.equal(full[errIdx + 4].type, 'banner', 'editorial block carries no audit row');

const warnIdx = full.findIndex(e => e.type === 'banner' && e.text.includes('UE-GR002'));
assert.deepEqual(full[warnIdx], {
  type: 'banner',
  kind: 'warning',
  text: bannerText('warning', 'UE-GR002', 'grammar', 'deterministic', 12, 5),
});

// info and unknown severities render as notes
const odd = buildReport(makeInput({ findings: [
  finding({ line: 1, severity: 'info' }),
  finding({ line: 2, severity: 'fatal' }),
] }));
const oddBanners = bannersFrom(odd, headingIndex(odd, 'Findings by file'));
assert.equal(oddBanners[0].kind, 'note');
assert(oddBanners[0].text.startsWith('[NOTE]'), 'info severity renders as a note');
assert.equal(oddBanners[1].kind, 'note');
assert(oddBanners[1].text.startsWith('[NOTE]'), 'unknown severity falls back to a note');

// --- should-be fallback: proposed ?? suggestion ?? message, and markers -----

const fallback = buildReport(makeInput({ findings: [
  finding({ line: 1, proposed: 'Propose one.', suggestion: 'Suggest one.', message: 'Message one.' }),
  finding({ line: 2, proposed: null, suggestion: 'Suggest two.', message: 'Message two.' }),
  finding({ line: 3, proposed: null, suggestion: null, message: 'Message three.' }),
  finding({ line: 4, proposed: 'Propose four.', message: 'Message four.', _replacement: 'Replace four.' }),
  finding({ line: 5, proposed: null, suggestion: 'Suggest five.', message: 'Message five.', _replacement: 'Replace five.' }),
  finding({ line: 6, proposed: null, suggestion: null, message: 'Message six.', _replacement: 'Replace six.' }),
] }));
assert.deepEqual(
  fallback.filter(e => e.type === 'kv' && e.label === 'Should be').map(e => e.value),
  [
    'Propose one.' + MANUAL_SUFFIX,
    'Suggest two.' + MANUAL_SUFFIX,
    'Message three.' + MANUAL_SUFFIX,
    'Propose four.' + FIXABLE_SUFFIX,
    'Suggest five.' + FIXABLE_SUFFIX,
    'Message six.' + FIXABLE_SUFFIX,
  ],
  'proposed wins, then suggestion, then message; _replacement drives the marker',
);

// --- heuristic paragraph and review queue -----------------------------------

const queueHeadingIdx = full[iQueueHeading];
assert.equal(queueHeadingIdx.type, 'heading');
const queueTexts = [];
for (const element of full.slice(iQueueHeading + 1)) {
  if (element.type === 'spacer') break;
  queueTexts.push(element.text);
}
const expectedFirstQueue = `docs/page.md:3:7 UE-HS002 — ${LONG_MESSAGE.slice(0, 80)}`;
assert.deepEqual(queueTexts, [
  expectedFirstQueue,
  'index.html:2:3 UE-AX001 — The image tag carries no alternative text.',
], 'review queue holds every heuristic finding in rendered order');
assert(!queueTexts[0].includes(LONG_MESSAGE.slice(80)), 'queue excerpt stops at 80 characters');

const det = buildReport(makeInput());
assert(!det.some(e => e.type === 'heading' && e.text === 'Review queue (heuristic findings)'),
  'queue section skipped when nothing is heuristic');
assert(!det.some(e => e.type === 'paragraph' && e.text === 'Heuristic finding — routed to review.'),
  'no routed-to-review paragraph for deterministic findings');
assert.equal(
  full.filter(e => e.type === 'paragraph' && e.text === 'Heuristic finding — routed to review.').length,
  2,
  'one routed-to-review paragraph per heuristic finding, audits included',
);

// --- audit findings live under Audits ---------------------------------------

const auditIdx = full.findIndex(e => e.type === 'banner' && e.text.includes('UE-EO001'));
assert.deepEqual(full[auditIdx], {
  type: 'banner',
  kind: 'warning',
  text: bannerText('warning', 'UE-EO001', 'publishing', 'deterministic', 1, 1),
});
assert.deepEqual(full[auditIdx + 1], { type: 'kv', label: 'Current', value: '(whole line context not captured)' });
assert.deepEqual(full[auditIdx + 4], { type: 'kv', label: 'Audit', value: 'publishing' });
assert.equal(full[auditIdx + 5].type, 'banner', 'audit block ends after its Audit row');

const heuristicAuditIdx = full.findIndex(e => e.type === 'banner' && e.text.includes('UE-AX001'));
assert.deepEqual(full[heuristicAuditIdx + 4], { type: 'kv', label: 'Audit', value: 'accessibility' });
assert.deepEqual(full[heuristicAuditIdx + 5], {
  type: 'paragraph',
  text: 'Heuristic finding — routed to review.',
});
assert(!det.some(e => e.type === 'kv' && e.label === 'Audits'), 'no audit row without audits');

// --- sources appendix -------------------------------------------------------

assert(!det.some(e => e.type === 'heading' && e.text === 'Sources'), 'no sources heading without sources');
assert(!det.some(e => e.type === 'bullets'), 'no bullets without sources');
assert.deepEqual(full[full.length - 1], { type: 'bullets', items: fullSources }, 'sources render as bullets');
assert.equal(iSourcesHeading, full.length - 2, 'sources heading directly before the bullets');
assert.notEqual(full[full.length - 1].items, fullSources, 'bullets items are a fresh array');

// --- empty scan -------------------------------------------------------------

const empty = buildReport(makeInput({ findings: [] }));
assert(!empty.some(e => e.type === 'heading'), 'empty scan renders no section headings');
const noFindingsIdx = empty.findIndex(e => e.type === 'paragraph' && e.text === 'No findings.');
assert(noFindingsIdx >= 0, 'empty scan says No findings.');
const emptyLegend3 = empty.findIndex(e => e.type === 'paragraph' && e.text.includes('changes nothing'));
assert.equal(noFindingsIdx, emptyLegend3 + 1, 'No findings. follows the legend directly');
assert(paragraphTexts(empty).includes('0 errors · 0 warnings · 0 notes'), 'zero counts on an empty scan');
assert.deepEqual(empty[0], { type: 'banner', kind: 'title', text: 'UN Editorial Review' });

const emptyWithSources = buildReport(makeInput({ findings: [], sources: ['House style guide, chapter 4'] }));
const emptyNoteIdx = emptyWithSources.findIndex(e => e.type === 'paragraph' && e.text === 'No findings.');
assert(emptyNoteIdx >= 0 && emptyNoteIdx < headingIndex(emptyWithSources, 'Sources'),
  'empty note precedes the sources appendix');

// --- sorting: line then column inside a file --------------------------------

const sorted = buildReport(makeInput({ findings: [
  finding({ line: 10, column: 1, ruleId: 'UE-GR001' }),
  finding({ line: 3, column: 9, ruleId: 'UE-GR002' }),
  finding({ line: 3, column: 2, ruleId: 'UE-TE003' }),
] }));
const positions = bannersFrom(sorted, headingIndex(sorted, 'Findings by file'))
  .map(e => e.text.match(/line (\d+):(\d+)/))
  .map(match => [Number(match[1]), Number(match[2])]);
assert.deepEqual(positions, [[3, 2], [3, 9], [10, 1]], 'findings sorted by line then column');

// --- grouping: one heading per file, first-appearance order -----------------

const interleaved = [
  finding({ file: 'b.md', line: 2, column: 4, ruleId: 'UE-SP001' }),
  finding({ file: 'a.md', line: 5, column: 3, ruleId: 'UE-GR001' }),
  finding({ file: 'b.md', line: 1, column: 1, ruleId: 'UE-TE003' }),
  finding({ file: 'a.md', line: 1, column: 6, ruleId: 'UE-GR002' }),
];
const grouped = buildReport(makeInput({ findings: interleaved }));
assert.deepEqual(
  grouped.filter(e => e.type === 'heading' && e.level === 2).map(e => e.text),
  ['b.md', 'a.md'],
  'files grouped under one heading each, first appearance order',
);
const bIdx = headingIndex(grouped, 'b.md');
const aIdx = headingIndex(grouped, 'a.md');
assert(bIdx < aIdx, 'file groups never interleave');
const bGroupBanners = grouped.slice(bIdx + 1, aIdx).filter(e => e.type === 'banner');
assert.equal(bGroupBanners.length, 2, 'both b.md findings sit inside the b.md group');
assert(bGroupBanners.every(e => e.text.includes('UE-SP001') || e.text.includes('UE-TE003')),
  'the b.md group holds only b.md findings');
assert.deepEqual(
  grouped.slice(aIdx + 1).filter(e => e.type === 'banner').map(e => e.text.match(/UE-[A-Z]+\d+/)[0]),
  ['UE-GR002', 'UE-GR001'],
  'a.md findings sorted by line inside their group',
);

// --- determinism and purity -------------------------------------------------

const sample = { profiles: ['publishing'], findings: interleaved, sources: fullSources };
const one = buildReport(makeInput(sample));
const two = buildReport(makeInput(sample));
assert.deepEqual(one, two, 'same input yields deeply equal output');
const copy = buildReport(JSON.parse(JSON.stringify(makeInput(sample))));
assert.deepEqual(one, copy, 'output depends only on input data');

const frozen = deepFreeze(makeInput(sample));
const snapshot = JSON.parse(JSON.stringify(frozen));
const fromFrozen = buildReport(frozen);
assert.deepEqual(JSON.parse(JSON.stringify(frozen)), snapshot, 'input findings are never mutated');
assert.deepEqual(fromFrozen, one, 'a deep-frozen input renders identically');
assertElements(fromFrozen, 'frozen-run output stays inside the union');

console.log('ok — report model: union, order, blocks, should-be, queue, audits, sources, empty, sorting, purity');
