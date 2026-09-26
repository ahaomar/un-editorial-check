// Organisation profiles and audit profiles.
//
// Two different file schemas share the --profile flag and are discriminated by
// their version field, never by filename:
//
//   profileVersion: 1  organisation profile — spelling, terminology, register,
//                      severities, rule switches. Merged over the bundled
//                      United Nations baseline (config/profiles/un-v1.json).
//   auditVersion: 1    audit profile — names the non-editorial checks that run
//                      only when explicitly requested (--profile security).
//
// Validation is strict and fail-closed: a malformed file aborts with exit code
// 2 instead of silently checking with a reduced rule set. Nothing here mutates
// module state; every applyProfile call returns a new object.

export class ProfileError extends Error {}

const SEVERITIES = new Set(['error', 'warning', 'info']);
const PROFILE_FIELDS = new Set([
  'profileVersion', 'name', 'source', 'description', 'spelling', 'terminology',
  'register', 'severities', 'rules', 'pageUrl',
]);
const AUDIT_FIELDS = new Set(['auditVersion', 'name', 'category', 'description', 'rules']);
const REGISTER_FIELDS = new Set(['forbidden', 'approved']);
const KNOWN_AUDITS = new Set(['publishing', 'accessibility', 'security']);

/** JSON.parse that rejects duplicate object keys (a classic config bypass). */
export function parseJsonStrict(text, label) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ProfileError(`${label} is not valid JSON: ${err.message}`);
  }
  const duplicates = [];
  const scan = (node) => {
    if (Array.isArray(node)) { node.forEach(scan); return; }
    if (node && typeof node === 'object') {
      const seen = new Set();
      for (const [key, value] of Object.entries(node)) {
        if (seen.has(key)) duplicates.push(key);
        seen.add(key);
        scan(value);
      }
    }
  };
  scan(parsed);
  if (duplicates.length) {
    throw new ProfileError(`${label} contains duplicate keys: ${[...new Set(duplicates)].join(', ')}`);
  }
  return parsed;
}

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

function checkKnownFields(obj, allowed, label, extras = []) {
  const unknown = Object.keys(obj).filter(key => !allowed.has(key) && !extras.includes(key));
  if (unknown.length) {
    throw new ProfileError(`${label} contains unknown fields: ${unknown.join(', ')}`);
  }
}

function validateSeverities(severities, knownIds, label) {
  if (!isPlainObject(severities)) throw new ProfileError(`${label} severities must be an object`);
  for (const [id, severity] of Object.entries(severities)) {
    if (!knownIds.includes(id)) throw new ProfileError(`${label} severities contains unknown rule "${id}"`);
    if (!SEVERITIES.has(severity)) throw new ProfileError(`${label} severity for ${id} must be error, warning or info`);
  }
}

function validateRuleSettings(rules, knownIds, label) {
  if (!isPlainObject(rules)) throw new ProfileError(`${label} rules must be an object`);
  for (const [id, setting] of Object.entries(rules)) {
    if (!knownIds.includes(id)) throw new ProfileError(`${label} rules contains unknown rule "${id}"`);
    if (!isPlainObject(setting)) throw new ProfileError(`${label} rules.${id} must be an object`);
    const keys = Object.keys(setting);
    if (!keys.length) throw new ProfileError(`${label} rules.${id} must set enabled or severity`);
    for (const key of keys) {
      if (key !== 'enabled' && key !== 'severity') {
        throw new ProfileError(`${label} rules.${id} contains unknown field "${key}"`);
      }
    }
    if ('enabled' in setting && typeof setting.enabled !== 'boolean') {
      throw new ProfileError(`${label} rules.${id}.enabled must be a boolean`);
    }
    if ('severity' in setting && !SEVERITIES.has(setting.severity)) {
      throw new ProfileError(`${label} rules.${id}.severity must be error, warning or info`);
    }
  }
}

