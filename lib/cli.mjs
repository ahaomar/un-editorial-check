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

export const VERSION = '0.6.0';
export const INFORMATION_URI = 'https://github.com/ahaomar/un-editorial-check';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = path.resolve(HERE, '..');

export class CliError extends Error {}

const FORMATS = new Set(['text', 'json', 'sarif']);

export function parseArgs(argv) {
  const opts = {
    paths: [], profiles: [], config: null, format: 'text',
    quiet: false, fix: false, apply: false, selfScan: false,
    help: false, version: false,
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
    if (arg.startsWith('--profile=')) { opts.profiles.push(arg.slice('--profile='.length)); continue; }
    if (arg === '--config') { opts.config = value('--config', i); i++; continue; }
    if (arg.startsWith('--config=')) { opts.config = arg.slice('--config='.length); continue; }
    if (arg === '--format') { opts.format = value('--format', i); i++; continue; }
    if (arg.startsWith('--format=')) { opts.format = arg.slice('--format='.length); continue; }
    if (arg === '--') { opts.paths.push(...argv.slice(i + 1)); break; }
    if (arg.startsWith('-') && arg !== '-') throw new CliError(`unknown option ${arg}`);
    else opts.paths.push(arg);
  }

  if (!FORMATS.has(opts.format)) {
    throw new CliError(`unknown format "${opts.format}" (expected text, json or sarif)`);
  }
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
                      the bundled United Nations baseline) or a built-in audit
                      name: ${AUDIT_NAMES.join(', ')}.
  --config <file>     Alternative configuration file.
  --format <fmt>      text (default), json or sarif.
  --json              Shorthand for --format json.
  --fix               Show the proposed corrections as a diff (prose files only).
  --fix --apply       Apply those corrections (same safety checks as a preview).
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

function runOnce(argv, io) {
  const opts = parseArgs(argv);
  if (opts.help) { io.log(HELP); return 0; }
  if (opts.version) { io.log(`un-editorial-check ${VERSION}`); return 0; }

  const root = SKILL_ROOT;
  const { meta, ids } = loadCatalogue(root);
  const cfg = loadRawConfig(root, opts.config, ids);
  const baseline = loadBaselineProfile(root, ids);
  const { profile, audits } = resolveProfiles(root, opts.profiles, meta, baseline, ids);

  const inputs = opts.paths.length ? opts.paths : (opts.selfScan ? [root] : ['.']);

  const paths = collectFiles(inputs, {
    skillRoot: root,
    selfScan: opts.selfScan,
    excludes: cfg.ignoredPaths,
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
