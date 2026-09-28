# Terminology and names

The four terminology rules run offline and none of them rewrites a file: no
finding in this file carries a replacement, so the fix pipeline skips it and
`--fix` leaves the wording to an editor. **UE-TE002**, **UE-TE003** and
**UE-TE004** are **error** severity and report only. **UE-TE001** keeps
**error** severity with deterministic confidence for its sourced pairs, and
drops to **warning** with heuristic confidence for the one context-gated pair,
where the copy may well be right.

- **UE-TE001** — Use **maternal mortality ratio (per 100,000 live births)** for `SH.STA.MMRT`; do not call it “maternal deaths”. Every configured pair is screened directly except `maternal mortality rate`, which is gated by nearby evidence: a finding is raised only when a printed statistic sits inside the evidence window (120 characters before the term, 200 after). Three offline states are distinguished. First, when a per-100 000 live-births figure is printed in the window, a warning asks for editorial review of the causal formulation and quotes the printed figure as evidence. Second, when some statistic is printed in the window but no such figure is present, a warning says plainly that the denominator could not be determined offline and claims no defect. Third, when no printed statistic appears in the window, no finding is raised at all. Outside that gated pair, a term inside a definition context is still reported as a warning rather than an error, because naming the unapproved term may be intentional. No wording can be derived offline, so none of these findings is a fix candidate.
- **UE-TE002** — Person-first language: keep `handicapped → persons with disabilities` and `aids victims → people living with HIV`, both of which have a recorded source. The unsourced pairs `women's work → female labour-force participation rate` and `female work → female labour-force participation rate` were removed: the recorded claim check found no primary United Nations source prescribing that replacement, and the checker never proposes wording that a source does not support.
- **UE-TE003** — Percentages. The percentage sign is permitted in running text, so the rule is silent in ordinary prose. Resolution context has no deterministic offline detector — this tool does not resolve agenda symbols or document types — so that branch is a documented limitation rather than a heuristic guess, and no finding is raised in any context. The house preference for `per cent` over `percent` is **UE-SP001**'s, on spelling-list authority: the profile maps the closed-up form to the two-word form, and terminology stays out of it.
- **UE-TE004** — Write **the United States** in prose. A bare `US` at sentence final position (e.g. `… in the US.`) is reported; it reads as the pronoun. Acronyms (`U.S.A`), currency amounts (`US dollars`, `US$`) and URLs are exempt. The finding is flag-only: it never carries a replacement, so `--fix` skips it and an editor writes the full name by hand.

Prefer **lower-secondary completion rate**, **share of parliamentary seats held by women**, and data centres’ **share of electricity demand** when these are the statistics meant.

Project-specific terms belong in an organisation profile or `allowlist.terminology`, not in a fork of these files.
