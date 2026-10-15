// Published skills.sh record suite.
//
// Standalone: node tests/audit-published-record.mjs
//
// What it locks:
//   1. the pinned audit — a Socket row carrying the instant the snapshot of
//      5 October produced is reported STALE, whatever verdict it carries,
//      because it describes a tree the default branch has moved past;
//   2. a refreshed record — a row from any other snapshot is read on its own
//      terms, green only when the scanner passes it and a failure otherwise,
//      which is the contract the README states for this watch;
//   3. the false green this watch used to have — the security page splits its
//      alert count across React comment boundaries, and the exact rendered
//      string the old scraper failed on is kept here so that a verdict built
//      from rendered copy cannot come back unnoticed;
//   4. a missing row — no Socket row is a failure, never a silent pass;
//   5. the snapshot manifest — the version is read out of the download
//      response, which is what says whether the record has been replaced;
//   6. zero dependencies — the watch imports node builtins only, and the
//      package still declares none.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PINNED_AUDIT,
  PINNED_COMMIT,
  PINNED_VERSION,
  PROVIDER,
  main,
  socketRecord,
  snapshotVersion,
  verdictOf,
} from '../scripts/skills-sh-audit-watch.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The Socket row skills.sh serves, as the audit endpoint states it. */
const pinnedRow = {
  provider: PROVIDER,
  slug: 'un-editorial-check',
  status: 'warn',
  summary: '2 alerts: gptAnomaly',
  auditedAt: PINNED_AUDIT,
};

/** The same row as a scanner would report it against a newer snapshot. */
const refreshed = (overrides) => ({ ...pinnedRow, auditedAt: '2026-11-01T00:00:00.000Z', ...overrides });

// --- 1. the pinned audit is stale, and stale is not a failure ---------------

{
  const verdict = verdictOf(pinnedRow, PINNED_VERSION);
  const report = verdict.lines.join('\n');
  assert.equal(verdict.code, 0,
    'an audit pinned to the 5 October snapshot is not a failure of this repository');
  assert.match(report, /STALE/, 'the pinned audit is named as stale');
  assert.match(report, new RegExp(PINNED_COMMIT.slice(0, 7)),
    'the stale report names the commit the snapshot holds');
  assert.match(report, /skills\.sh side only/,
    'the stale report says where the record is replaced and that our side cannot do it');
  // Stale wins over the verdict the row carries, in both directions: a pinned
  // pass is still not news about the current tree.
  assert.equal(verdictOf({ ...pinnedRow, status: 'pass', summary: '' }, null).code, 0,
    'a pinned pass is also stale rather than green');
  assert.match(verdictOf({ ...pinnedRow, status: 'pass', summary: '' }, null).lines.join('\n'), /STALE/,
    'a pinned pass is reported as stale, not as a green result');
}

// --- 2. a refreshed record is read on its own terms ------------------------

{
  const green = verdictOf(refreshed({ status: 'pass', summary: '' }), '1.9.0');
  assert.equal(green.code, 0, 'a passing fresh audit is green');
  assert.match(green.lines.join('\n'), /GREEN/, 'a passing fresh audit is named as green');
  assert.match(green.lines.join('\n'), /version 1\.9\.0/,
    'a green report names the snapshot version it saw');

  for (const status of ['warn', 'fail']) {
    const verdict = verdictOf(refreshed({ status }), null);
    assert.equal(verdict.code, 1, `a fresh ${status} audit must fail the watch`);
    assert.match(verdict.lines.join('\n'), /ALERTS/, `a fresh ${status} audit is reported as alerts`);
  }
  // A row with no status at all is not a license to pass.
  assert.equal(verdictOf(refreshed({ status: '' }), null).code, 1,
    'a fresh row carrying no status fails rather than passing silently');
}

// --- 3. no verdict can be built from rendered copy -------------------------

{
  // The markup the security page serves for the very row above: the count is
  // split across React comment nodes. The watcher this replaces matched this
  // text with /\d+\s*alerts?/, found nothing, took the missing count for zero,
  // and printed GREEN. Both halves of that failure are locked here.
  const rendered = '2<!-- --> alert<!-- -->s<!-- --> found:';
  assert.equal(rendered.match(/\d+\s*alerts?/), null,
    'the rendered count matches no numeric pattern, which is why the verdict is read from a field');
  assert.equal(pinnedRow.summary, '2 alerts: gptAnomaly',
    'the endpoint states the same count as a field the watch can read');
  assert.equal(verdictOf(refreshed({ status: 'warn' }), null).code, 1,
    'a fresh warning carrying the same two alerts is never green');
}

