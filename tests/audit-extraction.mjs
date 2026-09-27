// un-editorial-check — W1 contract tests: extraction & CLI honesty.
//
// Self-contained: its own tmpdir, its own CLI invocations through the same
// in-process `run` entry point tests/run.mjs uses. Nothing is ever written
// inside the repository (the checker self-scans the repository, and a test
// document inside it would be scanned as copy).
//
// Run standalone: node tests/audit-extraction.mjs
//
// Covered contract items:
//   1. HTML `ue:ignore` suppression (README:329 example and scoping rules)
//   2. Type-annotated TypeScript extraction
//   3. Sentence-like literal promise + the self-scan hard gate
//   4. Explicitly named unsupported files / zero-file scans / supported set
//   5. `fixtures` directory skip at any depth + explicit-path override
//   6. `<input value>` copy
//   7. Empty inline `--config=` / `--profile=` values
//   8. Non-regular existing input (FIFO) honesty
//   9. `Report written:` announcement
//  10. README / USER-GUIDE literal truth (targeted lines)
// plus regressions: MD/JS/TXT suppression matrix, directory exclusions,
// `--report` value refusals, `--fix` refusal on non-prose types.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run } from '../bin/check.mjs';
import { EXTRACTABLE_EXTENSIONS, SUPPORTED_EXTENSIONS } from '../lib/extract.mjs';
import { DEFAULT_EXCLUDES } from '../lib/scanner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'check.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'un-editorial-audit-'));

// Deliberate rule-violating test data. Each constant carries a same-line
// `ue:ignore` so the repository's own self-scan stays clean however the
// sentence-like-literal rule classifies this file's own source.
const ORG = 'The organization reports quarterly.'; // ue:ignore UE-SP001  (deliberate test data)
const ORG_AGAIN = 'The organization reports again.'; // ue:ignore UE-SP001  (deliberate test data)
const DOUBLED = 'The delegation reviewed the the draft.'; // ue:ignore UE-GR001  (deliberate test data)
const DOUBLED_NOPUNCT = 'The delegation reviewed the the draft'; // ue:ignore UE-GR001  (deliberate test data)

