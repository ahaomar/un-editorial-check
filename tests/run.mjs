// un-editorial-check — behavioural test suite.
//
// The corpus under tests/fixtures is the contract:
//   * every file in fixtures/negative must produce no findings at all,
//   * every file in fixtures/positive must produce exactly the rule ids listed
//     in fixtures/positive/expected.json, and the exit code must follow from
//     the severity of those ids (errors -> 1, warnings and notes -> 0),
//   * fixtures/fix holds the --fix contract (what may be rewritten and what
//     must be refused), and fixtures/audits holds the opt-in audit contract.
//
// Fixtures are copied out of the repository before use: the scanner never
// reads files inside its own skill root unless --self-scan is given, and a
// fixture has to behave like any other project file.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, run } from '../bin/check.mjs';
import { parseJsonStrict } from '../lib/config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'check.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'un-editorial-'));

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
  // Only supply the suite's config when the caller has not chosen one.
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
const ids = result => [...new Set(json(result).findings.map(f => f.ruleId))].sort();
const severityOf = id => {
  const rule = CATALOGUE.rules.find(entry => entry.id === id);
  assert(rule, `catalogue is missing ${id}`);
  return rule.severity;
};
const scan = (file, ...extra) => capture([file, '--format', 'json', ...extra]);

// --- corpus: negatives -------------------------------------------------------

const negatives = fs.readdirSync(fixture('negative')).sort();
assert(negatives.length >= 20, 'negative corpus must stay substantial');
for (const name of negatives) {
  const result = scan(fixture('negative', name));
  assert.equal(result.code, 0, `${name}: expected exit 0\n${result.stdout}\n${result.stderr}`);
  assert.deepEqual(ids(result), [], `${name} must produce no findings`);
}

// --- corpus: positives -------------------------------------------------------

const manifest = JSON.parse(fs.readFileSync(fixture('positive', 'expected.json'), 'utf8'));
const positives = fs.readdirSync(fixture('positive')).filter(name => name !== 'expected.json').sort();
assert.deepEqual(positives, Object.keys(manifest).sort(), 'expected.json must list every positive fixture');
for (const name of positives) {
  const result = scan(fixture('positive', name));
  assert.deepEqual(ids(result), manifest[name], `${name}: ${result.stdout}`);
  const expectedExit = manifest[name].some(id => severityOf(id) === 'error') ? 1 : 0;
  assert.equal(result.code, expectedExit, `${name}: exit code must follow the severity of its findings`);
}

// Every editorial rule in the catalogue must be covered by the corpus. UE-SP003
// is gated by an opt-in config flag, so it is covered later in this file.
const OPT_IN_COVERAGE = new Set(['UE-SP003']);
const covered = new Set([...Object.values(manifest).flat(), ...OPT_IN_COVERAGE]);
const uncovered = CATALOGUE.rules
  .filter(rule => rule.profile === null)
  .map(rule => rule.id)
  .filter(id => !covered.has(id));
assert.deepEqual(uncovered, [], `editorial rules with no positive fixture: ${uncovered.join(', ')}`);

// --- exit codes --------------------------------------------------------------

assert.equal(scan(write('clean.txt', 'The organisation reports the figure.\n')).code, 0);
assert.equal(scan(fixture('positive', 'nu002.txt')).code, 0, 'warnings alone must not fail the run');
assert.equal(scan(fixture('positive', 're005.txt')).code, 1, 'error-severity findings must fail the run');
for (const argv of [['--format', 'xml'], ['--config'], ['--bogus'], ['no-such-path'], ['--apply']]) {
  assert.equal(capture(argv).code, 2, `usage error must exit 2: ${argv.join(' ')}`);
}
assert.equal(capture(['--quiet', fixture('fix', 'protected.md'), '--fix']).code, 2,
  '--quiet with a --fix preview must be refused: showing the diff is the point');

// --- positions: the offset map points at the copy, not at a masked region ----

{
  const line = 'Read https://example.test/a-very-long-path and organization here.';
  const finding = json(scan(write('position.txt', `${line}\n`))).findings[0];
  assert(finding, 'expected a finding');
  assert.equal(finding.line, 1);
  assert.equal(finding.column, line.indexOf('organization') + 1,
    'column must point at the word, not at the masked URL before it');
}

{
  const lines = ['First line is clean.', 'Second line has organization here.', ''];
  const finding = json(scan(write('position-lines.txt', lines.join('\n')))).findings[0];
  assert.equal(finding.line, 2);
  assert.equal(finding.column, lines[1].indexOf('organization') + 1);
}

