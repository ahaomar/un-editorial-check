---
name: un-editorial-check
description: Audits written content against United Nations editorial standards and reports what fails. Use when reviewing dashboards, web pages, blog posts, LinkedIn drafts, page titles or meta descriptions for British English spelling, "per cent" usage, UN indicator terminology, neutral professional tone, grammar, country and organisation names, SEO length limits, accessibility attributes, and accuracy of data claims. Checks HTML, Markdown, JavaScript-generated strings and plain text with the bundled Node.js CLI; distinguishes deterministic rules from editorial judgement.
license: MIT
compatibility: Requires Node.js 18 or later and a host that can load the portable Agent Skills SKILL.md format.
metadata:
  version: "0.3.0"
  source-date: "2026-09-24"
---

# UN editorial check

Run the bundled Node.js CLI before offering editorial judgement. The CLI checks documented rules; it does not prove that prose is clear, neutral, accurate or adequately sourced.

Resolve `<skill-base>` from the directory containing this `SKILL.md`. All paths below are relative to that directory.

## Workflow

1. Run `node <skill-base>/bin/check.mjs <paths>`.
2. Address error-severity findings. Review warnings; do not suppress them merely to obtain exit code `0`.
3. Read the applicable files under [rules/](rules/): [spelling](rules/spelling.md), [terminology](rules/terminology.md), [numerals](rules/numerals.md), [register](rules/register.md) and [sources](rules/sources.md). Do not restate or reinterpret them from memory.
4. Review Tier 2: whether claims match evidence, figures are sourced and dated, citations are complete, comparisons use aligned years, labels describe what was counted and register is proportionate.
5. Report deterministic findings separately from editorial judgement.

## Boundaries

Never use `--fix` without showing the user the target files first. In v0.2.0 it is limited to allowlist-aware conservative spelling replacements in eligible prose files. It does not rewrite dates, percentages, terminology or claims. Review every resulting diff.

When `baseOrigin` is configured, canonical URLs are checked against its scheme, hostname and effective port. SRI results certify declaration syntax and required attributes, not whether a digest matches downloaded content.

Use bundled configuration from [config/default.json](config/default.json) or the installed organisation profile. Do not invent undocumented configuration keys.
