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
// Phase 5A adoption pack: baseline snapshots, the starter configuration,
// the in-package self-test and the per-platform character preview.
import { BaselineError, evaluateBaseline } from './baseline.mjs';
import { InitError, writeStarterConfig, detectHosts, formatInitReport } from './init.mjs';
import { SelfTestError, runSelfTest } from './selftest.mjs';
import { PLATFORMS, previewTruncate, formatPreview } from './truncate.mjs';

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
    init: false, initOverwrite: false, selfTest: false, preview: null, baseline: null,
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
    if (arg === '--init') { opts.init = true; continue; }
    if (arg === '--init-overwrite') { opts.initOverwrite = true; continue; }
    if (arg === '--self-test') { opts.selfTest = true; continue; }
    if (arg === '--preview') { opts.preview = value('--preview', i); i++; continue; }
    if (arg.startsWith('--preview=')) {
      const preview = arg.slice('--preview='.length);
      if (!preview) throw new CliError('--preview requires a value');
      opts.preview = preview;
      continue;
    }
    if (arg === '--baseline') { opts.baseline = value('--baseline', i); i++; continue; }
    if (arg.startsWith('--baseline=')) {
      const baseline = arg.slice('--baseline='.length);
      if (!baseline) throw new CliError('--baseline requires a value');
      opts.baseline = baseline;
      continue;
    }
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
  if (opts.initOverwrite && !opts.init) throw new CliError('--init-overwrite requires --init');
  if (opts.init) {
    const combos = [
      [opts.paths.length > 0, 'scan paths'],
      [Boolean(opts.baseline), '--baseline'],
      [opts.fix, '--fix'],
      [opts.quiet, '--quiet'],
      [opts.profiles.length > 0, '--profile'],
      [Boolean(opts.report), '--report'],
      [opts.selfTest, '--self-test'],
      [opts.preview !== null, '--preview'],
    ];
    for (const [on, name] of combos) {
      if (on) throw new CliError(`--init cannot be combined with ${name}`);
    }
  }
  if (opts.selfTest) {
    const combos = [
      [opts.paths.length > 0, 'scan paths'],
      [opts.profiles.length > 0, '--profile'],
      [Boolean(opts.baseline), '--baseline'],
      [opts.fix, '--fix'],
      [opts.preview !== null, '--preview'],
    ];
    for (const [on, name] of combos) {
      if (on) throw new CliError(`--self-test cannot be combined with ${name}`);
    }
  }
  if (opts.preview !== null) {
    if (!Object.hasOwn(PLATFORMS, opts.preview)) {
      throw new CliError(`unknown preview platform "${opts.preview}" (expected ${Object.keys(PLATFORMS).join(', ')})`);
    }
    if (opts.paths.length !== 1) throw new CliError('--preview takes exactly one file path');
    // The preview renders text, so no other output form may be requested:
    // --json is --format json and is caught by the same check.
    const end = argv.indexOf('--');
    const before = end === -1 ? argv : argv.slice(0, end);
    const formatGiven = before.some(a => a === '--json' || a === '--format' || a.startsWith('--format='));
    if (formatGiven) throw new CliError('--preview cannot be combined with --format');
    if (opts.fix) throw new CliError('--preview cannot be combined with --fix');
    if (opts.baseline) throw new CliError('--preview cannot be combined with --baseline');
    if (opts.profiles.length > 0) throw new CliError('--preview cannot be combined with --profile');
  }
  if (opts.baseline === '') throw new CliError('--baseline requires a value');
  return opts;
}