{
  // HTML entities decode to one character: without an offset map the reported
  // column would drift by four for every `&amp;`.
  const line = '<p>A &amp; B organization here.</p>';
  const finding = json(scan(write('position-entity.html', `${line}\n`))).findings[0];
  assert(finding, 'expected a finding');
  assert.equal(finding.line, 1);
  assert.equal(finding.column, line.indexOf('organization') + 1,
    'entity decoding must not shift the reported position');
}

{
  // An attribute value maps back to the character inside the quotes.
  const line = '<p title="organization">Body</p>';
  const finding = json(scan(write('position-attr.html', `${line}\n`))).findings[0];
  assert(finding, 'expected a finding');
  assert.equal(finding.column, line.indexOf('organization') + 1);
}

// --- suppressions ------------------------------------------------------------

const suppressions = [
  ['The organization reports. <!-- ue:ignore UE-SP001 -->', []],
  ['The organization reports. <!-- ue:ignore UE-SP* -->', []],
  ['The organization reports. <!-- ue:ignore all -->', []],
  ['The organization reports. <!-- ue:ignore UE-TE003 -->', ['UE-SP001']],
  ['The organization reports 25%. <!-- ue:ignore UE-SP001,UE-TE003,UE-RE003 -->', []],
];
suppressions.forEach(([body, expected], index) => {
  const result = scan(write(`suppress-${index}.md`, `${body}\n`));
  assert.deepEqual(ids(result), expected, body);
});

{
  // A suppression belongs to the paragraph that contains it.
  const body = 'The organization reports. <!-- ue:ignore UE-SP001 -->\n\nThe organization reports again.\n';
  assert.deepEqual(ids(scan(write('suppress-leak.md', body))), ['UE-SP001'],
    'a suppression must not leak into the next paragraph');
}

// --- the Phase 2 families honour suppressions and configuration --------------

{
  const cases = [
    ['UE-HS001', 'Foreigners are vermin.'],
    ['UE-RE006', 'The envoy dismissed the amendment as a total sham and labelled the rapporteur a clown.'],
    ['UE-GR001', 'The delegation reviewed the the same draft of the resolution.'],
  ];
  for (const [rule, body] of cases) {
    assert.deepEqual(ids(scan(write(`suppress-${rule}.md`, `${body} <!-- ue:ignore ${rule} -->\n`))), [],
      `${rule} must accept a ue:ignore suppression`);
  }

  // Disabling a new rule through configuration silences it over its own fixture.
  const off = write('gr-off.json', JSON.stringify({ rules: { 'UE-GR001': { enabled: false } } }));
  assert.deepEqual(ids(scan(fixture('positive', 'gr001-doubled.txt'), '--config', off)), [],
    'config.rules enabled:false must silence UE-GR001');

  // Downgrading a new error rule flips the exit code of its fixture.
  const down = write('hs-downgrade.json', JSON.stringify({ severities: { 'UE-HS001': 'warning' } }));
  const file = fixture('positive', 'hs001-dehumanising.txt');
  assert.equal(scan(file).code, 1, 'the UE-HS001 fixture exits 1 at error severity');
  assert.equal(scan(file, '--config', down).code, 0,
    'config.severities must downgrade UE-HS001 to warning');
}

// --- quotations and cited titles are never checked or rewritten --------------

assert.deepEqual(ids(scan(write('quote.txt', '> The organization reports.\n'))), []);
assert.deepEqual(ids(scan(write('cite.md', 'See <cite>Organization of African Unity</cite> here.\n'))), []);

// --- fenced blocks in plain text are out of reach ----------------------------

{
  // The fence must open on its marker line, not close on it: when the open
  // and close patterns are identical, the marker used to collapse its own
  // region and the body below it reached the rules and the fixer.
  const body = [
    'The US reported 45% in the intro.',
    '',
    '```text',
    'The US reported 45% inside the fence.',
    '```',
    '',
  ].join('\n');
  const result = json(scan(write('fence-body.txt', body)));
  assert(result.findings.length > 0, 'the intro line outside the fence must be checked');
  assert(result.findings.every(f => f.line === 1),
    `findings may only come from outside the fence: ${JSON.stringify(result.findings.map(f => [f.ruleId, f.line]))}`);

  assert.deepEqual(ids(scan(write('fence-open.txt', '```text\nThe US reported 45% in the open fence.\n'))), [],
    'a fence left open masks to the end of the file');

  // The reported --fix regression: a fenced body must survive --apply byte
  // for byte, because no finding may exist inside the fence for a fix to use.
  const fenced = 'Intro line.\n\n```text\nThe US delivered 45% of the supplies.\n```\n';
  const target = write('fence-fix.txt', fenced);
  const applied = capture([target, '--fix', '--apply']);
  assert.equal(applied.code, 0, `a fully fenced file has nothing to fix: ${applied.stderr}`);
  assert.equal(fs.readFileSync(target, 'utf8'), fenced, 'no part of a fenced block may ever be rewritten');
}

