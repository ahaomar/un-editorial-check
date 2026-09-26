# Numerals, dates and claims

## Editorial rules

- **UE-NU001** *(warning)* — Dates in running prose use day–month–year, for example `9 November 2026`. A numeric `d/m/y` or `m/d/y` date in prose is reported. Dates in source code, data formats, URLs, `datetime` attributes and immutable references are masked first; the pattern stays intentionally conservative rather than guessing an intended locale.
- **UE-NU002** *(warning, fixable)* — Numeric ranges join with an en dash: `1990–2025`, not `1990-2025`.

## Agent review required

These three are reported as warnings in the `AGENT REVIEW REQUIRED` section. They are prompts for a reviewer, not verdicts, and never reach error severity.

- **UE-RE003** — A prose figure needs a hedge such as “approximately”, “at least” or “an estimated”, and should identify source and date.
- **UE-DI001** — A coverage count must state what is counted: member economies, economies with a value, or economies drawable on a map. The qualifying word must appear in the count's own sentence; a qualifier in the next sentence does not cover it.
- **UE-CL001** — A comparison may be aligning different reference periods. Check that the compared values share a reference year, and say “reported on or before” when values are carried forward.

The checker does not calculate ratios, validate years against source rows, or prove that prose matches rendered data. Ordinal ranks are not counts; verify off-by-one boundaries yourself.
