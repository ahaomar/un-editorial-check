// Config loading, catalogue loading and rule-context assembly.
//
// Everything is validated before use and the module keeps no mutable global
// state: two runs in the same process cannot contaminate each other, and a
// bad file always aborts (exit code 2) instead of silently checking with a
// reduced rule set.

import fs from 'node:fs';
import path from 'node:path';
import {
  ProfileError, parseJsonStrict, validateProfile, validateAuditProfile,
  applyProfile, buildVocabulary,
} from './profile.mjs';

export { ProfileError };

const SEVERITIES = new Set(['error', 'warning', 'info']);
const CONFIG_FIELDS = new Set([
  'ignoredPaths', 'allowlist', 'severities', 'rules', 'spellingReview',
  'baseOrigin', 'renderTargets',
]);
const ALLOWLIST_FIELDS = new Set(['spellings', 'terminology', 'register']);
const RULE_FIELDS = new Set(['enabled', 'severity']);

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

function validateStringList(list, label) {
  if (!Array.isArray(list)) throw new ProfileError(`${label} must be an array`);
  for (const item of list) {
    if (!nonEmpty(item)) throw new ProfileError(`${label} must contain only non-empty strings`);
  }
}

function validateRuleSettings(rules, knownIds, label) {
  if (!isPlainObject(rules)) throw new ProfileError(`${label} must be an object`);
  for (const [id, setting] of Object.entries(rules)) {
    if (!knownIds.includes(id)) throw new ProfileError(`${label} contains unknown rule "${id}"`);
    if (!isPlainObject(setting)) throw new ProfileError(`${label}.${id} must be an object`);
    if (!Object.keys(setting).length) throw new ProfileError(`${label}.${id} must set enabled or severity`);
    for (const key of Object.keys(setting)) {
      if (!RULE_FIELDS.has(key)) throw new ProfileError(`${label}.${id} contains unknown field "${key}"`);
    }
    if ('enabled' in setting && typeof setting.enabled !== 'boolean') {
      throw new ProfileError(`${label}.${id}.enabled must be a boolean`);
    }
    if ('severity' in setting && !SEVERITIES.has(setting.severity)) {
      throw new ProfileError(`${label}.${id}.severity must be error, warning or info`);
    }
  }
}

/** Validate a raw config object. Returns a normalised, frozen config. */
export function validateConfig(raw, { knownIds = [] } = {}) {
  if (!isPlainObject(raw)) throw new ProfileError('config must be a JSON object');
  const unknown = Object.keys(raw).filter(key => !CONFIG_FIELDS.has(key));
  if (unknown.length) throw new ProfileError(`config contains unknown fields: ${unknown.join(', ')}`);

  const cfg = {
    ignoredPaths: raw.ignoredPaths ?? [],
    allowlist: raw.allowlist ?? {},
    severities: raw.severities ?? {},
    rules: raw.rules ?? {},
    spellingReview: raw.spellingReview ?? false,
    baseOrigin: raw.baseOrigin ?? null,
    renderTargets: raw.renderTargets ?? [],
  };

  validateStringList(cfg.ignoredPaths, 'config ignoredPaths');
  if (!isPlainObject(cfg.allowlist)) throw new ProfileError('config allowlist must be an object');
  const badAllow = Object.keys(cfg.allowlist).filter(key => !ALLOWLIST_FIELDS.has(key));
  if (badAllow.length) throw new ProfileError(`config allowlist contains unknown fields: ${badAllow.join(', ')}`);
  for (const key of ALLOWLIST_FIELDS) {
    if (key in cfg.allowlist) validateStringList(cfg.allowlist[key], `config allowlist.${key}`);
  }
  validateRuleSettings(cfg.severities, knownIds, 'config severities');
  validateRuleSettings(cfg.rules, knownIds, 'config rules');
  if (typeof cfg.spellingReview !== 'boolean') throw new ProfileError('config spellingReview must be a boolean');

  if (cfg.baseOrigin !== null) {
    if (!nonEmpty(cfg.baseOrigin)) throw new ProfileError('config baseOrigin must be a non-empty absolute URL');
    let url;
    try { url = new URL(cfg.baseOrigin); } catch { throw new ProfileError('config baseOrigin must be an absolute URL'); }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ProfileError('config baseOrigin must be an absolute http(s) URL');
    cfg.baseOrigin = url.href;
  }

  validateStringList(cfg.renderTargets, 'config renderTargets');
  for (const target of cfg.renderTargets) {
    if (!/^[\w$-]+$/.test(target)) throw new ProfileError(`config renderTargets entry "${target}" must be an identifier`);
  }

  cfg.allowlist = {
    spellings: cfg.allowlist.spellings ?? [],
    terminology: cfg.allowlist.terminology ?? [],
    register: cfg.allowlist.register ?? [],
  };
  return Object.freeze(cfg);
}