// --- --fix -------------------------------------------------------------------

{
  const target = write('protected-copy.md', fs.readFileSync(fixture('fix', 'protected.md'), 'utf8'));
  const before = fs.readFileSync(target, 'utf8');

  const preview = capture([target, '--fix']);
  assert.equal(preview.code, 1, `preview must report the un-fixed errors: ${preview.stderr}`);
  assert.equal(fs.readFileSync(target, 'utf8'), before, 'a preview must never write');
  assert.match(preview.stdout, /\(proposed\)/);
  assert.match(preview.stdout, /FIXABLE — \d+ replacement/);

  const applied = capture([target, '--fix', '--apply']);
  assert.equal(applied.code, 0, `every fixable error was applied: ${applied.stderr}`);
  assert.match(applied.stdout, /\(applied\)/);
  assert.match(applied.stdout, /^APPLIED — /m);
  assert.equal(fs.readFileSync(target, 'utf8'), [
    'The organisation inside <cite>Organization</cite> and organisation outside.',
    '',
    'See "Organization of African Unity" for detail, and organisation in prose.',
    '',
    'Read https://example.test/organization and organisation again.',
    '',
    '> organization quoted here',
    '',
    '<!-- organization in a comment -->',
    '',
    'organisation at last.',
    '',
  ].join('\n'), 'only bare prose may be rewritten');
}

for (const name of ['ranges.txt', 'states.txt']) {
  const target = write(`fix-${name}`, fs.readFileSync(fixture('fix', name), 'utf8'));
  const result = capture([target, '--fix', '--apply']);
  assert.equal(result.code, 0, `${name}: ${result.stderr}`);
}
assert.equal(fs.readFileSync(path.join(tmp, 'fix-ranges.txt'), 'utf8'),
  'Coverage was 1990–2025 and reached 25 per cent of the total.\n');
assert.equal(fs.readFileSync(path.join(tmp, 'fix-states.txt'), 'utf8'),
  'The United States reported US$ 4.1 billion in aid.\n');

// Non-prose files are refused with exit code 2 and left untouched.
for (const name of ['page.html', 'script.js']) {
  const target = write(`refuse-${name}`, fs.readFileSync(fixture('fix', name), 'utf8'));
  const before = fs.readFileSync(target, 'utf8');
  const result = capture([target, '--fix', '--apply']);
  assert.equal(result.code, 2, `${name} must be refused`);
  assert.match(result.stderr, /refusing --fix/);
  assert.equal(fs.readFileSync(target, 'utf8'), before, `${name} must not be rewritten`);
}

// Judgement calls are never auto-corrected: an error-severity rule without a
// deterministic replacement still exits 1 and still writes nothing.
{
  const target = write('no-auto.txt', 'Coverage reached a record level!\n');
  const before = fs.readFileSync(target, 'utf8');
  const result = capture([target, '--fix', '--apply']);
  assert.equal(result.code, 1, 'a non-fixable error must still fail the run');
  assert.doesNotMatch(result.stdout, /APPLIED/);
  assert.equal(fs.readFileSync(target, 'utf8'), before);
}

// Link safety: symlinks and hard links are refused before anything is written.
{
  const target = write('link-target.txt', 'organization\n');
  const link = path.join(tmp, 'link.txt');
  try { fs.symlinkSync(target, link); } catch { /* platforms without symlink permission */ }
  if (fs.existsSync(link)) {
    const result = capture([link, '--fix', '--apply']);
    assert.equal(result.code, 2, 'a symbolic link must be refused');
    assert.match(result.stderr, /symbolic link/i);
    assert.equal(fs.readFileSync(target, 'utf8'), 'organization\n');
  }
}
{
  const target = write('hard-target.txt', 'organization\n');
  const link = path.join(tmp, 'hard.txt');
  fs.linkSync(target, link);
  const result = capture([target, '--fix', '--apply']);
  assert.equal(result.code, 2, 'a hard-linked file must be refused');
  assert.match(result.stderr, /hard[- ]link/i);
  assert.equal(fs.readFileSync(target, 'utf8'), 'organization\n');
  assert.equal(fs.readFileSync(link, 'utf8'), 'organization\n');
}

