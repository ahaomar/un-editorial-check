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
import { extractFile, undecodableReason, isBinarySource, BINARY_EXTENSIONS } from './extract.mjs';
import { isPdfRefusal, pdfRefusalMessage } from './pdf-extract.mjs';
import { runEditorialRules } from './rules.mjs';
import { AUDIT_NAMES, runAudits } from './audits.mjs';
import { FixError, assertProseOnly, assertSafeToFix, planFixes, renderPlan, writeSafely } from './fix.mjs';
import { renderText, renderJSON, renderSARIF, editorialErrors } from './output.mjs';
// Phase 7 stretch: the reader's own glossary (imported terminology) and the
// local re-scan loop. Both are opt-in and neither changes the default run.
import { GlossaryError, loadGlossary, runGlossaryRules, GLOSSARY_RULE_IDS } from './glossary.mjs';
import { Watcher, watchTargets } from './watch.mjs';
import { buildReport } from './report.mjs';
import { renderPdf } from './pdf.mjs';
import { renderHtml } from './html.mjs';
import { HS_SOURCES } from './rules-hs.mjs';
// Phase 5A adoption pack: baseline snapshots, the starter configuration,
// the in-package self-test and the per-platform character preview.
import { BaselineError, evaluateBaseline } from './baseline.mjs';
import { InitError, writeStarterConfig, detectHosts, formatInitReport } from './init.mjs';
import { SelfTestError, runSelfTest } from './selftest.mjs';
import { PLATFORMS, previewTruncate, formatPreview } from './truncate.mjs';

export const VERSION = '1.5.1';
export const INFORMATION_URI = 'https://github.com/ahaomar/un-editorial-check';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = path.resolve(HERE, '..');

export class CliError extends Error {}

const FORMATS = new Set(['text', 'json', 'sarif']);

// --report dispatch is closed: the path extension picks the renderer, and any
// other extension is a usage refusal (exit code 2) so an unsupported path can
// never produce a file in a format this tool does not render.
const REPORT_EXTENSIONS = new Set(['.pdf', '.html']);

// How much detail a report carries. `grouped` is the default: findings that
// would render identically collapse into one issue with an occurrence table.
// `full` restores the pre-1.3.0 layout — one block per finding, for a reader
// who wants every occurrence spelled out where it was found. The value is a
// rendering choice only; counts, lanes and the exit code are the same either
// way, and an unrecognised value is a usage refusal (exit code 2) rather than
// a silent fallback, so a typo cannot quietly produce a different report.
const REPORT_DETAILS = new Set(['grouped', 'full']);

function reportExtensionError(reportPath) {
  const ext = path.extname(reportPath).toLowerCase();
  const seen = ext === '' ? 'no file extension' : 'file extension ' + ext;
  return new CliError(
    `--report ${reportPath}: ${seen} is not supported (supported extensions: ${[...REPORT_EXTENSIONS].join(', ')})`);
}

// POSIX single-quote only for anything that is not already plainly safe to
// paste: a target with a space in it must not split into two arguments, and a
// path with a quote in it must not end the quoting early.
function shellQuote(token) {
  const text = String(token);
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

/**
 * The command a capped report section prints so a reader can list everything
 * the body withheld (D13, .feedbacks/REPORT-REDESIGN-PLAN.md §4).
 *
 * It is this scan's own argv with `--report-detail` forced to `full` and the
 * report path restated. An existing `--report-detail` is *replaced*, never
 * appended to: two of them would be a duplicate flag, and a command whose
 * meaning depends on which one parseArgs reads first is not a command a
 * reader can trust. Every token is shell-quoted, so the printed line is
 * runnable rather than merely plausible.
 *
 * The program is named as the package names itself — the invocation every
 * documented example uses — rather than by an absolute path, because a report
 * is a document that gets shared and a local checkout path inside it helps
 * nobody who receives the file.
 *
 * @param {string[]} argv  the scan's own argument vector
 * @param {string} reportPath  where this report was written
 * @returns {string}
 */
export function rerunCommand(argv, reportPath) {
  const keep = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    if (arg === '--report-detail' || arg === '--report') { i += 1; continue; }
    if (arg.startsWith('--report-detail=') || arg.startsWith('--report=')) continue;
    keep.push(arg);
  }
  return ['un-editorial-check', ...keep, '--report-detail', 'full', '--report', reportPath]
    .map(shellQuote)
    .join(' ');
}

