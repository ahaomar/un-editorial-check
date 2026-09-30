# Changelog

## 1.4.0 – 30 September 2026

The first instalment of the report redesign approved for this release: the furniture that frames every page of both report formats, and the document title. What the tool finds, the counts it reports, the order of the report's sections and how it exits are as they were in 1.3.1.

### Changed

- **The document title is `Editorial Review Report`.** Both formats carried `UN Editorial Review` before: it was the HTML `<title>` and `<h1>`, the PDF's banner, and the fallback used when a scan supplied no targets. The new wording names what the document is instead of restating the tool, and one constant in `lib/furniture.mjs` now feeds every place it appears, so the two formats cannot drift apart on it.
- **The header is two rows of two cells, repeated on every page.** The first row is `un-editorial-check <version>` on the left against `EDITORIAL REVIEW` on the right; the second is `Document symbol: UE/<year>/<4 digits> · <date>` on the left against `Distribution: General` on the right. The header was four full-width lines: `EDITORIAL REVIEW`, then the scanned targets or `UN Editorial Review` where a scan supplied none, then the symbol and the date together, then the distribution marking. The targets are no longer repeated on every page because the cover already states them, and the space they occupied is what lets the right-hand cells sit at the right margin. The header reads `EDITORIAL REVIEW` and never `UNITED NATIONS`, exactly as before.
- **The footer is three cells across the width of the page.** `Page N of M` on the left, `© <year> un-editorial-check contributors` in the centre, and `github.com/ahaomar/un-editorial-check` on the right. The year is read from the scan's own date; where the input carries no date the year is left out of the line rather than guessed or taken from the machine running the scan, so two runs over one input draw the same footer.

### Removed

- **Two footer lines.** `Prepared by un-editorial-check, an independent editorial tool` and `report only; findings are not changed by this report.` are no longer printed under either report. Neither carried a promise the reader could act on. The footer is where the page position and the source belong, and the sentence a reader can act on — *This report changes nothing; re-run the checker to verify corrections.* — still opens the framing block of every report as it did before.

### Unchanged

Everything else. The thirty-seven rules, the five lanes, the clean-run wording, the exit-code contract, the grouping arithmetic, the twelve-category legend, the construction of the document symbol, the endorsement boundary and zero npm dependencies are as in 1.3.1. `--report-detail` still selects the layout, and JSON and SARIF are untouched.

### Not in this release

The rest of the approved redesign is deliberately left for a following release: the new order of the report's sections, sections carrying no numbers, the cap of twenty warnings printed with the count withheld and the exact re-run command beside it, and the drawing of the category artwork in both formats. The artwork itself is built and held in `lib/icons.mjs`, and the legend already carries an icon for each of the twelve categories, but neither format draws them yet.

## 1.3.1 – 29 September 2026

A short release prompted by a static analyser's report on this repository. Neither change alters what the tool finds, what it prints, or how it exits.

### Changed

- **The conditional spread that gives a PDF finding its page number no longer has `null` as its empty branch.** Spreading `null` into an object literal is a legal no-op, but an analyser pattern-matches the form as a possible spread of a non-object, so `{}` is used instead. The spread stays inside the finding's `properties`, and the SARIF shape is unchanged: a scan of any format other than `.pdf` emits properties byte-identical to 1.3.0, because neither branch ever added a key for a finding that has no page.
- **`socket.yml` names `tests/fixtures/audits/security.mjs` under `projectIgnorePaths`.** The fixture is a deliberate test fixture that is never executed, and a scanner reading it as source reports the fixture's own contents as though this repository had written them. This is the documented mechanism, and it supersedes an earlier attempt to record the same intent in a file Socket does not read.

### Unchanged

Everything else. The thirty-seven rules, the five lanes, the clean-run wording, the exit-code contract, the grouping arithmetic, the report formats, the twelve-category legend and zero npm dependencies are as in 1.3.0.

## 1.3.0 – 29 September 2026

Two features in one release: `.pdf` became a supported input, and the reports were redesigned around grouped issues.

### Added

