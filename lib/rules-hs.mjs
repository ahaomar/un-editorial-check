// Hate-speech family — UE-HS001, UE-HS002, UE-HS003 (category: hate-speech).
//
// Like every shipped rule, these match `unit.text`: the extracted copy span,
// from which quotations, comments, URLs and code are already absent. Three
// disciplines define the family:
//
//   * Composition over word lists: a dehumanising frame, an accusation or an
//     exclusion verb only fires when it is predicated of — or aimed at — a
//     listed group of people. The frame word alone never matches.
//   * Symmetry: one shared group vocabulary feeds all three rules, so swapping
//     which group is named cannot change whether a mirrored sentence fires.
//     The verify script sweeps every group term through every template.
//   * Attribution: `attributedClaim` (the UE-DP001 guard) exempts anything a
//     reporting party is quoted as saying, and UE-HS002 — a heuristic — routes
//     to review and never claims proof of intent.
//
// Findings are never fixable: no rule passes a `replacement`.
//
// Patterns are compiled lazily inside the rule functions (never at module
// top level), so the import cycle created at integration time cannot observe
// a half-initialised knowledge base.

import { emit, attributedClaim, escapeRe } from './rules.mjs';

/**
 * Knowledge base. Every entry carries a non-empty `source` citation and a
 * short `cite` used in finding suggestions. The sources establish the
 * standard the rules surface for human review; they do not prove that any
 * matched sentence meets the legal threshold of incitement, and no finding
 * here is a legal judgement.
 */
export const HS_KB = {
  groups: {
    source: 'United Nations Strategy and Plan of Action on Hate Speech (18 June 2019), working definition: '
      + '“any kind of communication in speech, writing or behaviour, that attacks or uses pejorative or '
      + 'discriminatory language with reference to a person or a group on the basis of who they are, in other '
      + 'words, based on their religion, ethnicity, nationality, race, colour, descent, gender or other '
      + 'identity factor.” https://www.un.org/en/hate-speech/understanding-hate-speech/what-is-hate-speech',
    cite: 'UN Strategy and Plan of Action on Hate Speech (un.org/en/hate-speech)',
    terms: [
      // Religions and belief.
      'muslims', 'christians', 'jews', 'hindus', 'sikhs', 'buddhists', 'atheists',
      // Ethnic and national groups.
      'roma', 'kurds', 'yazidis', 'uighurs', 'uyghurs', 'tibetans', 'palestinians',
      'arabs', 'syrians', 'iraqis', 'afghans', 'somalis', 'nigerians', 'pakistanis',
      'bangladeshis', 'ethiopians', 'eritreans', 'burmese',
      // Migration and legal status.
      'foreigners', 'immigrants', 'migrants', 'refugees', 'asylum seekers',
      // Racialised and other targeted groups.
      'black people', 'white people', 'indigenous peoples', 'gay people', 'trans people',
    ],
  },
  dehumanisingFrames: {
    source: 'United Nations, “Hate speech and real harm”: a campaign against the Rohingya Muslim minority '
      + 'was “loaded with derogatory and dehumanizing language”. '
      + 'https://www.un.org/en/hate-speech/understanding-hate-speech/hate-speech-and-real-harm',
    cite: 'UN, Hate speech and real harm (un.org/en/hate-speech)',
    frames: [
      'vermin', 'cockroaches', 'cockroach', 'rats', 'rat', 'lice', 'fleas', 'flea',
      'parasites', 'parasite', 'maggots', 'worms', 'insects', 'beasts', 'animals',
      'swine', 'pigs', 'disease', 'plague', 'cancer', 'virus', 'filth', 'garbage',
      'trash', 'subhuman',
    ],
  },
  collectiveBlame: {
    source: 'Rabat Plan of Action on the prohibition of advocacy of national, racial or religious hatred that '
      + 'constitutes incitement to discrimination, hostility or violence (United Nations document '
      + 'A/HRC/22/17/Add.4, 2013): the six-part threshold test weighs the context, the status of the speaker, '
      + 'the intent of the speaker, the content and form of the speech, the extent of the speech, and the '
      + 'likelihood of harm including imminence.',
    cite: 'Rabat Plan of Action, six-part threshold test (A/HRC/22/17/Add.4)',
    accusations: [
      'criminals', 'criminal', 'terrorists', 'terrorist', 'scum', 'killers',
      'murderers', 'rapists', 'thieves', 'extremists',
    ],
    traits: [
      'violent', 'dangerous', 'evil', 'savage', 'barbaric', 'cruel', 'vicious',
      'inferior',
    ],
    markers: ['inherently', 'naturally', 'genetically', 'instinctively', 'by nature'],
  },
  exclusionCalls: {
    source: 'International Covenant on Civil and Political Rights, article 20(2): “Any advocacy of national, '
      + 'racial or religious hatred that constitutes incitement to discrimination, hostility or violence shall '
      + 'be prohibited by law.” Office of the United Nations High Commissioner for Human Rights, International '
      + 'Covenant on Civil and Political Rights. '
      + 'https://www.ohchr.org/en/instruments-mechanisms/instruments/international-covenant-civil-and-political-rights',
    cite: 'ICCPR article 20(2) (OHCHR)',
    verbs: [
      'deport', 'ban', 'banish', 'expel', 'exile', 'eliminate', 'purge',
      'exterminate', 'kill', 'murder', 'slaughter', 'massacre', 'destroy',
      'ethnically cleanse', 'round up',
    ],
    modals: ['must', 'should', 'ought to', 'has to', 'have to'],
    outcomes: [
      'go', 'leave', 'depart', 'die', 'disappear', 'deported', 'banned',
      'expelled', 'exiled', 'eliminated', 'purged', 'removed', 'killed',
      'murdered', 'slaughtered', 'destroyed', 'exterminated', 'massacred',
    ],
  },
};