/** Load and validate rules/catalogue.json — the single source of rule metadata. */
export function loadCatalogue(root) {
  const file = path.join(root, 'rules', 'catalogue.json');
  const raw = parseJsonStrict(fs.readFileSync(file, 'utf8'), 'rules/catalogue.json');
  if (!isPlainObject(raw) || raw.catalogueVersion !== 1 || !Array.isArray(raw.rules) || !raw.rules.length) {
    throw new ProfileError('rules/catalogue.json must declare catalogueVersion 1 and a non-empty rules array');
  }
  const meta = {};
  const ids = [];
  for (const entry of raw.rules) {
    if (!isPlainObject(entry) || !nonEmpty(entry.id)) throw new ProfileError('catalogue entries must be objects with an id');
    if (meta[entry.id]) throw new ProfileError(`catalogue contains duplicate rule "${entry.id}"`);
    if (!SEVERITIES.has(entry.severity)) throw new ProfileError(`catalogue ${entry.id} severity must be error, warning or info`);
    if (!nonEmpty(entry.category) || !nonEmpty(entry.confidence) || !nonEmpty(entry.scope) || !nonEmpty(entry.status)) {
      throw new ProfileError(`catalogue ${entry.id} must declare category, confidence, scope and status`);
    }
    if (entry.confidence !== 'deterministic' && entry.confidence !== 'heuristic') {
      throw new ProfileError(`catalogue ${entry.id} confidence must be deterministic or heuristic`);
    }
    if ('profile' in entry && entry.profile !== null
      && entry.profile !== 'publishing' && entry.profile !== 'accessibility' && entry.profile !== 'security') {
      throw new ProfileError(`catalogue ${entry.id} profile must be null, publishing, accessibility or security`);
    }
    meta[entry.id] = entry;
    ids.push(entry.id);
  }
  return { meta, ids, catalogue: raw };
}

/** The bundled United Nations baseline organisation profile. */
export function loadBaselineProfile(root, knownIds) {
  const file = path.join(root, 'config', 'profiles', 'un-v1.json');
  const raw = parseJsonStrict(fs.readFileSync(file, 'utf8'), 'config/profiles/un-v1.json');
  return validateProfile(raw, { baseline: null, knownIds, label: 'config/profiles/un-v1.json' });
}

/** A bundled audit profile (publishing | accessibility | security). */
export function loadAuditProfile(root, name, meta) {
  const file = path.join(root, 'config', 'profiles', `${name}.json`);
  const raw = parseJsonStrict(fs.readFileSync(file, 'utf8'), `config/profiles/${name}.json`);
  return validateAuditProfile(raw, { expectedName: name, meta, label: `config/profiles/${name}.json` });
}

/**
 * Load an organisation profile from disk and merge it over the baseline.
 * Kept separate from audit loading so `--profile <file>` and
 * `--profile security` can never be confused: an existing path always wins.
 */
export function loadOrganisationProfile(root, file, baseline, knownIds, meta) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) throw new ProfileError(`profile not found: ${file}`);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new ProfileError(`profile path is not a regular file: ${file}`);
  const raw = parseJsonStrict(fs.readFileSync(resolved, 'utf8'), file);
  if (isPlainObject(raw) && 'auditVersion' in raw) {
    return { kind: 'audit', value: validateAuditProfile(raw, { meta, label: file }) };
  }
  const profile = validateProfile(raw, { baseline, knownIds, label: file });
  return { kind: 'organisation', value: applyProfile(baseline, profile) };
}

/** Assemble the rule context consumed by the editorial engine. */
export function makeContext({ cfg, baseline, meta }) {
  const vocab = buildVocabulary(baseline, { registerAllow: cfg.allowlist.register });
  // A profile may carry severities and rule states, but they were validated
  // and merged without ever reaching the engine — a documented feature that
  // silently did nothing. A configuration file is the more specific source,
  // so it wins on any key both set.
  const severities = { ...(baseline.severities || {}), ...cfg.severities };
  const rules = { ...(baseline.rules || {}), ...cfg.rules };
  return { cfg: Object.freeze({ ...cfg, severities, rules }), meta, vocab };
}

export { applyProfile, buildVocabulary, validateProfile, validateAuditProfile, parseJsonStrict };