- **`.pdf` is a supported input.** The text is recovered from the document's own bytes — xref tables and cross-reference streams, object streams, `FlateDecode`, `ASCIIHexDecode`, `ASCII85Decode`, `LZWDecode`, `RunLengthDecode`, the standard encodings, `/Differences` and `ToUnicode` CMaps — and screened by the same rules as any other copy. A PDF is a rendered page, so the tool cannot tell a quotation from a paragraph: every unit recovered is `authored`, and quoted material inside a PDF is screened rather than exempted, which is a difference made by the format rather than a property of the copy. `line` is a visual line reconstructed from the page layout and counted continuously through the document, and JSON and SARIF carry an additional `pdfPage`. A scanned or image-only document, an encrypted document, and a document whose fonts carry no recoverable encoding are refused with exit `2` and a named reason: nothing on standard output, no partial extraction, and no clean-run sentence for a document that was not read. `--fix` refuses a PDF, as it refuses every other non-prose format.
- **Grouped issues in the PDF and the HTML report.** Findings that agree on every value the reader sees — rule, lane, severity, confidence, category, matched text, advice and explanation — are drawn once as a single issue, with an `Occurrences` table giving each finding's own file, line and column, and a count shown when there is more than one. Two findings that differ in any of those stay apart rather than being summarised together, and `file` is not part of an issue's identity, so one defect in two files is one issue with two occurrences.
- **`--report-detail <grouped|full>`.** `grouped` is the default and `full` restores the previous layout of one block per finding. It is a rendering choice and nothing else: the severity counts, the lane counts and the process exit code are computed from the findings before either layout runs, so the two modes cannot disagree, and neither `--format json` nor `--format sarif` takes the flag.
- **A category legend on every surface.** The PDF, the HTML report and the terminal each state all twelve category markers with their text labels and this scan's count against each, including the categories that fired nothing, because a legend that drops part of its own vocabulary reads as though those categories do not exist. The terminal also carries the marker and the category's text label on every finding line, so the short code is never the only signal naming it.
- **Document furniture.** Both report formats open with a header reading `EDITORIAL REVIEW` carrying the report date, the targets and the version, and carry a footer with the credit line and the page numbers. Each scan also draws a document symbol of the form `UE/<year>/<4 digits>`, assigned by the tool from the date, the targets and the version as a reference for that one scan: registered nowhere, and not a document number of any institution.

### Changed behaviour to be aware of

- **The default PDF and HTML layout is grouped.** A reader of either file that expected one block per finding should pass `--report-detail full` or read the occurrence table. [docs/MIGRATION.md](docs/MIGRATION.md) sets the change out in full.
- **The terminal gained two additions**: the marker and the category after the rule id on a finding line, and a `categories:` line after `lanes:`. Neither appears on a clean run, which still prints the clean sentence and nothing else.
- **JSON and SARIF are unchanged**: one result per finding, in the same shape as 1.2.1, whatever the detail flag says.

### Verified, and how

Full suite green; `p48-gate.sh` `fail=0` over eight steps and the four corpus verifiers; `qa-battery.mjs` 6/6; self-scan exit `0`; portability exit `0`; `smoke.sh 1.3.0` green. Grouping is locked by an assertion that derives its expected counts from JSON rather than from another rendering of the same model, checks both formats in both detail modes, counts the occurrence rows against the findings, and is shown to reject a report whose count drifted. The legend on the terminal is locked against its own findings, its twelve codes in catalogue order and a drift check of its own. Every claim this release adds has a row in [docs/CLAIM-EVIDENCE-AUDIT.md](docs/CLAIM-EVIDENCE-AUDIT.md) with its limitations stated in the row.

### Not changed

The five lanes, the exact clean-run sentence `No findings under the enabled, documented local rules.`, the `--fix` allow-list (`UE-GR001`, `UE-GR002`, `UE-GR003`, `UE-NU002`, `UE-SP001`), the exit-code mapping, that heuristic findings are review severity by default, that audits never move the exit code, and that no report settles a question of fact, of law or of institutional endorsement. Zero npm dependencies. No rule was changed for this release.

## 1.2.1 – 28 September 2026

A single defect fix, found by CI rather than by any local check.

### Fixed

- **An installed package could not pass its own self-scan.** The exclusion patterns were matched against absolute paths, so a package installed under `node_modules` matched the `node_modules/**` pattern through its own parent. A `--self-scan` inside an install therefore either ran with no exclusions in force or excluded every file. The first case read `lib/fixtures/self-test`, the deliberate violations `--self-test` asserts on, and the installed package failed a scan of itself. The pattern match is now made against the path relative to the walk root, so `node_modules` as an *ancestor* of the scan root matches nothing while `lib/fixtures` inside it still does.

  This is what the CI release gate runs, and it had been failing on every release from `v1.0.0` onwards. `tests/release-regressions.mjs` now installs the packed tarball and asserts the installed binary self-scans clean, does not read the deliberate-violation fixture, and actually reads the package. The lock is shown to fail when the fix is reverted.

### Unchanged

Everything else. The five lanes, the clean-run wording, the `--fix` allow-list, the exit-code contract, the report formats and zero npm dependencies are as in 1.2.0.

## 1.2.0 – 28 September 2026

The leftover release: everything deferred after 1.1.0, plus the three features parked for it. Three new opt-in capabilities (an HTML report, a reader-supplied glossary, a watch loop), one new P0 detection, and four honesty fixes where the tool could claim more than it had done. The five lanes, the `--fix` allow-list, the exact clean-run wording, the exit-code contract and report-first behaviour are unchanged.

### Added