/**
 * D9: the scan root — the common ancestor of every target the scan was pointed
 * at, so a path printed relative to it resolves back to the file that was
 * actually scanned.
 *
 * Taken from the targets rather than from the working directory, because the
 * two disagree the moment somebody scans a tree they are not standing in: a
 * scan of `/srv/docs` run from `/home/me` must not print
 * `../../srv/docs/x.md`. The report states this root once, in Summary, which
 * is what makes every relative path in it readable.
 *
 * @param {string[]} inputs the raw target strings, as the user typed them
 * @returns {string|null} an absolute root, or null when there are no targets
 */
export function scanRoot(inputs) {
  // A target that is a file roots the scan at its directory, not at itself:
  // `un-editorial-check docs/a.md docs/b.md` scans `docs`, and reporting
  // `Root: docs/a.md` beside a relative `b.md` would not resolve. Directories
  // are their own root. An unreadable target falls back to the path as given
  // rather than guessing — the scan itself reports missing targets separately.
  const resolved = inputs.map((input) => {
    const abs = path.resolve(input);
    try {
      return fs.statSync(abs).isDirectory() ? abs : path.dirname(abs);
    } catch {
      return abs;
    }
  });
  if (!resolved.length) return null;
  return resolved.reduce((root, target) => {
    const left = root.split(path.sep);
    const right = target.split(path.sep);
    const shared = [];
    for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
      if (left[i] !== right[i]) break;
      shared.push(left[i]);
    }
    return shared.join(path.sep) || path.sep;
  });
}

/**
 * A path as the report prints it (D9): relative to the scan root, in POSIX
 * form so the document reads the same on any machine and so
 * `path.resolve(root, printed)` still reconstructs the absolute path.
 *
 * A target that *is* the root has no relative form at all — `path.relative`
 * returns an empty string — so the basename is printed instead. A name beats
 * nothing, and the root stated in Summary still tells the reader where it
 * lives.
 *
 * @param {string} root absolute scan root
 * @param {string} file absolute path the scan read
 * @returns {string}
 */
export function relativePath(root, file) {
  const rel = path.relative(root, String(file));
  return (rel || path.basename(String(file))).split(path.sep).join('/');
}

