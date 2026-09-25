# Changelog

All notable changes follow semantic versioning.

## 0.1.0 — 2026-09-24

- Escapes control and bidi-control characters in text diagnostics while preserving valid JSON and SARIF output.
- Matches configured canonical URLs by origin (scheme, hostname and effective port); without `baseOrigin`, checks only for an absolute HTTP(S) canonical.
- Expands mutable-reference coverage to `latest`, `dev`, `trunk`, `main` and `master`; clarifies that SRI checks cover syntax, declarations and pinning, not digest correctness.
- Rejects malformed and unknown configuration structures with precise exit-2 errors.
- Prevents apostrophes in contractions and possessives from acting as `--fix` quote boundaries while protecting straight- and curly-double-quoted titles.
- Initial Node-only, zero-dependency checker.
- Added deterministic spelling, terminology, numeral, register, SEO, accessibility, security and data-integrity rules.
- Added text, JSON and SARIF output, quiet mode, project configuration, allowlists and inline suppression.
- Added paired good/bad fixtures and a built-in test runner.
- Added opt-in, spelling-only `--fix` mode.