// --- spelling review and allowlists -----------------------------------------

{
  const review = write('review.json', JSON.stringify({ spellingReview: true }));
  const file = write('ize.txt', 'The report optimizes results.\n');
  assert.deepEqual(ids(scan(file)), [], 'the -ize review is opt-in');
  assert.deepEqual(ids(scan(file, '--config', review)), ['UE-SP003']);
  assert.equal(scan(file, '--config', review).code, 0, 'notes must not fail the run');
  // Sentence-initial capitals are reviewed like any other occurrence.
  const upper = write('ize-upper.txt', 'Optimize the annexes before publication.\n');
  assert.deepEqual(ids(scan(upper, '--config', review)), ['UE-SP003'],
    'a sentence-initial -ize form must be reviewed too');
  // Words that end in -ize without being spelling variants are never flagged.
  const nonCandidate = write('ize-noncandidate.txt', 'The file size grew. She won a prize for it.\n');
  assert.deepEqual(ids(scan(nonCandidate, '--config', review)), [],
    'size and prize are not -ise candidates');
}
// A qualifier must sit in the count's own sentence: a hedge in the next
// sentence must not cover an unqualified figure.
{
  const cross = write('di001-cross.txt', 'The dashboard covers 127 countries. The total is confirmed.\n');
  assert.deepEqual(ids(scan(cross)), ['UE-DI001'],
    'a qualifier in the following sentence must not excuse the count');
  const same = write('di001-same.txt', 'The survey covered 127 countries in total.\n');
  assert.deepEqual(ids(scan(same)), [], 'a qualifier in the same sentence satisfies the rule');
}
{
  const allowed = write('allowed.json', JSON.stringify({ allowlist: { spellings: ['organization'] } }));
  assert.deepEqual(ids(scan(write('allowed.txt', 'The organization reports.\n'), '--config', allowed)), []);
}

// A single unhedged figure in one clause must not condemn a hedged figure in
// the next.
{
  const clauses = write('clauses.txt', 'Approximately 10 per cent. The other value was 20 per cent.\n');
  assert.deepEqual(ids(scan(clauses)), ['UE-RE003']);
}

// --- profiles ----------------------------------------------------------------

{
  const missing = scan(fixture('positive', 'sp001.txt'), '--profile', 'does-not-exist.json');
  assert.equal(missing.code, 2, 'a missing profile must fail loudly');
  assert.match(missing.stderr, /profile not found/);
}

// Opt-in audits: no audit rule ever runs without being asked for.
{
  const result = scan(fixture('audits', 'publishing-long.html'));
  assert.deepEqual(ids(result), [], 'audits are opt-in');
  assert.equal(result.code, 0);
}
{
  const result = scan(fixture('audits', 'security.mjs'), '--profile', 'security');
  assert.deepEqual(ids(result), ['UE-SE001', 'UE-SE004']);
  assert(result.stdout.includes('"audit": "security"'), 'audit findings must be tagged');
  assert.equal(result.code, 0, 'audits never change the exit code');
  assert.match(capture([fixture('audits', 'security.mjs'), '--profile', 'security']).stdout,
    /OPTIONAL AUDIT — security/);
}
{
  const result = scan(fixture('audits', 'accessibility.html'), '--profile', 'accessibility');
  assert.deepEqual(ids(result), ['UE-AX001', 'UE-AX002']);
  assert.equal(result.code, 0);
}
{
  const result = scan(fixture('audits', 'publishing-missing.html'), '--profile', 'publishing');
  assert.deepEqual(ids(result), ['UE-EO001', 'UE-EO002', 'UE-EO003', 'UE-EO004', 'UE-EO005']);
  const origin = write('origin.json', JSON.stringify({ baseOrigin: 'https://example.test' }));
  const long = scan(fixture('audits', 'publishing-long.html'), '--profile', 'publishing', '--config', origin);
  assert.deepEqual(ids(long), ['UE-EO001', 'UE-EO002', 'UE-EO003', 'UE-EO004', 'UE-EO005']);
}
{
  // Every bundled audit can be requested at once, and still never fails the run.
  const result = scan(fixture('audits', 'publishing-missing.html'),
    '--profile', 'publishing', '--profile', 'accessibility', '--profile', 'security');
  assert(result.stdout.includes('"audit"'));
  assert.equal(result.code, 0);
  assert.deepEqual(ids(scan(fixture('audits', 'security.html'), '--profile', 'security')),
    ['UE-SE002', 'UE-SE003']);
}

