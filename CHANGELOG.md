# Changelog

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