- **`--report <path.html>`** — a self-contained HTML report beside the existing PDF, dispatched on the extension. The same five lanes, the same six fields on every finding, the same framing disclaimer, byte-identical output for identical input so it can be diffed. No external stylesheet, script or font; every value escaped. A report extension the tool does not render is a refusal with exit `2`, never a silent fall-back to PDF.
- **`--glossary <file>`** (and a `glossary` key in `.un-editorial.json`) — the reader's own terminology: a term on their `forbiddenTerms` list that appears in the copy, and a term on their `requiredTerms` list that appears nowhere in a scanned file. New rules `UE-GL001` and `UE-GL002`, audit-lane, warning severity. Labelled user-supplied everywhere — the catalogue source names the mechanism rather than a file, the profile reads `glossary`, the report gives it its own `OPTIONAL AUDIT — glossary` section, and every message ends by saying it is the reader's house terminology and not a United Nations rule. It is never recorded in `rules/sources.json`, which holds sourced institutional rules, because a personal file has no URL and no retrieval date. It never changes the exit code, and `--fix` never rewrites it. Fails closed with exit `2` on a wrong `glossaryVersion`, an unknown key, a wrong type, an empty term, a term that can never match, a duplicate term, a replacement key that is not forbidden, a missing file and a directory.
- **`--watch`** — re-scan whenever a scanned file changes, for one writer and one editor. Watches directories rather than files, because an editor that saves by rename replaces the file. Survives deletion, rename-replacement and directory removal. Resolves no exit code and says so; Ctrl+C exits `130`, never `0`. Every flag whose contract is an exit code or a single output document is refused up front rather than quietly ignored.
- **`UE-HR003` cross-block form** — a long authored paragraph repeated verbatim inside the same file is now reported, with the line where the first copy was. A block is the *visual paragraph*, reassembled from the units the markup split, so bold, italics, a link or a highlighted span inside one copy cannot hide the repeat, whether it wraps whole words or breaks one word in half. No replacement is passed, so it stays out of the `--fix` set.
- **JSX and TSX text children** are extracted by markup shape rather than by extension: `() => <p>The color reports quarterly.</p>` in a `.js` file is now scanned. The full HTML attribute grammar including the legal unquoted form, plus `aria-description`, `aria-roledescription` and `aria-valuetext`.
- **Launch and discovery material**: `docs/LAUNCH.md`, a five-lane demo under `docs/demo/`, shareable copy under `templates/social/`, a README Quickstart with the output shape and a five-lane table, and expanded npm keywords.

### Fixed

- **The skill-root shield was too wide.** It deleted *every* input under the skill root, so `check.mjs README.md` printed `scanned 0 files`, the clean-run sentence and exit `0` — claiming clean after reading nothing. The shield now applies only when the input *is* the skill root; a named file or sub-directory is scanned. A scan of the root still exits `0`, as documented.
- **A run could claim clean after reading nothing.** A file whose bytes are not decodable as UTF-8 — a misnamed binary, or a UTF-16 export saved as `.txt` — is now skipped, counted out of the scanned total and named in the header (`scanned 1 of 3 files — 2 skipped (not valid UTF-8)`) and in the JSON and SARIF output. A scan in which *every* candidate file was skipped is a refusal with exit `2`. Previously a binary renamed `.txt` produced findings invented from its file header, and `--fix --apply` rewrote the file.
- **UTF-16 was not actually caught.** It is valid UTF-8, so the strict decode succeeded and NUL-interleaved bytes became copy that rules read at meaningless positions. The guard now checks for a NUL byte first, the same signal git uses to classify a file as binary.
- **The PDF hid its own character loss.** A path outside WinAnsi still folds to `?`, but the report now says so, naming the encoding and warning that two names differing only in such a character will look alike, and that the JSON carries the exact name. A report that folded nothing is byte-identical to before.
- **The PDF omitted the framing disclaimer** that claim row 22 promises for "the report". It now leads the PDF, identical to the HTML, before any finding.
- **Four false-positive classes removed from `UE-HR002`.** `women are inferior`, `older people are inferior`, `refugees is inferior` and `migrants is inferior` were misparses of comparatives about rights, data and access. A preposition before the group now makes it the preposition's complement; partitives are exempt, so `All of the foreigners are criminals` still fires. Ten true positives still fire, verified by a 47-term × 3-template symmetry sweep.
- **`lib/cli.mjs` no longer breaks the repository's own rules.** The watch help text contained a missing sentence space and an all-caps heading, which the tone and grammar corpus verifiers caught.

### Changed behaviour to be aware of

- The **skill-root carve-out is narrower**. Naming a file or sub-directory inside the skill root is now scanned where it was previously dropped silently.
- **A run that reads nothing can now be refused.** An all-undecodable directory is exit `2` rather than a clean `0`.
- **Two rules were added to the catalogue** (43 to 45) and three test suites to the chain (20 to 23).
- **Guard notes narrowed to match the code.** `UE-HR003` no longer promises silence on "navigation" copy, because a Markdown document has no navigation surface: a standing paragraph repeated under your own section headings inside one Markdown file *is* reported, and `ue:ignore` silences it. A repeated paragraph is reported per file, never across files.

