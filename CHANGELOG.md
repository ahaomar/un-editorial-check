# Changelog

## 0.3.0 – 25 September 2026

- Expanded the installation guide for OpenCode 1.x and 2.x, Claude Code, Codex, Kimi Code CLI and other Agent Skills hosts.
- Documented project and global paths, manual installation, upgrades, invocation and host-specific compatibility boundaries.
- Added and validated the canonical skills.sh detail URL and GitHub-based installation commands.
- Preserved one root `SKILL.md` as the canonical skill definition to prevent host-copy drift.

## 0.2.0 – 25 September 2026

- Hardened `--fix` to prose-only regular `.txt`/`.md` files; reject symbolic links in every mode and hard links before writes.
- Added independent protected-span masking, allowlist-aware fixes and terminology/register allowlist handling.
- Recast HTML sink and Leaflet tooltip checks as documented conservative sink policies.
- Added strict, portable, data-only organisation profile v1 support and a maintained rule catalogue.
- Hardened HTML preprocessing, entity decoding and Unicode-safe JSON/SARIF output; corrected SRI and canonical wording.
- Added release metadata, community files, CI, skills.sh integration, maintainer guidance and packaging coverage.

## 0.1.0 – 24 September 2026

- Initial deterministic editorial checker.
