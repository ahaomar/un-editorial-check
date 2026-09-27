// Extension dispatch. Only surfaces that carry user-visible copy are
// extracted; .json, .css and other implementation files are not collected by
// the scanner at all, and anything unsupported yields no units rather than
// being scanned as raw text.

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

export function extractFile(filePath, source, { renderTargets = [] } = {}) {
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
