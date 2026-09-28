// un-editorial-check — Wave 3 lane contract suite (PHASE-6-PLAN, row B).
//
// The contract under test, verbatim from the plan: five output lanes
// (deterministic / heuristic review / harmful-discriminatory review /
// diplomatic sensitivity / audits) each carrying rule source, profile,
// confidence, limitation and recommended human action; heuristic default
// severity flip; expanded protected characteristics and "discriminatory or
// demeaning" high-severity human review, never auto-rewrite; quoted material
// reported separately; diplomacy KB variant/negation/incomplete-assertion
// coverage with the v8 web-corpus P0/P1 fixtures; PDF and --format JSON/SARIF
// reflect the lanes.
//
// Fixtures are copied out of the repository before use: the scanner never
// reads files inside its own skill root unless --self-scan is given. Every
// rendered output collected here is swept at the end for the banned phrases
// ("UN approved", "fully compliant", "finds all errors", "factual
// verification", "legal advice").

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../bin/check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'un-editorial-lanes-'));

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

const rendered = [];
const capture = (argv, configPath = config) => {
  const out = [];
  const err = [];
  const args = argv.includes('--config') ? argv : [...argv, '--config', configPath];
  const code = run(args, {
    log: line => out.push(String(line)),
    error: line => err.push(String(line)),
  });
  const result = { code, stdout: out.join('\n'), stderr: err.join('\n') };
  rendered.push(result.stdout, result.stderr);
  return result;
};
const json = result => {
  try { return JSON.parse(result.stdout); }
  catch { return assert.fail(`stdout is not JSON:\n${result.stdout}\n${result.stderr}`); }
};
const scan = (file, ...extra) => capture([file, '--format', 'json', ...extra]);

const LANE_NAMES = ['deterministic', 'heuristic-review', 'harmful-discriminatory', 'diplomacy', 'audit'];
const METADATA = ['lane', 'context', 'source', 'profile', 'confidence', 'limitation', 'action'];

// --- 1: every finding carries its lane metadata in JSON ----------------------

for (const [label, argv] of [
  ['v8 P1 demeaning', [fixture('lanes', 'web-p1-demeaning.txt')]],
  ['v8 P1 diplomacy claims', [fixture('lanes', 'web-p1-diplomacy-claims.txt')]],
  ['dm001 discriminating copy', [fixture('positive', 'dm001-demeaning.txt')]],
  ['heuristic collective blame', [fixture('positive', 'hs002-collective-blame.txt')]],
  ['opt-in audit', [fixture('audits', 'accessibility.html'), '--profile', 'accessibility']],
]) {
  const parsed = json(scan(...argv));
  assert.ok(parsed.findings.length > 0, `${label} must produce findings`);
  assert.deepEqual(Object.keys(parsed.lanes).sort(), [...LANE_NAMES, 'quoted'].sort(),
    `${label}: the lanes summary names all five lanes plus quoted`);
  for (const finding of parsed.findings) {
    for (const field of METADATA) {
      assert.equal(typeof finding[field], 'string',
        `${label}: ${finding.ruleId} carries a string ${field}`);
      assert(finding[field].length > 0, `${label}: ${finding.ruleId} ${field} is not empty`);
    }
    assert(LANE_NAMES.includes(finding.lane),
      `${label}: ${finding.ruleId} lane "${finding.lane}" is one of the five lanes`);
  }
}

// --- 2: harmful-discriminatory lane — high-severity review, never auto-rewrite

