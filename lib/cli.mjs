// Command-line interface: argument parsing, configuration loading, orchestration
// and exit codes.
//
// Exit codes (documented contract):
//   0  no error-severity editorial findings (audits never change this)
//   1  one or more error-severity editorial findings
//   2  usage, configuration, profile, scan or file-write failure

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ProfileError, loadCatalogue, loadBaselineProfile, loadAuditProfile, loadOrganisationProfile, validateConfig, parseJsonStrict, makeContext } from './config.mjs';
import { ScannerError, collectFiles } from './scanner.mjs';
import { extractFile } from './extract.mjs';
import { runEditorialRules } from './rules.mjs';
import { AUDIT_NAMES, runAudits } from './audits.mjs';
import { FixError, assertProseOnly, assertSafeToFix, planFixes, renderPlan, writeSafely } from './fix.mjs';
import { renderText, renderJSON, renderSARIF, editorialErrors } from './output.mjs';
import { buildReport } from './report.mjs';
import { renderPdf } from './pdf.mjs';
import { HS_SOURCES } from './rules-hs.mjs';

export const VERSION = '0.9.0';
export const INFORMATION_URI = 'https://github.com/ahaomar/un-editorial-check';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = path.resolve(HERE, '..');

export class CliError extends Error {}

const FORMATS = new Set(['text', 'json', 'sarif']);

export function parseArgs(argv) {
  const opts = {
    paths: [], profiles: [], config: null, format: 'text',
    quiet: false, fix: false, apply: false, selfScan: false,
    help: false, version: false, report: null,
  };
  const value = (name, index, inline) => {
    if (inline !== undefined) return inline;
    if (index + 1 >= argv.length) throw new CliError(`${name} requires a value`);
    return argv[index + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    if (arg === '--version') { opts.version = true; continue; }
    if (arg === '--quiet') { opts.quiet = true; continue; }
    if (arg === '--fix') { opts.fix = true; continue; }
    if (arg === '--apply') { opts.apply = true; continue; }
    if (arg === '--self-scan') { opts.selfScan = true; continue; }
    if (arg === '--json') { opts.format = 'json'; continue; }
    if (arg === '--profile') { opts.profiles.push(value('--profile', i)); i++; continue; }
    if (arg.startsWith('--profile=')) {
      const profile = arg.slice('--profile='.length);
      if (!profile) throw new CliError('--profile requires a value');
      opts.profiles.push(profile);
      continue;
    }
    if (arg === '--config') { opts.config = value('--config', i); i++; continue; }
    if (arg.startsWith('--config=')) {
      const config = arg.slice('--config='.length);
      if (!config) throw new CliError('--config requires a value');
      opts.config = config;
      continue;
    }
    if (arg === '--format') { opts.format = value('--format', i); i++; continue; }
    if (arg.startsWith('--format=')) { opts.format = arg.slice('--format='.length); continue; }
    if (arg === '--report') { opts.report = value('--report', i); i++; continue; }
    if (arg.startsWith('--report=')) { opts.report = arg.slice('--report='.length); continue; }
    if (arg === '--') { opts.paths.push(...argv.slice(i + 1)); break; }
    if (arg.startsWith('-') && arg !== '-') throw new CliError(`unknown option ${arg}`);
    else opts.paths.push(arg);
  }

  if (!FORMATS.has(opts.format)) {
    throw new CliError(`unknown format "${opts.format}" (expected text, json or sarif)`);
  }
  // The separate forms can carry an empty string value too (`--profile ""`).
  if (opts.config === '') throw new CliError('--config requires a value');
  if (opts.profiles.some(profile => profile === '')) {
    throw new CliError('--profile requires a value');
  }
  if (opts.report === '') throw new CliError('--report requires a value');
  if (opts.apply && !opts.fix) throw new CliError('--apply requires --fix');
  if (opts.quiet && opts.fix && !opts.apply) {
    throw new CliError('--quiet cannot be combined with a --fix preview; showing the diff first is the point of --fix');
  }
  return opts;
}

export const HELP = `un-editorial-check ${VERSION}
Read user-visible copy the way a UN editor would: language, wording, tone,
spelling, terminology, dates, numbers, claims and register — and nothing else.

USAGE
  un-editorial-check [options] <path...>

OPTIONS
  --profile <value>   Repeatable. An organisation profile JSON file (merged over
                      the bundled United Nations baseline), a bundled profile
                      name: un-secretariat-document, un-v1, un-geneva-web,
                      generic-british-english, or a built-in audit name:
                      ${AUDIT_NAMES.join(', ')}.
  --config <file>     Alternative configuration file.
  --format <fmt>      text (default), json or sarif.
  --json              Shorthand for --format json.
  --fix               Show the proposed corrections as a diff (prose files only).
  --fix --apply       Apply those corrections (same safety checks as a preview).
  --report <path.pdf> Write a current-to-should-be PDF report to the file.
                      Written before --fix, so it records the pre-fix state.
  --self-scan         Allow the skill's own directory to be scanned.
  --quiet             Suppress the text report (CI mode).
  --version           Print the version and exit.
  -h, --help          Show this help.

EXIT CODES
  0  no error-severity editorial findings
  1  error-severity editorial findings present
  2  usage, configuration, scan or write failure

Audits (--profile security etc.) are reported separately and never change the
exit code; editorial findings are the only thing that does.
`;

function loadRawConfig(root, configPath, knownIds) {
  const defaults = parseJsonStrict(fs.readFileSync(path.join(root, 'config', 'default.json'), 'utf8'), 'config/default.json');
  let overrides = {};
  let source = configPath;
  if (!source && fs.existsSync('.un-editorial.json')) source = '.un-editorial.json';
  if (source) {
    if (!fs.existsSync(source)) throw new CliError(`config not found: ${source}`);
    // statSync follows the link but refuses anything that is not a regular
    // file, so a named pipe can never block the run.
    if (!fs.statSync(source).isFile()) throw new CliError(`config path is not a regular file: ${source}`);
    overrides = parseJsonStrict(fs.readFileSync(source, 'utf8'), source);
    if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
      throw new ProfileError('config must be a JSON object');
    }
  }
  // Validate the file on its own before merging: the merge below coerces an
  // array where an object belongs into an empty object, which would hide the
  // mistake from the validator and accept a config the author never wrote.
  validateConfig(overrides, { knownIds });
  const merged = { ...defaults, ...overrides };
  for (const key of ['allowlist', 'severities', 'rules']) {
    if (defaults[key] || overrides[key]) {
      merged[key] = { ...(defaults[key] || {}), ...(overrides[key] || {}) };
    }
  }
  return validateConfig(merged, { knownIds });
}