// --- 4. a missing row fails, it does not pass silently ---------------------

{
  assert.equal(socketRecord({ audits: [] }), null, 'an empty audit list yields no Socket row');
  assert.equal(socketRecord({ audits: [{ provider: 'Snyk', status: 'pass' }] }), null,
    'another scanner passing does not stand in for the Socket row');
  assert.equal(socketRecord(undefined), null, 'a missing response yields no Socket row');
  const verdict = verdictOf(null, null);
  assert.equal(verdict.code, 1, 'no Socket row is a failure, never a silent pass');
  assert.match(verdict.lines.join('\n'), /NO RECORD/, 'the missing row is named');
}

// --- 5. the snapshot manifest says whether the record was replaced ---------

{
  const files = [
    { path: 'SKILL.md', contents: 'x' },
    { path: 'package.json', contents: JSON.stringify({ name: 'un-editorial-check', version: '1.7.0' }) },
  ];
  assert.equal(snapshotVersion({ files }), '1.7.0', 'the version is read out of the download response');
  assert.equal(snapshotVersion({ files: [{ path: 'SKILL.md', contents: 'x' }] }), null,
    'no manifest is reported as unknown rather than guessed');
  assert.equal(snapshotVersion({ files: [{ path: 'package.json', contents: 'not json' }] }), null,
    'an unparsable manifest is reported as unknown rather than thrown');
  assert.equal(snapshotVersion(undefined), null, 'a missing response is reported as unknown');
}

// --- 6. the command line, end to end, without a network -------------------

/** Runs the watch with its output captured, so the suite prints only its own line. */
async function run(argv) {
  const written = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { written.push(String(chunk)); return true; };
  try {
    return { code: await main(argv), text: written.join('') };
  } finally {
    process.stdout.write = original;
  }
}

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'published-record-'));
  try {
    const auditFile = path.join(tmp, 'audit.json');
    const snapshotFile = path.join(tmp, 'snapshot.json');
    fs.writeFileSync(snapshotFile, JSON.stringify({
      files: [{ path: 'package.json', contents: JSON.stringify({ version: PINNED_VERSION }) }],
    }));

    fs.writeFileSync(auditFile, JSON.stringify({ audits: [pinnedRow] }));
    const pinned = await run(['--audit', auditFile, '--snapshot', snapshotFile]);
    assert.equal(pinned.code, 0, 'the pinned record exits green from the command line');
    assert.match(pinned.text, /STALE/, 'the pinned record is reported as stale from the command line');

    fs.writeFileSync(auditFile, JSON.stringify({ audits: [refreshed({ status: 'fail' })] }));
    const failed = await run(['--audit', auditFile, '--snapshot', snapshotFile]);
    assert.equal(failed.code, 1, 'a fresh failure exits non-zero from the command line');
    assert.match(failed.text, /ALERTS/, 'a fresh failure is reported as alerts from the command line');

    // An unreadable record is their outage, not our finding: the run is
    // reported and exits green, so a service fault cannot read as a failure.
    const unreachable = await run(['--audit', path.join(tmp, 'absent.json')]);
    assert.equal(unreachable.code, 0, 'an unreadable record exits green rather than failing the watch');
    assert.match(unreachable.text, /SERVER ERROR/, 'an unreadable record is reported as their outage');

    await assert.rejects(main(['--not-an-option']), /unrecognised option/,
      'an unknown option is refused rather than ignored');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 7. zero dependencies -------------------------------------------------

{
  const source = fs.readFileSync(path.join(root, 'scripts/skills-sh-audit-watch.mjs'), 'utf8');
  assert(!/require\(/.test(source), 'the watch loads no module with require');
  const specifiers = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
  assert.ok(specifiers.length > 0, 'the watch imports what it uses');
  for (const specifier of specifiers) {
    assert.ok(specifier.startsWith('node:'),
      `the watch imports node builtins only, not ${specifier}`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0,
    'the package still declares no dependencies');
}

console.log('ok — published record: the pinned audit reads stale, fresh verdicts are read from fields, '
  + 'a missing row fails, and rendered copy decides nothing');
