// Editorial rules. Every rule here runs on TextUnit objects — already
// extracted, already classified user-visible prose — never on raw source
// lines. That boundary is what keeps CSS property names, comments, identifiers,
// modulo operators and version strings out of editorial findings.
//
// Two things are enforced for every finding:
//   * a precise position (located inside the unit's original source slice),
//   * an honest confidence label — deterministic rules prove the defect,
//     heuristic rules ask for human or agent judgement and never claim proof.

import { locate } from './position.mjs';
import { HS_RULES, HS_META } from './rules-hs.mjs';
import { TONE_RULES, TONE_META } from './rules-tone.mjs';
import { GRAMMAR_RULES, GRAMMAR_META } from './rules-grammar.mjs';

/** Rule metadata for the editorial set. Catalogue fields are asserted equal by tests. */
export const EDITORIAL_RULES = {
  'UE-SP001': { category: 'spelling', confidence: 'deterministic', severity: 'error' },
  'UE-SP002': { category: 'spelling', confidence: 'heuristic', severity: 'warning' },
  'UE-SP003': { category: 'spelling', confidence: 'heuristic', severity: 'info' },
  'UE-TE001': { category: 'terminology', confidence: 'deterministic', severity: 'error' },
  'UE-TE002': { category: 'terminology', confidence: 'deterministic', severity: 'error' },
  'UE-TE003': { category: 'terminology', confidence: 'deterministic', severity: 'error' },
  'UE-TE004': { category: 'terminology', confidence: 'deterministic', severity: 'error' },
  'UE-NU001': { category: 'numerals', confidence: 'deterministic', severity: 'warning' },
  'UE-NU002': { category: 'numerals', confidence: 'deterministic', severity: 'warning' },
  'UE-RE001': { category: 'register', confidence: 'heuristic', severity: 'warning' },
  'UE-RE002': { category: 'agent-review', confidence: 'heuristic', severity: 'warning' },
  'UE-RE003': { category: 'agent-review', confidence: 'heuristic', severity: 'warning' },
  'UE-RE004': { category: 'register', confidence: 'heuristic', severity: 'warning' },
  'UE-RE005': { category: 'register', confidence: 'deterministic', severity: 'error' },
  'UE-DI001': { category: 'agent-review', confidence: 'heuristic', severity: 'warning' },
  'UE-CL001': { category: 'agent-review', confidence: 'heuristic', severity: 'warning' },
  'UE-DP001': { category: 'diplomacy', confidence: 'deterministic', severity: 'error' },
  ...HS_META,
  ...TONE_META,
  ...GRAMMAR_META,
};

export const EDITORIAL_RULE_IDS = Object.keys(EDITORIAL_RULES);

const SCOPE = 'user-visible-copy';

