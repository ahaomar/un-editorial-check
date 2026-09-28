# un-editorial-check

[![skills.sh](https://skills.sh/b/ahaomar/un-editorial-check)](https://skills.sh/ahaomar/un-editorial-check/un-editorial-check)

A portable, zero-dependency Node.js CLI and Agent Skill that reads user-visible copy the way a United Nations editor would — language, wording, tone, spelling, terminology, dates, numbers, claims and register — and reports what fails.

It is not a code-quality, accessibility, security or SEO linter. Copy is extracted first (HTML text nodes and copy-bearing attributes, Markdown paragraphs, plain-text blocks, JavaScript strings that demonstrably render) and only then checked, so CSS properties, comments, identifiers, URLs and cited titles never reach a rule; block quotations and quoted material are classified with their context and reported separately where the review applies, never blended into authored copy. Those other concerns exist in this package solely as opt-in audits.

The product boundary is **report first**: a finding identifies a review requirement; it does not establish the truth of a claim. Deterministic rules prove the defect; where judgement is required the finding is labelled heuristic and moves to `AGENT REVIEW REQUIRED`.

> **For researchers, students and United Nations staff:** the plain-language **[User Guide](USER-GUIDE.md)** explains, step by step and without technical words, how to check a document with your AI assistant — including a prompt you can copy and paste.

## What it checks

Editorial rules (32, always on):

- British English spelling, mixed variants within a passage, and opt-in `-ize` review. The `-ize`/`-ise` conflict family is resolved by the selected profile: a profile-selection warning by default, silent under `un-secretariat-document`, an error only under a profile that prefers `-ise`.
- United Nations terminology: the `maternal mortality rate` versus ratio distinction (review-only, gated to the printed per-100 000-live-births statistic), `percent` written as `per cent`, and the country name `US` written in full.
- Day–month–year dates, en-dash ranges, hedged and sourced figures, counts that say what was counted, comparisons that align reference years.
- Neutral register and tone: promotional phrasing, rhetorical questions, exclamation marks, unsourced superlatives, direct insults and name-calling, threat or intimidation posture, and all-caps shouting.
- Contested territorial and sovereignty claims stated as fact: flagged for attribution or neutral United Nations wording, symmetrically for every party to the claim, with a cited source per claim, and reported as requiring diplomatic review rather than as a finding of fact.
- Hate speech: dehumanising frames, collective blame and calls for exclusion or violence against a group of people. Detection is composed over bounded pattern groups with a cited source each, is symmetric across groups, and exempts attributed statements; quoted material is reported separately as quoted context rather than silently skipped.
- Discriminatory or demeaning language beyond those frames — protected characteristics including gender, sex, disability, nationality, ethnicity, religion, sexual orientation, gender identity and age — routed to high-severity human review and never auto-rewritten. Quoted or reported material is classified and reported separately instead of being skipped.
- High-precision grammar: unintentionally doubled words, a space between a word and its following punctuation, and a missing space between two sentences — all deterministic, all repairable with `--fix`.
- Heuristic editorial review: sentence fragments, malformed wording, duplicated unrelated insertions, incoherent headings and broken quotations — review severity only, with no claim of full grammar checking.
- Supplied organisation vocabulary through data-only profiles.

Audit rules (11, only with `--profile publishing`, `--profile accessibility` or `--profile security`): page title, meta description, canonical link, heading structure and card metadata; image and form-control labelling; four bounded source-code policies. Audits are reported in their own section and never change the exit code.

The stable rule identifiers are indexed in [rules/catalogue.json](rules/catalogue.json); each entry names its severity, confidence and guard notes. Their institutional sources are recorded with URL, retrieval date, scope, evidence and rationale in [rules/sources.json](rules/sources.json). Re-check current United Nations guidance before treating a release as institutional advice.

## What the CLI proves, and what it does not

**Deterministic rules** test a pattern with a documented boundary — a spelling map, a terminology pair, an exclamation mark, a doubled word. The rule, its exemption and its position are explicit, so results are suitable for local review and CI. A clean run is not a certificate of quality: when nothing is found, the tool says exactly one thing — `No findings under the enabled, documented local rules.` — and nothing more.

**Heuristic rules and `AGENT REVIEW REQUIRED`** ask for judgement: whether a claim matches its evidence, figures are sourced and dated, citations are complete, comparisons use aligned years, register is proportionate, and labels describe what was counted. By default they are reported as warnings and never fail a run; only an organisation that configures a heuristic to `error` severity makes it fail. What a clean run means is exactly this: `No findings under the enabled, documented local rules.`

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

In non-interactive shells — an agent, a CI job, a script — always pass `--yes` (`-y`). Without a confirmation flag, `skills add` waits for a prompt that never comes and exits `0` having installed nothing; an installer that checks only the exit code would record a success that never happened.

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

### The `/un-diplomatic-agent` command

The `/un-diplomatic-agent` command drives the whole flow as one approval-gated procedure: it runs the check, writes the PDF report, and summarises the findings with severity counts and current-to-should-be wording, then stops at an approval gate where nothing is written. Only after the user explicitly approves does the agent apply the mechanical `--fix --apply` corrections, rewrite the remaining findings from the report's `SHOULD-BE` wording, re-run the scan and report what honestly remains; it never claims the copy is clean unless the exit code is `0`.

The canonical source is `commands/un-diplomatic-agent.md` in this repository — a single Markdown prompt, so any host that reads Markdown command files can load it. Copy the file into the command directory your host documents:

**OpenCode**

Project installation:

```text
.opencode/commands/un-diplomatic-agent.md
```

Global installation:

```text
~/.config/opencode/commands/un-diplomatic-agent.md
```

OpenCode documents both locations and still discovers the legacy singular `command/` directory. OpenCode reloads command files automatically; invoke `/un-diplomatic-agent`.

**Claude Code**

Project installation:

```text
.claude/commands/un-diplomatic-agent.md
```

User installation:

```text
~/.claude/commands/un-diplomatic-agent.md
```

Claude Code still loads `.claude/commands/` files although it now prefers skills for new work, so confirm the command directory for the installed version and restart after copying. Invoke `/un-diplomatic-agent`.

**Codex**

```text
~/.codex/prompts/un-diplomatic-agent.md
```

Codex documents custom prompts as user-level only — they live under the Codex home directory rather than the repository — and marks them deprecated in favour of skills, so confirm the directory in the installed version. Codex invokes the file as `/prompts:un-diplomatic-agent`.

**Other hosts covered above — Kimi Code CLI, Cursor, Gemini CLI, Windsurf, Cline, GitHub Copilot**

No command directory is verified for these hosts in this repository. Copy `commands/un-diplomatic-agent.md` into the custom-command directory your installed version documents, or hand the agent the path to the file and ask it to follow the flow. Command discovery is version-specific, so use the path the host reports.

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
5. keep deterministic findings, agent-review findings and its own editorial judgement separate in the report, following its five lanes — deterministic violations, heuristic review, harmful or discriminatory review, diplomatic sensitivity, audits; and
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
node bin/check.mjs content --init
node bin/check.mjs content --self-test
node bin/check.mjs content --baseline .ue-baseline.json
```

`--format text` is the default. JSON and SARIF results go to standard output; tool and configuration failures go to standard error. Paths may be files or directories. Directory scans do not follow symbolic links, and hidden directories, `node_modules`, build output and fixtures are skipped unless you name them explicitly.

The supported file formats are `.md`, `.markdown`, `.txt`, `.html`, `.htm`, `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts` or `.tsx`. Naming a file of any other type is a refusal, and so is a scan that ends up with no supported file to read. A scan whose target is the skill root itself — the bare `.` inside the installation, or the package directory named as a path — is the one exception: it reads nothing and exits `0`. Pass `--self-scan` to read the root, or name a file or a sub-directory inside it, which is scanned like any other input.

`--profile` is repeatable: a value that names a bundled audit (`publishing`, `accessibility`, `security`) runs that audit; a value that names a bundled organisation profile (`un-secretariat-document`, `un-v1`, `un-geneva-web`, `generic-british-english`) resolves to that bundled profile; any other value is an organisation profile file merged over the bundled United Nations baseline (an existing file of that name wins over the bundled name). A missing or invalid profile is a usage failure (exit `2`), not a silent fallback, and an unknown bare name is refused while listing the bundled profile names.

### Exit codes

| Code | Meaning |
|---:|---|
| `0` | No error-severity editorial findings; warnings, notes and every audit may remain |
| `1` | One or more error-severity editorial findings |
| `2` | Invalid options, path, JSON, profile or configuration; an unsupported file named explicitly, no supported files found in the scan (a scan whose target is the skill root itself exits `0` instead), or a scan or write failure |

CI should treat exit code `1` as a requested policy failure and exit code `2` as a tool failure. It should not silently merge the two. Audit findings never move the exit code, so `--profile security` cannot fail a build that the editorial rules passed.

### Output formats

The report separates five lanes: deterministic rule violations, heuristic editorial review, harmful or discriminatory language review, diplomatic sensitivity, and — only when requested — optional audits. Every finding carries its rule source, the profile it ran under, its confidence, the limitation that bounds it and the recommended human action.

- **Text:** a sectioned report in that order — deterministic violations by severity, the heuristic review queue, the harmful and discriminatory review queue, the diplomatic sensitivity queue, then `OPTIONAL AUDIT — <name>` for each audit that was requested. Each finding shows its source, confidence and recommended action beside the file position.
- **JSON:** the same findings as records carrying `file`, `line`, `column`, `ruleId`, `category`, `severity`, `confidence`, `scope`, `message`, `suggestion`, `current` and `proposed`, extended with the finding's lane, rule source, profile, limitation and recommended action; audit findings are tagged with their `audit`. Internal fields are stripped from every format.
- **SARIF:** SARIF 2.1.0 for code-scanning tools that accept static-analysis output, with the same lane and provenance information.

`--report <path.pdf>` writes the same review as a PDF, whatever `--format` says on stdout. It opens with the scan's scope and counts, then every finding grouped by file — what is currently written under `Current`, what should replace it under `Should be`, with a marker for findings that are `--fix-able` and findings that need a manual or agent rewrite — followed by a queue of heuristic findings for review and the knowledge-base sources behind contested-claim and hate-speech findings. The file is written before `--fix --apply`, so it records the pre-fix state of the copy, and each page carries a footer stating that the report changes nothing. `--quiet` still writes it; an unwritable path is a refusal with exit code `2`. The PDF uses Helvetica with WinAnsi encoding: typographic quotation marks and the ellipsis are converted to their plain forms, the en dash and the em dash keep their WinAnsi byte positions (0x96 and 0x97), and a character outside that encoding is replaced with `?`.

A suppression belongs to the copy span that contains it — one paragraph in HTML or Markdown, one line in JavaScript. Keep it narrow and record the reason in version control:

```html
<p>The organization reports quarterly. <!-- ue:ignore UE-SP001 --></p>
```

```js
const note = { inlineNote: `${count} organization` }; // ue:ignore UE-SP001  (name of a body)
```

`ue:ignore UE-SP001,UE-TE003` accepts a list, `ue:ignore UE-SP*` a rule family, and `ue:ignore all` everything in that span. A suppression in one paragraph never reaches the next, and configuration (`allowlist`, `severities`, `rules`) is the right tool when a whole project needs the same exception.

## Phase 5A adoption pack

Marked additions for the documentation merge: the baseline snapshot (`--baseline`), the starter configuration (`--init`), the installation self-test (`--self-test`), the character-budget preview (`--preview`), the GitHub Action (`action.yml`) and the templates under `templates/`. The npm package ships the CLI itself; `action.yml` and `templates/` are read from this repository.

### `--baseline <file>` — a snapshot of accepted findings

The first run writes a snapshot of every finding to the named file and exits `0`. Commit that file: later runs fail only on new error-severity findings the snapshot does not already contain. A finding's key is its working-directory-relative file, rule identifier and excerpt — no line or column — so reflow or an edit above a finding cannot make it look new, while a changed excerpt or a different rule does, and the check fails closed. Snapshot entries the scan no longer produces are reported as stale and never fail the run. An unreadable, corrupt or future-version snapshot is a refusal with exit code `2`, never a silent fall-back. The status line goes to standard error, so `--format json` and `--format sarif` output stays a single valid document.

### `--init` — a starter configuration and the paste snippet

`--init` writes `.un-editorial.json` in the working directory with the bundled defaults, so it changes no behaviour until you edit it, and refuses to replace an existing file unless `--init-overwrite` is given. It then prints how to scan with the new file, the CI or git host detected in that directory — GitHub Actions, GitLab CI, CircleCI, Jenkins, pre-commit or git, in that priority order, inspecting the directory itself and walking no parent directories — and the snippet for that host. Detection finds nothing outside the directory you run it in.

### `--self-test` — verify the installation in one command

`--self-test` runs the bundled corpus on the bundled defaults: one clean file that must produce no findings at all, and one file carrying a planted violation per line across five rules, each asserted at its exact line and column. The success line is `ok — self-test: 2 corpus cases, 5 findings asserted exactly` with exit code `0`; a finding that appears, moves or disappears fails with a readable diff on standard error and exit code `1`, and an unreadable corpus is exit code `2`. The run reads no working-directory configuration and no network, so it works from an `npm pack` tarball.

### `--preview <platform>` — a character-budget preview

`--preview` counts one file against a platform character budget and prints where the cut lands: `x` at 280 characters with every link counted as 23, `linkedin` at 3000, `bluesky` at 300 and `mastodon` at 500, with links counted as written on those three. These numbers are stated assumptions for planning, not guarantees from the platforms. The preview is a counting tool rather than a scan: exit code `0` means the preview was produced, whether or not the file fits, and the output states the truth when it is over budget.

### GitHub Action and templates

`action.yml` runs the CLI on `node20` through `action/main.mjs`, taking `path`, `config` and `baseline` inputs and installing nothing at run time. In this repository, `templates/pre-commit` is a shell script that passes staged files of an extractable type to the checker, and `templates/agent-commands/` holds paste-ready command prompts for Claude Code, Codex, OpenCode and Cursor, each carrying the approval law, the scan, the baseline ratchet and the rule that the copy is never called clean unless the exit code is `0`.

## The safe `--fix` boundary

Report-only operation is the default. `--fix` is opt-in and deliberately narrower than a general editor:

- `--fix` prints a diff labelled `(proposed)` and writes nothing; `--fix --apply` performs the same writes and labels them `(applied)`.
- It accepts only regular prose files with `.txt`, `.md` or `.markdown` extensions. Anything else — HTML, JavaScript, JSON, configuration — is refused with exit code `2`.
- It applies only deterministic replacements: British spelling outside the profile-dependent conflict family (`UE-SP001`), en-dash ranges (`UE-NU002`), a doubled word (`UE-GR001`), a space before punctuation (`UE-GR002`) and a missing space between sentences (`UE-GR003`), honouring spelling allowlists. Terminology, claims, dates, political wording, quotations, harmful wording and sources are never rewritten by `--fix`.
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

- `allowlist.spellings` names words the spelling rules leave alone. `allowlist.terminology` must repeat the unapproved term exactly as the profile writes it, and `allowlist.register` names phrases that are fine in this project. `allowlist.claims` names contested-claim knowledge-base entries (for example `DP-KASHMIR`) whose detection is switched off for this project.
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

Profile v1 requires `profileVersion`, `name` and `source`. Optional sections are `spelling` (a word-to-word map; each key must already exist in the baseline vocabulary so a typo cannot disable a rule), `spellingConflicts` (the `-ize`-`ise` conflict-family keys the profile accepts; each entry must exist in the baseline vocabulary, and a profile that states the list replaces the baseline family rather than extending it), `terminology.forbidden` (a list of pairs, or `{ "rule", "from", "to" }` objects to target one rule), `register` (an object with `forbidden` and `approved` lists), `diplomacy` (an object whose `claims` array adds or replaces contested-claim knowledge-base entries, merged by `id`), `severities`, `rules` and `pageUrl`. Unknown keys, unknown rule IDs, malformed mappings, empty or self-equivalent terminology pairs, incomplete claim entries and non-HTTP(S) page URLs fail closed with exit code `2`. Profiles contain data only and cannot execute JavaScript.

A profile's `severities` and `rules` are applied to the run; where a configuration file sets the same key, the configuration file wins.

Whether the `-ize`-`ise` conflict family (`organization`, `organizations`, `organize`, `organized`, `organizes`, `organizing`) stands is a profile choice, not a rule verdict: with no `--profile` each occurrence is a warning that names the choice and is never rewritten; `--profile un-secretariat-document` (alias `un-v1`) and `--profile un-geneva-web` accept the `-ize` form silently; `--profile generic-british-english` enforces the `-ise` spelling as a fixable error. Words outside the family are ordinary fixable errors in every stance.

The packaged baseline is [config/profiles/un-v1.json](config/profiles/un-v1.json). A discoverable project configuration example is [config/example.un-editorial.json](config/example.un-editorial.json).

### Spelling across profiles

Where British `-ise` and dictionary `-ize` forms conflict, the bundled baseline records the contested keys in `spellingConflicts` (every element must be a key of the profile's own spelling map; a value that is not fails with exit `2`, and `generic-british-english` sets an empty list). The default run reports that family as a profile-selection warning — it names the profile choice instead of calling any form wrong, is never auto-fixed, and does not fail the run. `--profile un-secretariat-document` (alias `un-v1`) stays silent on the family because the United Nations spelling list itself prints the `-ize` forms; `--profile un-geneva-web` behaves the same way, because the Geneva guide defers to the Editorial Manual; `--profile generic-british-english` reports the family as errors because that profile chooses `-ise`, and its message cites a retrievable source recorded in [rules/sources.json](rules/sources.json) or says plainly that the preference is configurable rather than a United Nations rule. Catalogue entries carry their registry sources in a `sources` key, so every spelling message can be traced to the document it came from.

### Extending an organisation profile

1. Record an authoritative, reviewable source and its verification date outside the executable schema or in the profile name/source metadata.
2. Add only bounded terminology, spelling, register, claim, severity or rule-state differences.
3. Add positive and negative fixtures for each accepted and rejected case.
4. Run `npm test` and the portability validator.
5. Submit changes through the contribution and security review process; do not copy `SKILL.md` into an organisation-specific fork.

## Rule catalogue and security limits

The maintained index is [rules/catalogue.json](rules/catalogue.json). Detailed guidance is under [rules/](rules/). Rule IDs are stable for CI allowlists and inline suppressions. Every claim this tool makes — whether it is supported, what limits it, and the test that locks it — is recorded in [docs/CLAIM-EVIDENCE-AUDIT.md](docs/CLAIM-EVIDENCE-AUDIT.md).

Important limitations:

- Rules run on extracted copy, never on raw source lines: HTML text nodes and copy-bearing attributes, Markdown paragraphs, plain-text blocks, and JavaScript strings with evidence of rendering. Extraction is deliberately conservative and regex-based — not a standards-compliant HTML or JavaScript parser — and no rule performs scope or data-flow analysis.
- `UE-SE001` flags `.innerHTML =` and `.outerHTML =` assignments in script files; `UE-SE004` flags `eval()` and `new Function()`. Neither is a taint analysis. Comments are masked first, so commented-out code is not reported.
- `UE-SE002` asks only whether an external script or stylesheet *declares* an `integrity` attribute. It never fetches an asset, never validates digest syntax and never proves a digest matches content. `UE-SE003` looks for `rel="noopener"` or `rel="noreferrer"` on `target="_blank"` links.
- The date rule detects slash dates in prose; it cannot infer the intended locale of an ambiguous numeric date.
- Allowlists and suppressions are blunt: they silence a rule over a span without proving the copy is correct.
- Promotional vocabulary and superlatives come from bounded lists in the profile and in `lib/rules.mjs`; an unlisted superlative is not reported. Extend them with a fixture, not by loosening the pattern.
- Contested-claim detection (`UE-DP001`) is a bounded knowledge base: listed regions, literal status phrases and a cited source per entry. A paraphrase outside the listed patterns is not reported, and the rule never decides which party's claim is correct — it asks for attribution or neutral wording.
- Grammar beyond the three high-precision patterns — agreement, tense, articles — requires human review, as do source accuracy, neutrality, claim support and year alignment.
- A skill can direct an agent to read files or run tools. Audit skills and scripts as software, grant only necessary permissions and do not install a skill into a sensitive environment without review.

## Upgrade and maintenance

Review the release notes and diff before upgrading. An upgrade that changes defaults, severities, the fix set or the report shape is written up with per-change instructions in [docs/MIGRATION.md](docs/MIGRATION.md); read the matching section before re-running a pipeline that consumes the report. Then inspect and update the installed skill:

```sh
npx skills list
npx skills update un-editorial-check
npm run check:portability
```

Use `npx skills list` to verify installation and this package's portability validator to validate the source. The validator is intentionally a strict parser for the restricted portable frontmatter subset published by this package, not a general YAML parser. Review the CLI output rather than assuming that an update is complete.

If an update cannot be applied cleanly:

```sh
npx skills remove un-editorial-check
npx skills add https://github.com/ahaomar/un-editorial-check --skill un-editorial-check --yes
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

The suite covers positive and negative fixtures for every catalogue rule, offset-accuracy assertions, suppressions, protected and applied fixes, configuration and profile rejection, audit opt-in, output formats, exit codes, package contents, a packed installation and an executable smoke test. Three audit suites run alongside it: `tests/audit-registry.mjs` validates the source registry's schema, URLs, retrieval dates, identifier uniqueness and catalogue references; `tests/audit-mutation.mjs` proves, by mutated variants, that representative rules fire on their defect, fall silent when the defect is removed and obey configuration changes; `tests/audit-docs.mjs` locks the user-facing documents — house style in this guide's plain-language sibling, the banned-claim phrases, the clean-run wording on every surface, and zero npm dependencies. The portability validator uses Node.js built-ins only and checks the canonical frontmatter, identity, relative resources, package allowlist, host documentation, stale-version markers and all maintained JSON files. GitHub Actions runs all of it across supported Node.js versions, plus explicit source-registry validation, and fails if a suite writes anything into the working tree.

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