export const HELP = `un-editorial-check ${VERSION}
Read user-visible copy the way a UN editor would: language, wording, tone,
spelling, terminology, dates, numbers, claims and register — and nothing else.

USAGE
  un-editorial-check [options] <path...>

OPTIONS
  --profile <value>   Repeatable. An organisation profile JSON file (merged over
                      the bundled United Nations baseline) or a built-in audit
                      name: ${AUDIT_NAMES.join(', ')}.
  --config <file>     Alternative configuration file.
  --format <fmt>      text (default), json or sarif.
  --json              Shorthand for --format json.
  --fix               Show the proposed corrections as a diff (prose files only).
  --fix --apply       Apply those corrections (same safety checks as a preview).
  --report <path.pdf> Write a current-to-should-be PDF report to the file.
                      Written before --fix, so it records the pre-fix state.
  --self-scan         Allow the skill's own directory to be scanned.
  --quiet             Suppress the text report (CI mode).
  --baseline <file>   Compare against a committed snapshot: only findings not
                      already recorded in the snapshot can fail the run.
  --init              Write a starter .un-editorial.json and print the paste
                      snippet for the CI or git host detected here.
  --self-test         Verify this installation against the bundled corpus.
  --preview <plt>     Print how much of one file fits a platform character
                      budget: x, linkedin, bluesky or mastodon.
  --version           Print the version and exit.
  -h, --help          Show this help.

EXIT CODES
  0  no error-severity editorial findings
  1  error-severity editorial findings present
  2  usage, configuration, scan or write failure

A --baseline first run records the snapshot and exits 0; later runs fail only
on new error-severity findings the snapshot does not already contain.
--preview exits 0 whenever the preview is produced, whether or not the file
fits the budget.

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

/**
 * Resolve each --profile value to either an organisation profile (merged over
 * the profile collected so far) or an audit. Audit rule sets come from the
 * bundled audit profile files, so a misfiled rule id fails validation here
 * with exit code 2 instead of silently running the wrong checks.
 */
function resolveProfiles(root, values, meta, baseline, knownIds) {
  let profile = baseline;
  const audits = new Map();
  const addAudit = (value) => audits.set(value.name, new Set(value.rules));

  for (const value of values) {
    const bundledAudit = AUDIT_NAMES.includes(value) && !fs.existsSync(path.resolve(value));
    if (bundledAudit) {
      addAudit(loadAuditProfile(root, value, meta));
      continue;
    }
    const loaded = loadOrganisationProfile(root, value, profile, knownIds, meta);
    if (loaded.kind === 'audit') addAudit(loaded.value);
    else profile = loaded.value;
  }
  return { profile, audits };
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

  // --preview: a counting preview of one file, before any scan machinery.
  // Exit 0 means the preview was produced, never that the copy is clean.
  if (opts.preview) {
    const target = opts.paths[0];
    let source;
    try {
      if (!fs.existsSync(target)) throw new CliError(`path not found: ${target}`);
      if (!fs.statSync(target).isFile()) throw new CliError(`not a regular file: ${target}`);
      source = fs.readFileSync(target, 'utf8');
    } catch (err) {
      if (err instanceof CliError) throw err;
      throw new CliError(`cannot read ${target}: ${err.message}`);
    }
    const preview = previewTruncate(source, opts.preview);
    if (!opts.quiet) io.log(formatPreview(preview, target));
    return 0;
  }

  const root = SKILL_ROOT;
  const { meta, ids } = loadCatalogue(root);

  // --init: write the starter configuration, prove it loads through the real
  // --config path, then print the host snippet. Both branches run before
  // loadRawConfig so a working-directory .un-editorial.json can never
  // interfere with setting one up (or with the bundled-defaults self-test).
  if (opts.init) {
    const configPath = '.un-editorial.json';
    const target = path.resolve(configPath);
    let prior = null;
    if (fs.existsSync(target)) {
      try {
        prior = fs.readFileSync(target, 'utf8');
      } catch (err) {
        throw new CliError(`cannot read config ${target}: ${err.message}`);
      }
    }
    try {
      writeStarterConfig(configPath, { overwrite: opts.initOverwrite });
    } catch (err) {
      if (err instanceof InitError) throw new CliError(err.message);
      throw err;
    }
    try {
      loadRawConfig(root, configPath, ids);
    } catch (err) {
      // The starter is validated before it is written; if it still refuses to
      // load, put the directory back exactly as it was found and report why.
      try {
        if (prior === null) fs.rmSync(target, { force: true });
        else fs.writeFileSync(target, prior);
      } catch { /* the load failure below is the one worth reporting */ }
      throw err;
    }
    io.log(formatInitReport({ relative: configPath, hosts: detectHosts(process.cwd()) }));
    return 0;
  }

  // --self-test: the bundled corpus on the bundled defaults, always.
  if (opts.selfTest) {
    const defaults = parseJsonStrict(
      fs.readFileSync(path.join(root, 'config', 'default.json'), 'utf8'), 'config/default.json');
    const selfCfg = validateConfig(defaults, { knownIds: ids });
    const selfProfile = loadBaselineProfile(root, ids);
    const selfCtx = makeContext({ cfg: selfCfg, baseline: selfProfile, meta });
    let result;
    try {
      result = runSelfTest({ ctx: selfCtx });
    } catch (err) {
      if (err instanceof SelfTestError) throw new CliError(err.message);
      throw err;
    }
    if (!result.ok) {
      io.error('self-test failed: the findings do not match the recorded expectations');
      for (const line of result.diff) io.error(line);
      return 1;
    }
    if (!opts.quiet) {
      io.log(`ok — self-test: ${result.cases} corpus cases, ${result.findings} findings asserted exactly`);
    }
    return 0;
  }

  const cfg = loadRawConfig(root, opts.config, ids);
  const baseline = loadBaselineProfile(root, ids);
  const { profile, audits } = resolveProfiles(root, opts.profiles, meta, baseline, ids);

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

  const ctx = makeContext({ cfg, baseline: profile, meta });

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

  // --baseline: the report above is printed first, then the snapshot
  // decision. The status goes to stderr so JSON and SARIF stdout stays a
  // single valid document; the snapshot itself is written or compared here,
  // and its exit code (0 recorded/known, 1 only for NEW error-severity
  // findings) replaces the plain findings exit code.
  if (opts.baseline) {
    let evaluation;
    try {
      evaluation = evaluateBaseline({
        file: opts.baseline,
        findings,
        errors,
        toolVersion: VERSION,
        cwd: process.cwd(),
      });
    } catch (err) {
      if (err instanceof BaselineError) throw new CliError(err.message);
      throw err;
    }
    io.error(evaluation.status);
    return evaluation.exitCode;
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
