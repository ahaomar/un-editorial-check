// Wave W3 audit: the report / PDF / fixer promises that had no lock.
//
//   Item 1 — the PDF must show a real en dash: UE-NU002's defect IS the dash,
//            so `Current` (hyphen) and `Should be` (en dash) must not print
//            identically; WinAnsi encodes en dash at 0x96 and em dash at 0x97.
//            Determinism, the magic, the trailer and the every-page footer are
//            re-locked here for the real --report output, not just synthetic
//            elements.
//   Item 4 — --fix must not leave a sentence starting in lower case: a
//            replacement that lands at a sentence start is capitalised, a
//            mid-sentence replacement keeps its lower case, and the existing
//            case-preservation is untouched. The fixed file re-scans clean.
//   Item 5 — README's "A fix is skipped, never guessed": a finding whose
//            reported offset does not hold the matched copy produces no plan,
//            no write and no exception.
//
// (Items 2 and 3 — the placeholder and the queue excerpt — are locked in
// tests/report-model.mjs, where their model assertions already live.)
//
// TDD: this file was written before the fixes. Standalone run:
//   node tests/audit-report-fix.mjs
// Only node:assert, the modules under test and the in-process CLI are used;
// every fixture lives in a fresh mkdtemp directory under os.tmpdir().

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../bin/check.mjs';
import { planFixes, writeSafely } from '../lib/fix.mjs';
import { renderPdf } from '../lib/pdf.mjs';

// --- harness ----------------------------------------------------------------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'un-editorial-audit-'));
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

const scanIds = (file) => {
  const result = capture([file, '--format', 'json']);
  assert.notEqual(result.code, 2, `scan failed for ${file}: ${result.stderr}`);
  return JSON.parse(result.stdout).findings.map(f => f.ruleId).sort();
};

// Text extraction from the uncompressed Tj operands — the same latin1-read
// technique the audit used, mirroring tests/pdf-structural.mjs.
const LINE_RE = /\/(F[123]) ([0-9.]+) Tf ([0-9.-]+) ([0-9.-]+) Td \(((?:\\[\s\S]|[^\\()])*)\) Tj/g;

function extractLines(pdf) {
  const out = [];
  for (const m of pdf.toString('latin1').matchAll(LINE_RE)) {
    out.push({
      font: m[1],
      size: Number(m[2]),
      x: Number(m[3]),
      y: Number(m[4]),
      text: m[5].replace(/\\([()\\])/g, '$1'),
    });
  }
  return out;
}

// The kv label sits at x=54 (bold), its value at x=54+84=138 (regular).
function kvValue(lines, label) {
  const i = lines.findIndex(l => l.text === label && l.x === 54 && l.font === 'F2');
  assert(i >= 0, `missing kv label: ${label}`);
  const value = lines[i + 1];
  assert(value && value.x === 138 && value.font === 'F1',
    `missing kv value row after ${label}: ${JSON.stringify(lines[i + 1])}`);
  return value.text;
}

// --- item 1: the PDF shows a real en dash for UE-NU002 -----------------------

