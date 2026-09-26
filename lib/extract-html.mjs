// HTML extraction: text nodes, copy-bearing attributes, <title> and the meta
// description become units; markup, comments, <code>/<pre>/<template>,
// <style> internals and non-JavaScript <script> payloads never do.
//
// <script> JavaScript is delegated to extractJS with the script's own offset,
// so its string literals are classified by render evidence instead of by
// their position in a line.

import { extractJS } from './extract-js.mjs';
import { makeUnit, unitText, COMPACT_MARKER } from './units.mjs';

// Technical surfaces (never copy) and quotation surfaces (published or reported
// speech): their contents never become checkable units.
const SKIP_CONTENT = new Set(['code', 'pre', 'template', 'cite', 'q', 'blockquote']);
// Tabular and other space-constrained contexts: "%" and hyphens are legitimate.
const TABLE_CONTEXT = new Set(['table', 'thead', 'tbody', 'tr', 'td', 'th']);
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);
const COPY_ATTRS = new Map([
  ['alt', 'prose'],
  ['aria-label', 'label'],
  ['placeholder', 'label'],
  ['title', 'label'],
]);
const NON_JS_SCRIPT = /^(application\/(ld\+)?json|text\/template|text\/x-handlebars|text\/html)/i;

function findTagEnd(source, start) {
  let i = start + 1;
  let quote = null;
  while (i < source.length) {
    const c = source[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
    i++;
  }
  return source.length - 1;
}

function parseAttrs(tagText, tagStart) {
  const attrs = new Map();
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tagText))) {
    const value = m[2] !== undefined ? m[2] : m[3];
    const quote = m[2] !== undefined ? '"' : "'";
    // Offset of the first character *inside* the quotes, absolute in the file.
    const eq = m[0].indexOf('=');
    const quoteAt = eq >= 0 ? m[0].indexOf(quote, eq) : -1;
    attrs.set(m[1].toLowerCase(), {
      value,
      offset: tagStart + m.index + (quoteAt >= 0 ? quoteAt + 1 : 0),
    });
  }
  return attrs;
}

function isCompactElement(attrs) {
  for (const key of ['class', 'id', 'role', 'aria-label']) {
    const attr = attrs.get(key);
    if (attr && COMPACT_MARKER.test(attr.value)) return true;
  }
  return false;
}

/**
 * @param {string} source
 * @param {string} filePath
 * @param {object} options
 * @param {number[]} options.starts
 * @param {string[]} options.renderTargets
 */
export function extractHTML(source, filePath, { starts, renderTargets = [] } = {}) {
  const units = [];
  const stack = []; // { name, compact }
  const n = source.length;
  let i = 0;

  const push = (unit) => { if (unit) units.push(unit); };
  const insideSkip = () => stack.some(e => SKIP_CONTENT.has(e.name));
  const insideCompact = () => stack.some(e => e.compact);

  const addText = (start, end) => {
    if (end <= start || insideSkip()) return;
    const raw = source.slice(start, end);
    const { text, map } = unitText(raw, { base: start, decode: true });
    push(makeUnit({
      file: filePath,
      starts,
      offset: start,
      raw,
      text,
      map,
      context: 'html-prose',
      compact: insideCompact(),
    }));
  };

  const closeElement = (name) => {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].name === name) { stack.splice(k, 1); return; }
    }
  };

  while (i < n) {
    const lt = source.indexOf('<', i);
    if (lt < 0) { addText(i, n); break; }
    addText(i, lt);

    // Comments, doctype and other declarations.
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (source.startsWith('<!', lt) || source.startsWith('<?', lt)) {
      const end = source.indexOf('>', lt + 2);
      i = end < 0 ? n : end + 1;
      continue;
    }

    const closing = source.startsWith('</', lt);
    const tagEnd = findTagEnd(source, lt);
    const tagText = source.slice(lt, tagEnd + 1);
    const nameMatch = tagText.match(/^<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/);

    if (!nameMatch) { i = tagEnd + 1; continue; }
    const name = nameMatch[1].toLowerCase();

    if (closing) {
      closeElement(name);
      i = tagEnd + 1;
      continue;
    }

    const attrs = parseAttrs(tagText, lt);
    const selfClosing = tagText.endsWith('/>') || VOID_TAGS.has(name);

    // Raw-text elements: their bodies are not walked by the tag scanner.
    if (name === 'script' || name === 'style') {
      const bodyStart = tagEnd + 1;
      const closeRe = new RegExp(`</${name}`, 'i');
      const rest = source.slice(bodyStart);
      const found = rest.search(closeRe);
      const bodyEnd = found < 0 ? n : bodyStart + found;
      if (name === 'script' && !NON_JS_SCRIPT.test(attrs.get('type')?.value || '')) {
        const body = source.slice(bodyStart, bodyEnd);
        if (body.trim()) {
          units.push(...extractJS(body, filePath, { starts, offsetBase: bodyStart, renderTargets }));
        }
      }
      i = found < 0 ? n : bodyStart + found;
      continue;
    }

    // Copy-bearing attributes.
    for (const [attr, kind] of COPY_ATTRS) {
      const attrValue = attrs.get(attr);
      if (!attrValue || !attrValue.value.trim()) continue;
      const { text, map } = unitText(attrValue.value, { base: attrValue.offset, decode: true });
      push(makeUnit({
        file: filePath,
        starts,
        offset: attrValue.offset,
        raw: attrValue.value,
        text,
        map,
        context: kind === 'prose' ? 'html-attr' : 'html-label',
        compact: kind === 'label' || insideCompact(),
      }));
    }
    if (name === 'button') {
      const value = attrs.get('value');
      if (value && value.value.trim()) {
        const { text, map } = unitText(value.value, { base: value.offset, decode: true });
        push(makeUnit({
          file: filePath,
          starts,
          offset: value.offset,
          raw: value.value,
          text,
          map,
          context: 'html-label',
          compact: true,
        }));
      }
    }
    if (name === 'meta' && (attrs.get('name')?.value || '').toLowerCase() === 'description') {
      const content = attrs.get('content');
      if (content && content.value.trim()) {
        const { text, map } = unitText(content.value, { base: content.offset, decode: true });
        push(makeUnit({
          file: filePath,
          starts,
          offset: content.offset,
          raw: content.value,
          text,
          map,
          context: 'meta-description',
          compact: true,
        }));
      }
    }

    if (!selfClosing) {
      stack.push({ name, compact: insideCompact() || TABLE_CONTEXT.has(name) || isCompactElement(attrs) });
    }
    i = tagEnd + 1;

    // <title> body is user-visible page copy but space-constrained.
    if (name === 'title' && !selfClosing) {
      const closeIdx = source.toLowerCase().indexOf('</title', i);
      const end = closeIdx < 0 ? n : closeIdx;
      const raw = source.slice(i, end);
      const { text, map } = unitText(raw, { base: i, decode: true });
      push(makeUnit({
        file: filePath,
        starts,
        offset: i,
        raw,
        text,
        map,
        context: 'page-title',
        compact: true,
      }));
      closeElement('title');
      i = end;
    }
  }

  return units;
}
