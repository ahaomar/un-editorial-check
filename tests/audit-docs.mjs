// un-editorial-check — documentation contract tests.
//
// Standalone: `node tests/audit-docs.mjs`. Locks what the user-facing
// documents promise:
//
//   1. banned claim phrases never appear in the README, skill instructions,
//      user guide, command template, changelog or docs/ pages;
//   2. the user guide's house style holds: no contractions, no question
//      marks outside code, British English forms, no percent signs outside
//      code (fenced blocks and inline spans are removed before checking);
//   3. the exact clean-run sentence appears on every documented surface, and
//      the CLI prints precisely that sentence on a clean run — and only then;
//   4. the changelog carries the released 1.0.0 section and no Unreleased
//      placeholder;
//   5. package.json declares no dependencies or devDependencies.
//
// Probe prose reaches the scanner through call names that are not render
// surfaces, so the repository self-scan never extracts this file's test data
// as user-visible copy.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../bin/check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const list = directory => fs.readdirSync(path.join(root, directory))
  .filter(name => name.endsWith('.md'))
  .map(name => path.join(directory, name));

const userFacing = ['README.md', 'SKILL.md', 'USER-GUIDE.md', 'CHANGELOG.md',
  ...list('commands'), ...list('docs')];

/** Remove fenced code blocks and inline code spans before style checks. */
const stripCode = text => text
  .replace(/```[\s\S]*?```/g, '')
  .replace(/`[^`\n]*`/g, '');

// --- 1. banned claim phrases -------------------------------------------------

{
  const banned = ['UN approved', 'fully compliant', 'finds all errors',
    'factual verification', 'legal advice'];
  for (const file of userFacing) {
    const text = read(file);
    for (const phrase of banned) {
      const pattern = new RegExp(phrase.split(/\s+/).join('\\s+'), 'i');
      const match = pattern.exec(text);
      assert(!match,
        `${file} must not carry a banned claim (${phrase.match(/\w+/)[0]} form) near offset ${match ? match.index : 0}`);
    }
  }
}

console.log('ok — banned claim phrases: absent from every user-facing document');

// --- 2. user guide house style ------------------------------------------------

{
  const prose = stripCode(read('USER-GUIDE.md'));

  const contractions = /\b\w+n't\b|\b(?:it's|that's|there's|what's|who's|here's|how's|he's|she's|it'll|that'll|there'll|they're|we're|you're|they've|we've|you've|they'll|we'll|you'll|i'm|i've|i'll|i'd|he'd|she'd|we'd|you'd|they'd|let's)\b/gi;
  const found = prose.match(contractions) || [];
  assert.equal(found.length, 0, `user guide must not use contractions: ${[...new Set(found)].join(', ')}`);

  assert(!prose.includes('?'), 'user guide must not ask questions in prose');
  assert(!prose.includes('%'), 'user guide must keep percent signs inside code');

  // British English: unambiguous American forms stay out of the prose.
  const american = ['color', 'colors', 'behavior', 'favorite', 'analyze',
    'center', 'defense', 'gray', 'fiber', 'labeled', 'traveling', 'fulfill',
    'enrollment', 'catalog'];
  const hits = [];
  for (const word of american) {
    const pattern = new RegExp(`\\b${word}\\b`, 'gi');
    if (pattern.test(prose)) hits.push(word);
  }
  assert.equal(hits.length, 0, `user guide prose must use British English: ${hits.join(', ')}`);
}

console.log('ok — user guide house style: no contractions, no questions, British English, percent in code only');

// --- 3. the clean-run sentence, on every surface and in the CLI ---------------

const CLEAN = 'No findings under the enabled, documented local rules.';

{
  for (const surface of ['README.md', 'SKILL.md', 'USER-GUIDE.md', 'commands/un-diplomatic-agent.md']) {
    assert(read(surface).includes(CLEAN),
      `${surface} must state the clean-run sentence exactly: ${CLEAN}`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'un-editorial-docs-'));
  const config = path.join(tmp, 'config.json');
  fs.writeFileSync(config, '{}');
  let sequence = 0;
  const capture = (prose) => {
    const file = path.join(tmp, `probe-${sequence++}.txt`);
    fs.writeFileSync(file, prose.endsWith('\n') ? prose : `${prose}\n`);
    const out = [];
    const err = [];
    const code = run([file, '--config', config], {
      log: line => out.push(String(line)),
      error: line => err.push(String(line)),
    });
    return { code, output: out.join('\n'), stderr: err.join('\n') };
  };

  const clean = capture('The report was reviewed, and the annex follows.');
  assert.equal(clean.code, 0, `a clean scan must exit 0:\n${clean.output}\n${clean.stderr}`);
  assert(clean.output.includes(CLEAN),
    `a clean scan must print the documented sentence exactly:\n${clean.output}`);

  const dirty = capture('The report is final!');
  assert.equal(dirty.code, 1, `a scan with an error must exit 1:\n${dirty.output}\n${dirty.stderr}`);
  assert(!dirty.output.includes(CLEAN),
    `a dirty scan must not claim a clean run:\n${dirty.output}`);

  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('ok — clean-run sentence: present on every surface, printed only by a clean CLI run');

// --- 4. changelog release section ---------------------------------------------

{
  const changelog = read('CHANGELOG.md');
  assert(!/^##\s+Unreleased\s*$/mi.test(changelog),
    'changelog must not keep an Unreleased placeholder section');
  assert(/^##\s+1\.0\.0\b/m.test(changelog),
    'changelog must carry the released 1.0.0 section');
}

console.log('ok — changelog: 1.0.0 section present, no Unreleased placeholder');

// --- 5. zero npm dependencies --------------------------------------------------

{
  const manifest = JSON.parse(read('package.json'));
  assert(!('dependencies' in manifest), 'package.json must declare no dependencies');
  assert(!('devDependencies' in manifest), 'package.json must declare no devDependencies');
}

console.log('ok — package manifest: no dependencies, no devDependencies');