/** Rule metadata for the hate-speech set. Catalogue fields are asserted equal. */
export const HS_META = {
  'UE-HS001': { category: 'hate-speech', confidence: 'deterministic', severity: 'error' },
  'UE-HS002': { category: 'hate-speech', confidence: 'heuristic', severity: 'error' },
  'UE-HS003': { category: 'hate-speech', confidence: 'deterministic', severity: 'error' },
};

// Compiled lazily on the first rule call: escapeRe is a const binding in
// rules.mjs, and the integration import cycle must never observe a call made
// while either module is still evaluating.
let compiled = null;

function patterns() {
  if (compiled) return compiled;
  const alt = (terms) => terms.map((term) => escapeRe(term)).join('|');
  const group = `(?:the\\s+)?(?:${alt(HS_KB.groups.terms)})`;
  const frame = `(?:${alt(HS_KB.dehumanisingFrames.frames)})`;
  const accusation = `(?:${alt(HS_KB.collectiveBlame.accusations)})`;
  const trait = `(?:${alt(HS_KB.collectiveBlame.traits)})`;
  const marker = `(?:(?:${alt(HS_KB.collectiveBlame.markers)})\\s+)?`;
  const verb = `(?:${alt(HS_KB.exclusionCalls.verbs)})`;
  const modal = `(?:${alt(HS_KB.exclusionCalls.modals)})`;
  const outcome = `(?:${alt(HS_KB.exclusionCalls.outcomes)})`;
  const copula = '(?:is|are|was|were)';

  // Each pattern is one template literal: a `+`-concatenated string piece in
  // this file would be extracted as user-visible copy by extract-js, and the
  // self-scan gate must stay silent on this module's own source.
  compiled = {
    // A listed group of people copulated to a listed dehumanising frame,
    // optionally reached through an intensifier or a comparison ("are nothing
    // but vermin", "are like cockroaches").
    hs001: new RegExp(`\\b${group}\\s+${copula}\\s+(?:(?:a|an|the|just|like|such|essentially|basically|literally)\\s+|nothing (?:but|more than)\\s+)*${frame}\\b`, 'gi'),
    // Universal quantifier plus an accusation noun ("all foreigners are criminals").
    hs002Universal: new RegExp(`\\ball\\s+(?:of\\s+(?:the|those)\\s+)?${group}\\s+${copula}\\s+(?:nothing (?:but|more than)\\s+|just\\s+)?${accusation}\\b`, 'gi'),
    // A trait predicate of the group, with or without an inherent marker
    // ("Muslims are inherently violent", "Kurds are dangerous by nature").
    hs002Trait: new RegExp(`\\b${group}\\s+${copula}\\s+${marker}${trait}\\b(?:\\s+by\\s+nature)?`, 'gi'),
    // Base-form exclusion or violence verb aimed at the group. Base forms
    // only: a past-tense narrative ("attackers killed the refugees") is not a
    // call and never matches.
    hs003Verb: new RegExp(`\\b${verb}\\s+(?:all\\s+|every\\s+)?${group}\\b`, 'gi'),
    // Modal outcome construction ("Foreigners must go", "Refugees must be deported").
    hs003Modal: new RegExp(`\\b${group}\\s+${modal}\\s+(?:be\\s+)?${outcome}\\b`, 'gi'),
  };
  return compiled;
}