export const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function matchCase(sample, replacement) {
  if (sample === sample.toUpperCase()) return replacement.toUpperCase();
  if (sample[0] === sample[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

export function wordRe(phrase, flags = 'g') {
  return new RegExp(`\\b${escapeRe(phrase)}\\b`, flags);
}

/** `ue:ignore UE-SP001,UE-TE003` / `<!-- ue:ignore all -->` inside a copy span. */
function suppression(unit) {
  const raw = [unit.raw, unit.suppress].filter(Boolean).join(' ');
  if (!/ue:ignore/.test(raw)) return null;
  const match = raw.match(/ue:ignore\s+([A-Za-z0-9*,\s-]+)/);
  if (!match) return { all: true, ids: new Set(), prefixes: [] };
  const specs = match[1].trim().split(/[,\s]+/).filter(Boolean);
  if (specs.some(s => s === 'all' || s === '*')) return { all: true, ids: new Set(), prefixes: [] };
  return {
    all: false,
    ids: new Set(specs),
    prefixes: specs.filter(s => s.endsWith('*')).map(s => s.slice(0, -1)),
  };
}

function isSuppressed(unit, ruleId) {
  const state = suppression(unit);
  if (!state) return false;
  if (state.all) return true;
  return state.ids.has(ruleId) || state.prefixes.some(prefix => ruleId.startsWith(prefix));
}

export function emit(ctx, unit, ruleId, matched, index, message, suggestion, override = {}) {
  if (isSuppressed(unit, ruleId)) return;
  const meta = ctx.meta[ruleId] || EDITORIAL_RULES[ruleId] || {};
  const severity = override.severity || ctx.cfg.severities[ruleId] || meta.severity || 'warning';
  const { line, column, offset } = locate(unit, matched, index);
  ctx.findings.push({
    file: unit.file,
    line,
    column,
    ruleId,
    category: meta.category || 'editorial',
    severity,
    confidence: override.confidence || meta.confidence || 'heuristic',
    scope: SCOPE,
    message,
    suggestion: suggestion || null,
    // What is currently written and what should replace it: the two halves of
    // the current-to-should-be report. `proposed` is guidance, not a fix —
    // only findings that also carry a `_replacement` are --fix-able.
    current: matched || null,
    proposed: override.proposed ?? override.replacement ?? null,
    _unit: unit,
    _index: index,
    _matched: matched,
    _offset: offset,
    _replacement: override.replacement ?? null,
  });
}

export function enabled(ctx, ruleId) {
  const setting = ctx.cfg.rules[ruleId];
  if (setting && setting.enabled === false) return false;
  return true;
}

// --- spelling ---------------------------------------------------------------

const WORD_TAIL = /[A-Za-zÀ-ÖØ-öø-ÿ][\w'’&.-]*/;
const SMALL_WORDS = new Set(['of', 'the', 'and', 'for', 'in', 'on', 'at', 'to', 'a', 'an', 'de', 'la', 'du', 'des', 'del', 'and/or']);

function isCapitalised(word) {
  return Boolean(word) && word[0] !== word[0].toLowerCase() && word[0] === word[0].toUpperCase();
}

/**
 * True when a capitalised match sits inside a multi-word proper name:
 * "World Health Organization", "Organization of African Unity". Official
 * names keep their published spelling, so they are never rewritten — the
 * organisation's own name is exactly the case a UN editor must not touch.
 */
function inProperName(text, index, length) {
  const matched = text.slice(index, index + length);
  if (!isCapitalised(matched)) return false;
  const prev = text.slice(0, index).match(new RegExp(`(${WORD_TAIL.source})\\s*$`));
  if (prev && isCapitalised(prev[1])) return true;
  const after = text.slice(index + length);
  const words = after.match(new RegExp(`^\\s*(${WORD_TAIL.source})(?:\\s+(${WORD_TAIL.source}))?`));
  if (!words) return false;
  const first = words[1];
  if (isCapitalised(first)) return true;
  if (SMALL_WORDS.has(first.toLowerCase()) && words[2] && isCapitalised(words[2])) return true;
  return false;
}

function ruleSP001(ctx, unit) {
  const allow = new Set(ctx.cfg.allowlist.spellings || []);
  for (const [american, british] of ctx.vocab.spellings) {
    if (allow.has(american) || allow.has(british)) continue;
    const re = wordRe(american, 'gi');
    let m;
    while ((m = re.exec(unit.text))) {
      if (inProperName(unit.text, m.index, m[0].length)) continue;
      const replacement = matchCase(m[0], british);
      emit(ctx, unit, 'UE-SP001', m[0], m.index,
        `American spelling "${m[0]}" in prose.`,
        `Use "${replacement}".`,
        { replacement });
    }
  }
}

function ruleSP002(ctx, unit) {
  const allow = new Set(ctx.cfg.allowlist.spellings || []);
  for (const [american, british] of ctx.vocab.spellings) {
    if (allow.has(american) || allow.has(british)) continue;
    const us = wordRe(american, 'gi').exec(unit.text);
    if (!us) continue;
    if (inProperName(unit.text, us.index, us[0].length)) continue;
    const gb = wordRe(british, 'gi').exec(unit.text);
    if (!gb) continue;
    emit(ctx, unit, 'UE-SP002', us[0], us.index,
      `British "${gb[0]}" and American "${us[0]}" variants appear in the same passage.`,
      'Choose one register and use it consistently.');
  }
}

// -ise candidates only: size, prize and their forms end in -ize but are not
// spelling variants, so they are skipped. The review is case-insensitive so a
// sentence-initial "Organize" is reviewed like any other occurrence.
const IZE_RE = /\b(?!(?:size|sizes|sized|sizing|prize|prizes|prized)\b)[a-z]+(?:ize|izes|izing|ized)\b|\b(?:defense|offense|license|licenses|licensed)\b/gi;
function ruleSP003(ctx, unit) {
  if (!ctx.cfg.spellingReview) return;
  let m;
  while ((m = IZE_RE.exec(unit.text))) {
    emit(ctx, unit, 'UE-SP003', m[0], m.index,
      `"${m[0]}" may prefer an "-ise" form; some "-ize" spellings are standard (Oxford).`,
      'Confirm against the dictionary named in the organisation profile.');
  }
}

// --- terminology ------------------------------------------------------------

const DEFINING_RE = /\b(?:ratio|per\s*100,?000|is\s+defined\s+as|defined\s+as|defined\s+here\s+as|means|refers\s+to|namely)\b/i;

function ruleTerminology(ctx, unit) {
  const allow = new Set(ctx.cfg.allowlist.terminology || []);
  for (const entry of ctx.vocab.terminology) {
    if (allow.has(entry.from)) continue;
    const re = wordRe(entry.from, 'gi');
    let m;
    while ((m = re.exec(unit.text))) {
      const ruleId = entry.rule;
      if (!enabled(ctx, ruleId)) continue;
      const before = unit.text.slice(Math.max(0, m.index - 80), m.index);
      const after = unit.text.slice(m.index, m.index + 120);
      const defining = DEFINING_RE.test(before) || DEFINING_RE.test(after);
      if (ruleId === 'UE-TE001' && defining) {
        emit(ctx, unit, ruleId, m[0], m.index,
          `"${m[0]}" appears in a definition context.`,
          `State the indicator explicitly: "${entry.to}".`,
          { severity: 'warning', confidence: 'heuristic', proposed: entry.to });
        continue;
      }
      emit(ctx, unit, ruleId, m[0], m.index,
        `Unapproved terminology "${m[0]}".`,
        `Use "${entry.to}".`,
        { proposed: entry.to });
    }
  }
}

function ruleTE003(ctx, unit) {
  if (unit.compact) return; // tables, charts, legends, tooltips, tiles, titles, meta
  const re = /(\d[\d,]*(?:\.\d+)?\s*)?%(?!\w)/g;
  let m;
  while ((m = re.exec(unit.text))) {
    const digits = m[1] ? m[1].trim() : null;
    emit(ctx, unit, 'UE-TE003', m[0], m.index,
      digits ? `Use "per cent" rather than "${digits}%".` : 'Use "per cent" rather than the "%" symbol in running prose.',
      digits ? `Write "${digits} per cent".` : 'Write "per cent".',
      { replacement: digits ? `${digits} per cent` : 'per cent' });
  }
}

function ruleTE004(ctx, unit) {
  // The guard notes promise three exemptions and the regex now honours them:
  // a period or dollar sign (US., US$), currency amounts (US dollars, US
  // cents), and the U.S.A. acronym — which is not the bare "US" this rule
  // targets.
  const re = /(?:\bUS\b(?![.$])(?!\s+(?:dollars?|cents?)\b)|U\.S\.(?![A-Za-z]))/g;
  let m;
  while ((m = re.exec(unit.text))) {
    const before = unit.text.slice(Math.max(0, m.index - 4), m.index);
    const suggestion = /\bthe\s+$/i.test(before) ? 'United States' : 'the United States';
    emit(ctx, unit, 'UE-TE004', m[0], m.index,
      `Bare "${m[0]}" in prose.`,
      `Write "${suggestion}".`,
      { replacement: suggestion });
  }
}

// --- numerals --------------------------------------------------------------

function ruleNU001(ctx, unit) {
  // Both components may be 1-31 so that day/m/y and m/d/y shapes are caught
  // (12/31/2026 is a US m/d/y date that the day-first-only form missed even
  // though the rules document promises both). URLs and code are masked before
  // rules run, so a slash pair plus a four-digit year is unambiguous here.
  const re = /\b(?:0?[1-9]|[12]\d|3[01])\s*\/\s*(?:0?[1-9]|[12]\d|3[01])\s*\/\s*\d{4}\b/g;
  let m;
  while ((m = re.exec(unit.text))) {
    emit(ctx, unit, 'UE-NU001', m[0], m.index,
      `Numeric date "${m[0]}" does not use the UN day-month-year form.`,
      'Write the date as day month year with the month spelled out, for example 9 November 2026.');
  }
}

function ruleNU002(ctx, unit) {
  if (unit.compact) return;
  const re = /(?<![\d-])\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\b(?![\d-])/g;
  let m;
  while ((m = re.exec(unit.text))) {
    const replacement = m[0].replace(/\s*-\s*/, '–');
    emit(ctx, unit, 'UE-NU002', m[0], m.index,
      `Numeric range "${m[0]}" uses a hyphen.`,
      `Use an en dash: "${replacement}".`,
      { replacement });
  }
}

// --- register and tone -----------------------------------------------------

function ruleRE001(ctx, unit) {
  const allow = new Set([
    ...(ctx.cfg.allowlist.register || []),
    ...(ctx.vocab.registerExempt || []),
  ]);
  for (const phrase of ctx.vocab.register) {
    if (allow.has(phrase)) continue;
    const re = wordRe(phrase, 'gi');
    const m = re.exec(unit.text);
    if (!m) continue;
    emit(ctx, unit, 'UE-RE001', m[0], m.index,
      `Register term "${m[0]}" is promotional rather than neutral.`,
      'Replace with neutral, literal wording.');
  }
}

const SUPERLATIVE_RE = /\b(best|worst|largest|smallest|highest|lowest|greatest|leading|fastest|slowest|unrivalled|unmatched|record[- ]breaking|number one|#1|most (?:successful|powerful|important))\b/gi;

function ruleRE002(ctx, unit) {
  let m;
  while ((m = SUPERLATIVE_RE.exec(unit.text))) {
    emit(ctx, unit, 'UE-RE002', m[0], m.index,
      `Superlative or ranking claim "${m[0]}" — the CLI cannot prove it is derived from the data shown.`,
      'Confirm the claim against the presented data or add a source, or use neutral wording.');
  }
}

const FIGURE_RE = /\b\d[\d,]*(?:\.\d+)?\s*(?:per cent|million|billion|trillion|thousand)\b|\b\d[\d,]*(?:\.\d+)?\s*%(?!\w)|\b\d{1,3}(?:,\d{3})+\b/g;
const HEDGE_RE = /\b(?:approximately|about|at least|an estimated|a reported|according to|estimated|reported|as of|based on|figures from|data from|source:|sources:)\b/i;
// The unit that makes a number a prose figure. `%` cannot be wrapped in \b:
// a word boundary never follows a percent sign, so "8%" used to match nothing
// and the rule silently skipped the commonest UN figure of all.
const FIGURE_WORD_RE = /\b(?:per cent|million|billion|trillion|thousand)\b|%/;

function ruleRE003(ctx, unit) {
  if (unit.compact) return;
  const clauses = unit.text.split(/(?<=[.!?;])\s+/);
  let cursor = 0;
  for (const clause of clauses) {
    const at = unit.text.indexOf(clause, cursor);
    cursor = at < 0 ? cursor : at + clause.length;
    if (HEDGE_RE.test(clause)) continue;
    FIGURE_RE.lastIndex = 0;
    const figure = FIGURE_RE.exec(clause);
    if (!figure) continue;
    // A bare thousands separator without a unit word is not a prose figure.
    if (!FIGURE_WORD_RE.test(figure[0])) continue;
    const index = (at < 0 ? 0 : at) + figure.index;
    emit(ctx, unit, 'UE-RE003', figure[0], index,
      `Figure "${figure[0]}" appears without a hedge or a source in the same sentence.`,
      'Add a hedge such as "approximately" and identify the source and reference date.');
  }
}

const QUESTION_START_RE = /^\s*(?:why|how|what|when|where|who|which|isn'?t|aren'?t|don'?t|doesn'?t|didn'?t|can'?t|won'?t|shouldn'?t|is|are|was|were|do|does|did|can|could|will|would|shall|should|may|might|have|has|had|ready|looking|wondering|imagine|did you|have you|do you|could you|would you|will you|can you)\b/i;

function ruleRE004(ctx, unit) {
  const sentences = unit.text.split(/(?<=[.!?])\s+/);
  let cursor = 0;
  for (const sentence of sentences) {
    const at = unit.text.indexOf(sentence, cursor);
    cursor = at < 0 ? cursor : at + sentence.length;
    if (!/\?\s*$/.test(sentence)) continue;
    if (!QUESTION_START_RE.test(sentence)) continue;
    const index = (at < 0 ? 0 : at) + sentence.search(/\S/);
    emit(ctx, unit, 'UE-RE004', sentence.trim().slice(0, 40), index,
      'Question phrased for effect — UN copy states findings directly.',
      'Rewrite as a declarative statement unless the question is genuinely soliciting information.');
  }
}

function ruleRE005(ctx, unit) {
  const re = /(?<![=!<>])!+(?=\s|$|[.,;:?])/g;
  let m;
  while ((m = re.exec(unit.text))) {
    emit(ctx, unit, 'UE-RE005', m[0], m.index,
      'Exclamation mark in formal copy.',
      'Remove the exclamation mark and state the point in a measured tone.');
  }
}

const COUNT_RE = /\b\d[\d,]*(?:\.\d+)?\s+(?:countries|states|members|reports|projects|offices|centres|centers|people|users|datasets|publications|indicators|sites|locations)\b/g;
const QUALIFIER_RE = /\b(?:member|reporting|with a value|drawable|on the map|at the time of writing|covered|as of|in total|total|estimated|around|about|more than|at least|up to|over|nearly|approximately|roughly)\b/i;

function ruleDI001(ctx, unit) {
  // The qualifier must sit in the count's own sentence: a hedge in the next
  // sentence must not cover an unqualified figure. Sentence bounds are found
  // once, then each count is tested against the sentence containing it.
  const sentences = [];
  let start = 0;
  const ends = /[.!?]+(?=\s|$)/g;
  let bound;
  while ((bound = ends.exec(unit.text))) {
    sentences.push([start, bound.index + bound[0].length]);
    start = bound.index + bound[0].length;
  }
  sentences.push([start, unit.text.length]);
  let m;
  while ((m = COUNT_RE.exec(unit.text))) {
    const sentence = sentences.find(([from, to]) => m.index >= from && m.index < to);
    if (!sentence || QUALIFIER_RE.test(unit.text.slice(sentence[0], sentence[1]))) continue;
    emit(ctx, unit, 'UE-DI001', m[0], m.index,
      `Count "${m[0]}" does not state what was counted or whether it is reported, estimated or total.`,
      'Label the figure, for example "reported" or "estimated", and say what was counted.');
  }
}

const YEAR_RE = /\b(?:19|20)\d{2}\b/g;
const COMPARISON_RE = /\b(?:compared to|compared with|versus|vs\.?|relative to|up from|down from|higher than|lower than|greater than|less than|more than|fewer than|increase(?:d)? from|decrease(?:d)? from|rose from|fell from|grew from|dropped from|exceeded|exceeds|outpaced|outpaces|outstripped|ahead of|year[- ]on[- ]year)\b/i;

function ruleCL001(ctx, unit) {
  const years = new Set(unit.text.match(YEAR_RE) || []);
  if (years.size < 2) return;
  const m = COMPARISON_RE.exec(unit.text);
  if (!m) return;
  emit(ctx, unit, 'UE-CL001', m[0], m.index,
    `Comparison references ${years.size} different years (${[...years].sort().join(', ')}).`,
    'Confirm the periods being compared are aligned and state them explicitly.');
}

// --- contested claims ---------------------------------------------------------

/**
 * Attribution turns a bare assertion into a report of a party's position:
 * "Pakistan claims that Kashmir is part of Pakistan" names who advances the
 * claim, which is exactly what the rule asks copy to do. The window is the
 * current sentence — text after the last [.!?;] before the match — because a
 * reporting verb several sentences earlier attributes nothing here. The guard
 * runs before any emission: for an error rule, a suppressed false positive is
 * preferable to a false claim of defect, so joined trailing attribution
 * ("…, the minister said") is recognised as well as leading attribution.
 */
const ATTRIBUTION_RE = /\b(?:says?|said|stating|stated|claims?|claimed|claiming|maintains?|maintained|argues?|argued|contends?|contended|alleges?|alleged|asserts?|asserted|insists?|insisted|noted|according\s+to|denies|denied|rejects?|rejected|wrote|written|writes|reiterates?|reiterated|emphasizes?|emphasises?|stresses|stressed)\b/i;

export function attributedClaim(text, index, length) {
  const before = text.slice(0, index);
  const sentenceStart = Math.max(
    before.lastIndexOf('.'), before.lastIndexOf('!'),
    before.lastIndexOf('?'), before.lastIndexOf(';'));
  if (ATTRIBUTION_RE.test(before.slice(sentenceStart + 1))) return true;
  const after = text.slice(index + length);
  const end = after.search(/[.!?]/);
  const tail = end < 0 ? after : after.slice(0, end);
  return /^\s*[,;:–—-]/.test(tail) && ATTRIBUTION_RE.test(tail);
}

function ruleDP001(ctx, unit) {
  for (const claim of ctx.vocab.claims) {
    for (const re of claim.patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(unit.text))) {
        if (attributedClaim(unit.text, m.index, m[0].length)) continue;
        emit(ctx, unit, 'UE-DP001', m[0], m.index,
          `Contested status claim "${m[0]}" about ${claim.topic} stated as fact.`,
          `Attribute the claim to the party advancing it or use neutral wording: "${claim.neutral}" `
          + `(UN terminology: "${claim.unTerminology}"; source: ${claim.source}).`,
          { proposed: claim.neutral });
      }
    }
  }
}

const RULE_BY_ID = {
  'UE-SP001': ruleSP001,
  'UE-SP002': ruleSP002,
  'UE-SP003': ruleSP003,
  'UE-TE003': ruleTE003,
  'UE-TE004': ruleTE004,
  'UE-NU001': ruleNU001,
  'UE-NU002': ruleNU002,
  'UE-RE001': ruleRE001,
  'UE-RE002': ruleRE002,
  'UE-RE003': ruleRE003,
  'UE-RE004': ruleRE004,
  'UE-RE005': ruleRE005,
  'UE-DI001': ruleDI001,
  'UE-CL001': ruleCL001,
  'UE-DP001': ruleDP001,
  ...HS_RULES,
  ...TONE_RULES,
  ...GRAMMAR_RULES,
};

/**
 * @param {Array} units  extracted copy spans (any file)
 * @param {object} ctx   { meta, cfg, vocab } — see lib/config.mjs
 * @param {object} extraRules  test-only rule registry merged over RULE_BY_ID
 *                             (used by lib/testkit.mjs during rule development;
 *                             production callers pass nothing).
 */
export function runEditorialRules(units, ctx, extraRules = {}) {
  const state = { findings: [], meta: ctx.meta, cfg: ctx.cfg, vocab: ctx.vocab };
  const registry = { ...RULE_BY_ID, ...extraRules };
  const extraIds = Object.keys(extraRules).filter((id) => !EDITORIAL_RULES[id]);
  const ruleIds = extraIds.length ? [...EDITORIAL_RULE_IDS, ...extraIds] : EDITORIAL_RULE_IDS;

  for (const unit of units) {
    const unitSuppression = suppression(unit);
    if (unitSuppression && unitSuppression.all) continue;
    for (const ruleId of ruleIds) {
      if (!enabled(state, ruleId)) continue;
      if (ruleId === 'UE-TE001' || ruleId === 'UE-TE002') continue; // handled together below
      const run = registry[ruleId];
      if (run) run(state, unit);
    }
    if (enabled(state, 'UE-TE001') || enabled(state, 'UE-TE002')) ruleTerminology(state, unit);
  }

  const seen = new Set();
  const findings = [];
  for (const finding of state.findings) {
    const key = `${finding.file}:${finding.line}:${finding.column}:${finding.ruleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(finding);
  }
  findings.sort((a, b) =>
    a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column ||
    a.ruleId.localeCompare(b.ruleId));
  return findings;
}
