# un-editorial-check

[![skills.sh](https://skills.sh/badge/ahaomar/un-editorial-check)](https://skills.sh/ahaomar/un-editorial-check)

A portable, zero-dependency Node.js CLI and Agent Skill that reports written-content risks against United Nations editorial standards. It checks HTML, Markdown, plain text and JavaScript strings, including strings that generate user-facing copy.

The product boundary is **report first**: a finding identifies a review requirement; it does not establish the truth of a claim. Deterministic checks find documented patterns. Editorial judgement remains with the reviewer.

## What it checks

- United Nations terminology, including maternal mortality ratios, labour-force participation rates, lower-secondary completion rates and data centres' share of electricity demand.
- British English spelling and written-out “per cent” in running prose, with compact-display exemptions.
- Dates, ranges, reporting language and some common data-claim risks.
- SEO structure, basic accessibility attributes and selected deterministic web-security patterns.
- Supplied organisation vocabulary through data-only profiles.

The v0.2.0 catalogue contains 24 stable rule IDs. Its institutional sources were checked on **24 September 2026**. Re-check current United Nations guidance before treating a release as institutional advice.

## Tier 1 and Tier 2

**Tier 1 — deterministic checks:** the CLI tests patterns with documented boundaries. These are suitable for local review and CI because the rule, exemption and output are explicit. A clean Tier 1 result is not a certificate of quality.

**Tier 2 — editorial judgement:** a reviewer must assess whether a claim matches its evidence, figures are sourced and dated, citations are complete, comparisons use aligned years, register is proportionate, labels describe what was counted and a coverage claim is reproducible. The skill requires the agent to review Tier 2 after running the CLI and to report the two classes separately.

## Requirements and installation

### Runtime

- Node.js 18 or later.
- No runtime npm dependencies.
- A supported Agent Skills host, or direct use of the CLI.

### Universal skills installation

The Vercel `skills` CLI installs the canonical repository skill and its bundled runtime files. Run it in the target project:

```sh
npx skills add ahaomar/un-editorial-check
npx skills add ahaomar/un-editorial-check --list
```

Choose the project or global scope and the detected host in the prompts. Add `--global` for user-level installation, `--copy` instead of the default symbolic-link installation, or `--yes` for a reviewed non-interactive installation.

### Per-agent installation

```sh
npx skills add ahaomar/un-editorial-check --skill un-editorial-check --agent opencode --yes
npx skills add ahaomar/un-editorial-check --skill un-editorial-check --agent claude-code --yes
npx skills add ahaomar/un-editorial-check --skill un-editorial-check --agent codex --yes
npx skills add ahaomar/un-editorial-check --skill un-editorial-check --agent kimi-code-cli --yes
npx skills add ahaomar/un-editorial-check --skill un-editorial-check --agent cursor --yes
npx skills add ahaomar/un-editorial-check --skill un-editorial-check --agent gemini-cli --yes
npx skills add ahaomar/un-editorial-check --skill un-editorial-check --agent windsurf --yes
npx skills add ahaomar/un-editorial-check --skill un-editorial-check --agent cline --yes
npx skills add ahaomar/un-editorial-check --skill un-editorial-check --agent github-copilot --yes
```

Append `--global` where a user-level installation is required. For the generic Agent Skills layout, use `--agent universal` to install to `.agents/skills/`.

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
2. address error-severity findings and review warnings;
3. read the applicable bundled rule files relative to the skill base, not from memory;
4. review Tier 2 claims against the available evidence; and
5. distinguish deterministic findings from editorial judgement in its report.

## CLI use

```sh
node bin/check.mjs README.md
node bin/check.mjs content dashboards --format text
node bin/check.mjs content --format json > results.json
node bin/check.mjs content --format sarif > results.sarif
node bin/check.mjs content --config .un-editorial.json
node bin/check.mjs content --profile config/profiles/un-v1.json
node bin/check.mjs content --quiet
node bin/check.mjs --self-scan --quiet
```

`--format text` is the default. JSON and SARIF results go to standard output; tool and configuration failures go to standard error. Paths may be files or directories. Directory scans do not follow symbolic links.

### Exit codes

| Code | Meaning |
|---:|---|
| `0` | No error-severity findings; warnings may remain |
| `1` | One or more error-severity findings |
| `2` | Invalid options, path, JSON, profile or configuration; the audit could not be completed as requested |

CI should treat exit code `1` as a requested policy failure and exit code `2` as a tool failure. It should not silently merge the two.

### Output formats

- **Text:** concise, review-oriented findings with path, line, rule and message.
- **JSON:** structured findings, file counts, severity and rule IDs; suitable for local automation.
- **SARIF:** SARIF 2.1.0 for code-scanning tools that accept static-analysis output.

Suppression comments apply to the line or bounded construct. Keep suppressions narrow and record the reason in version control:

```html
<!-- ue:ignore UE-SP001 -->
<p>organization</p>
```

```js
// ue:ignore UE-RE002
const label = deriveComparison(rows);
```

## The safe `--fix` boundary

Report-only operation is the default. `--fix` is opt-in and, in v0.2.0, is deliberately narrower than a general editor:

- It accepts explicit or discovered regular prose files with `.txt`, `.md` or `.markdown` extensions.
- It refuses HTML, JavaScript, JSON, code and configuration files, symbolic links and regular files with multiple hard links, with exit code `2`.
- It performs only conservative American-to-British spelling replacements and honours spelling allowlists.
- It masks comments, script and style blocks, fenced code, Markdown block quotes, inline code, cited titles, URLs and paths. An unrelated occurrence on the same line can remain fixable.
- It re-checks type, descriptor identity and link count before writing. This reduces path-replacement races but is not a race-proof sandbox.

The skill instructs agents to show changed files before invoking `--fix`. Run it only on a controlled working tree and review the diff. It does not rewrite dates, percentages, claims or terminology.

## Configuration

Copy [`.un-editorial.json`](.un-editorial.json) to the project root, or pass `--config path`:

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
  "baseOrigin": "https://www.example.org"
}
```

`baseOrigin` must be an absolute HTTP(S) origin. With it configured, canonical URLs are checked by scheme, hostname and effective port. Without it, the checker can reject missing or non-absolute canonical URLs but does not claim origin or self-reference. Local configuration files named `.un-editorial.json` are ignored during scans.

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
    "program": "programme"
  },
  "register": ["project house phrase"],
  "severities": {
    "UE-RE003": "warning"
  },
  "rules": {
    "UE-SE004": { "enabled": false }
  }
}
```

Profile v1 requires `profileVersion`, `name` and `source`. Optional sections are `spelling`, `terminology`, `register`, `severities`, `rules` and `pageUrl`. Unknown keys, unknown rule IDs, malformed mappings, empty or self-equivalent terminology pairs, and non-HTTP(S) page URLs fail closed. Profiles contain data only and cannot execute JavaScript.

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

- HTML and JavaScript use conservative regular expressions, not standards-compliant parsers, scopes or data-flow analysis.
- `UE-SE001` flags `innerHTML` and `outerHTML` sinks. `UE-SE004` applies a bounded local `bindTooltip` policy. Neither is a complete taint analysis.
- SRI rules validate exact-version markers, `sha384-` syntax, a 48-byte base64 digest and `crossorigin="anonymous"`. They do not fetch assets or prove that the digest matches content.
- The date rule detects slash dates; it cannot infer the intended locale of an ambiguous numeric date.
- Allowlists are simple and may suppress more context than intended.
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
npx skills add ahaomar/un-editorial-check --skill un-editorial-check
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

The suite covers positive and negative fixtures for every catalogue rule, configuration and profile rejection, security boundaries, output formats, exit codes, package contents, a packed installation and executable smoke test. The portability validator uses Node.js built-ins only and checks the canonical frontmatter, identity, relative resources, package allowlist, host documentation, stale-version markers and all maintained JSON files. GitHub Actions runs it across supported Node.js versions.

`--self-scan` may return `1` because fixtures and documentation intentionally contain rule examples. Release checks accept only exit codes `0` or `1`; exit code `2` fails.

## Releases and discovery

Stable releases are published to [npm](https://www.npmjs.com/package/un-editorial-check) and [GitHub Releases](https://github.com/ahaomar/un-editorial-check/releases). `package.json`, `VERSION` and the newest `CHANGELOG.md` heading must agree. A release requires syntax checks, the full test suite, portability validation, JSON parsing, `npm pack --dry-run`, direct CLI smoke tests, an installed tarball smoke test and a clean `git diff --check`.

The skill is listed through [skills.sh](https://skills.sh/ahaomar/un-editorial-check). The repository-root `SKILL.md` remains the canonical public definition.

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
