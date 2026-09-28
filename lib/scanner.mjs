// File discovery.
//
// Defaults are deliberately conservative so a "scan the site" cannot drag in
// the skill's own source, coding-agent scratch directories, build output or
// test fixtures — the exclusions that stop self-referential findings. Hidden
// directories are skipped while walking unless the directory the user pointed
// at is itself hidden (so an explicit hidden path still works).
//
// The skill's own root carries a narrow shield: a scan whose input *is* the
// root (the bare `.` or the package directory) reads nothing and is recorded
// as the documented carve-out rather than an empty-scan refusal, and a walk
// never descends into the root. A file or a sub-directory named inside the
// root is scanned like any other input — only `--self-scan` opens the root
// itself.

import fs from 'node:fs';
import path from 'node:path';
import { EXTRACTABLE_EXTENSIONS } from './extract.mjs';

export class ScannerError extends Error {}

export const DEFAULT_EXCLUDES = [
  '.agents', '.opencode', '.claude', '.agent', 'agent', '.kilo',
  'node_modules', 'dist', 'build', 'coverage', 'fixtures', 'tests/fixtures',
];

function patternToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLE__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE__/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function isExcluded(nameOrRelPath, absPath, patterns) {
  const segments = absPath.split(path.sep);
  const absForward = absPath.split(path.sep).join('/');
  for (const pattern of patterns) {
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3).split('/').filter(Boolean);
      for (let i = 0; i + prefix.length <= segments.length; i++) {
        if (prefix.every((part, j) => segments[i + j] === part)) return true;
      }
      continue;
    }
    if (pattern.includes('*')) {
      const re = patternToRegex(pattern);
      if (re.test(nameOrRelPath) || re.test(absForward)) return true;
      continue;
    }
    // Plain names match at any depth: `node_modules`, `tests/fixtures`.
    if (segments[segments.length - 1] === pattern) return true;
    if (absForward.endsWith(`/${pattern}`)) return true;
    if (nameOrRelPath === pattern || nameOrRelPath.startsWith(`${pattern}/`)) return true;
  }
  return false;
}

function walk(dir, options) {
  const { patterns, out, skillRoot, selfScan, allowHidden } = options;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory: skip quietly rather than abort the run
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    // While walking, the skill root itself is a plain directory exclusion
    // (like `node_modules`): never descend into it without --self-scan. This
    // only ever matches the root as a discovered sub-directory — a file or
    // sub-directory named on the command line never passes through here —
    // so nothing the user named explicitly is dropped by this check.
    if (skillRoot && !selfScan && full === skillRoot) continue;

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') && !allowHidden) continue;
      if (isExcluded(entry.name, full, patterns)) continue;
      walk(full, options);
      continue;
    }
    if (!entry.isFile()) continue; // symlinks are not followed while walking
    const ext = path.extname(entry.name).toLowerCase();
    if (!EXTRACTABLE_EXTENSIONS.has(ext)) continue;
    if (isExcluded(entry.name, full, patterns)) continue;
    out.add(full);
  }
}

/**
 * @param {string[]} inputs   files or directories (resolved from cwd)
 * @param {object} options
 * @param {string|null} options.skillRoot   installed skill directory: skipped
 *                                          when named as input, never descended
 *                                          into while walking, unless --self-scan
 * @param {boolean} options.selfScan        scan the skill root itself
 * @param {string[]} options.excludes       extra patterns (config ignoredPaths)
 * @param {boolean} options.fixMode         an unsupported named file is left to
 *                                          the fixer's own `refusing --fix` error
 * @returns {string[]} absolute file paths, sorted
 */
export function collectFiles(inputs, {
  skillRoot = null, selfScan = false, excludes = [], fixMode = false,
} = {}) {
  const patterns = [...DEFAULT_EXCLUDES, ...excludes];
  const out = new Set();
  // An input that *is* the skill root (the bare `.` or the package
  // directory) is the documented carve-out: it is skipped, and an empty
  // result the skip explains is not an empty-scan refusal — that is the
  // `node bin/check.mjs .` behaviour. No other input is dropped: a file or
  // sub-directory named inside the root is scanned, so an empty result from
  // it is a refusal like any other.
  const shield = { skippedBySkillRoot: false };

  for (const input of inputs) {
    const full = path.resolve(input);
    if (!fs.existsSync(full)) throw new ScannerError(`path not found: ${input}`);
    const stat = fs.statSync(full); // explicit inputs may be symlinks; --fix refuses them later
    if (stat.isFile()) {
      const ext = path.extname(full).toLowerCase();
      if (!EXTRACTABLE_EXTENSIONS.has(ext) && !fixMode) {
        const supported = [...EXTRACTABLE_EXTENSIONS].join(' ');
        throw new ScannerError(
          `unsupported file type: ${input} (supported extensions: ${supported})`);
      }
      out.add(full);
      continue;
    }
    if (!stat.isDirectory()) {
      throw new ScannerError(`not a regular file: ${input}`);
    }
    // The skill root named as a directory input: skip it and record why.
    if (skillRoot && !selfScan && full === skillRoot) {
      shield.skippedBySkillRoot = true;
      continue;
    }
    // A directory named on the command line overrides its own exclusion
    // (README: `fixtures` are skipped "unless you name them explicitly"):
    // only that directory's walk drops the patterns, everything inside it is
    // still filtered by the file-extension check alone.
    const named = path.basename(full);
    const rootExcluded = isExcluded(named, full, patterns);
    walk(full, {
      patterns: rootExcluded ? [] : patterns,
      out,
      skillRoot,
      selfScan,
      allowHidden: named.startsWith('.'),
    });
  }

  if (out.size === 0 && !shield.skippedBySkillRoot) {
    throw new ScannerError(`no supported files found: ${inputs.join(' ')}`);
  }

  // A symlinked file is never scanned: the target can change between the read
  // and any later write, and the v0.3.0 fix path already refused them.
  for (const file of out) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new ScannerError(`refusing symbolic link: ${file}`);
    if (!stat.isFile()) throw new ScannerError(`not a regular file: ${file}`);
  }
  return [...out].sort();
}
