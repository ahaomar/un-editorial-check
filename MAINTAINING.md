# Maintaining rules, profiles and compatibility

The current institutional source check date is **24 September 2026**. Before changing an institutional rule, re-check the named source, record the date and add positive and negative fixtures.

## Compatibility changes

The repository-root `SKILL.md` is the only canonical skill definition. Do not commit copied `SKILL.md` files under `.agents/`, `.claude/`, `.opencode/` or another host directory, and do not create recursive symbolic links. Use `npx skills add ahaomar/un-editorial-check` for user installations. A required committed adapter must be generated or tested against the canonical file and must fail on drift.

A new or changed host adapter requires all of the following before merge:

1. verify the current discovery path and format against official host or standard documentation, recording the source URL and verification date in `COMPATIBILITY.md`;
2. add a fixture or portability check that exercises the adapter or exact installation command;
3. update the README and detailed compatibility matrix, clearly distinguishing native host support from `skills` CLI installation and rules/manual support; and
4. run `npm run check:portability`, syntax checks, the full test suite, package dry-run and CLI smoke tests.

Use only commands listed by the current `npx skills --help`. Re-run that help output when updating installer guidance; agent identifiers, paths and command interfaces may change independently of this package.

Optional host metadata such as `agents/openai.yaml` must remain subordinate to `SKILL.md`. It may describe display metadata or invocation policy, but it must not become a second workflow definition.

## Rule lifecycle

Ideas enter the issue tracker, are reproduced as a fixture, and graduate only when the intended language is deterministic, editorially sourced and independently bounded. Add a stable ID, severity, category and deterministic status to `rules/catalogue.json`, then update prose rules and the changelog. Breaking changes require a major version; new rules and profiles require a minor version.

Organisation-specific differences belong in portable JSON profile v1 files, not forks. Profiles use only data: metadata, spelling mappings, terminology pairs, register terms, severities and enabled states. They cannot execute JavaScript. Validate the schema, bad examples and profile precedence in tests. The packaged `config/profiles/un-v1.json` records the built-in UN baseline.

HTML and JavaScript analysis is intentionally conservative and regex-based. `UE-SE001` and `UE-SE004` are sink policies, not taint analysis. `UE-SE004` accepts only bounded local `document.createElement` evidence for the same sink. Suppress a local false positive narrowly with `ue:ignore UE-SE001` or `UE-SE004`; never claim a general safety proof. SRI checks validate declaration syntax only and never retrieve assets.

## Release gate

Keep `package.json`, `VERSION` and the newest `CHANGELOG.md` heading identical. Keep version `0.2.0` unless the documented release process requires a version change. The package has no dependencies, so no lockfile is required.

Run `npm run check:syntax`, `npm test`, `npm run check:portability`, parse every tracked JSON file, `npm pack --dry-run`, `node bin/check.mjs --self-scan --quiet`, an installed executable smoke test and `git diff --check`. GitHub Actions actions are pinned to full verified commit SHAs with version comments. Never commit generated tarballs, local profiles, installed-package directories or agent copies that can drift from the canonical skill.
