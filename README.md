# un-editorial-check

A portable, zero-dependency Node CLI and agent skill that audits written content against United Nations editorial standards. It checks HTML, Markdown, plain text and JavaScript strings, including strings that generate user-facing copy.

## Why “check” is earned

The name promises **verify, not rewrite**. Report-only operation is the default and is the main protection against false positives. `un-style` sounds like removing style; `un-editorial` sounds like an editor or rewriter. “Check” is plain language for UN and international staff, while “lint” is developer jargon.

This commitment is part of the product. If automatic rewriting ever becomes the default, the name becomes misleading and should change.

## Install and run

Requires Node.js 18 or later. No packages are installed.

```sh
node bin/check.mjs README.md
node /path/to/un-editorial-check/bin/check.mjs dashboards --format sarif > results.sarif
node bin/check.mjs content --format json
node bin/check.mjs content --quiet
```

Exit codes:

- `0`: no error-severity findings (warnings are allowed)
- `1`: one or more error-severity findings
- `2`: tool, path, JSON or configuration failure

`--fix` is opt-in. In v0.1.0 it performs only conservative American-to-British spelling replacements, and skips code, markup, URLs/paths, comments, straight- or curly-double-quoted text, inline code and other protected spans. Apostrophes in contractions and possessives are not treated as quote boundaries. It does not rewrite dates, percentages, terminology, claims, comparisons or tone. Review the diff after every fix run.

## Configuration

Copy `.un-editorial.json` into a project or pass `--config path`:

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
  "baseOrigin": "https://ahaomar.github.io"
}
```

Inline suppression is available for deliberate exceptions:

```html
<!-- ue:ignore UE-SP001 -->
<p>organization</p>
```

```js
// ue:ignore UE-RE002
const label = 'largest regional share';
```

Use the narrowest possible suppression and record the reason in version control. A checker should be auditable.

## Rules

The v0.1.0 rule catalogue is documented under [`rules/`](rules/): spelling, terminology, numerals, register and verified sources. Rule IDs are stable and suitable for CI allowlists. Deterministic checks include SEO structure, basic accessibility, common mutable upstream references (`latest`, `dev`, `trunk`, `main` and `master` path segments), SRI declaration syntax and common unsafe DOM assignments. SRI digests are not fetched or recomputed, so this checker does not certify digest correctness.

The sources were checked on **24 September 2026**. Re-check the UN Editorial Manual before relying on the package as current institutional guidance.

## Two tiers

**Tier 1 — deterministic:** patterns with documented exemptions. This is what the CLI checks.

**Tier 2 — editorial judgement:** whether a claim matches its evidence, a figure is properly sourced and dated, a citation is complete, the register is proportionate, a comparison uses aligned years, and a coverage count describes what was actually counted. `SKILL.md` directs the agent to review these after running the checker. No regex can certify these claims.

## Known limitations

- HTML is inspected with conservative regular expressions, not a standards-compliant parser. Attribute order, unusual quoting and dynamically inserted markup can affect results.
- JavaScript is analysed line by line. It does not parse scopes, evaluate code, or trace data through functions.
- The date rule catches slash dates only; it does not infer the intended locale of ambiguous numeric dates.
- Coverage, source, neutrality, reporting-year alignment and claim accuracy require human review even when a deterministic rule passes.
- Allowlist matching is intentionally simple and can suppress more context than expected.
- Grammar coverage is limited; v0.1.0 is not a general-purpose prose grammar checker.
- SRI checks require an exact-looking version marker, `sha384-` declaration syntax with a 48-byte base64 value, and `crossorigin="anonymous"`. They do not fetch the asset or verify that the digest matches its content. When configured, `baseOrigin` must be an absolute HTTP(S) origin; canonical scheme, hostname and effective port must match it. Without `baseOrigin`, the checker reports missing or non-absolute HTTP(S) canonical links but does not claim origin or self-reference.
- `--fix` refuses symbolic-link inputs and does not run when a spelling allowlist is configured; automatic date and percentage rewrites were removed from v0.1.0.

## Development

```sh
npm test
npm run check:syntax
```

The test runner creates paired good/bad fixtures for all 24 rules and checks security escaping, canonical-origin matching, configuration rejection, clean output, quiet mode, version handling, format validation, package contents and an installed executable smoke test. No checkpoint commits are required or encouraged by this package workflow.

## Licence

MIT. See [`LICENSE`](LICENSE).