### Verified, and how

Full suite: 23 suites, 60 assertions groups, exit `0`. Corpus verifiers: 44 of 45 rules fire, `UE-TE003` documented-silent, no finding on a control line. Self-scan exits `0` with the repository scanning itself. Two independent adversarial QA passes over this release: the first returned **GO** with 13 findings, of which 4 Medium were all closed; a focused re-check of those fixes returned **GO** and found a regression the first pass had missed, which was also closed. Every claim in `docs/CLAIM-EVIDENCE-AUDIT.md` is re-verified against observed behaviour, and each new lock was shown to fail when its guarantee is removed.

### Not changed

The five lanes, the exact clean-run wording `No findings under the enabled, documented local rules.`, the `--fix` allow-list (`UE-GR001`, `UE-GR002`, `UE-GR003`, `UE-NU002`, `UE-SP001`), the exit-code mapping, the fact that heuristics are review severity by default, that audits never move the exit code, and the framing both report formats now state in full: the report never presents itself as verification of facts, legal opinion or United Nations endorsement. Zero npm dependencies. No rule change was made without a sourced fixture.

## 1.1.0 – 28 September 2026

The Phase 6 completion release: five output lanes, the exact clean-run sentence, diplomatic claims as review, heuristic findings as review severity by default, and a full documentation truth-pass with a migration guide and an audit table. Report-first behaviour, zero npm dependencies, the approval-gated command and the exit-code contract are unchanged.

- **The clean-run sentence is now exact.** A run with no findings prints `No findings under the enabled, documented local rules.` instead of the old `No editorial findings.` in the CLI, the README, the skill instructions, the user guide and the command template; the PDF report states the same meaning. Migration: any script or test that greps for the old sentence must match the new one — the exit codes do not change, so exit `0` still means no error-severity findings.
- **Five output lanes.** The text, JSON, SARIF and PDF outputs separate deterministic rule violations, heuristic editorial review, harmful or discriminatory review, diplomatic sensitivity and optional audits, each finding carrying rule source, profile, confidence, limitation and recommended human action. Heuristic findings flip to review severity by default: they no longer fail a run unless the organisation configures them to `error`. Migration: parsers keyed to the old section headings must be re-keyed to the lanes; consumers of `--format json` gain fields but keep the existing ones; pipelines that relied on heuristic errors failing the build must set `severities` for those rules in `.un-editorial.json`.
- **Diplomatic claims are review, not verdicts.** `UE-DP001` reports contested territorial-status statements as requiring diplomatic review in the diplomatic sensitivity lane, symmetrically for every party, rather than as factual errors. Migration: organisations that treated exit `1` on `UE-DP001` as a build gate must set `severities` for it explicitly.
- **Docs, gates and release hygiene.** A docs truth-pass across the README, skill instructions, user guide and command template; [docs/MIGRATION.md](docs/MIGRATION.md) explains every behaviour change above with its instruction; [docs/CLAIM-EVIDENCE-AUDIT.md](docs/CLAIM-EVIDENCE-AUDIT.md) records each claim, whether it is supported, its limitations and the test that locks it. The user guide's house style (no contractions, no question marks in prose, British English, no percentage signs outside code fences) and the banned-claim phrases are enforced by a test; the source registry gains schema, URL, date, uniqueness and catalogue-reference validation in the test chain and in CI; mutation-style variant tests prove representative rules fire on their defect, fall silent without it and obey configuration — each probe document written to a temporary directory outside the repository; CI fails if a suite writes into the working tree.

### Migration notes for existing configurations

- `.un-editorial.json` keeps every documented key (`ignoredPaths`, `allowlist`, `severities`, `rules`, `spellingReview`, `baseOrigin`, `renderTargets`) and its precedence: the configuration file still wins over a profile. Unknown keys still fail closed with exit `2`, so a stale key is reported, never ignored.
- If you pinned behaviour with `severities`, re-check each heuristic rule: the default severity is now review. If you pinned spelling, decide between `--profile un-secretariat-document`, `--profile generic-british-english`, `allowlist.spellings` and `severities`.
- If your CI greps the text report or the clean-run sentence, update it to the lanes and the new wording; prefer the exit codes and `--format json`, which are the stable interfaces.
- Re-run `npm test` (or `un-editorial-check --self-test`) after upgrading, and review the diff of your installed skill as described in the README.

## 1.0.0 – 28 September 2026

<!--
  changelog-1.0.0.md — body fragment for `release-prepare --changelog-body <this file>`.
  Format: BODY ONLY. Do not include a "## ..." heading: the tool generates
  `## 1.0.0 – <date>` itself and inserts this file verbatim directly beneath it
  (above the previous newest section), then syncs the five version anchors.
  Leading/trailing blank lines are trimmed on insert. This comment renders
  invisibly in Markdown and may stay or be deleted before use — but the file
  must remain a fragment, never a section.
