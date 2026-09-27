# Migration guide — upgrading to 1.0.0

This guide lists every behaviour change in the 1.0.0 release and what an existing user must do about it. Read only the sections for the features you use; nothing here is required to keep a plain report-only workflow running. The release notes are in [CHANGELOG.md](../CHANGELOG.md); every claim made here is tracked with its evidence in [CLAIM-EVIDENCE-AUDIT.md](CLAIM-EVIDENCE-AUDIT.md).

## Quick reference

| Change | Migration action |
|---|---|
| The clean-run sentence changed wording | Update any grep, test or dashboard that matches the old sentence; exit codes are unchanged |
| Five output lanes replace the flat section list | Re-key text-report parsers; `--format json` and SARIF gain fields, existing fields stay |
| Heuristic findings are review severity by default | If you relied on them failing the build, set `severities` for those rules |
| The `-ize`/`-ise` spelling conflict family warns by default | Pick a bundled `--profile`, or set `severities` / `allowlist.spellings` |
| Terminology, claims, dates, political wording, quotations, harmful wording and sources are never rewritten by `--fix` | Rewrite those findings from the report's `Should be` column |
| `maternal mortality rate` is context-gated; the `women's work` pair is removed; the percentage sign is silent in running prose | Expect those findings to narrow or disappear; this is source evidence, not a broken rule |
| Contested-claim findings report as diplomatic review, not factual error | Set `severities` on `UE-DP001` if you want it to fail a run |
| New opt-ins: `--init`, `--self-test`, `--baseline`, GitHub Action, hook, templates | Optional; no existing flag changes behaviour |

## The clean-run sentence

**What changed.** A run with no findings used to print `No editorial findings.` It now prints exactly:

```text
No findings under the enabled, documented local rules.
```

The same sentence now appears in the README, the skill instructions, the user guide and the `/un-diplomatic-agent` command template, and the PDF report states the same meaning.

**What you must do.** If a script, test or dashboard greps stdout for the old sentence, match the new one. Exit codes are unchanged: `0` still means no error-severity editorial findings, `1` still means at least one, `2` still means a tool or usage failure. Prefer exit codes or `--format json` over text matching.

## Five output lanes and heuristic severity

**What changed.** The report separates deterministic rule violations, heuristic editorial review, harmful or discriminatory review, diplomatic sensitivity and optional audits. Every finding carries its rule source, profile, confidence, limitation and recommended human action, in the text, JSON, SARIF and PDF outputs. Heuristic findings flip to review severity by default: they no longer move the exit code unless the organisation configures them to `error`.

**What you must do.**

- If you parse the text report by section heading, re-key to the lane headings. The stable interfaces remain the exit codes and `--format json`.
- JSON and SARIF consumers keep every existing field (`file`, `line`, `column`, `ruleId`, `category`, `severity`, `confidence`, `scope`, `message`, `suggestion`, `current`, `proposed`, `audit`) and gain the lane, source, profile, limitation and action fields.
- If a heuristic rule used to fail your build as an error, pin it in `.un-editorial.json`:

```json
{
  "severities": { "UE-RE004": "error" }
}
```

## Spelling conflicts between profiles

**What changed.** The `-ize`/`-ise` conflict family — words such as `organization` — is no longer a blanket error. Under the default run it is a profile-selection warning: the message names the profile choice instead of calling a form wrong, does not fail the run and is not rewritten by `--fix`. `--profile un-secretariat-document` (alias `un-v1`) and `--profile un-geneva-web` are silent on the family because the United Nations spelling list itself prints the `-ize` forms. `--profile generic-british-english` reports the family as errors because that profile chooses `-ise`. Only `analyse`, `catalyse`, `paralyse` and `practise` remain errors under every profile.

**What you must do.** Choose one deliberately:

```sh
# pin the United Nations secretariat baseline
node bin/check.mjs content --profile un-secretariat-document

# or pin British -ise preferences
node bin/check.mjs content --profile generic-british-english
```

