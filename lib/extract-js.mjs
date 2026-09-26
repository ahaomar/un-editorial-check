// JavaScript / TypeScript extraction: only string literals that carry evidence
// of being user-visible copy become units.
//
// Evidence, in order of strength:
//   1. the literal is assigned to, or passed to, a render surface
//      (label, title, text, message, tooltip, caption, innerHTML, add(...)),
//   2. the literal is concatenated into a larger string (narrative assembly
//      such as `add("... " + value + "% ...")`),
//   3. an interpolated template literal that reads like a sentence.
//
// Everything else — property names, identifiers, selectors, URLs, version
// literals, single-quoted code strings — never becomes a unit, so no rule can
// report it. That boundary is what the line-regex implementation lacked.

import { tokenizeJS } from './tokenize.mjs';
import { makeUnit, stripTags, COMPACT_MARKER, unitText } from './units.mjs';

const TARGET_KEYS = [
  'label', 'title', 'text', 'message', 'msg', 'tooltip', 'heading', 'caption',
  'placeholder', 'summary', 'description', 'narrative', 'takeaway', 'emptystate',
  'empty-state', 'button', 'header', 'subtitle', 'alt', 'content', 'innertext',
  'textcontent', 'innerhtml', 'copy', 'body', 'html', 'note', 'alert', 'banner',
  'kicker', 'lede', 'disclaimer', 'notice', 'hint', 'footnote', 'citation',
];

const TARGET_CALLS = [
  'add', 'append', 'write', 'render', 'show', 'display', 'alert', 'toast',
  'notify', 'announce', 'setlabel', 'settitle', 'settext', 'settooltip',
  'setmessage', 'setheading', 'setcaption', 'setsummary', 'setdescription',
  'setnarrative', 'createtextnode',
];

const COMPACT_RE = /legend|axis|tooltip|tile|stat|badge|pill|sparkline|gauge|knob/i;
const HTMLISH_RE = /<\/?[a-zA-Z][^>]*>/;

function compile(words) {
  return new RegExp(`^(?:${words.join('|')})$`, 'i');
}

function classify(tail) {
  const t = tail.replace(/\s+$/, '');
  let m;
  if ((m = t.match(/([A-Za-z_$][\w$]*)\s*:\s*$/))) return { kind: 'key', name: m[1] };
  if ((m = t.match(/([A-Za-z_$][\w$.]*)\s*\(\s*$/))) return { kind: 'call', name: m[1] };
  if ((m = t.match(/([A-Za-z_$][\w$.]*)\s*[+]?=\s*$/))) return { kind: 'assign', name: m[1] };
  if (/\+\s*$/.test(t)) return { kind: 'concat', name: null };
  if (/,\s*$/.test(t)) {
    const calls = [...t.slice(-200).matchAll(/([A-Za-z_$][\w$.]*)\(/g)];
    if (calls.length) return { kind: 'arg', name: calls[calls.length - 1][1] };
  }
  return { kind: 'unknown', name: null };
}

function passesShapeGate(value) {
  if (!value) return false;
  return /[A-Za-z]{2,}[^A-Za-z0-9]+[A-Za-z]{2,}/.test(value)
    || (value.length >= 20 && /[A-Za-z]/.test(value));
}

function unquote(token) {
  if (token.type === 'template') return token.text.replace(/^`/, '').replace(/`$/, '');
  return token.text.slice(1, -1);
}

/**
 * @param {string} source   JavaScript source (may be a slice of a larger file)
 * @param {string} filePath
 * @param {object} options
 * @param {number[]} options.starts      line starts of the *containing* document
 * @param {number}   options.offsetBase  where `source` starts inside that document
 * @param {string[]} options.renderTargets  extra identifiers treated as render surfaces
 */
export function extractJS(source, filePath, { starts, offsetBase = 0, renderTargets = [] } = {}) {
  const tokens = tokenizeJS(source);
  const units = [];
  const sanitised = renderTargets.map(t => String(t).replace(/[^\w$-]/g, '')).filter(Boolean);
  const targetRe = compile([...TARGET_KEYS, ...sanitised]);
  const callRe = compile([...TARGET_CALLS, ...sanitised]);

  // Line starts of this slice, used to honour a `ue:ignore` written in a
  // comment on the same line as the literal. The copy itself is never asked to
  // carry its own suppression.
  const lineStartsOfSource = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') lineStartsOfSource.push(i + 1);
  }
  function lineIndexAt(offset) {
    let lo = 0;
    let hi = lineStartsOfSource.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStartsOfSource[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  function suppressionFor(token) {
    const first = lineIndexAt(token.start);
    const last = lineIndexAt(token.end);
    const from = lineStartsOfSource[first];
    const to = last + 1 < lineStartsOfSource.length
      ? lineStartsOfSource[last + 1] - 1
      : source.length;
    const span = source.slice(from, to);
    return /ue:ignore/.test(span) ? span : null;
  }

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== 'string-double' && token.type !== 'string-single' && token.type !== 'template') continue;

    const prev = index > 0 && tokens[index - 1].type === 'code' ? tokens[index - 1].text : '';
    const ctx = classify(prev.slice(-160));
    const shortName = ctx.name ? ctx.name.split('.').pop() : null;

    let include;
    if (ctx.kind === 'key' || ctx.kind === 'assign') {
      include = shortName !== null && targetRe.test(shortName);
    } else if (ctx.kind === 'call' || ctx.kind === 'arg') {
      include = shortName !== null && callRe.test(shortName);
    } else if (ctx.kind === 'concat') {
      include = token.type !== 'string-single';
    } else {
      include = token.type === 'template' && Boolean(token.interp) && passesShapeGate(unquote(token));
    }
    if (!include) continue;

    const value = unquote(token);
    if (!value.trim()) continue;

    // The offset map is built from the literal's *contents*, so every copy
    // character points at its own source offset and the surrounding quotes can
    // never be touched by a fix.
    const opening = '`"\''.includes(token.text[0]) ? 1 : 0;
    const closing = token.text.length > 1 && '`"\''.includes(token.text[token.text.length - 1]) ? 1 : 0;
    const content = token.text.slice(opening, token.text.length - closing);
    const prepared = HTMLISH_RE.test(content) ? stripTags(content) : content;
    const { text, map } = unitText(prepared, { base: offsetBase + token.start + opening });

    const unit = makeUnit({
      file: filePath,
      starts,
      offset: offsetBase + token.start,
      raw: source.slice(token.start, token.end),
      suppress: suppressionFor(token),
      text,
      map,
      context: 'js-prose',
      compact: COMPACT_RE.test(shortName || ''),
    });
    if (unit) units.push(unit);
  }
  return units;
}