-->

Milestone release at the wave-2 gate: profile-aware spelling, the terminology rework, the fail-closed fix set and the adoption pack. Report-first behaviour, zero npm dependencies, the approval-gated command and the exit-code contract are unchanged.

- **Spelling conflicts became a profile choice (W2a).** The `-ize`/`-ise` conflict family (for example `organization`) is a profile-selection warning by default — named as a profile choice, never called wrong, never fixable — silent under `--profile un-secretariat-document` (alias `un-v1`) and under `--profile un-geneva-web`, and an error only under `--profile generic-british-english`; non-conflict `SP001` findings are unchanged, and `analyse`, `catalyse`, `paralyse` and `practise` stay errors everywhere. Migration: choose a bundled profile with `--profile`, or set `severities` / `allowlist.spellings` in `.un-editorial.json`; conflict-family findings no longer fail the build by default and `--fix` no longer rewrites them.
- **Bundled profiles resolve by name, and the registry fails closed (W2a).** Profile names resolve from the bundle (path wins over name; an unknown name exits `2` and lists the bundled names), profile validation fails closed with replace semantics, and catalogue entries are cross-checked against the source registry — `UE-SP003` is consolidated into the same catalogue. Migration: pin a profile name or path in your config; a stale or misspelled profile is now reported, never silently ignored.
- **Terminology rules reworked and removed from `--fix` (W2b).** `maternal mortality rate` is reviewed only where the printed statistic is the per-100 000-live-births ratio (warning, never an error or an automatic rewrite); the unsourced `women's work` and `female work` pairs are removed while the sourced `handicapped` → `persons with disabilities` pair stays; the percentage sign is silent in ordinary running prose while the spelling `percent` becomes `per cent` under the United Nations profiles; source identifiers are wired into the terminology catalogue entries. `UE-TE001`–`UE-TE004` leave the `--fix` set entirely: `--fix` never rewrites terminology, claims, dates, political wording, quotations, harmful wording or sources — only spelling outside the conflict family, en-dash ranges and the grammar repairs remain. Migration: scripts that used `--fix` for `per cent` or `the United States` must rewrite those from the report's `Should be` column; findings that disappear (the removed pairs, percentage signs in prose) are removed by source evidence, not regressions — see `rules/sources.json`.
- **A fail-closed fix set, deeper extraction, and five review heuristics (Wave 4).** The fix shrink is enforced fail-closed: `planFixes` honours an explicit allow-list, so only non-conflict spelling, en-dash ranges and the grammar repairs ever reach `--fix`, and a contract test locks the set against future rules. Extraction now covers headings, lists, tables, captions, dialog, labels, title and meta, and blockquotes, and every finding carries a context (`authored`, `quoted`, `cited`, `code`, `nav`, `metadata`) that flows through the JSON, SARIF and HTML output. Five review heuristics, `UE-HR001`–`UE-HR005`, report verbless sentence fragments, malformed wording such as `could of`, repeated sentences, headings that end in a full stop and unpaired quotation marks; each is warning severity at heuristic confidence, documents its narrow boundary, and is never rewritten by `--fix`. Migration: any automation that expected `--fix` to rewrite anything beyond spelling, ranges and the grammar repairs must apply changes from the report's `Should be` column.
- **Adoption pack for new installs.** `--init` writes a starter `.un-editorial.json` (refusing to overwrite without `--init-overwrite`), `--baseline` records a passing baseline and compares later runs against it, `--self-test` verifies the installed package end to end against bundled clean and violation fixtures, and `--preview` shows the per-platform characters the renderer can emit. A GitHub Action (`action.yml`), a pre-commit hook, and ready-to-paste agent-command templates for Claude Code, Codex, Cursor and OpenCode ship under `templates/`, each locked by a contract suite. Migration: none; these commands are additive.

### Migration notes for existing configurations

- `.un-editorial.json` keeps every documented key and its precedence (configuration file wins over profile); unknown keys still fail closed with exit `2`.
- Decide your spelling posture once: `--profile un-secretariat-document`, `--profile un-geneva-web`, `--profile generic-british-english`, `allowlist.spellings` or explicit `severities`.
- Re-run `npm test` (or `un-editorial-check --self-test`) after upgrading.

## 0.9.0 – 27 September 2026

First release of the deep editorial audit's remediation batch. Report-first behaviour, zero npm dependencies and the approval-gated command are unchanged.