{
  const demeaningRun = scan(fixture('lanes', 'web-p1-demeaning.txt'));
  const demeaning = json(demeaningRun);
  assert.equal(demeaningRun.code, 1, 'demeaning wording is an error: the run fails');
  assert.deepEqual(demeaning.lanes, {
    deterministic: 0, 'heuristic-review': 0, 'harmful-discriminatory': 2,
    diplomacy: 0, audit: 0, quoted: 0,
  }, 'the v8 P1 demeaning fixture lands entirely in the harmful-discriminatory lane');
  for (const finding of demeaning.findings) {
    assert.equal(finding.ruleId, 'UE-DM001');
    assert.equal(finding.lane, 'harmful-discriminatory');
    assert.equal(finding.severity, 'error');
    assert.match(finding.action, /High-severity human review/,
      'the recommended action is high-severity human review');
    assert.match(finding.limitation, /never rewritten automatically/,
      'the limitation records that the text is never rewritten automatically');
  }

  // Never auto-rewrite, proven through the full --fix pipeline: a file whose
  // only findings are discriminatory leaves the run byte-identical.
  const target = write('dm-fix.txt', fs.readFileSync(fixture('lanes', 'web-p1-demeaning.txt'), 'utf8'));
  const before = fs.readFileSync(target, 'utf8');
  const applied = capture([target, '--fix', '--apply']);
  assert.equal(fs.readFileSync(target, 'utf8'), before,
    'discriminatory wording must survive --fix --apply unchanged');
  assert.equal(applied.code, 1, 'the errors still fail the run after a refused fix');

  // The DM001 corpus fixture: three detections, all in the safety lane.
  const corpusRun = scan(fixture('positive', 'dm001-demeaning.txt'));
  const corpus = json(corpusRun);
  assert.equal(corpusRun.code, 1);
  assert.deepEqual(corpus.findings.map(f => f.ruleId), ['UE-DM001', 'UE-DM001', 'UE-DM001']);
  assert.equal(corpus.lanes['harmful-discriminatory'], 3);
}

// --- 3: diplomacy lane — advisory, attributed, never a truth verdict ----------

{
  const claimsRun = scan(fixture('lanes', 'web-p1-diplomacy-claims.txt'));
  const claims = json(claimsRun);
  assert.equal(claimsRun.code, 0, 'a diplomatic sensitivity is advisory and never fails the run');
  assert.equal(claims.lanes.diplomacy, 3, 'the v8 P1 claims fixture fires three variants');
  assert.deepEqual(claims.findings.map(f => f.line), [1, 3, 4],
    'the attributed claim on line 2 stays silent: the attribution guard holds for variants');
  for (const finding of claims.findings) {
    assert.equal(finding.ruleId, 'UE-DP001');
    assert.equal(finding.lane, 'diplomacy');
    assert.equal(finding.severity, 'warning');
    assert.match(finding.action, /Requires diplomatic review/,
      'the recommended action routes to diplomatic review');
    assert.match(finding.limitation, /never decides whose claim is correct/,
      'the limitation refuses a factual verdict');
    assert(!/\b(false|untrue|incorrect|wrong|lie)\b/i.test(finding.message),
      `the message never declares the claim false: ${finding.message}`);
  }

  // The baseline claim fixture: eight warning-severity findings, exit 0.
  const baselineRun = scan(fixture('positive', 'dp001.txt'));
  const baseline = json(baselineRun);
  assert.equal(baselineRun.code, 0, 'the contested-claims fixture is a warning corpus');
  assert.equal(baseline.lanes.diplomacy, baseline.findings.length);
  for (const finding of baseline.findings) assert.equal(finding.severity, 'warning');
}

// --- 3b: web/04 P0 — pinned detections, recorded limitation -------------------

{
  // `.feedbacks/v8/html-editor-feedback-skipped-by-skill.md` lines 30-35 raise
  // a P0 in `web/04-letter-permanent-representation.html`: the incoherent
  // heading "Dash Country is a terrioust Country" and a truncated paragraph
  // attributing a statement to a named public official. The fixture is a
  // verbatim copy of that file (QA finding F3: it had no fixture at all).
  // Two things are pinned here, and they must not be confused with each
  // other:
  //   * the seven findings the scan does produce today — five UE-SP001 -ize
  //     conflicts and two UE-RE002 ranking claims, at their exact lines —
  //     may not regress silently;
  //   * the P0 block itself (heading line 31, attributed paragraph lines
  //     33-35) produces nothing, and that gap is a documented limitation,
  //     not coverage: catching `terrioust` needs a dictionary spell-checker
  //     (forbidden by the zero npm dependencies rule), and adjudicating an
  //     attributed political statement is out of scope for the default
  //     editorial scan by the editor feedback's own classification. Row 28
  //     of docs/CLAIM-EVIDENCE-AUDIT.md records the limitation.
  const p0Run = scan(fixture('lanes', 'web-p0-incoherent-insertion.html'));
  const p0 = json(p0Run);
  assert.equal(p0Run.code, 0, 'every finding on web/04 is a warning: the run exits 0');
  assert.deepEqual(p0.lanes, {
    deterministic: 5, 'heuristic-review': 2, 'harmful-discriminatory': 0,
    diplomacy: 0, audit: 0, quoted: 0,
  }, 'web/04 currently yields five deterministic and two heuristic findings, and nothing else');

  const sp001 = p0.findings.filter(f => f.ruleId === 'UE-SP001');
  const re002 = p0.findings.filter(f => f.ruleId === 'UE-RE002');
  assert.equal(sp001.length, 5, 'UE-SP001 x5 (the -ize conflict family) must not regress');
  assert.equal(re002.length, 2, 'UE-RE002 x2 (ranking claims) must not regress');
  assert.deepEqual(sp001.map(f => f.line), [27, 43, 51, 79, 86],
    'the -ize conflicts keep their positions');
  assert.deepEqual(re002.map(f => f.line), [78, 108],
    'the ranking claims keep their positions');
  for (const finding of p0.findings) {
    assert.equal(finding.severity, 'warning', `${finding.ruleId} stays warning severity`);
    assert.equal(finding.lane, finding.ruleId === 'UE-SP001' ? 'deterministic' : 'heuristic-review');
    assert.notEqual(finding.lane, 'diplomacy', 'the attributed statement is not adjudicated here');
    assert.notEqual(finding.lane, 'harmful-discriminatory', 'the P0 block fires no safety rule');
  }

  // The recorded gap: nothing lands on the P0 block lines. If a future rule
  // starts detecting them, this assertion fails and the limitation row must
  // be re-stated — the gap is documented, never assumed.
  const onP0Block = p0.findings.filter(f => f.line >= 31 && f.line <= 35);
  assert.deepEqual(onP0Block, [],
    'nothing on the P0 block lines is detected today — the documented limitation');
}