export function parseArgs(argv) {
  const opts = {
    paths: [], profiles: [], config: null, format: 'text',
    quiet: false, fix: false, apply: false, selfScan: false,
    help: false, version: false, report: null, reportDetail: 'grouped',
    init: false, initOverwrite: false, selfTest: false, preview: null, baseline: null,
    glossary: null, watch: false,
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
    if (arg === '--report-detail') {
      opts.reportDetail = value('--report-detail', i); i++; continue;
    }
    if (arg.startsWith('--report-detail=')) {
      opts.reportDetail = arg.slice('--report-detail='.length); continue;
    }
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
    if (arg === '--glossary') { opts.glossary = value('--glossary', i); i++; continue; }
    if (arg.startsWith('--glossary=')) {
      const glossary = arg.slice('--glossary='.length);
      if (!glossary) throw new CliError('--glossary requires a value');
      opts.glossary = glossary;
      continue;
    }
    if (arg === '--watch') { opts.watch = true; continue; }
    if (arg === '--') { opts.paths.push(...argv.slice(i + 1)); break; }
    if (arg.startsWith('-') && arg !== '-') throw new CliError(`unknown option ${arg}`);
    else opts.paths.push(arg);
  }

  if (!FORMATS.has(opts.format)) {
    throw new CliError(`unknown format "${opts.format}" (expected text, json or sarif)`);
  }
  if (!REPORT_DETAILS.has(opts.reportDetail)) {
    throw new CliError(
      `unknown --report-detail "${opts.reportDetail}" (expected ${[...REPORT_DETAILS].join(' or ')})`);
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
      [Boolean(opts.glossary), '--glossary'],
      [opts.watch, '--watch'],
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
      [Boolean(opts.glossary), '--glossary'],
      [opts.watch, '--watch'],
    ];
    for (const [on, name] of combos) {
      if (on) throw new CliError(`--self-test cannot be combined with ${name}`);
    }
  }
  if (opts.glossary === '') throw new CliError('--glossary requires a value');
  if (opts.glossary !== null && opts.preview !== null) {
    throw new CliError('--preview cannot be combined with --glossary: the preview counts characters, it does not read the copy');
  }
  // --watch is a local interactive loop, so every flag whose contract is
  // defined in terms of this process's exit code is refused up front rather
  // than quietly ignored for the rest of the session. A combination that
  // would be surprising is a refusal (exit 2), never a partial run.
  if (opts.watch) {
    const combos = [
      [opts.fix, '--fix'],
      [opts.apply, '--apply'],
      [Boolean(opts.report), '--report'],
      [opts.quiet, '--quiet'],
      [Boolean(opts.baseline), '--baseline'],
      [opts.format !== 'text', `--format ${opts.format}`],
      [opts.selfTest, '--self-test'],
      [opts.init, '--init'],
      [opts.preview !== null, '--preview'],
    ];
    for (const [on, name] of combos) {
      if (on) throw new CliError(`--watch cannot be combined with ${name}: watch mode never resolves an exit code, so a flag defined by one is refused rather than ignored`);
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
  // Report extension validated last so every pre-existing usage refusal keeps
  // its original precedence: a path we cannot render is a usage error (exit
  // code 2), checked only once nothing else has already refused the run.
  if (opts.report !== null && !REPORT_EXTENSIONS.has(path.extname(opts.report).toLowerCase())) {
    throw reportExtensionError(opts.report);
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
  --glossary <file>   Import the reader's own terminology glossary: required
                      terms this copy must use and forbidden terms it must not.
                      Findings are labelled user-supplied, never a United
                      Nations rule, and --fix never rewrites them. Also settable
                      as the "glossary" key in a project configuration file.
  --watch             Re-scan on every change to the scanned files and keep
                      running until interrupted (a local editing loop; see the
                      watch-mode section below).
  --format <fmt>      text (default), json or sarif.
  --json              Shorthand for --format json.
  --fix               Show the proposed corrections as a diff (prose files only).
  --fix --apply       Apply those corrections (same safety checks as a preview).
  --report <path>     Write a current-to-should-be report to the file; the
                      extension selects the format: path.pdf writes a PDF,
                      path.html writes a self-contained HTML report.
                      Written before --fix, so it records the pre-fix state.
  --report-detail <mode>
                      How much detail the report carries. "grouped" (the
                      default) collects findings that render alike into one
                      issue with an occurrence table; "full" gives one block
                      per finding, as reports did before 1.3.0. Counts, lanes
                      and the exit code are identical either way.
  --self-scan         Allow the skill's own directory to be scanned.
  --quiet             Suppress the text report (CI mode).
  --baseline <file>   Compare against a committed snapshot: only findings not
                      already recorded in the snapshot can fail the run.
  --init              Write the starter configuration (.un-editorial.json), then
                      print the paste snippet for the CI or git host detected here.
  --self-test         Verify this installation against the bundled corpus.
  --preview <plt>     Print how much of one file fits a platform character
                      budget: x, linkedin, bluesky or mastodon.
  --version           Print the version and exit.
  -h, --help          Show this help.

EXIT CODES
  0  no error-severity editorial findings
  1  error-severity editorial findings present
  2  usage, configuration, scan or write failure

Watch mode
  --watch is a local interactive loop for one writer and one editor. It prints
  the report, then re-scans whenever a scanned file changes, and it keeps
  running until you stop it with Ctrl+C. It never resolves an exit code, so it
  is not a continuous-integration facility: a script waiting for its status
  would wait forever, not learn the result. Use an ordinary run in CI.
  Exit code 2 still applies: a bad flag, a missing file or an unreadable
  glossary stops the loop before it starts. --watch is refused together with
  --fix, --apply, --report, --quiet, --baseline, --json, --format, --init,
  --self-test and --preview, because each of those is defined by an exit code
  or by a single output document, which a repeating loop cannot provide.

A --baseline first run records the snapshot and exits 0; later runs fail only
on new error-severity findings the snapshot does not already contain.
--preview exits 0 whenever the preview is produced, whether or not the file
fits the budget.

Audits (--profile security etc.) are reported separately and never change the
exit code; editorial findings are the only thing that does. This holds whatever
severity an audit finding carries, so re-grading one to error through
config.severities still exits 0. A --glossary finding is reported in its own
"OPTIONAL AUDIT - glossary" section for the same reason: your house terminology
is not a United Nations requirement, so it never decides whether this run
passes. Read the section, or assert on it from --format json, if you want it to
gate a build.
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
  // A glossary has no URL and no retrieval date, so it is recorded here rather
  // than in the append-only source registry (rules/sources.json), which only
  // holds published, citable sources. The file the reader wrote is the whole
  // provenance, and the report names it.
  if (ctx.glossary) add(`Reader-supplied glossary: ${ctx.glossary.file}`);
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
  const { profile, audits, profileSelected } = resolveProfiles(root, opts.profiles, meta, baseline, ids);

  // --glossary: the reader's own terminology, loaded and fully validated before
  // any copy is read. The flag wins over the `glossary` config key; a refusal
  // here is exit code 2, never a run with the glossary silently dropped.
  // A missing catalogue entry is also a refusal: without it the report would
  // have to label a user-supplied finding with a United Nations rule file.
  let glossary = null;
  const glossaryPath = opts.glossary ?? cfg.glossary;
  if (glossaryPath) {
    for (const id of GLOSSARY_RULE_IDS) {
      if (!meta[id]) {
        throw new CliError(`glossary rules are not registered: rules/catalogue.json has no ${id} entry`);
      }
    }
    try {
      glossary = loadGlossary(glossaryPath);
    } catch (err) {
      if (err instanceof GlossaryError) throw new CliError(err.message);
      throw err;
    }
  }

  const inputs = opts.paths.length ? opts.paths : (opts.selfScan ? [root] : ['.']);

  const paths = collectFiles(inputs, {
    skillRoot: root,
    selfScan: opts.selfScan,
    excludes: cfg.ignoredPaths,
    // In fix mode an unsupported named file must reach the fixer, whose
    // `refusing --fix` message is the documented contract for it.
    fixMode: opts.fix,
  });

  // A file whose bytes are not valid UTF-8 is not copy in any text format
  // (lib/extract.mjs), and the fact that a file was never read must be visible
  // in the report: "scanned 2 files" over a directory where one file was never
  // decoded is the same sentence, byte for byte, as a clean run over two empty
  // files, and a reader or a CI job cannot tell them apart. So the skip is
  // counted here, at the only place that knows which files were decoded, and
  // carried into every output form.
  //
  // A PDF is read as a Buffer and is never decoded to a string. The
  // `undecodableReason` guard below reasons about decoded text, and a PDF is
  // not decoded text, so running it on PDF bytes would refuse every real
  // document before the adapter ever saw one. The decision is made on the
  // extension, before the read, so the Buffer reaches `extractFile` intact.
  const files = [];
  const skipped = [];
  for (const file of paths) {
    const ext = path.extname(file).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      let bytes;
      try {
        bytes = fs.readFileSync(file);
      } catch (err) {
        throw new CliError(`cannot read ${file}: ${err.message}`);
      }
      files.push({ file, source: bytes, ext });
      continue;
    }

    let source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch (err) {
      throw new CliError(`cannot read ${file}: ${err.message}`);
    }
    const reason = undecodableReason(source, file);
    if (reason) {
      skipped.push({ file, reason });
      continue;
    }
    files.push({ file, source, ext });
  }

  // A scan in which every candidate file was skipped read nothing at all, so
  // it takes the same refusal the scanner already uses for a directory with no
  // supported files: "scanned 0 files" followed by the clean sentence is the
  // exact shape of QA finding F1, where a run reported success having read
  // nothing. Exit 2 names the path and changes nothing else.
  //
  // The `paths.length` guard is load-bearing. When the skill-root shield
  // explains an empty scan, collectFiles returns no paths and no error, and
  // that is the documented `node bin/check.mjs .` carve-out which must keep
  // exiting 0. This refusal is only about the case the shield cannot explain:
  // the scanner did collect candidates and every one of them turned out to be
  // unreadable.
  if (paths.length > 0 && files.length === 0) {
    throw new ScannerError(`no readable files found: ${inputs.join(' ')} `
      + `(${skipped.length} candidate file${skipped.length === 1 ? '' : 's'} `
      + 'skipped: not valid UTF-8)');
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
    try {
      units.push(...extractFile(record.file, record.source, { renderTargets: cfg.renderTargets }));
    } catch (err) {
      // A refusal is a refusal, never a partial scan and never a skipped file.
      // Converting it here, before any rule has run and before any output has
      // been produced, is what keeps the shape of QA finding F1 out of reach: a
      // PDF the tool could not read must never become a run that reports the
      // clean sentence. Exit 2, a message naming the reason, nothing read.
      if (isPdfRefusal(err)) throw new CliError(pdfRefusalMessage(err, record.file));
      throw err;
    }
  }
  const findings = runEditorialRules(units, ctx);

  // A PDF finding carries the page the copy sits on, so a reader can open the
  // document and look. It is copied out here rather than inside the rule layer,
  // which keeps `lib/rules.mjs` free of any knowledge that a PDF exists: a rule
  // sees a unit, and the page number is a property of how that unit was read,
  // not of the copy inside it. `publicFinding` already copies unknown keys
  // into the JSON output, and the SARIF properties block is fed the same way.
  for (const finding of findings) {
    const page = finding._unit && finding._unit.pdfPage;
    if (Number.isInteger(page) && page > 0) finding.pdfPage = page;
  }

  if (audits.size) {
    // The audits read `source` as a string and are gated on the HTML and
    // script extensions, so a binary record is passed with an empty string
    // rather than its Buffer. No audit can reach a PDF's bytes: the extension
    // is not one an audit inspects, and a Buffer would break the offset maths
    // of a runner that never gets to use it.
    const auditFiles = files.map(record => (
      isBinarySource(record.source)
        ? { file: record.file, source: '', ext: record.ext }
        : record
    ));
    findings.push(...runAudits(audits, auditFiles, { meta, cfg }));
  }

  // The glossary runs after the editorial set and after the audits, and its
  // findings are audit-lane, so they land in their own "OPTIONAL AUDIT —
  // glossary" section and never enter the exit code. A glossary finding still
  // carries a catalogue entry, so config.severities and config.rules apply to
  // it exactly as they do to any other rule.
  if (glossary) {
    findings.push(...runGlossaryRules(units, glossary, ctx));
  }

  // --report ---------------------------------------------------------------
  // Written before the --fix block on purpose: the report always records the
  // pre-fix state of the copy. A path that cannot be written is a refusal
  // (exit code 2), the same class as every other write failure. The extension
  // was validated at parse time: .pdf renders the report model through
  // lib/report.mjs and lib/pdf.mjs, .html renders the same model lane-aware
  // through lib/html.mjs.
  if (opts.report) {
    // D9: every path in this report is printed relative to the scan root,
    // which Summary states once. The findings are **copied**, not edited —
    // JSON and SARIF are rendered further down from the same array and must
    // keep the absolute paths the engine produced.
    const root = scanRoot(inputs);
    const printable = root === null ? findings : findings.map(finding => ({
      ...finding,
      file: relativePath(root, finding.file),
    }));
    const reportInput = {
      version: VERSION,
      date: new Date().toISOString().slice(0, 10),
      root: root === null ? '' : root,
      targets: inputs,
      profiles: opts.profiles,
      filesCount: files.length,
      findings: printable,
      sources: collectReportSources(findings, { ...ctx, glossary }),
    };
    const ext = path.extname(opts.report).toLowerCase();
    // The re-run command every capped section prints. Built from this scan's
    // own argv so it re-runs the same targets with the same profiles; a body
    // that cannot name a real command refuses to cap rather than promise a
    // way back that does not exist.
    const command = rerunCommand(argv, opts.report);
    let payload;
    if (ext === '.pdf') {
      payload = renderPdf(buildReport(reportInput, { detail: opts.reportDetail, command }),
        { version: VERSION });
    } else if (ext === '.html') {
      payload = renderHtml(reportInput, { version: VERSION, detail: opts.reportDetail, command });
    } else {
      throw reportExtensionError(opts.report); // fail closed, never a default format
    }
    try {
      fs.writeFileSync(opts.report, payload);
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
    // Only text files reach the planner, so a Buffer can never be read as a
    // source string here. Stated rather than assumed: `assertProseOnly` above
    // has already refused every binary extension, and this is the lock that
    // says so at the point where the map is built.
    const sources = new Map(files
      .filter(record => !isBinarySource(record.source))
      .map(record => [record.file, record.source]));
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
  const context = {
    findings,
    files: files.length,
    skipped,
    version: VERSION,
    fixes,
    applied: opts.apply,
  };
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
 * Watch mode: one scan, then a rescan on every change, forever.
 *
 * The exit code of the FIRST scan is deliberately dropped. Watch mode is a
 * local loop, and a run that keeps going has no result to hand a caller: the
 * only way to stop is the keyboard, and the process then leaves with the
 * signal's own status rather than a claim about the copy. Only the pre-flight
 * refusals below can still end the process with exit code 2.
 *
 * A refused combination is refused before the first scan, so a mistyped
 * --watch never prints a report and then hangs.
 */
function runWatch(argv, io) {
  // parseArgs runs first and throws on every refused combination, so misuse
  // still exits 2 instead of starting a loop.
  const opts = parseArgs(argv);
  const targets = watchTargets(opts.paths.length ? opts.paths : ['.']);
  if (!targets.length) throw new CliError('--watch has no path to watch');

  // The first pass goes through exactly the same runOnce as any other
  // invocation, so the report a writer sees on startup is the report a
  // one-shot run would print, byte for byte.
  runOnce(argv, io);

  const watcher = new Watcher({
    targets,
    onChange: () => {
      runOnce(argv, io);
    },
    onError: (line) => io.error(`un-editorial-check: ${line}`),
  });

  // Ctrl+C is the documented way out. The watcher is closed first so no handle
  // outlives the signal, and the process then leaves with 128 + the signal
  // number — the status a shell reports for any interrupted command. It is
  // deliberately not 0: an interrupted watch has made no claim about the copy,
  // and 0 would read as a clean run.
  const stop = (signal) => {
    watcher.stop();
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    process.exit(128 + (signal === 'SIGINT' ? 2 : 15));
  };
  const onSignal = (signal) => stop(signal);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  // Announced after the watchers are open, so the line tells the truth about
  // what is being watched rather than what was intended.
  io.log(`watch mode: watching ${targets.length} director${targets.length === 1 ? 'y' : 'ies'}, `
    + 're-scanning on change. Press Ctrl+C to stop. Watch mode is a local loop: it never resolves an '
    + 'exit code, so do not use it in CI.');
  return null; // never a number: there is no result to report
}

/**
 * Run the CLI in-process (used by tests and by bin/check.mjs).
 * Never throws for expected failure classes: they become exit code 2.
 * @returns {number|null} process exit code, or null in watch mode
 */
export function run(argv, io = { log: (line) => console.log(line), error: (line) => console.error(line) }) {
  try {
    if (argv.includes('--watch')) return runWatch(argv, io);
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
