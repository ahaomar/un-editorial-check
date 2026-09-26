# Grammar

A deliberately narrow family. Subject–verb agreement, verb forms and tense are out of scope — the CLI never guesses between grammatical readings, because every guess costs false positives. What remains is mechanical and fixable: a doubled word, a space before punctuation, a full stop running straight into the next sentence.

## Editorial rules

- **UE-GR001** *(warning, fixable)* — The same word twice in a row, separated by exactly one space: `the the`, not `the, the`. Matching is case-insensitive (`The the` counts) and the fix keeps the first word's case. The legitimate doubles `had had`, `that that` and `very very` are exempt; every other repetition — including deliberate emphasis such as `long long ago` — is reported and can be silenced with `<!-- ue:ignore UE-GR001 -->`. A pair padded with extra spaces or split across hard-wrapped lines never matches.
- **UE-GR002** *(warning, fixable)* — One space between a word and one of the six covered marks: `,` `.` `;` `:` `?` `!`. Only the space is the defect; the mark itself is never reported here (an exclamation mark on its own belongs to UE-RE005). Several spaces before the mark, a mark that begins a hard-wrapped line, and an ellipsis after the space (`word ...`) are not matched, and URLs, quotations, code and comments never reach the rule.
- **UE-GR003** *(warning, fixable)* — A full stop running straight into the next sentence: `finalised.Next` is missing a space, `finalised. Next` never matches. Excluded: an ellipsis (`...Next`, `…Next`), a period after a digit (`1.5`, `v1.2.Beta`, `3.B`), single-letter initials and dotted initial chains (`U.S.A.`, `U.K.`, `e.g.`, `i.e.`, `J.P.`), the abbreviations `U.S.` `U.K.` `U.N.` `e.g.` `i.e.` `etc.` `Dr.` `Mr.` `Mrs.` `Prof.` `vs.` `a.m.` `p.m.` `St.` written directly against the next word, and any period followed by a lower-case letter (`index.js`). The list is a conservative exemption: any other period abutting a capital — `Dept.Finance`, say — is reported, because a space is required after it, and a single-letter word ending a sentence (`Annex A.The`) is skipped together with the initials.

## Guard notes

These are the exact strings carried in the rule catalogue; each one is locked by an assertion in `.feedbacks/verify-grammar.mjs`.

- **UE-GR001**

> Case-insensitive match on two identical words separated by exactly one space in the source; the legitimate doubles had had, that that and very very are exempt (fixture gr-doubles-ok.txt). Anything else between the words — a line break, extra spaces or punctuation — never matches, so intentional repetition outside the exemption list (for example long long ago) is still reported and may need ue:ignore.

- **UE-GR002**

> Covers exactly one space between a word and one of , . ; : ? !; only the space is reported — the presence of an exclamation mark belongs to UE-RE005. Multiple spaces before the mark, a mark that starts a hard-wrapped line and an ellipsis after the space are not matched; URLs, quotations and code are outside the copy span.

- **UE-GR003**

> Excludes a period preceded by another period or the ellipsis character, a period preceded by a digit (decimals such as 1.5, version numbers such as v1.2, outline numbering), single-letter initials and dotted initial chains (U.S.A., U.K., e.g., i.e., J.P.), and the abbreviations U.S., U.K., U.N., e.g., i.e., etc., Dr., Mr., Mrs., Prof., vs., a.m., p.m. and St. written directly against the next word; a period followed by a lower-case letter (index.js) never matches. The list is a conservative exemption: any other period abutting a capital — an abbreviation outside the list included — is reported, since a space is required after it, and a single-letter word ending a sentence before a capital (Annex A.The) is skipped with the initials.

The checker does not judge agreement, verb forms or tense; it never reads quotations, code, comments or links, which are masked out of the copy span before any rule runs, and it never rewrites a span that a `ue:ignore` comment exempts.
