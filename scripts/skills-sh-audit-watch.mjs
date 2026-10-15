#!/usr/bin/env node

// Reads the published skills.sh record for this skill and states whether the
// audit is still the snapshot of 5 October, green, or carrying findings.
//
// Run hourly by .github/workflows/socket-audit-watch.yml. The logic lives here
// rather than inline in the workflow for two reasons: `npm run check:syntax`
// covers every file under scripts/, and tests/audit-published-record.mjs can
// exercise every verdict without a network.
//
// The inline version this replaces scraped the security page and read the
// alert count out of rendered copy. That page splits the count across React
// comment boundaries — the markup is "2<!-- --> alert<!-- -->s<!-- --> found:"
// — so no numeric pattern matched, the count fell back to zero, and any newer
// snapshot would have been reported GREEN, including one carrying findings.
// The audit endpoint states the same verdicts as fields, and this reads those.
//
// Exit status is 0 when the record is unchanged or green, and 1 when a
// snapshot other than the pinned one carries findings, or when no Socket row
// is served at all. A failure to reach either endpoint is news about their
// service rather than about this skill, so it is reported and exits 0.
//
// USAGE
//   node scripts/skills-sh-audit-watch.mjs
//   node scripts/skills-sh-audit-watch.mjs --audit <file> --snapshot <file>
//
// The two file options read saved responses instead of the network.
// Zero npm dependencies: node builtins only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AUDIT_URL =
  'https://skills.sh/api/v1/skills/audit/ahaomar/un-editorial-check/un-editorial-check';
export const SNAPSHOT_URL =
  'https://skills.sh/api/download/ahaomar/un-editorial-check/un-editorial-check';

/** The scanner this watch reports on. */
export const PROVIDER = 'Socket';

/**
 * The Socket audit the snapshot of 5 October produced. While the published
 * record still carries this instant, the verdict describes the pre-1.7.1 tree
 * and no finding from it applies to the default branch.
 */
export const PINNED_AUDIT = '2026-10-05T11:30:35.858Z';

/** The commit that snapshot holds, and the version its manifest declares. */
export const PINNED_COMMIT = 'ea6c6d0b9952bd8bcda8cb53645fc0401ea11e38';
export const PINNED_VERSION = '1.7.0';

/** The Socket row of an audit response, or null when none is served. */
export function socketRecord(response) {
  const audits = Array.isArray(response?.audits) ? response.audits : [];
  return audits.find((row) => row.provider === PROVIDER) ?? null;
}

/**
 * The version declared by the package.json a snapshot response carries. The
 * download response lists every text file with its contents, so the manifest
 * is read straight out of it; binaries are not carried and are not needed.
 */
export function snapshotVersion(response) {
  const files = Array.isArray(response?.files) ? response.files : [];
  const manifest = files.find((file) => file?.path === 'package.json');
  if (!manifest || typeof manifest.contents !== 'string') return null;
  try {
    return JSON.parse(manifest.contents)?.version ?? null;
  } catch {
    return null;
  }
}

/**
 * The verdict for one Socket row, as a status code and the lines to print.
 *
 * A row carrying the pinned instant is STALE whatever it says: it reports a
 * tree that the default branch has moved past, so its findings are history
 * rather than news. Any other row is read on its own terms — green only when
 * the scanner passes it, and a failure otherwise, which is the contract the
 * README states for this watch.
 */
export function verdictOf(record, version = null) {
  const seen = version === null ? '' : ` snapshot version ${version}`;
  if (!record) {
    return {
      code: 1,
      lines: [
        `NO RECORD — skills.sh served no ${PROVIDER} row for this skill${seen}.`,
        'The skill may have left the directory, or the audit service may have changed shape.',
      ],
    };
  }
  const status = String(record.status ?? '');
  const auditedAt = String(record.auditedAt ?? '');
  const summary = String(record.summary ?? '');
  const head = `${PROVIDER}: status=${status || 'unknown'} auditedAt=${auditedAt || 'unknown'}`
    + ` summary=${summary || 'none'}${seen}`;

  if (auditedAt === PINNED_AUDIT) {
    return {
      code: 0,
      lines: [
        head,
        `STALE — the audit still belongs to the snapshot of 5 October, which holds`
          + ` ${PINNED_COMMIT.slice(0, 7)} (version ${PINNED_VERSION}). That snapshot was taken eleven`
          + ' minutes before e907670 answered the two findings this audit reports, so it'
          + ' describes a tree the default branch has moved past.',
        'The record is replaced on the skills.sh side only. Commits, tags, releases, npm'
          + ' publishes and reinstalls do not refresh a stored snapshot, so there is'
          + ' nothing to retry from here.',
      ],
    };
  }
  if (status === 'pass') {
    return {
      code: 0,
      lines: [
        head,
        `GREEN — the audit was re-run against a newer snapshot and reports no findings.`
          + (version && version !== PINNED_VERSION ? ` The snapshot now carries version ${version}.` : ''),
      ],
    };
  }
  return {
    code: 1,
    lines: [
      head,
      `ALERTS — a snapshot other than the pinned one reports ${status || 'a verdict'}`
        + `${summary ? `: ${summary}` : ''}. Its findings apply to the current tree and`
        + ' warrant a look at the security page.',
    ],
  };
}

/** Reads one of the two endpoints as JSON, refusing a non-success status. */
async function readJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

function parseArgs(argv) {
  const options = { audit: null, snapshot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--audit' || flag === '--snapshot') {
      const key = flag.slice(2);
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${flag} needs a file path`);
      options[key] = value;
      index += 1;
    } else {
      throw new Error(`unrecognised option ${flag}`);
    }
  }
  return options;
}

/** Runs the watch and returns the process exit code. */
export async function main(argv) {
  const options = parseArgs(argv);

  let audit;
  try {
    audit = options.audit
      ? JSON.parse(fs.readFileSync(options.audit, 'utf8'))
      : await readJson(AUDIT_URL);
  } catch (error) {
    process.stdout.write(
      `SERVER ERROR — the audit record could not be read (${error.message}).`
      + ' This is their side, not this skill, so nothing is compared yet.\n',
    );
    return 0;
  }

  let version = null;
  try {
    const snapshot = options.snapshot
      ? JSON.parse(fs.readFileSync(options.snapshot, 'utf8'))
      : await readJson(SNAPSHOT_URL);
    version = snapshotVersion(snapshot);
  } catch {
    // The snapshot endpoint is context for the log, not the verdict itself.
  }

  const verdict = verdictOf(socketRecord(audit), version);
  for (const line of verdict.lines) process.stdout.write(`${line}\n`);
  return verdict.code;
}

// Run only when this file is the entry point, so that the suite can import the
// verdicts without reaching for the network.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