export function normaliseTerminologyEntry(entry) {
  if (Array.isArray(entry)) {
    if (entry.length !== 2) throw new ProfileError('a terminology pair must contain exactly [from, to]');
    const [from, to] = entry;
    if (!nonEmpty(from) || !nonEmpty(to)) throw new ProfileError('terminology pairs must be non-empty strings');
    if (from === to) throw new ProfileError(`terminology pair "${from}" cannot map a term to itself`);
    return { rule: 'UE-TE001', from, to };
  }
  if (isPlainObject(entry)) {
    const unknown = Object.keys(entry).filter(key => !['rule', 'from', 'to'].includes(key));
    if (unknown.length) throw new ProfileError(`terminology entry contains unknown fields: ${unknown.join(', ')}`);
    if (entry.rule !== 'UE-TE001' && entry.rule !== 'UE-TE002') {
      throw new ProfileError('terminology entry rule must be UE-TE001 or UE-TE002');
    }
    if (!nonEmpty(entry.from) || !nonEmpty(entry.to)) throw new ProfileError('terminology entries must be non-empty strings');
    if (entry.from === entry.to) throw new ProfileError(`terminology pair "${entry.from}" cannot map a term to itself`);
    return { rule: entry.rule, from: entry.from, to: entry.to };
  }
  throw new ProfileError('terminology entries must be [from, to] arrays or {rule, from, to} objects');
}

function validateStringList(list, label) {
  if (!Array.isArray(list)) throw new ProfileError(`${label} must be an array`);
  const seen = new Set();
  for (const item of list) {
    if (!nonEmpty(item)) throw new ProfileError(`${label} must contain only non-empty strings`);
    if (seen.has(item)) throw new ProfileError(`${label} contains a duplicate entry "${item}"`);
    seen.add(item);
  }
}

/**
 * Validate an organisation profile.
 * @param {object} profile   already parsed
 * @param {object} options
 * @param {object|null} options.baseline  baseline profile; when present, spelling
 *   keys must already exist in it so that a typo cannot silently disable a rule
 * @param {string[]} options.knownIds     catalogue rule ids
 */
export function validateProfile(profile, { baseline = null, knownIds = [], label = 'profile' } = {}) {
  if (!isPlainObject(profile)) throw new ProfileError(`${label} must be an object`);
  checkKnownFields(profile, PROFILE_FIELDS, label);

  if (profile.profileVersion !== 1) throw new ProfileError(`${label} profileVersion must be 1`);
  if (!nonEmpty(profile.name)) throw new ProfileError(`${label} name must be a non-empty string`);
  if (!nonEmpty(profile.source)) throw new ProfileError(`${label} source must be a non-empty string`);
  if ('description' in profile && !nonEmpty(profile.description)) throw new ProfileError(`${label} description must be a non-empty string`);

  if ('pageUrl' in profile) {
    let url;
    try { url = new URL(profile.pageUrl); } catch { throw new ProfileError(`${label} pageUrl must be an absolute URL`); }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ProfileError(`${label} pageUrl must be an absolute http(s) URL`);
  }

  const baselineKeys = baseline && isPlainObject(baseline.spelling) ? new Set(Object.keys(baseline.spelling)) : null;

  if ('spelling' in profile) {
    if (!isPlainObject(profile.spelling)) throw new ProfileError(`${label} spelling must be an object`);
    for (const [from, to] of Object.entries(profile.spelling)) {
      if (!/^[a-z][a-z-]*$/.test(from)) throw new ProfileError(`${label} spelling key "${from}" must be a lowercase word`);
      if (!nonEmpty(to)) throw new ProfileError(`${label} spelling.${from} must be a non-empty string`);
      if (from === to) throw new ProfileError(`${label} spelling.${from} maps a word to itself`);
      if (baselineKeys && !baselineKeys.has(from)) {
        throw new ProfileError(`${label} spelling key "${from}" is not in the baseline vocabulary`);
      }
    }
  }

  if ('terminology' in profile) {
    const terminology = profile.terminology;
    if (!isPlainObject(terminology)) throw new ProfileError(`${label} terminology must be an object`);
    checkKnownFields(terminology, new Set(['forbidden']), `${label} terminology`);
    if ('forbidden' in terminology) {
      if (!Array.isArray(terminology.forbidden)) throw new ProfileError(`${label} terminology.forbidden must be an array`);
      const seen = new Set();
      const normalised = [];
      for (const entry of terminology.forbidden) {
        const item = normaliseTerminologyEntry(entry);
        if (seen.has(item.from)) throw new ProfileError(`${label} terminology contains duplicate term "${item.from}"`);
        seen.add(item.from);
        normalised.push(item);
      }
      terminology.forbidden = normalised;
    }
  }

  if ('register' in profile) {
    const register = profile.register;
    if (!isPlainObject(register)) throw new ProfileError(`${label} register must be an object`);
    checkKnownFields(register, REGISTER_FIELDS, `${label} register`);
    const forbidden = register.forbidden || [];
    const approved = register.approved || [];
    if ('forbidden' in register) validateStringList(forbidden, `${label} register.forbidden`);
    if ('approved' in register) validateStringList(approved, `${label} register.approved`);
    const overlap = forbidden.filter(item => approved.includes(item));
    if (overlap.length) throw new ProfileError(`${label} register lists ${overlap[0]} as both forbidden and approved`);
  }

  if ('severities' in profile) validateSeverities(profile.severities, knownIds, label);
  if ('rules' in profile) validateRuleSettings(profile.rules, knownIds, label);

  return profile;
}