// An organisation profile merges over the bundled United Nations baseline.
{
  const profile = write('custom-profile.json', JSON.stringify({
    profileVersion: 1,
    name: 'Custom',
    source: 'fixture',
    spelling: { organization: 'organisation-custom' },
    terminology: { forbidden: [['old term', 'current term']] },
    register: { forbidden: ['bad phrase'] },
  }));
  const file = write('custom.txt', 'The organization, old term and bad phrase are used.\n');
  const result = capture([file, '--format', 'json', '--profile', profile]);
  assert.deepEqual(ids(result), ['UE-RE001', 'UE-SP001', 'UE-TE001']);
  const spelling = json(result).findings.find(finding => finding.ruleId === 'UE-SP001');
  assert.equal(spelling.suggestion, 'Use "organisation-custom".');
}

// A profile must not leak into the next run in the same process.
{
  const profileA = write('profile-a.json', JSON.stringify({
    profileVersion: 1, name: 'A', source: 'fixture', spelling: { organization: 'organisation-custom' },
  }));
  const file = write('leak.txt', 'The organization reports.\n');
  assert.equal(capture([file, '--format', 'json', '--profile', profileA]).code, 1);
  const baseline = scan(file);
  assert.equal(baseline.code, 1);
  assert.equal(json(baseline).findings[0].suggestion, 'Use "organisation".',
    'a profile from an earlier run leaked into the baseline');
}

{
  // Shapes the contested-claims knowledge base must reject: a claim entry is
  // all required fields (the source citation is what makes it reviewable) and
  // patterns may only use the {subject}/{claimant} placeholders with their own
  // literal claim wording between them.
  const claim = (overrides = {}) => ({
    id: 'DP-X', topic: 'Test Region', subjects: ['Test Region'], claimants: ['Testland'],
    patterns: ['{subject} is part of {claimant}'],
    neutral: 'the disputed territory of Test Region',
    unTerminology: 'the question of Test Region',
    source: 'fixture source',
    ...overrides,
  });
  const invalidShapes = [
    {},
    { profileVersion: 1, name: '', source: 'x' },
    { profileVersion: 1, name: 'x', source: 'y', extra: true },
    { profileVersion: 1, name: 'x', source: 'y', spelling: { organization: '' } },
    { profileVersion: 1, name: 'x', source: 'y', spelling: { organization: ['organisation'] } },
    { profileVersion: 1, name: 'x', source: 'y', spelling: { organization: null } },
    { profileVersion: 1, name: 'x', source: 'y', spelling: { bogus: 'x' } },
    { profileVersion: 1, name: 'x', source: 'y', terminology: { unknown: [], forbidden: [['old', '']] } },
    { profileVersion: 1, name: 'x', source: 'y', register: { unknown: [] } },
    { profileVersion: 1, name: 'x', source: 'y', rules: { 'UE-RE003': { enabled: true, extra: true } } },
    { profileVersion: 1, name: 'x', source: 'y', pageUrl: '/relative' },
    { profileVersion: 1, name: 'x', source: 'y', diplomacy: 'nope' },
    { profileVersion: 1, name: 'x', source: 'y', diplomacy: { unknown: [] } },
    { profileVersion: 1, name: 'x', source: 'y', diplomacy: { claims: 'nope' } },
    { profileVersion: 1, name: 'x', source: 'y', diplomacy: { claims: [{}] } },
    { profileVersion: 1, name: 'x', source: 'y', diplomacy: { claims: [claim(), claim()] } },
    { profileVersion: 1, name: 'x', source: 'y', diplomacy: { claims: [claim({ source: '' })] } },
    { profileVersion: 1, name: 'x', source: 'y', diplomacy: { claims: [claim({ neutral: '  ' })] } },
    { profileVersion: 1, name: 'x', source: 'y', diplomacy: { claims: [claim({ subjects: [] })] } },
    { profileVersion: 1, name: 'x', source: 'y', diplomacy: { claims: [claim({ patterns: ['{subject}'] })] } },
    { profileVersion: 1, name: 'x', source: 'y', diplomacy: { claims: [claim({ patterns: ['{subject} is part of {bogus}'] })] } },
    { profileVersion: 1, name: 'x', source: 'y', diplomacy: { claims: [claim({ patterns: [' is part of {claimant}'] })] } },
    { profileVersion: 1, name: 'x', source: 'y', diplomacy: { claims: [claim({ patterns: ['{subject} is part of {claimant}'], claimants: [] })] } },
    { profileVersion: 1, name: 'x', source: 'y', diplomacy: { claims: [claim({ bogus: true })] } },
    { auditVersion: 1, name: 'security', category: 'nope', rules: ['UE-SE001'] },
    { auditVersion: 1, name: 'security', category: 'security', rules: ['UE-NOPE'] },
  ];
  const file = fixture('positive', 'sp001.txt');
  invalidShapes.forEach((shape, index) => {
    const bad = write(`invalid-profile-${index}.json`, JSON.stringify(shape));
    const result = capture([file, '--profile', bad, '--format', 'json']);
    assert.equal(result.code, 2, `expected exit 2 for ${JSON.stringify(shape)}\n${result.stderr}`);
  });
}