{
  const target = write('nu002.txt', 'Coverage was 1990-2025.\n');
  assert.deepEqual(scanIds(target), ['UE-NU002'], 'the fixture fires exactly UE-NU002');

  const pdfA = path.join(tmp, 'a.pdf');
  const pdfB = path.join(tmp, 'b.pdf');
  const first = capture([target, '--report', pdfA]);
  assert.equal(first.code, 0, `a warning-only file must exit 0: ${first.stderr}`);
  const second = capture([target, '--report', pdfB]);
  assert.equal(second.code, 0, `second run must exit 0: ${second.stderr}`);

  const a = fs.readFileSync(pdfA);
  const b = fs.readFileSync(pdfB);
  assert.equal(Buffer.compare(a, b), 0, 'the same input twice must yield a byte-identical PDF');

  const s = a.toString('latin1');
  assert(s.startsWith('%PDF-1.4\n'), 'the report starts with the PDF 1.4 magic');
  assert(s.endsWith('%%EOF\n'), 'the report ends with the %%EOF trailer');
  assert(s.includes('report only; findings are not changed by this report.'),
    'every report carries the report-only footer promise');

  // Every page object carries its own n/m footer stamp.
  const pageCount = (s.match(/\/Type \/Page(?!s)/g) || []).length;
  assert(pageCount >= 1, 'at least one page object');
  const footers = [...s.matchAll(/- page (\d+)\/(\d+) -/g)].map(m => [Number(m[1]), Number(m[2])]);
  assert.equal(footers.length, pageCount, 'one page n/m footer per page object');
  footers.forEach(([n, total], i) => {
    assert.equal(n, i + 1, `footer ${i + 1} prints its own page number`);
    assert.equal(total, pageCount, 'footer total equals the page count');
  });

  // The defect: NU002's Current is a plain hyphen, its Should be an en dash.
  // Both halves must reach the page, and the en dash must be byte 0x96.
  const lines = extractLines(a);
  const current = kvValue(lines, 'Current');
  const should = kvValue(lines, 'Should be');
  assert(current.includes('1990-2025'), `Current must print the hyphen range: ${JSON.stringify(current)}`);
  assert(!current.includes('\u0096'), 'Current holds no en dash byte');
  assert(should.includes('1990\u00962025'),
    'Should be must carry the WinAnsi en dash at 0x96: ' + JSON.stringify(should));
  assert(should !== current,
    'Current and Should be must not print identically: ' + JSON.stringify({ current, should }));
}

// --- item 1b: em dash at 0x97, every other fold unchanged --------------------

{
  const pdf = renderPdf([{ type: 'paragraph', text: 'Range 2020—2021, “quoted”, it’s… and Ω stays.' }]);
  const text = extractLines(pdf).map(l => l.text).join('\n');
  assert(text.includes('2020\u00972021'),
    'the em dash keeps its WinAnsi byte 0x97: ' + JSON.stringify(text));
  assert(text.includes('"quoted"'), 'curly double quotes still fold to ASCII');
  assert(text.includes("it's"), 'the curly apostrophe still folds to ASCII');
  assert(text.includes('...'), 'the ellipsis still folds to three dots');
  assert(text.includes('and ? stays.'), 'a character outside WinAnsi still becomes ?');
}

// --- item 4: sentence-start capitalisation in the fixer ----------------------

const applyFix = (name, body) => {
  const file = write(name, body);
  const beforeIds = scanIds(file);
  const result = capture([file, '--fix', '--apply']);
  assert.equal(result.code, 0, `${name}: --fix --apply must succeed: ${result.stderr}`);
  const after = fs.readFileSync(file, 'utf8');
  const afterIds = scanIds(file);
  for (const id of afterIds) {
    assert(beforeIds.includes(id),
      `${name}: the rewrite raised a new finding ${id} (before: ${beforeIds.join(',') || 'none'})`);
  }
  return after;
};

{
  // The reported corruption defect: `. US` fixed to `. the United States`.
  assert.equal(
    applyFix('cap-sentence.txt', 'The report lands here. US reported gains for the region.\n'),
    'The report lands here. The United States reported gains for the region.\n',
    'a replacement at a sentence start must be capitalised',
  );
  // Mid-sentence stays lower case.
  assert.equal(
    applyFix('cap-mid.txt', 'Gains from US were reported.\n'),
    'Gains from the United States were reported.\n',
    'a mid-sentence replacement must keep its lower case',
  );
  // Start of line is a sentence start too.
  assert.equal(
    applyFix('cap-line.txt', 'US reported gains for the region.\n'),
    'The United States reported gains for the region.\n',
    'a replacement at the start of a line must be capitalised',
  );
  // Sentence-initial SP001: case-preservation already produces the capital.
  assert.equal(
    applyFix('cap-sp001.txt', 'Organization is key.\n'),
    'Organisation is key.\n',
    'a sentence-initial Organization stays grammatical after the fix',
  );
  // Whole-word upper-case preservation is untouched by the mechanism.
  assert.equal(
    applyFix('cap-upper.txt', 'ORGANIZATION is key here.\n'),
    'ORGANISATION is key here.\n',
    'ORGANIZATION still maps to ORGANISATION',
  );

  // No fixed file may start a sentence in lower case, and the reported
  // corruption must be gone after a re-scan.
  for (const name of ['cap-sentence.txt', 'cap-mid.txt', 'cap-line.txt',
    'cap-sp001.txt', 'cap-upper.txt']) {
    const text = fs.readFileSync(path.join(tmp, name), 'utf8');
    assert(!/\.\s+[a-z]/.test(text), `${name}: lower case survives after a full stop: ${text}`);
  }
  assert.deepEqual(scanIds(path.join(tmp, 'cap-sentence.txt')), [],
    'the fixed sentence carries no finding at all on re-scan');
}