- **Extraction and CLI honesty.** `<!-- ue:ignore UE-SP001 -->` now suppresses inside HTML copy spans, inline or standalone, scoped to the paragraph or line it sits in — the README's suppression example is literally true again. Scanning a named file with an unsupported extension refuses with exit `2` and lists the supported extensions, as does an empty scan (the skill root's own self-shield excepted); an empty `--config=` or `--profile=` refuses with exit `2` instead of being silently dropped; sentence-like string literals in JavaScript and TypeScript are scanned, including type-annotated declarations and `value` attributes on input buttons; a bare `fixtures` directory is skipped at any depth while a directory named explicitly still scans; a non-regular file reports `not a regular file` rather than hanging; `--report` announces `Report written: <path>` in normal text output. Each contract is locked by a new audit suite.
- **Detection corrections.** Attribution recognises the reporting-verb families (states, confirmed, observed, told, underlined, highlighted, commented, warned, remarked, explained, clarified and their other forms), both leading the claim and trailing it within six words with the comma optional, so a claim attributed by an unrecognised verb no longer slips through. `UE-HS003` stays silent on operational copy such as registration routes and document handovers while still firing on `Foreigners should leave the country.`; `UE-RE002` exempts the fixed economic term `leading indicator`; `UE-RE004` reports the full sentence instead of a forty-character prefix and is never fixable; `UE-TE004` reports sentence-final bare `US.` while `US$`, `U.S.A.` and `US-based` exemptions stay pinned. Every change ships with its guard note and test lock updated together.
- **Report, fixer and PDF corrections.** PDF en dashes and em dashes are emitted as their WinAnsi bytes, so a `UE-NU002` year-range finding's current and should-be values no longer render identically; the audit placeholder reads `(not applicable)` instead of developer copy; review-queue truncation is marked with an ellipsis and capped at eighty characters; the fixer capitalises sentence-start replacements (`the United States` after a full stop becomes `The United States`) without touching mid-sentence wording or changing which rules are fixable, and a finding whose offset no longer matches the source is skipped instead of misapplied.
- **Source registry.** `rules/sources.json` is a machine-readable registry of twenty-two sources — URL, retrieval date, scope, evidence and rationale for each, including four honest negative records for sources that could not be retrieved — ready to be cited by catalogue entries. The `UE-RE002` and `UE-DP001` guard notes now document the leading-indicator exception and the attribution window that the engine actually implements.
- **Verification.** The test chain grows to ten suites (new audit suites for extraction, detection, and report/fix/PDF contracts); the full release gate — syntax, all suites, portability, tracked JSON parse, package dry-run, self-scan, diff check and the behavioural verifiers — passes clean.

## 0.8.0 – 27 September 2026

- **Approval-gated agent command (`/un-diplomatic-agent`).** A new `commands/un-diplomatic-agent.md` prompt drives the whole review as one gated procedure: scan with `--report`, summarise current-to-should-be wording, stop at an explicit approval question, and only after an explicit go-ahead apply `--fix --apply`, rewrite the remaining findings from the report's `SHOULD-BE` text (asking the user whenever `proposed` is null rather than inventing wording), then re-run and report what honestly remains — never claiming the copy is clean unless the exit code is `0`. Six of those promises are pinned verbatim, and in scan-gate-apply order, by a new contract suite (`tests/command-contract.mjs`); the command ships inside the npm package (`files` now includes `commands`), and the README documents per-host installation with verified-or-hedged paths only. The flow was rehearsed end to end by a cold agent following the file against a scratch corpus: no writes before approval even under a fix-it-now instruction, no invented wording, and a clean claim only at exit code `0`.
- Ships the fourth and final planned phase. The command is read-only at the gate by design: `--fix` stays opt-in, and nothing is written to the user's copy before the approval question is answered. `1.0.0` is reserved for a stabilisation release after real-world installation and corpus testing.

## 0.7.0 – 27 September 2026

- **PDF report (`--report <path.pdf>`).** The same review as a PDF, whatever `--format` says on stdout: a cover block with the scan's scope, counts and the deterministic-versus-heuristic legend, then every finding grouped by file with what is currently written (`Current`) and what should replace it (`Should be`), a marker separating `--fix-able` findings from rewrites that need a human or an agent, a queue of heuristic findings for review, and a Sources appendix citing the contested-claims and hate-speech knowledge bases behind the findings. The file is written before `--fix --apply`, so it records the pre-fix state of the copy; an unwritable path refuses with exit `2`; `--quiet` still writes it. The writer is a hand-rolled, zero-dependency PDF 1.4 generator (`lib/pdf.mjs`) driven by the pure report model in `lib/report.mjs`; both are test-locked — xref offsets, page count, fonts, transliteration, extraction round-trip and byte determinism — alongside CLI tests covering exit-code neutrality and every refusal path. The PDF uses Helvetica with WinAnsi encoding: typographic dashes and quotation marks become their plain forms and a character outside that encoding is replaced with `?`, as documented in the README.
- **Should-be guidance on every report-only finding (`UE-HS001`–`UE-HS003`, `UE-RE006`–`UE-RE008`).** Each of the six now passes a `proposed` guidance sentence saying what to write instead, so the report's `Should be` column is real for every finding. `_replacement` stays `null` for all six, so none of them is ever `--fix`-able; the guard notes that promised "no proposed wording" were corrected in the same change along with their test locks, and the hate-speech knowledge-base sources are exported for the report appendix.
- **Two doc-truth defects fixed and locked.** SKILL.md's `--fix` list had gone stale — it omitted `the United States` and the three grammar fixes while claiming exclamation marks were fixable — and `rules/register.md` called `UE-RE005` fixable although that rule passes no replacement. Both are corrected and pinned by release regressions so the prose cannot drift from the engine again.