/** Validate a named audit profile (publishing | accessibility | security). */
export function validateAuditProfile(value, { expectedName = null, meta = {}, label = 'audit profile' } = {}) {
  if (!isPlainObject(value)) throw new ProfileError(`${label} must be an object`);
  checkKnownFields(value, AUDIT_FIELDS, label);
  if (value.auditVersion !== 1) throw new ProfileError(`${label} auditVersion must be 1`);
  if (!KNOWN_AUDITS.has(value.name)) throw new ProfileError(`${label} name must be publishing, accessibility or security`);
  if (expectedName && value.name !== expectedName) throw new ProfileError(`${label} name "${value.name}" does not match "${expectedName}"`);
  if (!KNOWN_AUDITS.has(value.category)) throw new ProfileError(`${label} category must match a supported audit name`);
  if (value.category !== value.name) throw new ProfileError(`${label} category must equal name`);
  if (!nonEmpty(value.description)) throw new ProfileError(`${label} description must be a non-empty string`);
  if (!Array.isArray(value.rules) || !value.rules.length) throw new ProfileError(`${label} rules must be a non-empty array`);
  for (const id of value.rules) {
    if (!Object.hasOwn(meta, id)) throw new ProfileError(`${label} references unknown rule "${id}"`);
    if (meta[id].profile !== value.name) {
      throw new ProfileError(`${label} references rule "${id}", which belongs to the ${meta[id].profile || 'editorial'} set`);
    }
  }
  if (new Set(value.rules).size !== value.rules.length) throw new ProfileError(`${label} lists a rule twice`);
  return value;
}

/**
 * Merge an organisation profile over a base profile. Pure: returns a new
 * object, never mutates either input (so a bad profile cannot poison a later
 * run in the same process).
 */
export function applyProfile(base, profile) {
  const merged = {
    profileVersion: 1,
    name: profile.name ?? base.name,
    source: profile.source ?? base.source,
    description: profile.description ?? base.description,
    spelling: { ...base.spelling, ...(profile.spelling || {}) },
    terminology: { forbidden: [...(base.terminology?.forbidden || [])] },
    register: {
      forbidden: [...(base.register?.forbidden || [])],
      approved: [...(base.register?.approved || [])],
    },
    severities: { ...base.severities, ...(profile.severities || {}) },
    rules: { ...base.rules, ...(profile.rules || {}) },
    pageUrl: profile.pageUrl ?? base.pageUrl ?? null,
  };

  for (const entry of profile.terminology?.forbidden || []) {
    const normalised = normaliseTerminologyEntry(entry);
    const existing = merged.terminology.forbidden.findIndex(item =>
      (typeof item === 'string' ? item : item.from) === normalised.from);
    if (existing >= 0) merged.terminology.forbidden[existing] = normalised;
    else merged.terminology.forbidden.push(normalised);
  }

  for (const item of profile.register?.forbidden || []) {
    if (!merged.register.forbidden.includes(item)) merged.register.forbidden.push(item);
  }
  for (const item of profile.register?.approved || []) {
    if (!merged.register.approved.includes(item)) merged.register.approved.push(item);
  }

  return merged;
}

/** Turn a validated profile into the vocabulary the rules consume. */
export function buildVocabulary(profile, { registerAllow = [] } = {}) {
  const spellings = Object.entries(profile.spelling || {});
  const terminology = (profile.terminology?.forbidden || []).map(normaliseTerminologyEntry);
  const forbidden = [...(profile.register?.forbidden || [])];
  const approved = [...(profile.register?.approved || [])];
  const registerExempt = new Set([...approved, ...registerAllow]);
  return {
    spellings,
    terminology,
    register: forbidden,
    registerExempt,
  };
}
