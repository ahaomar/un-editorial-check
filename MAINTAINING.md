# Maintaining rules, profiles and compatibility

The current institutional source check date is **24 September 2026**. Before changing an institutional rule, re-check the named source, record the date and add positive and negative fixtures.

## Compatibility changes

The repository-root `SKILL.md` is the only canonical skill definition. Do not commit copied `SKILL.md` files under `.agents/`, `.claude/`, `.opencode/` or another host directory, and do not create recursive symbolic links. Use `npx skills add https://github.com/ahaomar/un-editorial-check` for user installations. A required committed adapter must be generated or tested against the canonical file and must fail on drift.

A new or changed host adapter requires all of the following before merge:

1. verify the current discovery path and format against official host or standard documentation, recording the source URL and verification date in `COMPATIBILITY.md`;
2. add a fixture or portability check that exercises the adapter or exact installation command;
3. update the README and detailed compatibility matrix, clearly distinguishing native host support from `skills` CLI installation and rules/manual support; and
4. run `npm run check:portability`, syntax checks, the full test suite, package dry-run and CLI smoke tests.

Use only commands listed by the current `npx skills --help`. Re-run that help output when updating installer guidance; agent identifiers, paths and command interfaces may change independently of this package.

Optional host metadata such as `agents/openai.yaml` must remain subordinate to `SKILL.md`. It may describe display metadata or invocation policy, but it must not become a second workflow definition.

## Rule lifecycle

Ideas enter the issue tracker, are reproduced as a fixture, and graduate only when the intended language is deterministic, editorially sourced and independently bounded. Add a stable ID, severity, category, confidence, scope and status to `rules/catalogue.json`, then update prose rules and the changelog. Breaking changes require a major version; new rules and profiles require a minor version.

Organisation-specific differences belong in portable JSON profile v1 files, not forks. Profiles use only data: metadata, spelling mappings, terminology pairs, register terms, severities and enabled states. They cannot execute JavaScript. Validate the schema, bad examples and profile precedence in tests. The packaged `config/profiles/un-v1.json` records the built-in UN baseline. Profile `severities` and `rules` must reach the engine — a release gate exists because they were once validated and then dropped.

Editorial rules run on extracted `TextUnit` objects, never on raw source lines. When a rule needs a new surface (a copy-bearing attribute, a JavaScript key), extend extraction and add fixtures for both the surface and the things that must stay invisible — comments, code, quoted titles, URLs, identifiers. Extraction changes move false positives into false negatives; review both directions.

HTML and JavaScript analysis is intentionally conservative and regex-based. `UE-SE001`, `UE-SE002`, `UE-SE003` and `UE-SE004` are bounded policies, not taint analysis: they ask whether a pattern is declared, not whether it is exploitable. Suppress a local false positive narrowly with `ue:ignore UE-SE001` inside the copy span or line that carries it; never claim a general safety proof. Audits are opt-in through `--profile` and must never change the exit code.

## Release gate

Keep `package.json`, `VERSION` and the newest `CHANGELOG.md` heading identical, and keep `MAINTAINING.md` and `SKILL.md` in step with them; the current version is `1.8.2`. A version moves only when the documented release process calls for it. The package has no dependencies, so no lockfile is required.

## The published skills.sh record

skills.sh stores a copy of this repository and runs the Gen, Socket and Snyk audits against that copy rather than against the default branch, so a commit is not a lever on it. The copy in place holds `ea6c6d0`, taken at 11:27 UTC on 5 Oct 2026: its `package.json` reads `1.7.0`, and its `.gitignore` predates the entries added in 1.8.1. The hardening that answers the two findings the Socket scan reports, `e907670`, landed eleven minutes later, so the published warning describes a tree this repository has moved past. Both the copy and the verdicts are public and need no account: `https://skills.sh/api/download/ahaomar/un-editorial-check/un-editorial-check` and `https://skills.sh/api/v1/skills/audit/ahaomar/un-editorial-check/un-editorial-check`.

Do not spend commits on this. Version bumps, documentation commits, an empty re-index request, a substantive testing commit, the tag and release, the npm publish and reinstalling through `npx skills add` were each tried against the frozen copy, and none moved it, because none of them is read by the scanner. The copy is replaced on the skills.sh side only; `scripts/skills-sh-audit-watch.mjs`, run hourly by `.github/workflows/socket-audit-watch.yml`, reports the replacement and is the one place to look. The header of that workflow carries the full evidence, and `tests/audit-published-record.mjs` locks how the record is read.

### What the two alerts on that copy describe

Both were raised against the code the copy carried on 5 October, and both are about code this repository has since answered.

| Alert | What it said | Where the answer stands |
|---|---|---|
| `lib/output.mjs` | A stray fragment in `renderSARIF()` that reads as invalid syntax, and a rule id or a confidence reaching the terminal unescaped | The syntax half was a false positive: that file parses, and 1.7.0 ran from npm. The injection half is answered — every caller-controlled value the terminal prints passes through `escapeControl` — and `tests/release-regressions.mjs` now locks the whole surface: the rule id, the confidence, the file name, the category, the suggestion, the skip reason and the audit name. |
| `lib/icons.mjs` | `className` and path data written into quoted attributes without the quote escaped, and a stroke width inserted raw | Answered in 1.7.1: the escape covers all five XML-significant characters, a stroke width or a size that is not a positive finite number refuses loudly, and `tests/icons.mjs` locks all three. |

The deep dive on 22 October 2026 added two things. The alert named a stray invalid syntax in a file that parses, and the tree did hold one line of that kind: a statement joined to the next one on the same line, in `lib/output.mjs`, put there by the 1.8.0 release. It parses, it passes every gate, and to a scanner reading a fragment it reads as a stray piece of syntax — so it is written out again, and a tripwire now fails the suite when any line in `lib/`, `tests/`, `scripts/` or `bin/` joins two statements. The second thing is the lock the alert's own wording asked for and the suite did not hold: the terminal guard had been proven for the rule id alone, and it now covers every field the renderer prints that the engine did not write itself.

None of that moves the page on its own. The copy the audit reads is replaced on the skills.sh side, and the request for that replacement is the open issue `vercel-labs/skills#2371`.

Run `npm run check:syntax` (every file under `bin/`, `lib/`, `tests/` and `scripts/`), `npm test`, `npm run check:portability`, parse every tracked JSON file, `npm pack --dry-run`, `node bin/check.mjs . --self-scan --quiet` (it must exit `0`), an installed executable smoke test and `git diff --check`. GitHub Actions are pinned to full verified commit SHAs with version comments. Never commit generated tarballs, local profiles, installed-package directories or agent copies that can drift from the canonical skill.