// --- 4: text output — lane sections, lane counts, never masquerading ---------

{
  const claimsText = capture([fixture('lanes', 'web-p1-diplomacy-claims.txt')]).stdout;
  assert.match(claimsText,
    /^lanes: deterministic 0 · heuristic-review 0 · harmful-discriminatory 0 · diplomacy 3 · audit 0 · quoted 0$/m,
    'the header names all five lanes plus quoted with their counts');
  assert.match(claimsText, /DIPLOMATIC SENSITIVITY \(3\)/);
  assert(!claimsText.includes('EDITORIAL ERRORS'),
    'a diplomatic sensitivity never masquerades as an editorial error');

  const demeaningText = capture([fixture('lanes', 'web-p1-demeaning.txt')]).stdout;
  assert.match(demeaningText, /HARMFUL-DISCRIMINATORY REVIEW \(2\)/);
  assert.match(demeaningText, /^lanes: .*harmful-discriminatory 2/m);
  assert(!demeaningText.includes('EDITORIAL ERRORS'),
    'discriminatory findings never masquerade as editorial errors');

  // An empty scan has no lane line to route: the locked empty wording stands.
  const clean = capture([write('clean.txt', 'The organisation reports the figure.\n')]).stdout;
  assert.match(clean, /No findings under the enabled, documented local rules\./);
  assert(!clean.includes('lanes:'), 'no lane line on an empty scan');
}

// --- 5: heuristic default severity flip --------------------------------------

{
  // A heuristic judgement never fails the run and is routed to human review:
  // UE-HS002 (heuristic confidence) is a warning in the safety lane, and
  // UE-RE002 (heuristic) lands in the heuristic-review lane.
  const blameRun = scan(fixture('positive', 'hs002-collective-blame.txt'));
  const blame = json(blameRun);
  assert.equal(blameRun.code, 0, 'a heuristic judgement never fails the run');
  assert(blame.findings.length > 0);
  for (const finding of blame.findings) {
    assert.equal(finding.confidence, 'heuristic');
    assert.equal(finding.severity, 'warning', 'heuristic checks are not error-severity by default');
    assert.equal(finding.lane, 'harmful-discriminatory',
      'the safety category wins over heuristic confidence');
  }

  const heuristicRun = scan(fixture('positive', 're002.js'));
  const heuristic = json(heuristicRun);
  assert.equal(heuristicRun.code, 0);
  for (const finding of heuristic.findings) {
    assert.equal(finding.confidence, 'heuristic');
    assert.notEqual(finding.severity, 'error', 'no heuristic check is error-severity by default');
    assert.equal(finding.lane, 'heuristic-review');
    assert.match(finding.action, /review/i, 'the action routes the reader to review');
  }
  const heuristicText = capture([fixture('positive', 're002.js')]).stdout;
  assert.match(heuristicText, /AGENT REVIEW REQUIRED \(\d+\)/,
    'heuristic findings render in their own section');
}

// --- 6: audit lane -----------------------------------------------------------

