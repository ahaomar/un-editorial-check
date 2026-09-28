// Wave 4 (Agent C) contract: the UE-HR001..UE-HR005 review heuristics.
//
//   1. catalogue + registry contract — five entries with the exact ten-key
//      schema, review-only severity (warning, never error), heuristic
//      confidence, agent-review category, profile null, appended straight
//      after UE-GR003, honest limitation text and no invented sources;
//   2. UE-HR001 sentence-like fragment — fires on a verbless 5-8 word
//      sentence in authored prose only, on the first offending sentence of
//      a unit, and stays silent behind every documented gate (verb signal,
//      comma, parentheses, abbreviation tail, word count, repetition,
//      heading / list / nav / compact);
//   3. UE-HR002 malformed wording — tight collocations only, never the
//      idiomatic "would of course", report-only with a suggestion and no
//      replacement, silent on code-context units;
//   4. UE-HR003 duplicate sentence — one finding per unit for a repeated
//      4+ word sentence, silent across blocks (documented limitation) and
//      silent inside tables (compact units);
//   5. UE-HR004 incoherent heading — heading units ending in . or ; only;
//   6. UE-HR005 broken quotation — a surviving unpaired quote mark, with
//      paired quotes, apostrophes, code and compact units all silent;
//   7. fixture contract — every positive HR fixture exits 0 (review-only)
//      and fires exactly its one rule, and expected.json agrees;
//   8. fix boundary + disable — no HR id is ever in FIXABLE_RULE_IDS,
//      `--fix --apply` leaves a file containing all five findings byte
//      identical, config.rules enabled:false and ue:ignore both silence.
//
// NOT COVERED HERE, ON PURPOSE: the proposed second form of UE-HR003 (a long
// authored block repeated verbatim later in the same file, which is the
// duplicated-insertion defect in .feedbacks/v8/web/01 lines 141 and 151). The
// implementation lives in lib/rules.mjs, which the depth agent does not own,
// so shipping the test without the implementation would fail this suite and
// block every merge. The specification, the fixtures and the exact patch are
// handed to the integrator instead; see the Phase-7 report. Nothing in this
// file depends on it.
//
// TDD: written before the heuristic section landed in lib/rules.mjs.
// Standalone: node tests/audit-heuristics.mjs
// Prose in this file stays single-quoted: the repository self-scan extracts
// double-quoted sentence-like literals from .mjs sources, and this suite
// must not depend on that machinery to stay clean.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, CATALOGUE } from '../bin/check.mjs';
import { EDITORIAL_RULES } from '../lib/rules.mjs';
import { FIXABLE_RULE_IDS } from '../lib/fix.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'un-editorial-heuristics-'));

const write = (name, value) => {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, value);
  return file;
};
const config = write('config.json', '{}');
const capture = (argv) => {
  const out = [];
  const err = [];
  const args = argv.includes('--config') ? argv : [...argv, '--config', config];
  const code = run(args, {
    log: line => out.push(String(line)),
    error: line => err.push(String(line)),
  });
  return { code, stdout: out.join('\n'), stderr: err.join('\n') };
};
const scan = (file) => {
  const result = capture([file, '--format', 'json']);
  assert.notEqual(result.code, 2, `scan failed for ${file}: ${result.stderr}`);
  return JSON.parse(result.stdout).findings;
};
const hrOnly = (file) => scan(file).filter(f => f.ruleId.startsWith('UE-HR'));
const hrIds = (file) => hrOnly(file).map(f => f.ruleId);
const fixture = (name) => path.join(root, 'tests', 'fixtures', 'positive', name);

const HR_IDS = ['UE-HR001', 'UE-HR002', 'UE-HR003', 'UE-HR004', 'UE-HR005'];

// --- 1. catalogue and registry contract -------------------------------------