// Bundled organisation profile names, resolved against config/profiles/.
// The baseline file keeps its un-v1.json name; `un-secretariat-document` is
// the same profile under its descriptive name.
const BUNDLED_PROFILES = {
  'un-secretariat-document': 'un-v1.json',
  'un-v1': 'un-v1.json',
  'un-geneva-web': 'un-geneva-web.json',
  'generic-british-english': 'generic-british-english.json',
};
const BUNDLED_PROFILE_NAMES = Object.keys(BUNDLED_PROFILES);

/**
 * Resolve each --profile value to either an organisation profile (merged over
 * the profile collected so far) or an audit. Audit rule sets come from the
 * bundled audit profile files, so a misfiled rule id fails validation here
 * with exit code 2 instead of silently running the wrong checks.
 *
 * Resolution order per value: an existing path always wins (a local file may
 * legitimately shadow a bundled name), then the bundled audit names, then the
 * bundled profile names. A path-looking value that exists nowhere keeps the
 * plain `profile not found:` refusal; a bare unknown name is answered with
 * the bundled names so the refusal is self-correcting.
 */
function resolveProfiles(root, values, meta, baseline, knownIds) {
  let profile = baseline;
  let profileSelected = false;
  const audits = new Map();
  const addAudit = (value) => audits.set(value.name, new Set(value.rules));

  for (const value of values) {
    if (!fs.existsSync(path.resolve(value))) {
      if (AUDIT_NAMES.includes(value)) {
        addAudit(loadAuditProfile(root, value, meta));
        continue;
      }
      const bundled = BUNDLED_PROFILES[value];
      if (bundled) {
        const file = path.join(root, 'config', 'profiles', bundled);
        profile = loadOrganisationProfile(root, file, profile, knownIds, meta).value;
        profileSelected = true;
        continue;
      }
      const pathLike = value.includes('/') || value.endsWith('.json');
      if (pathLike) throw new ProfileError(`profile not found: ${value}`);
      throw new ProfileError(
        `profile not found: ${value} (bundled profiles: ${BUNDLED_PROFILE_NAMES.join(', ')})`);
    }
    const loaded = loadOrganisationProfile(root, value, profile, knownIds, meta);
    if (loaded.kind === 'audit') addAudit(loaded.value);
    else {
      profile = loaded.value;
      profileSelected = true;
    }
  }
  return { profile, audits, profileSelected };
}

/**
 * Knowledge-base citations behind the findings in this run, for the report's
 * Sources appendix. Contested-claim findings are matched back to their claim
 * through the exact neutral wording they carry as `proposed`; the hate-speech
 * knowledge base is cited when any of its rules fired. Order is stable and
 * duplicates are dropped.
 */
function collectReportSources(findings, ctx) {
  const sources = [];
  const add = (source) => {
    if (typeof source === 'string' && source.trim() && !sources.includes(source)) {
      sources.push(source);
    }
  };
  for (const finding of findings) {
    if (finding.ruleId !== 'UE-DP001') continue;
    const claim = (ctx.vocab.claims || []).find(entry => entry.neutral === finding.proposed);
    if (claim) add(claim.source);
  }
  const hsFired = findings.some(f =>
    f.ruleId === 'UE-HS001' || f.ruleId === 'UE-HS002' || f.ruleId === 'UE-HS003');
  if (hsFired) for (const source of HS_SOURCES) add(source);
  return sources;
}