## 0.6.0 – 26 September 2026

- **Hate speech (`UE-HS001`–`UE-HS003`).** Three new editorial rules flag a listed dehumanising, pest, disease or animal frame predicated of a listed group of people, collective blame or an inherent trait attributed to a whole group, and calls for group-level exclusion or violence rather than individual legal process. Detection is composition over word lists: a bare frame word never matches, the group vocabulary is shared across the three rules so a mirrored sentence fires identically whoever is named, claims attributed to a reporting party are exempt through the `UE-DP001` guard, and quoted copy never reaches the rule because extraction masks it first. Every knowledge-base entry carries a `source` citation. All three are report-only — no replacement is passed — and `UE-HS002` is a heuristic that routes the finding to review and never claims proof of intent or the legal threshold of incitement.
- **Aggressive and undiplomatic tone (`UE-RE006`–`UE-RE008`).** Direct insult or contempt appellation, threat or intimidation posture, and a standalone all-caps word of five letters or more join the register family as warnings. The insult and threat rules are bounded heuristics that cannot judge target or context — a fixture pair proves both a matched idiom and the deliberately excluded "crush expectations" — while `UE-RE008` proves only the caps token itself and states its finite exemption list. All three are report-only.
- **High-precision grammar (`UE-GR001`–`UE-GR003`).** Unintentionally doubled words, a space between a word and its following punctuation, and a full stop running straight into the next word — deterministic warnings, all three `--fix`-able. The guard notes name the exact boundaries: `had had`, `that that` and `very very` are exempt from `UE-GR001`, `UE-GR002` reports only the space (the mark itself belongs to `UE-RE005`), and `UE-GR003` excludes decimals, versions, ellipses, dotted initial chains, a lower-case follower and a fixed abbreviation list while still reporting any other period abutting a capital.
- **The catalogue grows to 37 rules.** Suppression through `ue:ignore`, disablement through `config.rules` and downgrade through `config.severities` are test-locked for the new ids, along with the fixture gates: every new rule fires on its own positive fixture, none fires on any pre-existing fixture, and the repository's own prose scans clean — 0 errors, 0 warnings — under the full set.
- **Rule-development harness (`lib/testkit.mjs`).** A test-only module, never imported by the CLI, runs a rule under development through the real extraction and engine path — suppression, configuration, severity resolution, dedupe and sort — so a new rule is exercised exactly as production runs it.

## 0.5.0 – 26 September 2026

- **Contested-claim engine (`UE-DP001`).** A deterministic editorial rule flags bare sovereignty and territorial-status claims about listed regions — stated as fact instead of attributed to the party advancing them or phrased in neutral United Nations wording. Detection is symmetric: every claimant in an entry fires on the same pattern, and the rule never adjudicates whose claim is true. The baseline knowledge base in `config/profiles/un-v1.json` ships with Jammu and Kashmir, Taiwan, Hong Kong and Crimea; each entry carries its neutral phrasing, its UN designation and a `source` citation — for example Security Council resolution 47 (1948) — and can be replaced or extended per organisation through `profile.diplomacy.claims`, or opted out per entry through `config.allowlist.claims`.
- **`current` and `proposed` on every finding.** Findings now carry what is written (`current`) and the guidance for what should replace it (`proposed`): spelling and terminology findings propose their replacement, contested claims propose their neutral phrasing, heuristic findings carry `null`. `proposed` is report guidance; only findings that also carry a deterministic replacement remain `--fix`-able.
- **Configuration `severities` fixed to its documented shape.** The README documents flat `"UE-RE003": "error"` values, but validation demanded `{"enabled", "severity"}` objects while the engine consumed flat values: the documented shape was rejected with exit `2`, and the accepted shape leaked an object into `finding.severity`. Configuration severities now validate as flat severity strings, matching organisation profiles and the engine.
- **Plain-text fenced blocks are masked again.** The region collapsed on its own opening marker — the fence's open and close patterns are identical, so the marker closed the region it was opening — and rules ran on, and `--fix --apply` rewrote, text inside a fenced block in a `.txt` file, contradicting the README. The masker now blanks the opening marker and starts the region after it; a regression test proves the fenced body survives `--apply` byte for byte.
- **Duplicate-key rejection works again.** `JSON.parse` silently keeps only the last duplicate value, so the old scan of the parsed tree could never see one and a duplicate-key configuration passed with exit `0`. The check now reads the raw text: a duplicate key in a configuration, profile or catalogue fails closed with exit `2`, at any nesting depth, while strings that merely contain separators are not mistaken for keys.
- **`UE-TE004` now exempts what its guard notes promise.** `U.S.A.`, `US dollar` and `US cent` amounts no longer fire alongside the bare-country-name finding (`US$` and URLs already were exempt); the guard notes name the exact exemptions.
- **`UE-SP003` review runs case-insensitively**, so a sentence-initial `Optimize` is reviewed like any other occurrence, and `size`/`prize` forms — which end in `-ize` without being `-ise` candidates — are skipped.
- **`UE-DI001` accepts a qualifier in the count's own sentence only.** A hedge in the following sentence no longer silently excuses an unqualified count; the guard notes now promise the sentence-scoped check.
- **`UE-RE004` guard notes admit the limit**: a genuine information question can match the same sentence-initial openers. The rule routes the sentence to review as a heuristic and never declares it a defect.
- **The README documents `--yes` (`-y`)** for `skills add` in non-interactive shells: without a confirmation flag the CLI exits `0` having installed nothing, which an exit-code-checking agent reads as success.