// --- contested claims: UE-DP001 -----------------------------------------------

{
  // Every finding carries what is currently written and what should replace
  // it: the two halves of the current-to-should-be report.
  const finding = json(scan(fixture('positive', 'dp001.txt'))).findings[0];
  assert.equal(finding.ruleId, 'UE-DP001');
  assert.equal(finding.current, 'Kashmir is part of India');
  assert.equal(finding.proposed, 'the disputed territory of Jammu and Kashmir');
  assert.equal(finding.severity, 'error');
  assert.match(finding.suggestion, /Security Council resolution 47 \(1948\)/,
    `the finding must cite its source: ${finding.suggestion}`);
}
{
  // Deterministic replacements elsewhere report both halves too.
  const finding = json(scan(fixture('positive', 'sp001.txt'))).findings[0];
  assert.equal(finding.current, 'organization');
  assert.equal(finding.proposed, 'organisation');
}
{
  // A single claim can be opted out of by id without touching the others.
  const file = write('claim-opt.txt', 'Kashmir is part of India.\n');
  assert.deepEqual(ids(scan(file)), ['UE-DP001']);
  const allowed = write('claim-allow.json', JSON.stringify({ allowlist: { claims: ['DP-KASHMIR'] } }));
  assert.deepEqual(ids(scan(file, '--config', allowed)), []);
}
{
  // Downgrading the rule keeps the finding visible but stops it failing the run.
  const file = write('claim-severity.txt', 'Kashmir is part of India.\n');
  const warn = write('claim-severity.json', JSON.stringify({ severities: { 'UE-DP001': 'warning' } }));
  const result = scan(file, '--config', warn);
  assert.deepEqual(ids(result), ['UE-DP001']);
  assert.equal(json(result).findings[0].severity, 'warning',
    'a config severity override must reach the finding as a plain severity');
  assert.equal(result.code, 0, 'a downgraded claim must not fail the run');
}
{
  // ue:ignore suppresses the rule in its copy span like any other.
  const file = write('claim-ignore.md', 'Kashmir is part of India. <!-- ue:ignore UE-DP001 -->\n');
  assert.deepEqual(ids(scan(file)), []);
}
{
  // An organisation profile adds a claim the baseline does not know and
  // replaces the baseline entry it names.
  const profile = write('claims-profile.json', JSON.stringify({
    profileVersion: 1, name: 'Claims', source: 'fixture',
    diplomacy: {
      claims: [
        {
          id: 'DP-TESTREGION', topic: 'Test Region',
          subjects: ['Test Region'], claimants: ['Testland'],
          patterns: ['{subject} is part of {claimant}'],
          neutral: 'the disputed territory of Test Region',
          unTerminology: 'the question of Test Region',
          source: 'fixture source',
        },
        {
          id: 'DP-KASHMIR', topic: 'Jammu and Kashmir',
          subjects: ['Kashmir'], claimants: ['India'],
          patterns: ['{subject} is sovereign territory of {claimant}'],
          neutral: 'the disputed territory of Jammu and Kashmir',
          unTerminology: 'the question of Jammu and Kashmir',
          source: 'fixture source',
        },
      ],
    },
  }));
  const added = write('claim-added.txt', 'Test Region is part of Testland.\n');
  assert.deepEqual(ids(scan(added)), [], 'the baseline does not know this claim');
  assert.deepEqual(ids(scan(added, '--profile', profile)), ['UE-DP001']);
  const replaced = write('claim-replaced.txt', 'Kashmir is part of India.\n');
  assert.deepEqual(ids(scan(replaced, '--profile', profile)), [],
    'an organisation claim replaces the baseline entry with the same id');
}

// --- configuration validation ------------------------------------------------