const write = (name, value) => {
  const file = path.join(tmp, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
  return file;
};
// An explicit config keeps the suite independent of any .un-editorial.json in
// the working directory.
const config = write('config.json', '{}');

const runRaw = (argv) => {
  const out = [];
  const err = [];
  const code = run(argv, {
    log: line => out.push(String(line)),
    error: line => err.push(String(line)),
  });
  return { code, stdout: out.join('\n'), stderr: err.join('\n') };
};
// Only supply the suite's config when the caller has not chosen one.
const capture = (argv, configPath = config) =>
  runRaw(argv.includes('--config') ? argv : [...argv, '--config', configPath]);
const json = result => {
  try { return JSON.parse(result.stdout); }
  catch { return assert.fail(`stdout is not JSON:\n${result.stdout}\n${result.stderr}`); }
};
const ids = result => [...new Set(json(result).findings.map(f => f.ruleId))].sort();
const scan = (file, ...extra) => capture([file, '--format', 'json', ...extra]);

// --- 1. HTML ue:ignore suppression ------------------------------------------

{
  // Baseline: the same paragraph without a suppression fires UE-SP001.
  assert.deepEqual(ids(scan(write('html-base.html', `<p>${ORG}</p>\n`))), ['UE-SP001']);

  // README:329 ships this exact example; it must produce 0 findings, exit 0 —
  // identical to the Markdown / JS / TXT twins below.
  const inline = scan(write('html-inline.html', `<p>${ORG} <!-- ue:ignore UE-SP001 --></p>\n`));
  assert.deepEqual(ids(inline), [], 'the README HTML suppression example must produce no findings');
  assert.equal(inline.code, 0, 'a fully suppressed HTML file must exit 0');

  // The Markdown, JS and TXT twins behave identically, with and without the
  // suppression (existing behaviour, locked as the contract demands).
  assert.deepEqual(ids(scan(write('twin-base.md', `${ORG}\n`))), ['UE-SP001']);
  assert.deepEqual(ids(scan(write('twin-base.txt', `${ORG}\n`))), ['UE-SP001']);
  assert.deepEqual(ids(scan(write('twin-base.js', `const label = "${ORG}";\n`))), ['UE-SP001']);
  assert.deepEqual(ids(scan(write('twin-sup.md', `${ORG} <!-- ue:ignore UE-SP001 -->\n`))), []);
  assert.deepEqual(ids(scan(write('twin-sup.txt', `${ORG} <!-- ue:ignore UE-SP001 -->\n`))), []);
  assert.deepEqual(
    ids(scan(write('twin-sup.js', `const label = "${ORG}"; // ue:ignore UE-SP001\n`))), []);

  // A comment after </p> on the same line scopes that paragraph.
  assert.deepEqual(
    ids(scan(write('html-after-p.html', `<p>${ORG}</p> <!-- ue:ignore UE-SP001 -->\n`))), [],
    'a comment after </p> on the same line must scope that paragraph');

  // A standalone comment line directly above a paragraph scopes that paragraph.
  assert.deepEqual(
    ids(scan(write('html-above.html', `<!-- ue:ignore UE-SP001 -->\n<p>${ORG}</p>\n`))), [],
    'a standalone comment directly above a paragraph must scope that paragraph');

  // ue:ignore all and family patterns work in HTML.
  assert.deepEqual(ids(scan(write('html-all.html', `<p>${ORG} <!-- ue:ignore all --></p>\n`))), []);
  assert.deepEqual(ids(scan(write('html-family.html', `<p>${ORG} <!-- ue:ignore UE-SP* --></p>\n`))), []);

  // A suppression for a different rule does not silence UE-SP001.
  assert.deepEqual(
    ids(scan(write('html-wrong.html', `<p>${ORG} <!-- ue:ignore UE-TE003 --></p>\n`))),
    ['UE-SP001'], 'a ue:ignore for another rule must not silence UE-SP001');

  // A comment anywhere inside the unit's text span applies to that unit.
  assert.deepEqual(
    ids(scan(write('html-mid.html', '<p>The organization <!-- ue:ignore UE-SP001 --> reports quarterly.</p>\n'))),
    [], 'a comment inside the paragraph text must scope the paragraph');

  // In a multi-paragraph file a suppression in paragraph A does not silence B.
  const multi = scan(write('html-multi.html',
    `<p>${ORG} <!-- ue:ignore UE-SP001 --></p>\n<p>${ORG_AGAIN}</p>\n`));
  assert.deepEqual(ids(multi), ['UE-SP001'],
    'a suppression in paragraph A must not silence paragraph B');
  assert.equal(json(multi).findings[0].line, 2, 'the surviving finding must come from paragraph B');

  const multiAbove = scan(write('html-multi-above.html',
    `<!-- ue:ignore UE-SP001 -->\n<p>${ORG}</p>\n<p>${ORG_AGAIN}</p>\n`));
  assert.deepEqual(ids(multiAbove), ['UE-SP001'],
    'a standalone suppression above paragraph A must not silence paragraph B');
  assert.equal(json(multiAbove).findings[0].line, 3,
    'the surviving finding must come from paragraph B');

  // HTML comments remain masked from rule text (unchanged behaviour).
  assert.deepEqual(
    ids(scan(write('html-comment-masked.html', `<!-- ${ORG} -->\n<p>Clean paragraph.</p>\n`))),
    [], 'comment text must never reach the rules');

  // --- regression: the existing MD/JS/TXT suppression matrix ----------------
  const matrix = [
    ['The organization reports. <!-- ue:ignore UE-SP001 -->', []],
    ['The organization reports. <!-- ue:ignore UE-SP* -->', []],
    ['The organization reports. <!-- ue:ignore all -->', []],
    ['The organization reports. <!-- ue:ignore UE-TE003 -->', ['UE-SP001']],
    ['The organization reports 25%. <!-- ue:ignore UE-SP001,UE-TE003,UE-RE003 -->', []],
  ];
  matrix.forEach(([body, expected], index) => {
    assert.deepEqual(ids(scan(write(`matrix-${index}.md`, `${body}\n`))), expected, body);
  });
  // A Markdown suppression must not leak into the next paragraph.
  assert.deepEqual(
    ids(scan(write('matrix-leak.md',
      'The organization reports. <!-- ue:ignore UE-SP001 -->\n\nThe organization reports again.\n'))),
    ['UE-SP001'], 'a Markdown suppression must not leak into the next paragraph');
  // A JS line suppression must not leak to the next line.
  const jsLeak = json(scan(write('js-leak.js',
    `const label = "${ORG}"; // ue:ignore UE-SP001\nconst other = "${ORG_AGAIN}";\n`)));
  assert.equal(jsLeak.findings.length, 1, 'a JS suppression must not leak to the next line');
  assert.equal(jsLeak.findings[0].line, 2, 'the surviving JS finding must come from line 2');
  // A TXT suppression must not leak into the next paragraph.
  const txtLeak = json(scan(write('txt-leak.txt',
    `${ORG} <!-- ue:ignore UE-SP001 -->\n\n${ORG_AGAIN}\n`)));
  assert.equal(txtLeak.findings.length, 1, 'a TXT suppression must not leak into the next paragraph');
  assert.equal(txtLeak.findings[0].line, 3, 'the surviving TXT finding must come from line 3');
}

// --- 2. type-annotated TypeScript --------------------------------------------

{
  const jsTwin = write('twin-gr.js', `const msg = "${DOUBLED}";\n`);
  const jsIds = ids(scan(jsTwin));
  assert.deepEqual(jsIds, ['UE-GR001'], 'the .js twin must fire UE-GR001');

  const variants = [
    `const msg: string = "${DOUBLED}";\n`,
    `let msg: string = "${DOUBLED}";\n`,
    `var msg: string = "${DOUBLED}";\n`,
    `export const msg: string = "${DOUBLED}";\n`,
    `const msg: Record<string, string> = "${DOUBLED}";\n`,
    `const msg: Array<string> = "${DOUBLED}";\n`,
    `el.textContent = "${DOUBLED}";\n`,
  ];
  variants.forEach((body, index) => {
    const file = write(`annot-${index}.ts`, body);
    assert.deepEqual(ids(scan(file)), jsIds,
      `the .ts twin must fire exactly like the .js twin: ${body.trim()}`);
  });
}

// --- 3. sentence-like literals ------------------------------------------------

{
  // Positive probes: any non-comment position, >= 4 words, ends in . ! or ?.
  const positives = [
    ['console-position.js', `console.log("${DOUBLED}");\n`],
    ['console-assign.js', `const label = "${DOUBLED}";\n`],
    ['array-element.js', `[${JSON.stringify(DOUBLED)}]\n`],
    ['bare-template.js', '`' + DOUBLED + '`\n'],
  ];
  for (const [name, body] of positives) {
    assert.deepEqual(ids(scan(write(name, body))), ['UE-GR001'],
      `a sentence-like literal must be extracted as copy: ${name}`);
  }

  // Negative probes: they must stay silent.
  assert.deepEqual(ids(scan(write('neg-shape.js', 'beep("File not found");\n'))),
    [], 'a short label without a sentence ending must stay silent');
  assert.deepEqual(ids(scan(write('neg-require.js', "require('./some/module');\n"))),
    [], 'a require path must stay silent');
  assert.deepEqual(ids(scan(write('neg-nopunct.js', `const status = "${DOUBLED_NOPUNCT}";\n`))),
    [], 'a string that does not end in . ! or ? must stay silent');
  assert.deepEqual(
    ids(scan(write('neg-comment.js', `// const label = "${DOUBLED}";\nconst x = 1;\n`))),
    [], 'a sentence-like literal inside a comment must stay silent');
}

// --- 4. explicitly named unsupported files and zero-file scans ---------------

{
  // The supported set stays exactly this list.
  assert.deepEqual([...EXTRACTABLE_EXTENSIONS].sort(),
    ['.md', '.markdown', '.txt', '.html', '.htm', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx'].sort(),
    'the extractable extension set must not change');
  assert.deepEqual([...SUPPORTED_EXTENSIONS].sort(), [...EXTRACTABLE_EXTENSIONS].sort(),
    'the announced list must match the extractable set');

  for (const ext of ['.py', '.vue', '.xml', '.json', '.css']) {
    const file = write(`unsupported${ext}`, 'copy that would otherwise scan\n');
    const result = capture([file]);
    assert.equal(result.code, 2, `an explicitly named ${ext} file must refuse with exit 2`);
    assert.ok(result.stderr.includes(file), `stderr must name the path: ${result.stderr}`);
    for (const supported of SUPPORTED_EXTENSIONS) {
      assert.ok(result.stderr.includes(supported),
        `stderr must list the supported extensions: missing ${supported}`);
    }
  }

  // A directory scan still skips unsupported files silently …
  write('ext-mixed/style.css', `${ORG}\n`);
  write('ext-mixed/data.json', `${ORG}\n`);
  write('ext-mixed/page.txt', `${ORG}\n`);
  const mixed = json(capture([path.join(tmp, 'ext-mixed'), '--format', 'json']));
  assert.equal(mixed.files, 1, 'unsupported files in a directory scan must be skipped, not counted');

  // … but a scan in which zero files were scanned is a refusal.
  const emptyDir = path.join(tmp, 'only-unsupported');
  fs.mkdirSync(emptyDir, { recursive: true });
  fs.writeFileSync(path.join(emptyDir, 'style.css'), 'body { color: red; }\n');
  const zero = capture([emptyDir]);
  assert.equal(zero.code, 2, 'a scan that finds no supported files must exit 2');
  assert.match(zero.stderr, /no supported files found/,
    `stderr must say no supported files were found: ${zero.stderr}`);
  assert.ok(zero.stderr.includes(emptyDir), `stderr must name the path: ${zero.stderr}`);

  // An explicitly named empty .txt / .md file still scans: 0 findings, exit 0.
  for (const name of ['empty-file.txt', 'empty-file.md']) {
    const file = write(name, '');
    const result = scan(file);
    assert.equal(result.code, 0, `${name} must scan clean with exit 0`);
    assert.deepEqual(ids(result), [], `${name} must produce no findings`);
  }

  // A genuinely missing path keeps `path not found`.
  const missing = runRaw([path.join(tmp, 'no-such-path')]);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /path not found/);

  // --fix on non-prose types is refused by the fixer, unchanged.
  const fixHtml = write('fix-page.html', `<p>${ORG}</p>\n`);
  const fixHtmlBefore = fs.readFileSync(fixHtml, 'utf8');
  const fixHtmlResult = capture([fixHtml, '--fix', '--apply']);
  assert.equal(fixHtmlResult.code, 2, 'HTML must still be refused by --fix');
  assert.match(fixHtmlResult.stderr, /refusing --fix/);
  assert.equal(fs.readFileSync(fixHtml, 'utf8'), fixHtmlBefore, 'HTML must not be rewritten');

  const fixJs = write('fix-script.js', `const label = "${ORG}";\n`);
  const fixJsBefore = fs.readFileSync(fixJs, 'utf8');
  const fixJsResult = capture([fixJs, '--fix', '--apply']);
  assert.equal(fixJsResult.code, 2, 'JavaScript must still be refused by --fix');
  assert.match(fixJsResult.stderr, /refusing --fix/);
  assert.equal(fs.readFileSync(fixJs, 'utf8'), fixJsBefore, 'JavaScript must not be rewritten');
}

// --- 5. fixtures directory skip ----------------------------------------------

{
  assert.ok(DEFAULT_EXCLUDES.includes('fixtures'),
    'DEFAULT_EXCLUDES must skip any directory segment named fixtures');
  const defaults = JSON.parse(fs.readFileSync(path.join(root, 'config', 'default.json'), 'utf8'));
  assert.ok(defaults.ignoredPaths.includes('fixtures/**'),
    'config/default.json ignoredPaths must skip fixtures at any depth');

  write('proj/fixtures/skipped.md', `${ORG}\n`);
  write('proj/other/kept.md', `${ORG}\n`);
  write('proj/a/fixtures/deep.md', `${ORG}\n`);

  // A directory scan skips fixtures at any depth …
  const dirScan = json(capture([path.join(tmp, 'proj'), '--format', 'json']));
  assert.equal(dirScan.files, 1,
    `fixtures at any depth must be skipped in directory scans: ${JSON.stringify(dirScan)}`);
  assert.ok(dirScan.findings[0].file.replace(/\\/g, '/').endsWith('proj/other/kept.md'),
    'only the non-fixtures file must be scanned');

  // … while a fixtures path named explicitly on the command line is scanned.
  const explicitFile = path.join(tmp, 'proj', 'fixtures', 'skipped.md');
  assert.deepEqual(ids(scan(explicitFile)), ['UE-SP001'],
    'an explicitly named fixtures file must still be scanned');

  const explicitDir = json(capture([path.join(tmp, 'proj', 'fixtures'), '--format', 'json']));
  assert.equal(explicitDir.files, 1,
    'an explicitly named fixtures directory must still be scanned');
  assert.deepEqual([...new Set(explicitDir.findings.map(f => f.ruleId))].sort(), ['UE-SP001']);
}

// --- 6. <input value> copy ----------------------------------------------------

{
  const withValue = scan(write('input-value.html',
    '<input type="button" value="The organization will publish the guide.">\n'));
  assert.ok(ids(withValue).includes('UE-SP001'),
    `an input button value must be scanned and fire UE-SP001: ${withValue.stdout}`);

  // The existing <button value> handling is unchanged.
  const button = scan(write('button-value.html',
    '<button value="The organization will publish the guide."></button>\n'));
  assert.ok(ids(button).includes('UE-SP001'), 'a button value must keep firing UE-SP001');

  // A text input default value is user data, not published copy.
  const textInput = scan(write('input-text.html',
    '<input type="text" value="The organization will publish the guide.">\n'));
  assert.deepEqual(ids(textInput), [],
    'a text input default value must not be treated as published copy');
}

// --- 7. empty inline flag values ---------------------------------------------

{
  // `--config=` and `--profile=` are usage failures, not silent fallbacks.
  const emptyConfig = capture(['--config=']);
  assert.equal(emptyConfig.code, 2, '--config= must exit 2');
  assert.match(emptyConfig.stderr, /--config requires a value/);

  const emptyProfile = capture(['--profile=']);
  assert.equal(emptyProfile.code, 2, '--profile= must exit 2');
  assert.match(emptyProfile.stderr, /--profile requires a value/);

  // --report already refuses an empty value; keep it.
  const reportEmpty = spawnSync(process.execPath, [cli, '--report='],
    { encoding: 'utf8', cwd: tmp });
  assert.equal(reportEmpty.status, 2, '--report= must still exit 2');
  assert.match(reportEmpty.stderr, /--report requires a value/);
  const reportMissing = spawnSync(process.execPath, [cli, '--report'],
    { encoding: 'utf8', cwd: tmp });
  assert.equal(reportMissing.status, 2, '--report without a value must still exit 2');
  assert.match(reportMissing.stderr, /--report requires a value/);

  // Normal forms are unchanged.
  const clean = write('flag-clean.txt', 'The organisation reports the figure.\n');
  assert.equal(capture([clean, '--config', config]).code, 0,
    '--config <path> must keep working');
  assert.equal(capture([clean, '--profile', 'security']).code, 0,
    '--profile <name> must keep working');

  // A non-empty but odd --config value reaches the loader unchanged: it is
  // refused as a missing config file, never as an empty flag value.
  const odd = capture([clean, '--config', '{"json"}']);
  assert.equal(odd.code, 2);
  assert.match(odd.stderr, /config not found/);
  assert.doesNotMatch(odd.stderr, /requires a value/,
    'a non-empty --config value must not be treated as empty');
}

// --- 8. non-regular existing input -------------------------------------------

{
  const fifo = path.join(tmp, 'pipe.txt');
  const made = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
  if (made.status === 0) {
    const result = spawnSync(process.execPath, [cli, fifo],
      { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 2, `a FIFO must refuse with exit 2: ${result.stderr}`);
    assert.ok(!result.error, 'a FIFO must not hang the run');
    assert.match(result.stderr, /not a regular file/,
      `stderr must say it is not a regular file: ${result.stderr}`);
    assert.ok(result.stderr.includes(fifo), `stderr must name the path: ${result.stderr}`);
  }
}

// --- 9. report path announcement ----------------------------------------------

{
  const target = write('report-target.txt', `${ORG}\n`);
  const pdf = path.join(tmp, 'announce.pdf');

  // TEXT, not quiet: exactly one `Report written:` line, after the findings.
  const textResult = capture([target, '--report', pdf]);
  assert.equal(textResult.code, 1, 'the target must report UE-SP001');
  const announced = textResult.stdout.split('\n').filter(line => line.startsWith('Report written: '));
  assert.equal(announced.length, 1, `expected exactly one announcement:\n${textResult.stdout}`);
  assert.equal(announced[0], `Report written: ${pdf}`,
    'the announcement must carry the path exactly as given');
  assert.ok(textResult.stdout.trimEnd().endsWith(`Report written: ${pdf}`),
    'the announcement must come after the findings block');

  // --quiet never announces.
  const quiet = capture([target, '--report', path.join(tmp, 'announce-quiet.pdf'), '--quiet']);
  assert.equal(quiet.stdout.includes('Report written:'), false,
    '--quiet must not announce the report');
  assert.equal(quiet.stdout.trim(), '', '--quiet must not print the text report');

  // --format json and --format sarif stay machine-readable.
  for (const format of ['json', 'sarif']) {
    const result = capture([target, '--report', path.join(tmp, `announce-${format}.pdf`),
      '--format', format]);
    assert.doesNotThrow(() => JSON.parse(result.stdout),
      `--format ${format} must stay valid JSON`);
    assert.equal(result.stdout.includes('Report written:'), false,
      `--format ${format} must not announce the report`);
  }

  // The path is printed exactly as given, even when relative.
  const relative = spawnSync(process.execPath,
    [cli, 'report-target.txt', '--report', 'given-name.pdf'],
    { cwd: tmp, encoding: 'utf8' });
  assert.equal(relative.status, 1, `expected the failing exit code: ${relative.stderr}`);
  assert.ok(relative.stdout.includes('\nReport written: given-name.pdf'),
    `relative report paths must be echoed as given:\n${relative.stdout}`);
}

// --- 10. documentation is literally true -------------------------------------

{
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  // Supported formats: the exact extension list.
  for (const ext of SUPPORTED_EXTENSIONS) {
    assert.ok(readme.includes(`\`${ext}\``),
      `README must document the supported extension ${ext}`);
  }
  assert.ok(readme.includes(
    '`.md`, `.markdown`, `.txt`, `.html`, `.htm`, `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts` or `.tsx`'),
    'README must list the supported extensions exactly');
  // Exit codes: exit 2 for an unsupported named file and for a zero-file scan.
  assert.match(readme, /\| `2` \|[^|\n]*unsupported/,
    'the README exit-code table must document exit 2 for unsupported named files');
  assert.match(readme, /\| `2` \|[^|\n]*no supported files/,
    'the README exit-code table must document exit 2 for a zero-file scan');
  // Directory skipping: the promise at README:304 stays.
  assert.match(readme,
    /hidden directories, `node_modules`, build output and fixtures are skipped unless you name them explicitly/,
    'README must keep the directory-skip promise');

  const guide = fs.readFileSync(path.join(root, 'USER-GUIDE.md'), 'utf8');
  const guideLines = guide.split('\n');
  // Lines 24 and 83 (1-based) name the file formats: exact extension lists,
  // and the house style holds — no question marks, no percent signs.
  for (const number of [24, 83]) {
    const line = guideLines[number - 1];
    for (const ext of SUPPORTED_EXTENSIONS) {
      assert.ok(line.includes(`\`${ext}\``),
        `USER-GUIDE line ${number} must document ${ext}: ${line}`);
    }
    assert.ok(!/[?%]/.test(line),
      `USER-GUIDE line ${number} must keep the house style (no question mark, no percent): ${line}`);
  }
  // The guide documents exit code 2 for an unsupported file type.
  assert.ok(guide.includes('exit code 2'),
    'USER-GUIDE must document exit code 2 for an unsupported file type');
}

// --- self-scan gates (the hard gate of contract item 3) -----------------------

{
  const selfScan = spawnSync(process.execPath, [cli, '.', '--self-scan', '--quiet'],
    { cwd: root, encoding: 'utf8' });
  assert.equal(selfScan.status, 0,
    `the repository's own self-scan must exit 0:\n${selfScan.stdout}\n${selfScan.stderr}`);

  const plain = spawnSync(process.execPath, [cli, '.'],
    { cwd: root, encoding: 'utf8' });
  assert.equal(plain.status, 0,
    `node bin/check.mjs . must exit 0:\n${plain.stdout}\n${plain.stderr}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok — HTML suppressions, TypeScript, sentence-like literals, unsupported files, fixtures, flags, FIFO, report line, docs, self-scan');