## 0.4.0 – 25 September 2026

Re-architected around one rule: the checker reads user-visible copy and nothing else.

- **Extraction before inspection.** Rules now run on classified `TextUnit` objects rather than raw source lines. HTML text nodes and copy-bearing attributes, Markdown paragraphs, plain-text blocks and JavaScript strings with evidence of being rendered (target key, render call, concatenation, interpolated template) are the only input. Code, comments, identifiers, URLs, quoted titles, block quotations and `<cite>` content never reach a rule, which removes the false-positive classes that made v0.3.0 noisy.
- **Offset maps.** Every mask is equal-length and each unit records where each surviving character came from, so a reported line and column point at the copy itself — even after entity decoding — and a fix can only land where the matched text exists literally.
- **Editorial scope.** 16 editorial rules covering spelling, terminology, numerals, register and claim discipline. Publishing, accessibility and security became 11 audit rules that run only when requested with `--profile`, reported in their own section, and never affecting the exit code.
- **Honest severity.** Deterministic rules state the defect; heuristic rules say so and, where judgement is required, move to `AGENT REVIEW REQUIRED`. Exit `1` means error-severity editorial findings only; warnings, notes and every audit exit `0`.
- **Conservative `--fix`.** Prose files only, four deterministic rules only, diff preview by default and `--apply` to write. Symlinks, hard links and non-regular files are refused, and a fix is skipped rather than guessed when the matched copy is not present exactly.
- **Profiles.** `--profile` accepts either an organisation profile file merged over the bundled United Nations baseline or a bundled audit name (`publishing`, `accessibility`, `security`). Profiles are validated strictly and never leak into a later run.
- **Suppressions and compact surfaces.** `ue:ignore` inside a copy span suppresses specific rules, a rule family or everything. Tables, chart axes and legends, tooltips, stat tiles, `<title>` and meta descriptions are exempt from `%` and en-dash rules, where space is a legitimate constraint.
- Fixes to the text report: control characters are escaped in file names, messages and diff lines; title and meta-description lengths are measured after entity decoding; the SRI audit reports scripts and stylesheets only.
- Two documented features that silently did nothing now work: a profile's `severities` and `rules` reach the engine (configuration still wins on a shared key), and `ue:ignore` in a comment on the same line as a JavaScript string suppresses that string.
- Two editorial rules were quietly half-dead. `UE-RE003` could never match a `%` figure, because a word boundary does not follow a percent sign — so the commonest UN figure of all was never reviewed for a hedge or a source. `UE-CL001` recognised only a short list of set phrases, so "output in 2025 exceeded output in 2023" passed unremarked; it now also matches `exceeded`, `greater than`, `more than`, `outpaced` and `year-on-year`.
- `UE-NU001` now reports both numeric date shapes the documentation promises. The extraction rewrite had narrowed the pattern to day/month/year, so a US `m/d/y` date like `12/31/2026` — which v0.3.0 caught — passed silently. Both slash components accept 1–31; URLs, code and `datetime` values are masked before the rule runs.

## 0.3.0 – 25 September 2026

- Expanded the installation guide for OpenCode 1.x and 2.x, Claude Code, Codex, Kimi Code CLI and other Agent Skills hosts.
- Documented project and global paths, manual installation, upgrades, invocation and host-specific compatibility boundaries.
- Added and validated the canonical skills.sh detail URL and GitHub-based installation commands.
- Preserved one root `SKILL.md` as the canonical skill definition to prevent host-copy drift.

## 0.2.0 – 25 September 2026

- Hardened `--fix` to prose-only regular `.txt`/`.md` files; reject symbolic links in every mode and hard links before writes.
- Added independent protected-span handling for quotations, comments and code.
- See git history for earlier releases.
