// Extension dispatch. Only surfaces that carry user-visible copy are
// extracted; .json, .css and other implementation files are not collected by
// the scanner at all, and anything unsupported yields no units rather than
// being scanned as raw text.
//
// Binary content guard: a file whose bytes are not valid UTF-8 is not
// user-visible copy in any of these formats, and a misnamed binary — a PNG
// called notes.txt, a UTF-16 export called report.txt — is read with
// replacement characters, which the rules then read as prose. That produced
// findings invented from bytes that are not text (a "Bare US in prose" inside
// a PNG header) and, worse, let `--fix --apply` write the lossy round-trip back
// over the original bytes. extractFile therefore decodes strictly and returns
// no units for content that is not UTF-8, exactly as it returns no units for
// an unsupported extension. A readable .txt is untouched: the check is
// validity, not content, so prose with any script in it still scans.

import fs from 'node:fs';
import path from 'node:path';
import { lineStarts } from './position.mjs';
import { extractHTML } from './extract-html.mjs';
import { extractMarkdown } from './extract-markdown.mjs';
import { extractText } from './extract-text.mjs';
import { extractJS } from './extract-js.mjs';

// Ordered canonical list of every file format the checker claims to support.
// README.md and USER-GUIDE.md list these same extensions; keep them in sync.
export const SUPPORTED_EXTENSIONS = [
  '.md', '.markdown', '.txt',
  '.html', '.htm',
  '.js', '.mjs', '.cjs', '.jsx',
  '.ts', '.tsx',
];

export const EXTRACTABLE_EXTENSIONS = new Set(SUPPORTED_EXTENSIONS);

const REPLACEMENT = '\uFFFD';
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true });

/**
 * True when `source` is a lossy UTF-8 decode of a file that is not UTF-8 text.
 *
 * The only signal available on a decoded string is the replacement character
 * Node's decoder substitutes for an undecodable byte. A file that legitimately
 * contains U+FFFD must not be excluded, so the ambiguous case is settled
 * against the file's actual bytes: a strict decode that throws is proof the
 * bytes are not UTF-8. Only then are the units dropped. Any failure to read
 * the bytes back (a caller that passed text not on disk) leaves the source
 * scannable, so this guard can never exclude a file it cannot prove.
 *
 * @param {string} source  the decoded file content
 * @param {string} filePath
 * @returns {boolean}
 */
function isUndecodable(source, filePath) {
  if (!source.includes(REPLACEMENT)) return false;
  let bytes;
  try {
    bytes = fs.readFileSync(filePath);
  } catch {
    return false;
  }
  try {
    STRICT_UTF8.decode(bytes);
    return false; // valid UTF-8 that genuinely contains U+FFFD
  } catch {
    return true;
  }
}

export function extractFile(filePath, source, { renderTargets = [] } = {}) {
  if (isUndecodable(source, filePath)) return [];
  const starts = lineStarts(source);
  const ext = path.extname(filePath).toLowerCase();
  const options = { starts, renderTargets };

  switch (ext) {
    case '.html':
    case '.htm':
      return extractHTML(source, filePath, options);
    case '.md':
    case '.markdown':
      return extractMarkdown(source, filePath, options);
    case '.txt':
      return extractText(source, filePath, options);
    case '.js':
    case '.mjs':
    case '.cjs':
    case '.jsx':
    case '.ts':
    case '.tsx':
      return extractJS(source, filePath, { starts, offsetBase: 0, renderTargets });
    default:
      return [];
  }
}