Alternatively keep the default warning, silence specific words with `allowlist.spellings`, or pin severities in `.un-editorial.json`. If CI must be red or green on spelling, do not rely on the default: set the severity explicitly.

## The `--fix` set shrank

**What changed.** `--fix` applies only safe, deterministic, reversible replacements: British spelling outside the profile-dependent conflict family, en-dash ranges, a doubled word, a space before punctuation and a missing space between sentences. Terminology (`per cent`, `the United States` included), claims, dates, political wording, quotations, harmful wording and sources are never rewritten by `--fix`.

**What you must do.** If a pipeline used `--fix --apply` to apply terminology or spelling-conflict corrections, take those from the report's `Should be` column instead — the approval-gated command template already does this. Review every `--fix` diff as before; the files it accepts (`.txt`, `.md`, `.markdown`) and its refusals are unchanged.

## Terminology rules reworked against sources

**What changed.**

- `maternal mortality rate` is reported only where the printed statistic is the per-100 000-live-births figure, and only for review — the rate and the ratio are different measures.
- The unsourced `women's work` replacement pair is removed; the sourced pair `handicapped` → `persons with disabilities` stays.
- The percentage sign is silent in running prose (the live United Nations guidance permits either form in running text); the spelling `percent` becomes `per cent`.
- The shared source note that cited a dead `editorial.un.org` address and contradicted the percentage guidance was corrected alongside these rules.

**What you must do.** Treat vanished findings as source-backed removals, not regressions — the evidence and retrieval dates are in `rules/sources.json`. If you still want a house rule that the guide does not carry, express it in a profile (`terminology.forbidden`) with your own source.

## Contested claims require diplomatic review

**What changed.** `UE-DP001` reports a bare territorial-status claim as requiring diplomatic review in the diplomatic sensitivity lane, symmetrically for every party to the claim, instead of standing as a factual error.

**What you must do.** If a build gate relied on exit `1` from `UE-DP001`, set its severity explicitly in `.un-editorial.json`:

```json
{
  "severities": { "UE-DP001": "error" }
}
```

## New opt-ins (no migration required)

- `--init` writes a starter `.un-editorial.json` plus a host and CI snippet.
- `--self-test` runs a bundled corpus and asserts the exact expected findings — use it after every upgrade.
- `--baseline <path>` records the findings of a run; later runs fail only on findings that are not in the baseline.
- A GitHub Action (`action.yml`), a pre-commit hook snippet and agent command templates for Claude Code, Codex, OpenCode and Cursor ship with the package.
- Report previews cut deterministically at a platform-specific length and mark the cut, so nothing is ever truncated silently.

## Configuration compatibility

Every documented `.un-editorial.json` key keeps its meaning and precedence (`ignoredPaths`, `allowlist`, `severities`, `rules`, `spellingReview`, `baseOrigin`, `renderTargets`). The configuration file still wins over a profile on a shared key. Unknown keys, unknown rule IDs and malformed values still fail closed with exit `2` — a stale key is reported, never ignored. Profile files gain the `spellingConflicts` key; a profile that names a non-existent spelling key fails with exit `2`.

## What did not change

- Exit codes `0` / `1` / `2`, and audits never moving the exit code.
- Report-first operation: a finding identifies a review requirement; it does not establish truth.
- Zero npm dependencies and offline-deterministic operation.
- `--fix` remains opt-in, prose-only and diff-previewed; symbolic links, hard links and non-regular files remain refused.
- Inline suppression syntax (`ue:ignore`) and its span rules.
- The approval-gated `/un-diplomatic-agent` flow.

## Suggested upgrade steps

1. Read the 1.0.0 release notes in [CHANGELOG.md](../CHANGELOG.md).
2. Update the installed skill (`npx skills update un-editorial-check`) or reinstall as described in the README.
3. Run `un-editorial-check --self-test` (or `npm test` in a checkout) to verify the installation.
4. Apply the sections above that match your setup, then re-run your pipeline once and compare the lane output with your expectations.
5. Keep your existing `.un-editorial.json`; adjust only the severities and profile choices you deliberately want to change.