// --- item 5: the offset-mismatch skip path (README:346) ---------------------

{
  const file = write('mismatch.md', 'The organization reports the figure.\n');
  const source = fs.readFileSync(file, 'utf8');
  const sources = new Map([[file, source]]);
  assert.equal(source.indexOf('organization'), 4, 'fixture: the match sits at offset 4');

  const finding = (overrides = {}) => ({
    file,
    line: 1,
    column: 5,
    ruleId: 'UE-SP001',
    category: 'spelling',
    severity: 'error',
    confidence: 'deterministic',
    scope: 'user-visible-copy',
    message: 'American spelling "organization" in prose.',
    suggestion: 'Use "organisation".',
    current: 'organization',
    proposed: 'organisation',
    // A mapped unit: resolveSpan may only fix where the map points.
    _unit: { map: Array.from({ length: source.length }, (_, i) => i), offset: 0, raw: source },
    _index: 0,
    _matched: 'organization',
    _offset: 4,
    _replacement: 'organisation',
    ...overrides,
  });

  // Control: the offset that holds the match is fixable — proof the setup is
  // not trivially skipping every finding.
  const controlPlans = planFixes([finding()], sources);
  assert.equal(controlPlans.length, 1, 'control: an anchored match produces exactly one plan');
  assert.equal(controlPlans[0].after, 'The organisation reports the figure.\n');

  // The promise under test: the offset points at text that does not match the
  // reported copy, so the fix must be skipped — not guessed at the right spot,
  // not invented, and with no exception.
  const stale = finding({ _offset: 0 }); // offset 0 is "The ", not the match
  const snapshot = JSON.parse(JSON.stringify(stale));
  let plans;
  assert.doesNotThrow(() => { plans = planFixes([stale], sources); },
    'a stale offset must not throw');
  assert.deepEqual(plans, [], 'a finding whose offset does not hold the match is skipped');
  assert.deepEqual(JSON.parse(JSON.stringify(stale)), snapshot,
    'the finding is left alone: no field is mutated or stripped');
  assert.equal(fs.readFileSync(file, 'utf8'), source, 'file bytes unchanged');

  // The apply path receives no plan, so the write layer cannot be reached.
  for (const plan of plans) writeSafely(plan.file, plan.before, plan.after);
  assert.equal(fs.readFileSync(file, 'utf8'), source, 'no invented write through writeSafely');

  // Second shape: no offset map at all and the matched copy is absent from the
  // source entirely — the same skip, via the near-neighbour search.
  const absent = finding({
    _unit: { offset: 0, raw: source },
    _matched: 'organizationnation',
    _offset: 4,
  });
  assert.deepEqual(planFixes([absent], sources), [],
    'a matched copy that is absent from the source is skipped, never guessed');
  assert.equal(fs.readFileSync(file, 'utf8'), source, 'still no write for the absent match');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok — audit report/fix: PDF en/em dash bytes, determinism, footers, '
  + 'sentence-start capitalisation, offset-mismatch skip');