/** Report, never rewrite: no override carries a `replacement`. */
function ruleHS001(state, unit) {
  const re = patterns().hs001;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(unit.text))) {
    if (attributedClaim(unit.text, m.index, m[0].length)) continue;
    emit(state, unit, 'UE-HS001', m[0], m.index,
      `Dehumanising frame "${m[0]}" is predicated of a group of people.`,
      `Describe the group or its conduct without pest, disease or animal imagery (source: ${HS_KB.dehumanisingFrames.cite}).`);
  }
}

/** Collective blame and inherent-trait accusations: heuristic, routed to review. */
function ruleHS002(state, unit) {
  const text = unit.text;
  const { hs002Universal, hs002Trait } = patterns();

  hs002Universal.lastIndex = 0;
  let m;
  while ((m = hs002Universal.exec(text))) {
    // A negated universal ("not all foreigners are criminals") is a corrected
    // or hedged statement, not collective blame.
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (/\b(?:not|never)\s+$/i.test(before)) continue;
    if (attributedClaim(text, m.index, m[0].length)) continue;
    emit(state, unit, 'UE-HS002', m[0], m.index,
      `Collective framing "${m[0]}" targets a group of people; heuristic, routed to review.`,
      `State a sourced finding about specific conduct rather than a trait of the whole group (source: ${HS_KB.collectiveBlame.cite}).`);
  }

  hs002Trait.lastIndex = 0;
  while ((m = hs002Trait.exec(text))) {
    if (attributedClaim(text, m.index, m[0].length)) continue;
    emit(state, unit, 'UE-HS002', m[0], m.index,
      `Collective framing "${m[0]}" targets a group of people; heuristic, routed to review.`,
      `State a sourced finding about specific conduct rather than a trait of the whole group (source: ${HS_KB.collectiveBlame.cite}).`);
  }
}

/** Calls for exclusion or violence against a group, never against individuals. */
function ruleHS003(state, unit) {
  const text = unit.text;
  const { hs003Verb, hs003Modal } = patterns();
  for (const re of [hs003Verb, hs003Modal]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      if (attributedClaim(text, m.index, m[0].length)) continue;
      emit(state, unit, 'UE-HS003', m[0], m.index,
        `Call for exclusion or violence against a group of people: "${m[0]}".`,
        `Remove the blanket demand; due process is described for individuals, never as a demand about a group (source: ${HS_KB.exclusionCalls.cite}).`);
    }
  }
}

export const HS_RULES = {
  'UE-HS001': ruleHS001,
  'UE-HS002': ruleHS002,
  'UE-HS003': ruleHS003,
};