const configErrors = [
  [{ baseOrigin: 'ftp://example.test' }, /baseOrigin must be an absolute http\(s\) URL/i],
  [{ baseOrigin: 'javascript:alert(1)' }, /baseOrigin must be an absolute http\(s\) URL/i],
  [{ baseOrigin: '/relative' }, /baseOrigin must be an absolute URL/i],
  [{ baseOrigin: null, spellingReview: 'false' }, /spellingReview must be a boolean/i],
  [{ allowlist: [] }, /allowlist must be an object/i],
  [{ allowlist: { spellings: 'organization' } }, /allowlist\.spellings must be an array/i],
  [{ allowlist: { claims: 'DP-KASHMIR' } }, /allowlist\.claims must be an array/i],
  [{ rules: [] }, /rules must be an object/i],
  [{ severities: 'error' }, /severities must be an object/i],
  [{ severities: { 'UE-NOPE': 'error' } }, /severities contains unknown rule/i],
  [{ unknownSetting: true }, /unknown fields: unknownSetting/],
  [{ ignoredPaths: 'dist' }, /ignoredPaths must be an array/i],
  [{ renderTargets: ['has space'] }, /must be an identifier/i],
];
for (const [settings, pattern] of configErrors) {
  const file = write(`invalid-config-${Math.random().toString(36).slice(2)}.json`, JSON.stringify(settings));
  const result = capture(['--config', file]);
  assert.equal(result.code, 2, `${JSON.stringify(settings)}: ${result.stderr}`);
  assert.match(result.stderr, pattern, `${JSON.stringify(settings)} -> ${result.stderr}`);
}
{
  const malformed = write('malformed.json', '{');
  assert.equal(capture(['--config', malformed]).code, 2);
}
{
  // JSON.parse keeps only the last duplicate value, so the parsed tree can
  // never show a duplicate — fail-closed rejection has to read the raw text.
  const dup = write('dup-keys.json', '{"spellingReview": false, "spellingReview": true}');
  const result = capture(['--config', dup]);
  assert.equal(result.code, 2, 'a duplicate-key config must fail closed');
  assert.match(result.stderr, /duplicate keys: spellingReview/);
  assert.throws(() => parseJsonStrict('{"a": {"x": 1, "x": 2}}', 'nested.json'),
    /duplicate keys: x/, 'a nested duplicate must be rejected too');
  // Strings that merely contain separators are values, not keys.
  assert.deepEqual(parseJsonStrict('{"a": "key: {value}", "b": [1, 2]}', 'ok.json'),
    { a: 'key: {value}', b: [1, 2] });
}

// --- ignored paths and directory walking -------------------------------------

{
  write('ignore/node_modules/a.txt', 'organization\n');
  write('ignore/node_modules-copy/a.txt', 'organization\n');
  write('ignore/.hidden/a.txt', 'organization\n');
  const cfg = write('ignore-config.json', JSON.stringify({ ignoredPaths: ['node_modules/**'] }));
  const result = capture([path.join(tmp, 'ignore'), '--format', 'json', '--config', cfg]);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.findings.map(f => f.file.replace(/\\/g, '/').split('/').slice(-3).join('/')),
    ['ignore/node_modules-copy/a.txt'],
    `only the sibling directory must be scanned: ${result.stdout}`);
  assert.equal(parsed.files, 1, 'node_modules and hidden directories must be skipped');
}

