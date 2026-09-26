# Diplomacy

- **UE-DP001** *(error)* — A contested sovereignty or territorial-status claim about a listed region is stated as fact. Attribute the claim to the party advancing it, or use the neutral wording the finding proposes. Deterministic and not fixable.

## How detection works

The knowledge base lives in `config/profiles/un-v1.json` under `diplomacy.claims`. Each entry declares:

- `subjects` — the region or regions the claim is about;
- `claimants` — every party to the status question;
- `patterns` — literal claim templates built only from `{subject}` and `{claimant}`, each carrying claim wording of its own, such as `"{subject} is part of {claimant}"` or `"{claimant} has sovereignty over {subject}"`;
- `neutral` — the status-free wording the finding proposes;
- `unTerminology` — the formal United Nations designation for the same subject;
- `source` — the citation that makes the entry reviewable.

Every claimant fires on the same pattern, so both directions of a dispute are caught and neither side is privileged. The rule never decides whose claim is correct; it asks for attribution or neutral wording, and the suggestion cites the entry's source.

Bundled entries: Jammu and Kashmir (Security Council resolution 47 (1948)), Taiwan (General Assembly resolution 2758 (1971)), Hong Kong (the Joint Declaration registered with the United Nations) and Crimea (General Assembly resolution 68/262 (2014)).

## What stays silent

- Reported claims, where attribution such as `"Pakistan claims that Kashmir is part of Pakistan."` or `", the minister said."` names who advances the claim;
- quoted, commented and cited copy, because extraction masks those spans before any rule runs;
- regions the knowledge base does not list — the rule never guesses at a region it does not know.

## Extending and opting out

- `config.allowlist.claims` disables one entry by id, for example `DP-KASHMIR`, for the whole project;
- `profile.diplomacy.claims` in an organisation profile adds an entry or replaces the bundled entry with the same id — claim entries are validated strictly and fail closed with exit code `2` when incomplete;
- `config.severities` and `config.rules` re-grade or switch off `UE-DP001` like any other rule, and `ue:ignore UE-DP001` suppresses it inside one copy span.

## Reporting

Findings carry `current` (the matched claim) and `proposed` (the neutral phrasing): the two halves of the current-to-should-be report the diplomatic agent command reads. Nothing here is rewritten by `--fix`; corrections are applied only after the user approves them.
