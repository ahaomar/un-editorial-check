# un-editorial-check

[![skills.sh](https://skills.sh/badge/ahaomar/un-editorial-check/un-editorial-check)](https://skills.sh/ahaomar/un-editorial-check/un-editorial-check)

A portable, zero-dependency Node.js CLI and Agent Skill that reads user-visible copy the way a United Nations editor would — language, wording, tone, spelling, terminology, dates, numbers, claims and register — and reports what fails.

It is not a code-quality, accessibility, security or SEO linter. Copy is extracted first (HTML text nodes and copy-bearing attributes, Markdown paragraphs, plain-text blocks, JavaScript strings that demonstrably render) and only then checked, so CSS properties, comments, identifiers, URLs, quoted titles, block quotations and code never reach a rule. Those other concerns exist in this package solely as opt-in audits.

The product boundary is **report first**: a finding identifies a review requirement; it does not establish the truth of a claim. Deterministic rules prove the defect; where judgement is required the finding is labelled heuristic and moves to `AGENT REVIEW REQUIRED`.

## What it checks

Editorial rules (16, always on):

- British English spelling, mixed variants within a passage, and opt-in `-ize` review.
- United Nations terminology: maternal mortality ratio, labour-force participation rates, lower-secondary completion rates, data centres’ share of electricity demand, “per cent” in running prose, “the United States”.
- Day–month–year dates, en-dash ranges, hedged and sourced figures, counts that say what was counted, comparisons that align reference years.
- Neutral register: promotional phrasing, rhetorical questions, exclamation marks, unsourced superlatives.
- Supplied organisation vocabulary through data-only profiles.

Audit rules (11, only with `--profile publishing`, `--profile accessibility` or `--profile security`): page title, meta description, canonical link, heading structure and card metadata; image and form-control labelling; four bounded source-code policies. Audits are reported in their own section and never change the exit code.

The v0.4.0 catalogue contains 27 stable rule IDs, indexed in [rules/catalogue.json](rules/catalogue.json). Its institutional sources were checked on **24 September 2026**. Re-check current United Nations guidance before treating a release as institutional advice.

## What the CLI proves, and what it does not

**Deterministic rules** test a pattern with a documented boundary — a spelling map, a terminology pair, `%` in running prose, an exclamation mark. The rule, its exemption and its position are explicit, so results are suitable for local review and CI. A clean run is not a certificate of quality.

**Heuristic rules and `AGENT REVIEW REQUIRED`** ask for judgement: whether a claim matches its evidence, figures are sourced and dated, citations are complete, comparisons use aligned years, register is proportionate, and labels describe what was counted. They are reported as warnings and are never promoted to errors.

The skill requires the agent to work through those findings after running the CLI, and to keep deterministic findings, agent-review findings and its own editorial judgement separate in the report.

## Requirements and installation

### Runtime

- Node.js 18 or later.
- No runtime npm dependencies.
- A supported Agent Skills host, or direct use of the CLI.

### Universal installation with the skills CLI

The canonical published skill is available through skills.sh and GitHub. The CLI installs the complete package, including `bin/`, `lib/`, `rules/` and `config/`:

```sh
npx skills add https://github.com/ahaomar/un-editorial-check \
  --skill un-editorial-check \
  --list
```

To install for a specific agent, use the corresponding command below. Run these commands from the project where you want the skill installed, unless you add `--global` for a user-level installation.

```sh
# OpenCode 1.x and 2.x
npx skills add https://github.com/ahaomar/un-editorial-check \
  --skill un-editorial-check --agent opencode --yes

# Claude Code
npx skills add https://github.com/ahaomar/un-editorial-check \
  --skill un-editorial-check --agent claude-code --yes

# Codex
npx skills add https://github.com/ahaomar/un-editorial-check \
  --skill un-editorial-check --agent codex --yes

# Kimi Code CLI
npx skills add https://github.com/ahaomar/un-editorial-check \
  --skill un-editorial-check --agent kimi-code-cli --yes

# Other supported skills hosts
npx skills add https://github.com/ahaomar/un-editorial-check --skill un-editorial-check --agent cursor --yes
npx skills add https://github.com/ahaomar/un-editorial-check --skill un-editorial-check --agent gemini-cli --yes
npx skills add https://github.com/ahaomar/un-editorial-check --skill un-editorial-check --agent windsurf --yes
npx skills add https://github.com/ahaomar/un-editorial-check --skill un-editorial-check --agent cline --yes
npx skills add https://github.com/ahaomar/un-editorial-check --skill un-editorial-check --agent github-copilot --yes
```

Use `--global` for a user-level installation. Use `--copy` instead of the CLI's default symbolic-link installation when the agent or filesystem does not support links. Review the target path shown by the CLI.

### OpenCode 1.x and 2.x

The portable `SKILL.md` format is designed for both OpenCode generations. The installer path is the recommended approach because it copies or links the complete package:

```sh
npx skills add https://github.com/ahaomar/un-editorial-check \
  --skill un-editorial-check --agent opencode --yes
```

Expected project locations are:

```text
.opencode/skills/un-editorial-check/SKILL.md
.agents/skills/un-editorial-check/SKILL.md
.claude/skills/un-editorial-check/SKILL.md
```

OpenCode 2.x documents all three project locations. OpenCode 1.x support can vary by exact release; if native discovery is unavailable, use the CLI installation, or manually copy the complete package to `.opencode/skills/un-editorial-check/`. Restart OpenCode after installation. The skill is loaded on demand; ask:

```text
Use the un-editorial-check skill to audit this content.
```

For a global installation, add `--global`. The global location for OpenCode 2.x is `~/.config/opencode/skills/un-editorial-check/`. Older 1.x releases may use a different global location, so use the CLI's reported path as the source of truth.

### Claude Code

```sh
npx skills add https://github.com/ahaomar/un-editorial-check \
  --skill un-editorial-check --agent claude-code --yes
```

Project installation:

```text
.claude/skills/un-editorial-check/SKILL.md
```

Global installation:

```text
~/.claude/skills/un-editorial-check/SKILL.md
```

Restart Claude Code and ask it to use `un-editorial-check`, or select the skill from the host's skill interface.

### Codex

```sh
npx skills add https://github.com/ahaomar/un-editorial-check \
  --skill un-editorial-check --agent codex --yes
```

The standard project path is:

```text
.agents/skills/un-editorial-check/SKILL.md
```

The optional `agents/openai.yaml` file provides Codex display metadata; it is not required for the portable skill. Restart Codex after installation.

### Kimi Code CLI

```sh
npx skills add https://github.com/ahaomar/un-editorial-check \
  --skill un-editorial-check --agent kimi-code-cli --yes
```

The standard project path is:

```text
.agents/skills/un-editorial-check/SKILL.md
```

Kimi Code may also expose version-specific `.kimi` or `.kimi-code` locations. Prefer the skills CLI installation and use the path it reports. Restart Kimi Code and invoke `/skill:un-editorial-check` or ask the agent to use the skill.

### Other agents and editors

The same canonical skill can be installed through the skills CLI for supported agents:

| Host | Project installation | Boundary |
|---|---|---|
| Cursor | `.agents/skills/un-editorial-check/SKILL.md` via CLI | Confirm native discovery in the installed Cursor version. |
| Gemini CLI | `.agents/skills/un-editorial-check/SKILL.md` | Gemini surfaces can have separate stores. |
| Windsurf | `.windsurf/skills/un-editorial-check/SKILL.md` via CLI | Use a rules adapter if the installed version does not load Agent Skills. |
| Cline | `.agents/skills/un-editorial-check/SKILL.md` via CLI | Use a rules adapter if the installed version does not load Agent Skills. |
| GitHub Copilot | `.agents/skills/un-editorial-check/SKILL.md` | IDE, chat and CLI surfaces may differ. |

For a host that supports the shared Agent Skills format but is not listed above, use:

```sh
npx skills add https://github.com/ahaomar/un-editorial-check \
  --skill un-editorial-check --agent universal --yes
```

See [COMPATIBILITY.md](COMPATIBILITY.md) for the verified matrix, global paths, source links and version-specific boundaries.

### Direct npm installation

```sh
npm install --global un-editorial-check
un-editorial-check --version
un-editorial-check content --format text
```

For a project-local dependency:

```sh
npm install --save-dev un-editorial-check
npx un-editorial-check content --format json
```

## Compatibility at a glance

| Host | Status | Installer name | Portable project path |
|---|---|---|---|
| OpenCode 1.x | Version-dependent; verify the exact 1.x release | `opencode` | `.opencode/skills/` or `.agents/skills/` |
| OpenCode 2.x | Native support | `opencode` | `.opencode/skills/`, `.agents/skills/` or `.claude/skills/` |
| Claude Code | Native support | `claude-code` | `.claude/skills/` |
| Codex | Native support | `codex` | `.agents/skills/` |
| Kimi Code CLI | Native support; other Kimi surfaces may differ | `kimi-code-cli` | `.agents/skills/` |
| Cursor | CLI installation verified; confirm the installed version | `cursor` | `.agents/skills/` |
| Gemini CLI | Native support | `gemini-cli` | `.agents/skills/` |
| Windsurf | CLI installation verified; confirm the installed version | `windsurf` | `.windsurf/skills/` |
| Cline | CLI installation verified; confirm the installed version | `cline` | `.agents/skills/` |
| GitHub Copilot | Supported surfaces vary | `github-copilot` | `.agents/skills/` |
| Generic Agent Skills | Host must implement discovery | `universal` | `.agents/skills/` |

See [COMPATIBILITY.md](COMPATIBILITY.md) for verified global paths, source links, host-specific differences and manual installation. “CLI installation verified” is deliberately narrower than a claim that every current or future version has native discovery.

## How an agent uses the skill

Install the complete skill, then ask the agent to use `un-editorial-check` or select it through the host's skill command. The agent resolves `<skill-base>` from the directory containing `SKILL.md` and runs the bundled checker:

```sh
node <skill-base>/bin/check.mjs <paths> --format text
```

For example, if the installed skill is under `.agents/skills/un-editorial-check/`:

```sh
node .agents/skills/un-editorial-check/bin/check.mjs content --format text
```

The agent must:

1. run the Node CLI on the requested files;
2. address error-severity findings and review warnings, without suppressing them just to reach exit `0`;
3. read the applicable bundled rule files relative to the skill base, not from memory;
4. work through `AGENT REVIEW REQUIRED` findings against the available evidence;
5. keep deterministic findings, agent-review findings and its own editorial judgement separate in the report; and
6. request audits with `--profile publishing`, `--profile accessibility` or `--profile security` only when that audit was asked for — a default run is editorial only.

## CLI use

```sh
node bin/check.mjs README.md
node bin/check.mjs content dashboards --format text
node bin/check.mjs content --format json > results.json
node bin/check.mjs content --format sarif > results.sarif
node bin/check.mjs content --config .un-editorial.json
node bin/check.mjs content --profile editorial-org.json
node bin/check.mjs content --profile publishing --profile accessibility --profile security
node bin/check.mjs content --quiet
node bin/check.mjs --self-scan --quiet
```

`--format text` is the default. JSON and SARIF results go to standard output; tool and configuration failures go to standard error. Paths may be files or directories. Directory scans do not follow symbolic links, and hidden directories, `node_modules`, build output and fixtures are skipped unless you name them explicitly.

`--profile` is repeatable: a value that names a bundled audit (`publishing`, `accessibility`, `security`) runs that audit; any other value is an organisation profile file merged over the bundled United Nations baseline. A missing or invalid profile is a usage failure (exit `2`), not a silent fallback.

### Exit codes

| Code | Meaning |
|---:|---|
| `0` | No error-severity editorial findings; warnings, notes and every audit may remain |
| `1` | One or more error-severity editorial findings |
| `2` | Invalid options, path, JSON, profile or configuration; a scan or write failure |

CI should treat exit code `1` as a requested policy failure and exit code `2` as a tool failure. It should not silently merge the two. Audit findings never move the exit code, so `--profile security` cannot fail a build that the editorial rules passed.

### Output formats

- **Text:** sectioned report — `EDITORIAL ERRORS`, `EDITORIAL WARNINGS`, `EDITORIAL NOTES`, `AGENT REVIEW REQUIRED`, then `OPTIONAL AUDIT — <name>` for each audit that was requested.
- **JSON:** the same findings as records carrying `file`, `line`, `column`, `ruleId`, `category`, `severity`, `confidence`, `scope`, `message` and `suggestion`; audit findings are tagged with their `audit`. Internal fields are stripped from every format.
- **SARIF:** SARIF 2.1.0 for code-scanning tools that accept static-analysis output.

A suppression belongs to the copy span that contains it — one paragraph in HTML or Markdown, one line in JavaScript. Keep it narrow and record the reason in version control:

```html
<p>The organization reports quarterly. <!-- ue:ignore UE-SP001 --></p>
```

```js
const note = { inlineNote: `${count} organization` }; // ue:ignore UE-SP001  (name of a body)
```

`ue:ignore UE-SP001,UE-TE003` accepts a list, `ue:ignore UE-SP*` a rule family, and `ue:ignore all` everything in that span. A suppression in one paragraph never reaches the next, and configuration (`allowlist`, `severities`, `rules`) is the right tool when a whole project needs the same exception.

## The safe `--fix` boundary

Report-only operation is the default. `--fix` is opt-in and deliberately narrower than a general editor:

- `--fix` prints a diff labelled `(proposed)` and writes nothing; `--fix --apply` performs the same writes and labels them `(applied)`.
- It accepts only regular prose files with `.txt`, `.md` or `.markdown` extensions. Anything else — HTML, JavaScript, JSON, configuration — is refused with exit code `2`.
- It applies only deterministic replacements: British spelling (`UE-SP001`), `per cent` (`UE-TE003`), en-dash ranges (`UE-NU002`) and `the United States` (`UE-TE004`), honouring spelling allowlists.
- It masks comments, script and style blocks, fenced code, block quotations, inline code, cited titles, `<cite>`, `<q>` and `<blockquote>`, URLs and paths. An unrelated occurrence elsewhere in the same file can remain fixable.
- A fix is skipped, never guessed: if the matched copy is not present exactly where the offset map says it is, the finding is left alone and reported.
- It refuses symbolic links, non-regular files and regular files with multiple hard links, and re-checks type, descriptor identity and link count before writing. This reduces path-replacement races but is not a race-proof sandbox.

Exit codes after `--apply`: `0` when every error-severity finding was written, `1` when an error-severity finding could not be written (for example `UE-RE005`, which needs a human to rewrite the sentence), `2` on a refusal or write failure.

The skill instructs agents to show the target files and the proposed diff before invoking `--fix`. Run it only on a controlled working tree and review the result. It does not rewrite dates, terminology or claims.

## Configuration

Defaults live in [config/default.json](config/default.json). Override them with `.un-editorial.json` in the working directory (discovered automatically) or with `--config path`. A copyable starting point is [config/example.un-editorial.json](config/example.un-editorial.json):

```json
{
  "ignoredPaths": ["vendor/**", "legacy/**"],
  "allowlist": {
    "spellings": ["UN Women", "Drupal"],
    "terminology": ["project-defined term"],
    "register": ["approved house phrase"]
  },
  "severities": { "UE-RE003": "error" },
  "rules": { "UE-SE004": { "enabled": false } },
  "spellingReview": false,
  "baseOrigin": "https://www.example.org",
  "renderTargets": ["inlineNote", "statusMessage", "tooltipContent"]
}
```

- `allowlist.spellings` names words the spelling rules leave alone. `allowlist.terminology` must repeat the unapproved term exactly as the profile writes it, and `allowlist.register` names phrases that are fine in this project.
- `severities` promotes or downgrades one rule; `rules` carries `{"enabled": false}` to switch one off. Both are validated against the catalogue, so a mistyped rule ID fails with exit code `2` instead of quietly doing nothing.
- `spellingReview` enables the `-ize` review (`UE-SP003`).
- `renderTargets` adds project-specific identifiers to the JavaScript keys and calls treated as rendering copy.
- `baseOrigin` must be an absolute HTTP(S) origin. With it configured, canonical URLs are checked by scheme, hostname and effective port. Without it, the checker can reject missing or non-absolute canonical URLs but does not claim origin or self-reference.

Where a configuration file and a profile both set a rule's severity or state, the configuration file wins. Local configuration files named `.un-editorial.json` are ignored during scans.

## Organisation profile v1

A profile adds organisation-specific data without forking the skill:

```json
{
  "profileVersion": 1,
  "name": "Example organisation profile",
  "source": "https://www.example.org/editorial-standards",
  "pageUrl": "https://www.example.org/editorial-standards",
  "spelling": {
    "organization": "organisation"
  },
  "terminology": {
    "forbidden": [["program", "programme"]]
  },
  "register": {
    "forbidden": ["project house phrase"],
    "approved": []
  },
  "severities": {
    "UE-RE003": "warning"
  },
  "rules": {
    "UE-RE003": { "enabled": false }
  }
}
```

Profile v1 requires `profileVersion`, `name` and `source`. Optional sections are `spelling` (a word-to-word map; each key must already exist in the baseline vocabulary so a typo cannot disable a rule), `terminology.forbidden` (a list of pairs, or `{ "rule", "from", "to" }` objects to target one rule), `register` (an object with `forbidden` and `approved` lists), `severities`, `rules` and `pageUrl`. Unknown keys, unknown rule IDs, malformed mappings, empty or self-equivalent terminology pairs, and non-HTTP(S) page URLs fail closed with exit code `2`. Profiles contain data only and cannot execute JavaScript.

A profile's `severities` and `rules` are applied to the run; where a configuration file sets the same key, the configuration file wins.

The packaged baseline is [config/profiles/un-v1.json](config/profiles/un-v1.json). A discoverable project configuration example is [config/example.un-editorial.json](config/example.un-editorial.json).

### Extending an organisation profile

1. Record an authoritative, reviewable source and its verification date outside the executable schema or in the profile name/source metadata.
2. Add only bounded terminology, spelling, register, severity or rule-state differences.
3. Add positive and negative fixtures for each accepted and rejected case.
4. Run `npm test` and the portability validator.
5. Submit changes through the contribution and security review process; do not copy `SKILL.md` into an organisation-specific fork.

## Rule catalogue and security limits

The maintained index is [rules/catalogue.json](rules/catalogue.json). Detailed guidance is under [rules/](rules/). Rule IDs are stable for CI allowlists and inline suppressions.

Important limitations:

- Rules run on extracted copy, never on raw source lines: HTML text nodes and copy-bearing attributes, Markdown paragraphs, plain-text blocks, and JavaScript strings with evidence of rendering. Extraction is deliberately conservative and regex-based — not a standards-compliant HTML or JavaScript parser — and no rule performs scope or data-flow analysis.
- `UE-SE001` flags `.innerHTML =` and `.outerHTML =` assignments in script files; `UE-SE004` flags `eval()` and `new Function()`. Neither is a taint analysis. Comments are masked first, so commented-out code is not reported.
- `UE-SE002` asks only whether an external script or stylesheet *declares* an `integrity` attribute. It never fetches an asset, never validates digest syntax and never proves a digest matches content. `UE-SE003` looks for `rel="noopener"` or `rel="noreferrer"` on `target="_blank"` links.
- The date rule detects slash dates in prose; it cannot infer the intended locale of an ambiguous numeric date.
- Allowlists and suppressions are blunt: they silence a rule over a span without proving the copy is correct.
- Promotional vocabulary and superlatives come from bounded lists in the profile and in `lib/rules.mjs`; an unlisted superlative is not reported. Extend them with a fixture, not by loosening the pattern.
- Grammar, source accuracy, neutrality, claim support and year alignment require human review.
- A skill can direct an agent to read files or run tools. Audit skills and scripts as software, grant only necessary permissions and do not install a skill into a sensitive environment without review.

## Upgrade and maintenance

Review the release notes and diff before upgrading. Then inspect and update the installed skill:

```sh
npx skills list
npx skills update un-editorial-check
npm run check:portability
```

Use `npx skills list` to verify installation and this package's portability validator to validate the source. The validator is intentionally a strict parser for the restricted portable frontmatter subset published by this package, not a general YAML parser. Review the CLI output rather than assuming that an update is complete.

If an update cannot be applied cleanly:

```sh
npx skills remove un-editorial-check
npx skills add https://github.com/ahaomar/un-editorial-check --skill un-editorial-check
npx skills list
```

For a manual installation, replace the complete skill directory, retain the same directory identity and rerun the bundled checker. Re-run project CI after every upgrade. Do not assume that an update changed only instructions: review scripts, profiles, permissions and release notes.

## Development and tests

```sh
npm test
npm run check:portability
npm run check:syntax
node bin/check.mjs --self-scan --quiet
npm pack --dry-run
```

The suite covers positive and negative fixtures for every catalogue rule, offset-accuracy assertions, suppressions, protected and applied fixes, configuration and profile rejection, audit opt-in, output formats, exit codes, package contents, a packed installation and an executable smoke test. The portability validator uses Node.js built-ins only and checks the canonical frontmatter, identity, relative resources, package allowlist, host documentation, stale-version markers and all maintained JSON files. GitHub Actions runs both across supported Node.js versions.

The repository is a fixture for itself: `node bin/check.mjs . --self-scan --quiet` must exit `0`. Documentation and fixtures may still *mention* rule IDs, but they may not contain copy that breaks the rules.

## Releases and discovery

Stable releases are published to [npm](https://www.npmjs.com/package/un-editorial-check) and [GitHub Releases](https://github.com/ahaomar/un-editorial-check/releases). `package.json`, `VERSION` and the newest `CHANGELOG.md` heading must agree. A release requires syntax checks, the full test suite, portability validation, JSON parsing, `npm pack --dry-run`, direct CLI smoke tests, an installed tarball smoke test and a clean `git diff --check`.

The skill is listed through [skills.sh](https://skills.sh/ahaomar/un-editorial-check/un-editorial-check). The repository-root `SKILL.md` remains the canonical public definition.

## Troubleshooting

- **The skill is absent:** run `npx skills list`, confirm the target project or global scope, and compare the installed directory with [COMPATIBILITY.md](COMPATIBILITY.md).
- **The host does not load it:** verify the exact path for the installed host version and restart the host. Remove duplicate skill IDs with different precedence.
- **A relative file is missing:** reinstall the complete package; `SKILL.md` alone is not a runnable installation.
- **Node is unavailable:** install Node.js 18 or later and confirm `node --version`.
- **A finding differs from the expected result:** inspect the applicable rule and any suppression, then review the source line. Do not weaken a rule without a sourced fixture and release decision.
- **An upgrade changed behaviour:** read the npm/GitHub release notes, compare versions, rerun `npm test` or the installed CLI and review the working-tree diff.
- **A host only supports rules:** create a small adapter that instructs the agent to read the canonical `SKILL.md`; document and test that adapter separately. Do not claim native skill support.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [MAINTAINING.md](MAINTAINING.md) before changing behaviour or compatibility. Add a failing fixture or portability test first.

Report vulnerabilities privately through the process in [SECURITY.md](SECURITY.md). Do not include credentials, private content or sensitive command output in an issue. Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

MIT. See [LICENSE](LICENSE).
