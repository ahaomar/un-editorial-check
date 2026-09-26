# Spelling rules

- **UE-SP001** *(error)* — Use British English in prose unless another standard is declared. The built-in map covers common variants; the fixer preserves case where practical.
- **UE-SP002** *(warning)* — Flag a passage that uses both variants of the same word. Consistency is the finding, not which variant won.
- **UE-SP003** *(info, opt-in)* — Report `-ize` forms that may require an `-ise` spelling under the named dictionary. Matching is case-insensitive (a sentence-initial `Optimize` is reviewed), and `size`/`prize` forms are not `-ise` candidates and are skipped. Off unless `spellingReview` is enabled in configuration, because Oxford spelling is legitimate and the UN framework does not settle every case.

Published titles inside `<cite>`, quoted Markdown, block quotes, code and inline code retain their published or technical spelling. Add project and product names to `allowlist.spellings`.

The UN authority is the Concise Oxford English Dictionary, 12th edition, first-listed form, used within the United Nations Editorial Manual framework.
