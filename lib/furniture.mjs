// UN-style document furniture: the header block and the footer stamp that
// frame a report, in both formats.
//
// Everything here is derived from the scan input and nothing else — no clock
// and no environment. Two runs over the same input draw the same document
// symbol, the same date line and the same footer, so a report can be diffed
// and hashed the way lib/html.mjs already promises.
//
// The endorsement boundary, stated once because it is a real constraint: a
// neutral credit line and UN document conventions (title block, document
// symbol, date, distribution marking) are normal and fine. What this project
// must not do is print a masthead that makes the tool, or whoever is named in
// the credit, appear to speak for the United Nations — claim row 22 promises
// the report never presents itself as United Nations endorsement. So the header
// says EDITORIAL REVIEW, never UNITED NATIONS, and the credit line names only
// the tool until Omar supplies text that has been sourced.
//
// The credit is a data-driven field rather than layout code so it can be
// replaced without touching a renderer, and so its value is auditable.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * The credit line's text — "Prepared by …".
 *
 * Deliberately neutral: it names the tool and states that it is independent,
 * and invents no person, title or affiliation. Omar has not supplied credit
 * text, and a name would be a claim nobody has sourced. Replace this one value
 * when he does; nothing else in either renderer needs to change.
 */
export const CREDIT = 'un-editorial-check, an independent editorial tool';

/** The footer's second line, as printed. */
export function creditLine(credit = CREDIT) {
  return `Prepared by ${credit}`;
}

/**
 * ISO date (`2026-09-28`) to `28 September 2026`.
 *
 * A fixed month table rather than `toLocaleDateString`: locale and ICU data
 * differ between machines, and a report whose date line changes with the host
 * is not byte-identical to the one before it.
 *
 * Anything that is not an ISO date passes through untouched, so a hand-built
 * input cannot be silently turned into an invented date.
 */
export function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return String(iso || '');
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return String(iso);
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The document symbol, `UE/<year>/<four digits>`.
 *
 * Derived from the scan date, targets and tool version, so the same scan
 * identifies the same document and two different scans do not collide. This is
 * a reference this tool assigns — it is not a United Nations registry number
 * and no sequence is read from anywhere, because the checker is offline and
 * stateless and cannot know what number came before it.
 *
 * @param {{date?: string, targets?: string[], version?: string}} input
 * @returns {string}
 */
export function documentSymbol(input) {
  const date = String((input && input.date) || '');
  const year = /^\d{4}/.exec(date) ? date.slice(0, 4) : '0000';
  const key = [
    date,
    ((input && input.targets) || []).join(' '),
    (input && input.version) || '',
  ].join('|');
  const n = String(fnv1a(key) % 10000).padStart(4, '0');
  return `UE/${year}/${n}`;
}

/**
 * The header block: what the document is, when, and how it is marked.
 *
 * Four lines, drawn on the cover and on every continuation page. The second is
 * the document title — what was scanned — falling back to the report's own
 * title when a caller supplies no targets.
 *
 * @param {{date?: string, targets?: string[]}} input
 * @returns {string[]}
 */
export function headerRows(input) {
  const targets = (input && input.targets) || [];
  return [
    'EDITORIAL REVIEW',
    targets.length ? targets.join(' ') : 'UN Editorial Review',
    `Document symbol: ${documentSymbol(input)}   Date: ${formatDate(input && input.date)}`,
    'Distribution: General',
  ];
}

/**
 * The footer's first line: tool, subject and page position.
 *
 * The page numbers arrive from the renderer, which is the only place that
 * knows how many pages it drew.
 *
 * @param {{version: string, page: number, pages: number}} info
 * @returns {string}
 */
export function footerLine({ version, page, pages }) {
  return `un-editorial-check ${version} · editorial review · page ${page}/${pages}`;
}
