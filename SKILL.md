---
name: un-editorial-check
description: Audits written content against United Nations editorial standards and reports what fails. Use when reviewing dashboards, web pages, blog posts, LinkedIn drafts, page titles or meta descriptions for British English spelling, "per cent" usage, UN indicator terminology, neutral professional tone, grammar, country and organization names, SEO length limits, accessibility attributes, and accuracy of data claims. Checks HTML, Markdown, JavaScript-generated strings and plain text; distinguishes deterministic rules from editorial judgement.
---

# UN editorial check

Run the bundled checker before offering editorial judgement. The tool checks rules; it does not prove that prose is clear, neutral or accurate.

## Workflow

1. Run `node <skill-directory>/bin/check.mjs <paths>`.
2. Fix error-severity findings. Warnings require human review.
3. Read the applicable files in `rules/`; do not restate or reinterpret them from memory.
4. Review Tier 2: whether claims match evidence, figures are sourced, citations are complete, and register is proportionate.
5. Report deterministic findings separately from editorial judgement.

Never use `--fix` without showing the user the changed files first. It is limited to conservative spelling replacements in v0.1.0; contractions and possessives are not interpreted as quote boundaries. When `baseOrigin` is configured, canonical URLs are checked against its scheme, hostname and effective port. SRI results certify declaration syntax and required attributes, not whether a digest matches downloaded content.

Read `rules/spelling.md`, `rules/terminology.md`, `rules/numerals.md`, `rules/register.md`, and `rules/sources.md`.
