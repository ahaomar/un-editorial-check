// File discovery.
//
// Defaults are deliberately conservative so a "scan the site" cannot drag in
// the skill's own source, coding-agent scratch directories, build output or
// test fixtures — the exclusions that stop self-referential findings. Hidden
// directories are skipped while walking unless the directory the user pointed
// at is itself hidden (so an explicit hidden path still works), and the
// skill's own root is excluded unless --self-scan is used.

import fs from 'node:fs';
import path from 'node:path';
import { EXTRACTABLE_EXTENSIONS } from './extract.mjs';

export class ScannerError extends Error {}

export const DEFAULT_EXCLUDES = [
  '.agents', '.opencode', '.claude', '.agent', 'agent', '.kilo',
  'node_modules', 'dist', 'build', 'coverage', 'tests/fixtures',
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
    if (skillRoot && !selfScan && (full === skillRoot || full.startsWith(`${skillRoot}${path.sep}`))) continue;

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
 * @param {string|null} options.skillRoot   installed skill directory to protect
 * @param {boolean} options.selfScan        scan the skill root itself
 * @param {string[]} options.excludes       extra patterns (config ignoredPaths)
 * @returns {string[]} absolute file paths, sorted
 */
export function collectFiles(inputs, { skillRoot = null, selfScan = false, excludes = [] } = {}) {
  const patterns = [...DEFAULT_EXCLUDES, ...excludes];
  const out = new Set();

  for (const input of inputs) {
    const full = path.resolve(input);
    if (!fs.existsSync(full)) throw new ScannerError(`path not found: ${input}`);
    const stat = fs.statSync(full); // explicit inputs may be symlinks; --fix refuses them later
    if (stat.isFile()) { out.add(full); continue; }
    if (!stat.isDirectory()) continue;
    walk(full, {
      patterns,
      out,
      skillRoot,
      selfScan,
      allowHidden: path.basename(full).startsWith('.'),
    });
  }

  if (skillRoot && !selfScan) {
    for (const file of [...out]) {
      if (file === skillRoot || file.startsWith(`${skillRoot}${path.sep}`)) out.delete(file);
    }
  }

  // A symlinked file is never scanned: the target can change between the read
  // and any later write, and the v0.3.0 fix path already refused them.
  for (const file of out) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new ScannerError(`refusing symbolic link: ${file}`);
    if (!stat.isFile()) throw new ScannerError(`refusing non-regular file: ${file}`);
  }
  return [...out].sort();
}