// A directory scan never picks up files the extractor cannot read.
{
  const dir = path.join(tmp, 'extensions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'style.css'), 'organization\n');
  fs.writeFileSync(path.join(dir, 'data.json'), '{"label":"organization"}\n');
  fs.writeFileSync(path.join(dir, 'page.txt'), 'organization\n');
  const parsed = JSON.parse(capture([dir, '--format', 'json']).stdout);
  assert.equal(parsed.files, 1, `only the .txt file is extractable: ${JSON.stringify(parsed)}`);
  assert.deepEqual([...new Set(parsed.findings.map(f => f.ruleId))], ['UE-SP001']);
}

// --- output ------------------------------------------------------------------

{
  const result = capture([fixture('positive', 're002.js')]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /AGENT REVIEW REQUIRED \(\d+\)/);
}
{
  const result = capture([fixture('positive', 'nu002.txt')]);
  assert.match(result.stdout, /EDITORIAL WARNINGS \(1\)/);
  assert.doesNotMatch(result.stdout, /EDITORIAL ERRORS/);
}
{
  const result = capture([fixture('positive', 'sp001.txt')]);
  assert.match(result.stdout, /EDITORIAL ERRORS \(1\)/);
  assert.match(result.stdout, /un-editorial-check \d+\.\d+\.\d+/);
}
{
  const clean = capture([write('clean-out.txt', 'The organisation reports the figure.\n')]);
  assert.match(clean.stdout, /No editorial findings\./);
}

// Internal bookkeeping never reaches a consumer.
for (const format of ['json', 'sarif']) {
  const parsed = JSON.parse(capture([fixture('positive', 'sp001.txt'), '--format', format]).stdout);
  const text = JSON.stringify(parsed);
  for (const internal of ['_unit', '_index', '_matched', '_offset', '_replacement']) {
    assert(!text.includes(`"${internal}"`), `${internal} leaked into ${format} output`);
  }
  assert.equal(format === 'json' ? 'findings' in parsed : 'runs' in parsed, true);
}

{
  const jsonReport = json(capture([fixture('positive', 'sp001.txt'), '--format', 'json']));
  const sarif = json(capture([fixture('positive', 'sp001.txt'), '--format', 'sarif']));
  assert.equal(sarif.runs[0].tool.driver.version, jsonReport.version);
  assert(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine >= 1);
  assert.equal(sarif.runs[0].results[0].properties.scope, 'user-visible-copy');
}

// Control characters in file names and content are escaped, never emitted raw.
{
  const controls = 'A\x0B B\x7F C\n';
  const file = write(`ctl ${String.fromCharCode(27)} name.txt`, `The organization ${controls}\n`); // ue:ignore UE-SP001  (deliberate test data)
  const result = capture([file]);
  assert.equal(result.code, 1);
  // The report may contain line breaks, nothing else.
  assert.doesNotMatch(result.stdout, /[\x00-\x08\x0b-\x1f\x7f]/);
  assert(result.stdout.includes('\\u001b') || result.stdout.includes('\\x1b'),
    `missing escaped ESC in: ${result.stdout}`);
}
{
  const dirty = write('dirty.txt', 'The US uses boom and organization.​‮');
  for (const format of ['json', 'sarif']) {
    const result = capture([dirty, '--format', format]);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
    assert.doesNotMatch(result.stdout, /[​‮]/);
  }
}

// Entity decoding must not distort a rendered-length audit.
{
  const source = '<!doctype html><html lang="en"><head><title>One &amp; two</title>'
    + `<meta name="description" content="${'A&amp;B '.repeat(40)}">`
    + '<link rel="canonical" href="https://example.test/page">'
    + '<meta property="og:title" content="Title"><meta name="twitter:card" content="summary"></head>'
    + '<body><h1>Page</h1></body></html>';
  const result = scan(write('encoded.html', source), '--profile', 'publishing');
  assert(!ids(result).includes('UE-EO002'), `decoded length must be measured: ${result.stdout}`);
}

// --- configuration discovery -------------------------------------------------

{
  // A project .un-editorial.json is picked up from the working directory.
  const project = path.join(tmp, 'project');
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, 'page.txt'), 'The organization reports.\n');
  fs.writeFileSync(path.join(project, '.un-editorial.json'),
    JSON.stringify({ allowlist: { spellings: ['organization'] } }));
  const result = spawnSync(process.execPath, [cli, 'page.txt', '--format', 'json'], {
    cwd: project, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).findings, [],
    '.un-editorial.json must be honoured from the working directory');
}

// --- CLI surface -------------------------------------------------------------

{
  const version = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout.trim(), /^un-editorial-check \d+\.\d+\.\d+$/);
  const reported = json(capture([fixture('positive', 'sp001.txt'), '--format', 'json'])).version;
  assert.equal(version.stdout.trim(), `un-editorial-check ${reported}`,
    '--version and the report must agree');

  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--fix/);
  assert.match(help.stdout, /--profile/);
  assert.match(help.stdout, /EXIT CODES/);
}

// --- packaging --------------------------------------------------------------

{
  const pack = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(pack.status, 0, pack.stderr);
  const files = JSON.parse(pack.stdout)[0].files.map(entry => entry.path);
  for (const required of ['lib/cli.mjs', 'lib/units.mjs', 'config/default.json',
    'config/profiles/un-v1.json', 'rules/catalogue.json', 'bin/check.mjs', 'SKILL.md', 'VERSION']) {
    assert(files.includes(required), `npm pack must include ${required}`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const reported = json(capture([fixture('positive', 'sp001.txt'), '--format', 'json'])).version;
  assert.equal(pkg.version, reported, 'the report version must match package.json');
  assert.equal(fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim(), reported,
    'VERSION must match package.json');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok — corpus, exit codes, positions, suppressions, fixes, profiles, config, output, packaging');
