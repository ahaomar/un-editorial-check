// Grammar rules — UE-GR001..UE-GR003, a deliberately high-precision subset.
//
// Subject-verb agreement, verb forms and tense are out of scope: choosing
// between them needs judgement a deterministic matcher cannot make without
// false positives. What is left is mechanical and provable: a doubled word,
// a space between a word and its punctuation, a full stop running straight
// into the next sentence.
//
// Two boundaries keep every finding honest:
//   * rules match `unit.text` — the extracted copy span, with URLs, quotes,
//     code, comments and markup already absent, never the raw source;
//   * `verbatim()` then re-checks each match against the unit's own source
//     slice at the mapped offset, so a space produced only by masking or by
//     joining hard-wrapped lines can never become a finding or a fix. When
//     that check cannot run (no offset map), nothing is reported — a rule
//     that cannot prove the defect stays silent.

import { emit, matchCase } from './rules.mjs';

/**
 * True when `matched` sits verbatim in the unit's source slice at the offset
 * the unit's map points to. Masked regions (URLs, quotations, code) and the
 * spaces that join hard-wrapped lines all collapse to a single space in the
 * cleaned text; without this check they would look exactly like a doubled
 * word or a "word ," defect. A rejected match is never reported, so every
 * reported replacement applies byte for byte — which is also why the guard
 * requires `index` to be an index into `unit.text` (the string `locate()`
 * and the fixer map through).
 */
function verbatim(unit, index, matched) {
  if (!unit.map || !unit.raw || !matched) return false;
  if (index < 0 || index >= unit.map.length) return false;
  const at = unit.map[index] - unit.offset;
  return at >= 0 && at + matched.length <= unit.raw.length
    && unit.raw.startsWith(matched, at);
}

// --- UE-GR001: unintentionally doubled word ---------------------------------

// The legitimate English doubles. Comparison is case-insensitive, so
// "Had had" is exempt exactly like "had had". Every entry is proved by the
// negative fixture tests/fixtures/negative/gr-doubles-ok.txt; repetition
// outside this list is still reported (see the guard notes).
const ALLOWED_DOUBLES = new Set(['had had', 'that that', 'very very']);

const DOUBLED_WORD_RE = /([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9'’]*) ([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9'’]*)/g;

function ruleGR001(state, unit) {
  const text = unit.text;
  DOUBLED_WORD_RE.lastIndex = 0;
  let m;
  while ((m = DOUBLED_WORD_RE.exec(text))) {
    const first = m[1];
    // Advance past the first word only: in "x x x" the second pair must
    // still be reachable from the position after the first word.
    DOUBLED_WORD_RE.lastIndex = m.index + first.length;
    if (first.toLowerCase() !== m[2].toLowerCase()) continue;
    if (ALLOWED_DOUBLES.has(`${first} ${m[2]}`.toLowerCase())) continue;
    const matched = m[0];
    if (!verbatim(unit, m.index, matched)) continue;
    const replacement = matchCase(matched, first);
    emit(state, unit, 'UE-GR001', matched, m.index,
      `The word "${first}" appears twice in a row in "${matched}".`,
      `Delete one copy: write "${replacement}".`,
      { replacement, proposed: replacement });
  }
}

// --- UE-GR002: space between a word and following punctuation ---------------
//
// Covered set: exactly , . ; : ? ! with exactly one space before it. The
// space is the defect; the presence of the mark is never reported here —
// an exclamation mark on its own is UE-RE005's territory.

const SPACE_BEFORE_PUNCT_RE = /([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9'’&.-]*) ([,.;:?!])/g;

function ruleGR002(state, unit) {
  const text = unit.text;
  SPACE_BEFORE_PUNCT_RE.lastIndex = 0;
  let m;
  while ((m = SPACE_BEFORE_PUNCT_RE.exec(text))) {
    // A space before an ellipsis ("word ...") is a style choice, not the
    // stray-space defect: leave it to the ue:ignore escape hatch.
    if (m[2] === '.' && text[m.index + m[0].length] === '.') continue;
    const matched = m[0];
    if (!verbatim(unit, m.index, matched)) continue;
    const replacement = m[1] + m[2];
    emit(state, unit, 'UE-GR002', matched, m.index,
      `A space sits between "${m[1]}" and "${m[2]}".`,
      `Pull the punctuation onto the word: write "${replacement}".`,
      { replacement, proposed: replacement });
  }
}

// --- UE-GR003: missing space between sentences ------------------------------
//
// The period must run straight into a capital — "final.Next" — with no space
// at all. Everything in here exists to keep dotted conventions out:
//
//   * preceded by "." or "…"  → ellipsis ("...Next", "…Next");
//   * preceded by a digit     → decimals, version numbers, outline items;
//   * a standalone letter before the period → initials and dotted chains
//     ("U.S.A.", "J.P.", "e.g.", "i.e.");
//   * text ending in a listed abbreviation (word-boundary guarded, so
//     "the best.Next" is still reported while "St.Louis" is not).
//
// A period followed by a lowercase letter — index.js, v1.2's second dot,
// www.example.test — never enters the pattern at all.

const ABBREVIATIONS_END_RE =
  /(?:^|[^A-Za-z])(?:U\.S\.|U\.K\.|U\.N\.|e\.g\.|i\.e\.|etc\.|Dr\.|Mr\.|Mrs\.|Prof\.|vs\.|a\.m\.|p\.m\.|St\.)$/i;
const SENTENCE_JOIN_RE = /\.(?=[A-Z])/g;

function ruleGR003(state, unit) {
  const text = unit.text;
  SENTENCE_JOIN_RE.lastIndex = 0;
  let m;
  while ((m = SENTENCE_JOIN_RE.exec(text))) {
    const at = m.index; // position of the period
    const prev = at > 0 ? text[at - 1] : '';
    if (!prev) continue;                       // period opens the copy span
    if (prev === '.' || prev === '…') continue; // ellipsis
    if (prev >= '0' && prev <= '9') continue;   // decimal, version, numbering
    if (/[A-Za-z]/.test(prev)) {
      const before = at >= 2 ? text[at - 2] : '';
      // A standalone letter before the period is an initial or an initial
      // chain; those take no space after the period by convention.
      if (at < 2 || !/[A-Za-z0-9]/.test(before)) continue;
      if (ABBREVIATIONS_END_RE.test(text.slice(0, at + 1))) continue;
    }
    const word = text.slice(at + 1).match(/^[A-Za-z][A-Za-z0-9'’-]*/);
    if (!word) continue;
    const matched = `.${word[0]}`;
    if (!verbatim(unit, at, matched)) continue;
    const replacement = `. ${word[0]}`;
    emit(state, unit, 'UE-GR003', matched, at,
      `The full stop in "${matched}" runs straight into the next word.`,
      `Insert a space after the full stop: write "${replacement}".`,
      { replacement, proposed: replacement });
  }
}

export const GRAMMAR_RULES = {
  'UE-GR001': ruleGR001,
  'UE-GR002': ruleGR002,
  'UE-GR003': ruleGR003,
};

export const GRAMMAR_META = {
  'UE-GR001': { category: 'grammar', confidence: 'deterministic', severity: 'warning' },
  'UE-GR002': { category: 'grammar', confidence: 'deterministic', severity: 'warning' },
  'UE-GR003': { category: 'grammar', confidence: 'deterministic', severity: 'warning' },
};