{
  const auditedRun = scan(fixture('audits', 'accessibility.html'), '--profile', 'accessibility');
  const audited = json(auditedRun);
  assert.equal(auditedRun.code, 0, 'audits never change the exit code');
  assert(audited.findings.length > 0, 'the accessibility profile produces findings');
  for (const finding of audited.findings) {
    assert.equal(finding.lane, 'audit');
    assert.equal(finding.source, 'config/profiles/accessibility.json',
      'an audit finding is sourced to its profile file');
    assert.equal(finding.profile, 'accessibility');
  }
  const text = capture([fixture('audits', 'accessibility.html'), '--profile', 'accessibility']).stdout;
  assert.match(text, /OPTIONAL AUDIT — accessibility/);
}

// --- 7: SARIF carries the lanes ---------------------------------------------

{
  const sarif = json(capture([fixture('lanes', 'web-p1-demeaning.txt'), '--format', 'sarif']));
  assert.equal(sarif.version, '2.1.0');
  const run0 = sarif.runs[0];
  assert.equal(run0.results.length, 2);
  for (const rule of run0.tool.driver.rules) {
    for (const field of ['lane', 'source', 'profile', 'limitation', 'action']) {
      assert.equal(typeof rule.properties[field], 'string',
        `SARIF rule descriptor carries ${field}`);
    }
    assert(LANE_NAMES.includes(rule.properties.lane));
  }
  for (const result of run0.results) {
    for (const field of METADATA) {
      assert.equal(typeof result.properties[field], 'string',
        `SARIF result carries ${field}`);
    }
    assert.equal(result.properties.lane, 'harmful-discriminatory');
  }
}

// --- 8: the PDF reflects the lanes ------------------------------------------

const PDF_LINE_RE = /\/(F[123]) ([0-9.]+) Tf ([0-9.-]+) ([0-9.-]+) Td \(((?:\\[\s\S]|[^\\()])*)\) Tj/g;
const pdfLines = buffer => [...buffer.toString('latin1').matchAll(PDF_LINE_RE)]
  .map(m => m[5].replace(/\\([()\\])/g, '$1'));

{
  const pdfPath = path.join(tmp, 'lanes.pdf');
  const reported = capture([fixture('lanes', 'web-p1-demeaning.txt'), '--report', pdfPath]);
  assert.equal(reported.code, 1, '--report does not change the failing exit code');
  const lines = pdfLines(fs.readFileSync(pdfPath));
  assert(lines.length > 0, 'the report draws text');
  const joined = lines.join(' ');
  assert.match(joined, /harmful-discriminatory 2/,
    'the PDF carries the lane counts paragraph');
  assert.match(joined, /Lane harmful-discriminatory/,
    'the PDF finding block opens its lane rows with the lane');
  assert.match(joined, /Action High-severity human review/,
    'the PDF finding block carries the recommended human action');
  assert.match(joined, /Source rules\/hate-speech\.md/,
    'the PDF finding block carries the rule source');
  assert.match(joined, /Limitation Wording flagged for high-severity human review/,
    'the PDF finding block carries the limitation');
}

// --- 9: quoted material is a context, not a lane ----------------------------

// Quoted spans are masked by extraction (a quotation is never scanned as the
// author's copy), so a scan over quoted content reports only the authored
// findings — and the report layer's quoted routing for an explicit
// `finding.context` is pinned in tests/report-model.mjs. Here: the CLI always
// annotates context, and quoting never deletes authored findings.
{
  const file = write('quoted.md',
    'Coverage was 1990-2025.\n\n"Coverage was 1990-2025," she said.\n');
  const parsed = json(scan(file));
  assert.equal(parsed.lanes.quoted, 0, 'a masked quotation produces no phantom finding');
  for (const finding of parsed.findings) {
    assert.equal(typeof finding.context, 'string', 'every CLI finding carries a context');
    assert.equal(finding.context, 'authored', 'authored copy is not quoted context');
    assert.equal(finding.line, 1, 'the authored line still reports');
  }
}

// --- 10: banned-phrase sweep over every rendered output ----------------------

const BANNED = /UN approved|fully compliant|finds all errors|factual verification|legal advice/i;
for (const output of rendered) {
  assert(!BANNED.test(output), `banned phrase in rendered output:\n${output}`);
}

console.log('ok — lanes: metadata, safety lane, diplomacy lane, sections, heuristic flip, '
  + 'audit lane, SARIF, PDF, quoted context, banned phrases');