function runOnce(argv, io) {
  const opts = parseArgs(argv);
  if (opts.help) { io.log(HELP); return 0; }
  if (opts.version) { io.log(`un-editorial-check ${VERSION}`); return 0; }

  const root = SKILL_ROOT;
  const { meta, ids } = loadCatalogue(root);
  const cfg = loadRawConfig(root, opts.config, ids);
  const baseline = loadBaselineProfile(root, ids);
  const { profile, audits, profileSelected } = resolveProfiles(root, opts.profiles, meta, baseline, ids);

  const inputs = opts.paths.length ? opts.paths : (opts.selfScan ? [root] : ['.']);

  const paths = collectFiles(inputs, {
    skillRoot: root,
    selfScan: opts.selfScan,
    excludes: cfg.ignoredPaths,
    // In fix mode an unsupported named file must reach the fixer, whose
    // `refusing --fix` message is the documented contract for it.
    fixMode: opts.fix,
  });

  const files = [];
  for (const file of paths) {
    let source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch (err) {
      throw new CliError(`cannot read ${file}: ${err.message}`);
    }
    files.push({ file, source, ext: path.extname(file).toLowerCase() });
  }

  const ctx = makeContext({
    cfg,
    baseline: profile,
    meta,
    profileSelected,
    // The static conflict family from the baseline: which keys are contested
    // never changes, only the selected profile's stance over them does.
    conflictFamily: baseline.spellingConflicts,
  });

  const units = [];
  for (const record of files) {
    units.push(...extractFile(record.file, record.source, { renderTargets: cfg.renderTargets }));
  }
  const findings = runEditorialRules(units, ctx);

  if (audits.size) {
    findings.push(...runAudits(audits, files, { meta, cfg }));
  }

  // --report ---------------------------------------------------------------
  // Written before the --fix block on purpose: the report always records the
  // pre-fix state of the copy. A path that cannot be written is a refusal
  // (exit code 2), the same class as every other write failure.
  if (opts.report) {
    const elements = buildReport({
      version: VERSION,
      date: new Date().toISOString().slice(0, 10),
      targets: inputs,
      profiles: opts.profiles,
      filesCount: files.length,
      findings,
      sources: collectReportSources(findings, ctx),
    });
    const pdf = renderPdf(elements, { version: VERSION });
    try {
      fs.writeFileSync(opts.report, pdf);
    } catch (err) {
      throw new CliError(`cannot write report ${opts.report}: ${err.message}`);
    }
  }

  // --fix ---------------------------------------------------------------
  let fixes = [];
  const appliedKeys = new Set();
  if (opts.fix) {
    assertProseOnly(paths);
    assertSafeToFix(paths);
    const sources = new Map(files.map(record => [record.file, record.source]));
    fixes = planFixes(findings, sources);
    if (opts.apply) {
      for (const plan of fixes) {
        writeSafely(plan.file, plan.before, plan.after);
        for (const edit of plan.edits) {
          appliedKeys.add(`${edit.file || plan.file}:${edit.line}:${edit.column}:${edit.ruleId}`);
        }
      }
    }
  }

  const errors = editorialErrors(findings).filter(finding =>
    !appliedKeys.has(`${finding.file}:${finding.line}:${finding.column}:${finding.ruleId}`));

  // Output ---------------------------------------------------------------
  const context = { findings, files: files.length, version: VERSION, fixes, applied: opts.apply };
  if (!opts.quiet) {
    if (opts.format === 'json') io.log(renderJSON(context));
    else if (opts.format === 'sarif') io.log(renderSARIF({ ...context, informationUri: INFORMATION_URI }));
    else {
      const parts = [];
      if (opts.fix && fixes.length) {
        parts.push(fixes.map(plan => renderPlan(plan, { applied: opts.apply })).join('\n\n'));
        parts.push(''); // one blank line between the diff and the report
      }
      parts.push(renderText(context));
      io.log(parts.join('\n'));
      // The PDF is written silently upstream; the operator needs to know where
      // it landed, exactly as `--fix` labels its own results.
      if (opts.report) io.log(`Report written: ${opts.report}`);
    }
  } else if (opts.format !== 'text') {
    if (opts.format === 'json') io.log(renderJSON(context));
    else io.log(renderSARIF({ ...context, informationUri: INFORMATION_URI }));
  }

  return errors.length ? 1 : 0;
}

/**
 * Run the CLI in-process (used by tests and by bin/check.mjs).
 * Never throws for expected failure classes: they become exit code 2.
 * @returns {number} process exit code
 */
export function run(argv, io = { log: (line) => console.log(line), error: (line) => console.error(line) }) {
  try {
    return runOnce(argv, io);
  } catch (err) {
    if (err instanceof CliError || err instanceof ProfileError
      || err instanceof ScannerError || err instanceof FixError) {
      io.error(`un-editorial-check: ${err.message}`);
      return 2;
    }
    throw err;
  }
}
