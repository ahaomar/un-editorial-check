# Hate speech

- **UE-HS001** *(error)* — A listed group of people is predicated of a listed dehumanising frame, such as `"Foreigners are vermin."` Deterministic and not fixable: the finding reports the matched wording and proposes no replacement.
- **UE-HS002** *(error)* — Collective blame or an inherent trait attributed to a whole listed group, such as `"All Syrians are terrorists."` Heuristic, routed to review; it never claims proof of intent.
- **UE-HS003** *(error)* — A call for exclusion or violence against a listed group, such as `"Deport all Iraqis."`, rather than individual legal process. Deterministic and not fixable.

## How detection works

The knowledge base lives in `lib/rules-hs.mjs` under `HS_KB`, and every entry carries a `source` citation:

- `groups` — the shared vocabulary of groups of people (religions, ethnic and national groups, migration status, racialised groups) that feeds all three rules;
- `dehumanisingFrames` — pest, disease, animal and filth imagery, used by UE-HS001;
- `collectiveBlame` — accusation nouns, trait adjectives and inherent-trait markers, used by UE-HS002;
- `exclusionCalls` — base-form verbs, modal verbs and outcome verbs, used by UE-HS003.

Composition over word lists: a frame, accusation or verb never matches on its own — it fires only when predicated of, or aimed at, a listed group of people. Because one shared group vocabulary feeds all three rules, swapping which group is named cannot change whether a mirrored sentence fires. The rules run on extracted copy, so quotations, comments, URLs and code are already outside the span, and claims attributed to a reporting party are exempt through the same guard as `UE-DP001`.

## What stays silent

- Bare group mentions, for example `"The delegation met refugees and immigrants."`;
- reported claims, where attribution such as `"The envoy said that foreigners are vermin."` or `", the ambassador stated."` names who advances the claim;
- quoted copy and block quotations, because extraction masks those spans before any rule runs;
- pest, disease and animal wording with no human group in it, such as `"The inspection found rats in the store room."`;
- individual legal process and past-tense narrative, for example `"The court ordered the deportations after individual hearings."` and `"Attackers killed the refugees in the camp."`;
- a bare accusation without a quantifier, such as `"Foreigners are criminals."` — UE-HS002 requires the universal form or a trait predicate of the group.

## Extending and opting out

- `config.severities` re-grades a rule and `config.rules` switches one off, for example `{"UE-HS002": {"enabled": false}}`; both keys work in a profile too;
- `ue:ignore UE-HS001` suppresses one rule inside one copy span;
- the group vocabulary and the frame, accusation and verb lists live in `HS_KB`, so an extension applied there keeps the three rules symmetric by construction.

## Reporting

Findings carry `current`, the matched wording, and a suggestion that cites the knowledge-base source behind the finding; UE-HS002 says `heuristic, routed to review` on every finding. Nothing here is rewritten by `--fix`: no finding carries replacement or proposed wording. A match is wording for human review, not a legal finding of incitement.