{
  const ids = CATALOGUE.rules.map(rule => rule.id);
  const gr3 = ids.indexOf('UE-GR003');
  assert.notEqual(gr3, -1, 'UE-GR003 must exist to anchor the append point');
  assert.deepEqual(ids.slice(gr3 + 1, gr3 + 1 + HR_IDS.length), HR_IDS,
    'the five heuristic entries must append directly after UE-GR003');

  for (const id of HR_IDS) {
    const entry = CATALOGUE.rules.find(rule => rule.id === id);
    assert(entry, `${id} must exist in rules/catalogue.json`);
    assert.deepEqual(Object.keys(entry).sort(), [
      'category', 'confidence', 'extensibility', 'guardNotes', 'id',
      'profile', 'scope', 'severity', 'status', 'summary',
    ], `${id} must carry exactly the ten catalogue keys`);
    assert.equal(entry.severity, 'warning', `${id} must be review-only: severity warning`);
    assert.notEqual(entry.severity, 'error', `${id} must never be error severity`);
    assert.equal(entry.category, 'agent-review', `${id} category`);
    assert.equal(entry.confidence, 'heuristic', `${id} confidence`);
    assert.equal(entry.scope, 'user-visible-copy', `${id} scope`);
    assert.equal(entry.status, 'deterministic', `${id} status`);
    assert.equal(entry.profile, null, `${id} must be profile-independent`);
    assert.equal(entry.extensibility, 'config.severities, config.rules', `${id} extensibility`);
    assert.equal(typeof entry.summary, 'string');
    assert.ok(entry.summary.length > 15, `${id} summary must describe the rule`);
    assert.ok(entry.guardNotes.length > 80, `${id} guardNotes must state the limitations`);
    assert.match(entry.guardNotes, /heuristic|false positive|not a complete/i,
      `${id} guardNotes must carry honest limitation language`);

    const blob = JSON.stringify(entry).toLowerCase();
    for (const banned of ['un approved', 'fully compliant', 'finds all errors',
      'factual verification', 'legal advice']) {
      assert(!blob.includes(banned), `${id} must not contain the banned phrase "${banned}"`);
    }
    assert(!/https?:\/\//.test(blob), `${id} must not invent a source URL`);

    const meta = EDITORIAL_RULES[id];
    assert(meta, `${id} must be registered in EDITORIAL_RULES`);
    assert.equal(meta.severity, 'warning', `${id} registry severity`);
    assert.equal(meta.category, 'agent-review', `${id} registry category`);
    assert.equal(meta.confidence, 'heuristic', `${id} registry confidence`);
    assert.equal(meta.scope, undefined, `${id} registry entry stays minimal like its neighbours`);
  }
}

// --- 2. UE-HR001 sentence-like fragment --------------------------------------

{
  const fire = scan(write('hr001-fire.txt',
    'The annual report on the situation.\n'));
  const hits = fire.filter(f => f.ruleId === 'UE-HR001');
  assert.equal(hits.length, 1, `UE-HR001 must fire on a verbless sentence, got ${JSON.stringify(fire)}`);
  const hit = hits[0];
  assert.equal(hit.severity, 'warning', 'HR findings are review-only');
  assert.equal(hit.confidence, 'heuristic', 'HR findings are heuristic confidence');
  assert.equal(hit.context, 'authored', 'the fragment came from authored copy');
  assert.equal(typeof hit.suggestion, 'string');
  assert.ok(hit.suggestion.length > 10, 'a fired fragment needs a usable suggestion');
  assert.ok(String(hit.current).includes('annual report'), 'current carries the offending sentence');

  assert.equal(hrIds(write('hr001-fire-md.md',
    'The annual report on the situation.\n'))[0], 'UE-HR001', 'Markdown fires too');

  // First offending sentence only: the unit yields one finding even when a
  // second fireable sentence follows, and it is the first one that reports.
  const two = hrOnly(write('hr001-two.txt',
    'The annual report on the situation. Annual delegation arrival situation briefing today.\n'))
    .filter(f => f.ruleId === 'UE-HR001');
  assert.equal(two.length, 1, `only the first offending sentence may fire, got ${JSON.stringify(two)}`);
  assert.ok(String(two[0].current).startsWith('The annual report'),
    'the first offending sentence is the one that reports');

  // Verb signals suppress: inflected verb, auxiliary, curated base verb.
  for (const [name, text] of [
    ['inflected', 'The delegation meets today.\n'],
    ['auxiliary', 'The plan is ready for review.\n'],
    ['curated', 'Restart OpenCode after installation.\n'],
  ]) {
    assert.deepEqual(hrIds(write(`hr001-verb-${name}.txt`, text)).filter(id => id === 'UE-HR001'), [],
      `${name} verb signal must silence UE-HR001`);
  }

  // Structure gates: headings, list items and navigation are not fragments.
  assert.deepEqual(hrIds(write('hr001-heading.md',
    '# The annual report on the situation.\n')).filter(id => id === 'UE-HR001'), [],
  'a heading unit must never be called a fragment');
  assert.deepEqual(hrIds(write('hr001-list.md',
    '- The annual report on the situation.\n')).filter(id => id === 'UE-HR001'), [],
  'a list item must never be called a fragment');
  assert.deepEqual(hrIds(write('hr001-nav.html',
    '<nav><a href="/x">The annual report on the situation.</a></nav>\n')).filter(id => id === 'UE-HR001'), [],
  'navigation copy must never be called a fragment');

  // Sentence gates: word count, comma, parentheses, abbreviation tail.
  assert.deepEqual(hrIds(write('hr001-short.txt',
    'The annual report.\n')).filter(id => id === 'UE-HR001'), [],
  'three words is too short to judge');
  assert.deepEqual(hrIds(write('hr001-long.txt',
    'The annual report on the situation about the delegation arrival.\n')).filter(id => id === 'UE-HR001'), [],
  'ten words is too long to judge');
  assert.deepEqual(hrIds(write('hr001-comma.txt',
    'The annual report, on the situation for delegation.\n')).filter(id => id === 'UE-HR001'), [],
  'a comma means the sentence has structure the gate cannot see');
  assert.deepEqual(hrIds(write('hr001-paren.txt',
    'The annual report (draft) on the situation.\n')).filter(id => id === 'UE-HR001'), [],
  'parenthetical text suppresses the fragment call');
  assert.deepEqual(hrIds(write('hr001-abbr.txt',
    'The delegation flight route via St.\n')).filter(id => id === 'UE-HR001'), [],
  'a sentence ending in an abbreviation is a split artefact, not a fragment');
  assert.deepEqual(hrIds(write('hr001-repeat.txt',
    'The annual report inside and annual report outside.\n')).filter(id => id === 'UE-HR001'), [],
  'a repeated content word marks deliberate parallel phrasing, not a fragment');
}

// --- 3. UE-HR002 malformed wording -------------------------------------------

{
  const one = hrIds(write('hr002-of.txt',
    'The revised text could of been clearer.\n'));
  assert.deepEqual(one, ['UE-HR002'], `tight collocation must fire, got ${JSON.stringify(one)}`);

  assert.deepEqual(hrIds(write('hr002-course.txt',
    'This would of course be fine.\n')).filter(id => id === 'UE-HR002'), [],
  'the idiomatic "would of course" must never fire');

  assert.equal(hrIds(write('hr002-went.txt',
    'The delegation had went early.\n')).filter(id => id === 'UE-HR002').length, 1,
  'had went must fire');
  assert.equal(hrIds(write('hr002-better.txt',
    'This is more better than before.\n')).filter(id => id === 'UE-HR002').length, 1,
  'more better must fire');

  assert.equal(hrIds(write('hr002-two.txt',
    'The text had went further and could of been clearer.\n')).filter(id => id === 'UE-HR002').length, 2,
  'each malformed collocation gets its own finding');

  const fired = hrOnly(write('hr002-shape.txt',
    'The revised text could of been clearer.\n'))[0];
  assert.equal(typeof fired.suggestion, 'string');
  assert.ok(fired.suggestion.length > 10, 'malformed wording needs a usable suggestion');
  assert.equal(fired.proposed, null, 'guidance only — no proposed replacement');

  assert.deepEqual(hrIds(write('hr002-code.mjs',
    'const note = `The revised text could of been clearer.`;\n')).filter(id => id === 'UE-HR002'), [],
  'code-context units are never wording targets');
}

// --- 4. UE-HR003 duplicate sentence ------------------------------------------

{
  const dupLine = 'The delegation arrived early and reviewed the agenda. The delegation arrived early and reviewed the agenda.';
  const dup = hrIds(write('hr003-one-block.md', `${dupLine}\n`));
  assert.deepEqual(dup, ['UE-HR003'], `a repeated sentence must fire once, got ${JSON.stringify(dup)}`);

  // Documented limitation: duplication is judged inside one unit only — the
  // same sentence once in each of two paragraphs never fires.
  assert.deepEqual(hrIds(write('hr003-two-blocks.md',
    'The delegation arrived early and reviewed the agenda.\n\nThe delegation arrived early and reviewed the agenda.\n')).filter(id => id === 'UE-HR003'), [],
  'the same sentence in two paragraphs is out of scope (documented limitation)');

  // Normalisation: case and terminal punctuation differences still match.
  assert.equal(hrIds(write('hr003-normalise.md',
    'Very good idea here. very good idea here!\n')).filter(id => id === 'UE-HR003').length, 1,
  'case and punctuation differences must not hide a duplicate');

  assert.deepEqual(hrIds(write('hr003-short.md',
    'Good work. Good work.\n')).filter(id => id === 'UE-HR003'), [],
  'a duplicate shorter than four words is too short to judge');

  // Tables are compact units: identical advice in two rows is legitimate.
  assert.deepEqual(hrIds(write('hr003-table.md',
    '| Note |\n| --- |\n| The delegation arrived early and reviewed the agenda. |\n| The delegation arrived early and reviewed the agenda. |\n')).filter(id => id === 'UE-HR003'), [],
  'identical table cells must never count as a duplicated sentence');
}

// --- 5. UE-HR004 incoherent heading ------------------------------------------

{
  const dot = hrIds(write('hr004-dot.md', '# Programme overview of the annual report.\n'));
  assert.deepEqual(dot, ['UE-HR004'], `a heading ending in a full stop must fire, got ${JSON.stringify(dot)}`);
  assert.equal(hrIds(write('hr004-semicolon.md', '# Programme overview;\n')).filter(id => id === 'UE-HR004').length, 1,
    'a heading ending in a semicolon must fire');
  assert.deepEqual(hrIds(write('hr004-clean.md', '# Programme overview\n')).filter(id => id === 'UE-HR004'), [],
    'a heading without terminal punctuation is fine');
  assert.equal(hrIds(write('hr004-h2.html', '<h2>Programme overview.</h2>\n')).filter(id => id === 'UE-HR004').length, 1,
    'HTML heading tags fire too');
  assert.deepEqual(hrIds(write('hr004-paragraph.txt', 'Programme overview.\n')).filter(id => id === 'UE-HR004'), [],
    'a paragraph ending in a full stop is ordinary prose, not a heading');
}

// --- 6. UE-HR005 broken quotation --------------------------------------------

{
  const open = hrIds(write('hr005-open.md',
    'The delegation said "arrivals are delayed.\n'));
  assert.deepEqual(open, ['UE-HR005'], `an unpaired quote must fire, got ${JSON.stringify(open)}`);

  assert.deepEqual(hrIds(write('hr005-balanced.md',
    'The delegation said "arrivals are delayed" today.\n')).filter(id => id === 'UE-HR005'), [],
    'a balanced quotation must stay silent');
  assert.deepEqual(hrIds(write('hr005-apostrophe.md',
    'The delegation\'s arrival is confirmed.\n')).filter(id => id === 'UE-HR005'), [],
    'a straight apostrophe is not a quotation mark');
  assert.deepEqual(hrIds(write('hr005-curly-apostrophe.md',
    'Delegation’s arrival is confirmed.\n')).filter(id => id === 'UE-HR005'), [],
    'a curly apostrophe is not a quotation mark');
  assert.deepEqual(hrIds(write('hr005-curly-pair.md',
    'The delegation said “arrivals are delayed.”\n')).filter(id => id === 'UE-HR005'), [],
    'a balanced curly quotation must stay silent');
  assert.equal(hrIds(write('hr005-curly-open.md',
    'The delegation said “arrivals are delayed.\n')).filter(id => id === 'UE-HR005').length, 1,
    'an unpaired curly quote must fire');
  assert.deepEqual(hrIds(write('hr005-code.mjs',
    'const note = `He said "arrivals`;\n')).filter(id => id === 'UE-HR005'), [],
    'code-context units are never quotation targets');
  assert.deepEqual(hrIds(write('hr005-compact.html',
    '<a class="badge" href="/x">Mission said "arrivals</a>\n')).filter(id => id === 'UE-HR005'), [],
    'compact navigation units are never quotation targets');
}

// --- 7. positive fixtures: exact ids, exit 0 ---------------------------------

{
  const FIXTURES = [
    ['hr001-fragment.txt', 'UE-HR001'],
    ['hr002-malformed.txt', 'UE-HR002'],
    ['hr003-duplicate.md', 'UE-HR003'],
    ['hr004-heading.md', 'UE-HR004'],
    ['hr005-quotation.md', 'UE-HR005'],
  ];
  const manifest = JSON.parse(fs.readFileSync(fixture('expected.json'), 'utf8'));
  for (const [name, id] of FIXTURES) {
    // Fixtures are copied out of the skill root before use — the scanner
    // never reads files inside its own root unless --self-scan is given.
    const target = write(`pos-${name}`, fs.readFileSync(fixture(name), 'utf8'));
    const result = capture([target, '--format', 'json']);
    assert.equal(result.code, 0,
      `${name} must exit 0 — heuristic findings are review-only:\n${result.stdout}`);
    const findings = JSON.parse(result.stdout).findings;
    assert.deepEqual(findings.map(f => f.ruleId), [id],
      `${name} must fire exactly ${id}`);
    assert.equal(findings[0].severity, 'warning', `${name} finding severity`);
    assert.deepEqual(manifest[name], [id], `expected.json must list ${name} as [${id}]`);
  }
}

// --- 8. fix boundary, disable and suppression --------------------------------

{
  for (const id of HR_IDS) {
    assert(!FIXABLE_RULE_IDS.has(id), `${id} must never be --fix-able`);
  }

  const combo = write('hr-combo.md', [
    'The annual report on the situation.',
    '',
    'The revised text could of been clearer.',
    '',
    'The delegation arrived early and reviewed the agenda. The delegation arrived early and reviewed the agenda.',
    '',
    '# Programme overview of the annual report.',
    '',
    'The delegation said "arrivals are delayed.',
    '',
  ].join('\n'));
  const comboFindings = scan(combo);
  assert.deepEqual(comboFindings.map(f => f.ruleId), HR_IDS,
    `all five heuristics fire together, review-only, in source order: got ${JSON.stringify(comboFindings.map(f => f.ruleId))}`);
  assert.ok(comboFindings.every(f => f.severity === 'warning'),
    'every heuristic finding stays warning severity');

  const before = fs.readFileSync(combo, 'utf8');
  const applied = capture([combo, '--fix', '--apply']);
  assert.equal(applied.code, 0, `apply must exit 0 with only review findings: ${applied.stderr}`);
  assert.equal(fs.readFileSync(combo, 'utf8'), before,
    '--fix --apply must never rewrite a heuristic-only file');

  // The same fire text is silent once config disables the rule.
  const off = write('hr-off.json', JSON.stringify({ rules: { 'UE-HR001': { enabled: false } } }));
  const disabledRun = capture([write('hr-disabled.md', 'The annual report on the situation.\n'),
    '--format', 'json', '--config', off]);
  assert.notEqual(disabledRun.code, 2, `the disable config must be accepted: ${disabledRun.stderr}`);
  const disabled = JSON.parse(disabledRun.stdout).findings;
  assert.deepEqual(disabled.map(f => f.ruleId), [],
    'config.rules enabled:false must silence UE-HR001');

  const ignored = hrIds(write('hr-ignore.md',
    'The annual report on the situation. <!-- ue:ignore UE-HR001 -->\n'));
  assert.deepEqual(ignored, [], `ue:ignore must suppress UE-HR001, got ${JSON.stringify(ignored)}`);
}

console.log('ok — heuristic review rules: catalogue, gates, fixtures, fix boundary, disable');
