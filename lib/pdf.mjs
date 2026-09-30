// Minimal, dependency-free PDF 1.4 writer for the report generator.
//
// renderPdf(elements, opts) lays the report model's element union out on A4
// portrait pages, stamps a footer on every page once layout has produced the
// page count (two passes), and returns the whole file as a Buffer. Content
// streams stay uncompressed so the structural test can read the text operands
// back with a regular expression. The module is pure: no file system, no
// process, no clock — the same input always yields the same bytes.
//
// Everything reader-visible goes through transliteration first: curly quotes
// and the ellipsis fold to ASCII, the soft hyphen is dropped, the WinAnsi
// specials — including the en dash (0x96) and the em dash (0x97) — keep their
// single-byte positions (a dash that folded to "-" made UE-NU002's Current and
// Should be print identically), and any remaining code point outside the
// encoding becomes "?".
//
// On that last fold, precisely, because it is a real limitation and the
// report must not hide it. WinAnsi is a single-byte encoding: a Cyrillic,
// Arabic or Han character has no code in it, and the writer holds no font that
// could draw one. Embedding a font is out of scope — it would mean shipping a
// font program in the package — and a transliteration fold is not offered in
// its place because a wrong transliteration of an unfamiliar script is worse
// than an honest placeholder: the reader could not tell it from the real name.
// So the character is replaced by "?", and the loss is announced rather than
// silent: when any string in the report needed that fold, the report carries a
// closing note saying so, naming the encoding and stating that a character
// shown as "?" may be a character the font cannot draw and not a question mark
// in the copy. Two file names that differ only in a non-Latin character will
// therefore still print alike, and that is the documented cost — the JSON
// output, which the same run also produces, carries the exact path.
//
// The soft hyphen is the other dropped character, and unlike "?" it needs no
// note: it is an invisible line-breaking hint that carries no text of its own.
//
// Line breaking uses the standard Adobe AFM advance widths for Helvetica and
// Helvetica-Bold (units per 1000 em). An unbroken run that is wider than the
// column is cut at the last character that fits, so no emitted line leaves
// the content box.
//
// Since Phase 9 the writer also draws three surfaces shared with lib/html.mjs,
// in both `detail` modes: the twelve-row category legend (lib/legend.mjs —
// marker code plus the category's own name, so colour and shape are never the
// only signal), and the UN-style document furniture (lib/furniture.mjs) whose
// header reads EDITORIAL REVIEW and never UNITED NATIONS — claim row 22
// promises the report never presents itself as United Nations endorsement.
// The `issue` element (grouped detail) renders as a structured block: banner,
// marker row (a count only when the group holds more than one occurrence),
// the finding's own fields, the six provenance rows, and an `Occurrences`
// list of File / Location / Content / Should be kv blocks that wraps within
// the measure. Summary counts are never derived from `issue.count`: they come
// from the summary paragraph the model computed from the findings.

import { Buffer } from 'node:buffer';

import { legendRows } from './legend.mjs';
import { categoryIcon, pdfIcon, severityIcon } from './icons.mjs';
import { footerCells, headerRows } from './furniture.mjs';
import { capLines, sectionCount } from './report.mjs';

// --- page geometry -----------------------------------------------------------

const PAGE_W = 595.28; // A4 portrait, points
const PAGE_H = 841.89;
const MARGIN = 54;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const TOP = PAGE_H - MARGIN;
const BOTTOM = MARGIN;
const BODY = 10.5;
const BODY_LEAD = 14;
const LABEL_COL = 84;
const BULLET_INDENT = 14;
const FOOTER_SIZE = 7.5;
const FOOTER_Y = 30;
const BLACK = '0 0 0';
// The metadata beside a section title — its lane and its finding count — is
// set lighter than the title itself so a reader's eye takes the title first.
const META_GREY = '0.45 0.45 0.45';
const WHITE = '1 1 1';
const FOOTER_GREY = '0.45 0.45 0.45';

// --- AFM width tables --------------------------------------------------------
// Index 0 of the ASCII table is code point 32 (space); index 0 of the Latin-1
// table is code point 160 (no-break space). Everything else measures 0.5 em.

const HELV_REG_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, // 32..39 space ! " # $ % & '
  333, 333, 389, 584, 278, 333, 278, 278, // 40..47 ( ) * + , - . /
  556, 556, 556, 556, 556, 556, 556, 556, // 48..55 0 1 2 3 4 5 6 7
  556, 556, 278, 278, 584, 584, 584, 556, // 56..63 8 9 : ; < = > ?
  1015, 667, 667, 722, 722, 667, 611, 778, // 64..71 @ A B C D E F G
  722, 278, 500, 667, 556, 833, 722, 778, // 72..79 H I J K L M N O
  667, 778, 722, 667, 611, 722, 667, 944, // 80..87 P Q R S T U V W
  667, 667, 611, 278, 278, 278, 469, 556, // 88..95 X Y Z [ \ ] ^ _
  333, 556, 556, 500, 556, 556, 278, 556, // 96..103 ` a b c d e f g
  556, 222, 222, 500, 222, 833, 556, 556, // 104..111 h i j k l m n o
  556, 556, 333, 500, 278, 556, 500, 722, // 112..119 p q r s t u v w
  500, 500, 500, 334, 260, 334, 584, // 120..126 x y z { | } ~
];

const HELV_BOLD_ASCII = [
  278, 333, 474, 556, 556, 889, 722, 238, // 32..39
  333, 333, 389, 584, 278, 333, 278, 278, // 40..47
  556, 556, 556, 556, 556, 556, 556, 556, // 48..55
  556, 556, 333, 333, 584, 584, 584, 611, // 56..63
  975, 722, 722, 722, 722, 667, 611, 778, // 64..71
  722, 278, 556, 722, 611, 833, 722, 778, // 72..79
  667, 778, 722, 667, 611, 722, 667, 944, // 80..87
  667, 667, 611, 333, 278, 333, 584, 556, // 88..95
  333, 556, 611, 556, 611, 556, 333, 611, // 96..103
  611, 278, 278, 556, 278, 889, 611, 611, // 104..111
  611, 611, 389, 556, 333, 611, 556, 778, // 112..119
  556, 556, 500, 389, 280, 389, 584, // 120..126
];

const HELV_REG_LATIN1 = [
  278, 333, 556, 556, 556, 556, 260, 556, // 160..167
  333, 737, 370, 556, 584, 333, 737, 333, // 168..175
  400, 584, 333, 333, 333, 556, 537, 278, // 176..183
  333, 333, 365, 556, 834, 834, 834, 611, // 184..191
  667, 667, 667, 667, 667, 667, 1000, 722, // 192..199
  667, 667, 667, 667, 278, 278, 278, 278, // 200..207
  722, 722, 778, 778, 778, 778, 584, 778, // 208..215
  722, 722, 722, 722, 667, 667, 611, 556, // 216..223
  556, 556, 556, 556, 556, 556, 889, 500, // 224..231
  556, 556, 556, 556, 278, 278, 278, 278, // 232..239
  556, 556, 556, 556, 556, 556, 556, 584, // 240..247
  611, 556, 556, 556, 556, 500, 556, 500, // 248..255
];

const HELV_BOLD_LATIN1 = [
  278, 333, 556, 556, 556, 556, 260, 556, // 160..167
  333, 737, 370, 556, 584, 333, 737, 333, // 168..175
  400, 584, 333, 333, 333, 556, 537, 278, // 176..183
  333, 333, 365, 556, 834, 834, 834, 611, // 184..191
  722, 722, 722, 722, 722, 722, 1000, 722, // 192..199
  667, 667, 667, 667, 278, 278, 278, 278, // 200..207
  722, 722, 778, 778, 778, 778, 584, 778, // 208..215
  722, 722, 722, 722, 667, 667, 611, 611, // 216..223
  556, 556, 556, 556, 556, 556, 889, 556, // 224..231
  556, 556, 556, 556, 278, 278, 278, 278, // 232..239
  611, 611, 611, 611, 611, 611, 611, 584, // 240..247
  611, 611, 611, 611, 611, 556, 611, 556, // 248..255
];

function afmWidth(codePoint, bold) {
  if (codePoint >= 32 && codePoint <= 126) {
    return (bold ? HELV_BOLD_ASCII : HELV_REG_ASCII)[codePoint - 32];
  }
  if (codePoint >= 160 && codePoint <= 255) {
    return (bold ? HELV_BOLD_LATIN1 : HELV_REG_LATIN1)[codePoint - 160];
  }
  return 500;
}

// --- transliteration ---------------------------------------------------------
// The typographic folds are test-locked. The C1 table keeps the WinAnsi
// specials (bullets, the euro sign, fancy ligatures) at their encoded
// positions; every other code point outside the encoding — and every control
// character — is escaped as \uXXXX so that nothing is silently lost.

const WINANSI_EXTRAS = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84],
  [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88], [0x2030, 0x89],
  [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C], [0x017D, 0x8E],
  [0x2022, 0x95], [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A],
  [0x203A, 0x9B], [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F],
]);

/**
 * True when `codePoint` has no single-byte WinAnsi code, which is what the "?"
 * fold is for. The en dash and the em dash are deliberately absent: 0x96 and
 * 0x97 are the bytes WinAnsi puts them at, so they are representable.
 */
function unrepresentable(codePoint) {
  if (codePoint >= 0x20 && codePoint <= 0x7E) return false;
  if (codePoint >= 0xA0 && codePoint <= 0xFF) return false;
  if (codePoint === 0x96 || codePoint === 0x97) return false;
  if (WINANSI_EXTRAS.has(codePoint)) return false;
  return true;
}

/**
 * True when any code point in `value` will be replaced by "?". The soft hyphen
 * is excluded: it is dropped on purpose and needs no note.
 */
function hasUnrepresentable(value) {
  for (const ch of value) {
    const cp = ch.codePointAt(0);
    if (cp === 0x00AD) continue;
    if (unrepresentable(cp)) return true;
  }
  return false;
}

function toWinAnsi(value) {
  let out = '';
  for (const ch of value) {
    const cp = ch.codePointAt(0);
    if (cp === 0x2018 || cp === 0x2019) out += "'";
    else if (cp === 0x201C || cp === 0x201D) out += '"';
    // WinAnsi encodes the en dash at 0x96 and the em dash at 0x97; folding
    // them to "-" hid UE-NU002's whole defect, where Current and Should be
    // differ only in the dash. The byte form passes through as well, because
    // every string reaches this function twice (wrap measures, pdfLiteral
    // emits) and the encoding must be idempotent.
    else if (cp === 0x2013 || cp === 0x96) out += '\u0096';
    else if (cp === 0x2014 || cp === 0x97) out += '\u0097';
    else if (cp === 0x2026) out += '...';
    else if (cp === 0x00AD) { /* soft hyphen: dropped, and announced nowhere */ }
    else if (unrepresentable(cp)) out += '?';
    else if (cp >= 0x20 && cp <= 0x7E) out += ch;
    else if (cp >= 0xA0 && cp <= 0xFF) out += ch;
    else out += String.fromCharCode(WINANSI_EXTRAS.get(cp));
  }
  return out;
}

function measure(value, font, size) {
  const bold = font === 'F2';
  let width = 0;
  for (const ch of value) {
    width += (afmWidth(ch.codePointAt(0), bold) * size) / 1000;
  }
  return width;
}

// Word wrap against the real advance widths. Whitespace collapses to single
// spaces; a word that cannot fit even alone is cut at the last character
// that fits, so no line leaves the column.

function wrap(value, font, size, maxWidth) {
  const normalized = toWinAnsi(value).replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const fits = (piece) => measure(piece, font, size) <= maxWidth;
  const lines = [];
  let current = '';
  for (const word of normalized.split(' ')) {
    let rest = word;
    while (rest !== '' && !fits(rest)) {
      if (current !== '') {
        lines.push(current);
        current = '';
        continue;
      }
      let cut = 1;
      while (cut < rest.length && fits(rest.slice(0, cut + 1))) cut++;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    const joined = current === '' ? rest : current + ' ' + rest;
    if (fits(joined)) current = joined;
    else {
      lines.push(current);
      current = rest;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

function pdfLiteral(value) {
  const win = toWinAnsi(value);
  let out = '(';
  for (const ch of win) {
    if (ch === '(' || ch === ')' || ch === '\\') out += '\\';
    out += ch;
  }
  return out + ')';
}

function n(value) {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function bannerFill(kind) {
  if (kind === 'error') return '0.776 0.157 0.157';
  if (kind === 'warning') return '0.902 0.318 0';
  if (kind === 'title') return '0.216 0.278 0.31';
  return '0.082 0.396 0.753';
}

/**
 * A legend marker's `#rrggbb` as a PDF fill colour, three decimal places per
 * channel (the precision `n()` would give, applied per channel rather than to
 * the whole triplet). Anything that is not a six-digit hex — an unknown
 * category carries `colour: ''` — falls back to the neutral marker grey, so a
 * missing colour still draws a swatch instead of corrupting the stream. The
 * value is never passed through `n()`: that rounds a single number, and
 * `0.4 0.4 0.4` must not become one number.
 */
function rgbFill(hex) {
  const match = /^#([0-9a-fA-F]{6})$/.exec(String(hex || ''));
  if (!match) return '0.45 0.45 0.45';
  const hex6 = match[1].toLowerCase();
  const channel = (start) =>
    String(Math.round(parseInt(hex6.slice(start, start + 2), 16) / 255 * 1000) / 1000);
  return `${channel(0)} ${channel(2)} ${channel(4)}`;
}

// --- serialization -----------------------------------------------------------

function serialize(pages) {
  const objects = new Map();
  const pageCount = pages.length;
  const kidRefs = [];
  for (let i = 0; i < pageCount; i++) kidRefs.push(`${6 + i * 2} 0 R`);

  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Kids [${kidRefs.join(' ')}] /Count ${pageCount} >>`);
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.set(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  objects.set(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
  for (let i = 0; i < pageCount; i++) {
    const pageNum = 6 + i * 2;
    const contentNum = 7 + i * 2;
    const data = pages[i].join('\n');
    objects.set(pageNum,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89]`
      + ` /Resources << /ProcSet [/PDF /Text] /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >>`
      + ` /Contents ${contentNum} 0 R >>`);
    objects.set(contentNum,
      `<< /Length ${Buffer.byteLength(data, 'latin1')} >>\nstream\n${data}\nendstream`);
  }

  const maxObject = 5 + pageCount * 2;
  const offsets = [];
  const chunks = [];
  let cursor = 0;
  const put = (chunk) => {
    chunks.push(chunk);
    cursor += Buffer.byteLength(chunk, 'latin1');
  };

  put('%PDF-1.4\n');
  for (let num = 1; num <= maxObject; num++) {
    offsets[num] = cursor;
    put(`${num} 0 obj\n${objects.get(num)}\nendobj\n`);
  }
  const xrefStart = cursor;
  put(`xref\n0 ${maxObject + 1}\n`);
  put('0000000000 65535 f \n');
  for (let num = 1; num <= maxObject; num++) {
    put(`${String(offsets[num]).padStart(10, '0')} 00000 n \n`);
  }
  put(`trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk, 'latin1')));
}

// --- layout ------------------------------------------------------------------

/** Every reader-visible string an element carries. */
function elementStrings(el) {
  if (!el || typeof el !== 'object') return [];
  const out = [];
  // Scalars: the original three plus an issue's own fields (the grouped
  // layout puts the copy and the explanation here instead of on kv and
  // paragraph elements, and the fold must find them or a grouped report
  // would lose its closing note), a legend row's text, and a cap block's
  // re-run command — which is the one string a reader copies out of the
  // report, so it must be warned about rather than silently folded.
  for (const key of ['text', 'label', 'value', 'current', 'should', 'message',
    'audit', 'category', 'intent', 'command']) {
    if (typeof el[key] === 'string') out.push(el[key]);
  }
  if (Array.isArray(el.items)) {
    for (const item of el.items) if (typeof item === 'string') out.push(item);
  }
  // An issue's provenance rows and its occurrence list carry paths and copy
  // the reader sees; a legend row carries the category name, its code and
  // what the category covers.
  if (Array.isArray(el.provenance)) {
    for (const row of el.provenance) {
      if (row && typeof row === 'object') {
        if (typeof row.label === 'string') out.push(row.label);
        if (typeof row.value === 'string') out.push(row.value);
      }
    }
  }
  if (Array.isArray(el.occurrences)) {
    for (const occurrence of el.occurrences) {
      if (occurrence && typeof occurrence === 'object') {
        for (const key of ['file', 'content', 'should']) {
          if (typeof occurrence[key] === 'string') out.push(occurrence[key]);
        }
      }
    }
  }
  if (Array.isArray(el.rows)) {
    for (const row of el.rows) {
      if (row && typeof row === 'object') {
        for (const key of ['category', 'code', 'intent']) {
          if (typeof row[key] === 'string') out.push(row[key]);
        }
      }
    }
  }
  return out;
}

// The "?" fold is never silent. When any string in the report needed it, the
// report says so in a closing note, because a "?" in a file name is otherwise
// indistinguishable from a "?" in the copy. The note is appended to the element
// list rather than drawn by the layout code, so it flows, wraps and paginates
// exactly like any other paragraph and costs no extra pass.
// Framing disclaimer, identical to FRAMING in lib/html.mjs and worded from
// row 22 of docs/CLAIM-EVIDENCE-AUDIT.md. Both report formats carry it, so a
// claim about "the report" stays true whichever format the reader opened.
const FRAMING = 'The report never presents itself as verification of facts, legal opinion or United Nations endorsement.';
const FOLD_NOTE = 'Note on characters: this report is set in the standard '
  + 'WinAnsi-encoded fonts, which cover the ASCII and Western European ranges '
  + 'but not every script. A character with no code in that encoding is shown '
  + 'as a question mark, so a question mark in this report may be a character '
  + 'the font cannot draw rather than punctuation in the copy, and two names '
  + 'that differ only in such a character will look alike here. The source file '
  + 'is unchanged, and the JSON output from the same run carries the exact name.';

// A finding banner in `detail: 'full'`: "[ERROR] UE-GR001 · grammar ·
// deterministic · line 12:5". The capture is the category — the second field
// after the bracketed severity and the rule id. The cover banner ("Editorial
// Review Report") and a hand-built banner with no bracket ("error · line
// 12:5") do not match, so nothing outside the model's own finding banners can
// be counted as a finding.
const FINDING_BANNER = /^\[[^\]]+\]\s+\S+\s+·\s+([^\s·]+)/;

/**
 * The findings behind an element list, for `legendRows` — never a count read
 * off a rendered block. Grouping is presentation: in grouped detail each
 * `issue` stands for its occurrences, so every occurrence contributes one
 * finding with its category; in `full` detail there is one finding banner per
 * finding, and the category is parsed from the banner the model printed. The
 * result is exactly the list the findings themselves would make, so the
 * legend's counts equal the counts lib/html.mjs draws from the same scan —
 * and no severity summary anywhere is derived from `issue.count`.
 *
 * @param {object[]} elements  the report element union
 * @returns {object[]} `{ category }` per finding
 */
function legendFindings(elements) {
  const hasIssues = elements.some(el => el && el.type === 'issue');
  const findings = [];
  if (hasIssues) {
    for (const el of elements) {
      if (!el || el.type !== 'issue') continue;
      const occurrences = Array.isArray(el.occurrences) ? el.occurrences.length : 0;
      for (let i = 0; i < occurrences; i++) findings.push({ category: el.category });
    }
    return findings;
  }
  for (const el of elements) {
    if (!el || el.type !== 'banner') continue;
    const match = FINDING_BANNER.exec(String(el.text || ''));
    if (match) findings.push({ category: match[1] });
  }
  return findings;
}

/**
 * Splice the twelve-row category legend in under the Categories heading the
 * model already pushed — the section D5 puts second, so the legend sits where
 * a reader meets the marker vocabulary and before any marker is used. Both
 * detail modes get it — a legend is how a reader decodes a marker, so an
 * absent legend on one mode is an absent vocabulary. The rows come from
 * lib/legend.mjs `legendRows`, so all twelve categories are listed with their
 * counts (zero included) in catalogue order.
 *
 * The heading itself is the model's, not spliced here, so lib/html.mjs and
 * lib/pdf.mjs cannot name the section differently.
 *
 * @param {object[]} elements  the framed element list (framing disclaimer first)
 * @returns {object[]} a new list; the input is not mutated
 */
function insertLegend(elements) {
  const rows = legendRows(legendFindings(elements));
  const categories = elements.findIndex(el => el && el.type === 'heading' && el.text === 'Categories');
  if (categories >= 0) {
    // Directly under the model's own Categories heading: the heading stays the
    // model's, so both formats name the section from the same string.
    return [
      ...elements.slice(0, categories + 1),
      { type: 'legend', rows },
      { type: 'rule' },
      ...elements.slice(categories + 1),
    ];
  }
  // Only reachable if a caller hands over a list without the model's heading
  // (the renderer's own fixtures do exactly that). The legend is still given
  // the same section name, so a reader — and a test — meets one vocabulary.
  const at = elements.findIndex(el => el && el.type === 'heading');
  if (at < 0) {
    return [...elements, { type: 'rule' }, { type: 'legend', rows }];
  }
  return [
    ...elements.slice(0, at),
    { type: 'spacer' },
    {
      type: 'heading', level: 1, text: 'Categories',
      meta: 'twelve checked categories',
      count: sectionCount(legendFindings(elements).length),
    },
    { type: 'legend', rows },
    { type: 'rule' },
    ...elements.slice(at),
  ];
}

/**
 * The input `headerRows` is drawn from. `lib/cli.mjs` renders the PDF with
 * `{ version }` only — the model it hands over carries the scan's date and
 * targets as the cover's own kv rows — so the header is derived from those
 * cover rows, first label found, exactly as the cover prints them. A caller
 * that holds the real report input (the tests) may pass `opts.input` and skip
 * the derivation; lib/html.mjs receives that same input, and both formats
 * therefore print the same document symbol.
 *
 * @param {object[]} elements  the report element union
 * @param {object} opts        `{ version, input? }`
 * @param {string} version     the version stamped into the footer
 * @returns {{date?: string, targets?: string[], version?: string}}
 */
function headerInputFor(elements, opts, version) {
  if (opts.input && typeof opts.input === 'object') return opts.input;
  const coverValue = (label) => {
    const row = elements.find(el => el && el.type === 'kv' && el.label === label);
    return row ? String(row.value) : '';
  };
  return {
    date: coverValue('Date'),
    // Round trip of the cover's own join: `Targets` prints as
    // `targets.join(' ')`, and splitting it back must not invent or drop a
    // target (an empty value yields [], keeping headerRows' fallback title).
    targets: coverValue('Targets').split(' ').filter(Boolean),
    version,
  };
}

/**
 * Render the report element union into a complete PDF file.
 *
 * @param {object[]} elements  banner | heading | paragraph | kv | bullets | spacer | rule | issue | legend
 * @param {object} [opts]      `{ version }` — stamped into the page footer;
 *                             `{ input }` — the report input headerRows is
 *                             drawn from, when the caller holds it (the
 *                             cover's kv rows are derived otherwise)
 * @returns {Buffer} the whole PDF, uncompressed streams, correct xref
 */
export function renderPdf(elements, opts = {}) {
  const version = typeof opts.version === 'string' ? opts.version : '';
  const pages = [];
  let ops = null;
  let y = 0;
  // The header block: two furniture rows of two cells, drawn at the top of
  // every page in `drawHeader` below. Derived once — it is the same document
  // on every page — and the input is kept because the footer's copyright year
  // is read from the same date.
  const furnitureInput = headerInputFor(elements, opts, version);
  const docHeader = headerRows(furnitureInput, version);
  const folded = elements.some(el => elementStrings(el).some(hasUnrepresentable));
  // The framing disclaimer leads the document, directly after the summary
  // banner when there is one, so a reader meets the boundary of the report
  // before they meet any finding in it.
  const bannerLead = elements[0]?.type === 'banner' ? 1 : 0;
  const framed = [
    ...elements.slice(0, bannerLead),
    { type: 'paragraph', text: FRAMING },
    { type: 'spacer' },
    ...elements.slice(bannerLead),
  ];
  // The legend is spliced in before layout so it flows, wraps and paginates
  // like any other element, in both detail modes. The fold note stays last:
  // it closes the document.
  const withLegend = insertLegend(framed);
  const laidOut = folded
    ? [...withLegend, { type: 'spacer' }, { type: 'rule' },
      { type: 'paragraph', text: FOLD_NOTE }]
    : withLegend;

  // The document header (D2): two rows of two cells, at the top of every page —
  // cover and continuations alike. The left cell is set from the left margin
  // and the right cell ends flush with the right edge of the measure, so the
  // boundary word sits opposite the tool name whatever their lengths are; the
  // left cell wraps into the space the right one leaves instead of running
  // underneath it. A rule closes the block, and the body starts below it.
  const HEADER_GAP = 12;
  function drawHeader() {
    let cursor = TOP;
    for (let i = 0; i < docHeader.length; i++) {
      const row = docHeader[i];
      const font = i === 0 ? 'F2' : 'F1';
      const size = i === 0 ? 9 : 8.5;
      const right = String(row.right || '');
      const rightW = right ? measure(right, font, size) : 0;
      const avail = Math.max(24, CONTENT_W - (right ? rightW + HEADER_GAP : 0));
      const lines = wrap(String(row.left), font, size, avail);
      // The baseline is taken before the wrap is drawn, because the right cell
      // belongs to the row's *first* line: a left cell that wrapped to three
      // lines must not drag the boundary word down with it.
      const firstBaseline = cursor - size * 0.82;
      // An all-whitespace left cell wraps to nothing. The row still spends a
      // line of height so its right cell has a baseline to sit on and the two
      // header rows cannot collapse into one another.
      if (lines.length === 0) cursor -= size + 3;
      for (const line of lines) {
        place(line, font, size, MARGIN, cursor - size * 0.82, BLACK);
        cursor -= size + 3;
      }
      if (right) place(right, font, size, MARGIN + CONTENT_W - rightW, firstBaseline, BLACK);
    }
    cursor -= 2;
    const ruleY = cursor - 10;
    ops.push(`q 0.5 w 0.62 0.62 0.62 RG ${n(MARGIN)} ${n(ruleY)}`
      + ` ${n(MARGIN + CONTENT_W)} ${n(ruleY)} l S Q`);
    y = ruleY - 10;
  }

  function newPage() {
    ops = [];
    pages.push(ops);
    drawHeader();
  }

  function need(height) {
    if (y - height < BOTTOM) newPage();
  }

  function place(line, font, size, x, baseline, colour) {
    ops.push(`${colour} rg BT /${font} ${n(size)} Tf ${n(x)} ${n(baseline)}`
      + ` Td ${pdfLiteral(line)} Tj ET`);
  }

  function drawBanner(el) {
    const fontSize = 11;
    const lead = 15;
    const pad = 4;
    const lines = wrap(String(el.text), 'F2', fontSize, CONTENT_W - 12);
    if (lines.length === 0) return;
    const height = lines.length * lead + pad;
    need(height);
    const rectTop = y;
    ops.push(`q ${bannerFill(el.kind)} rg ${n(MARGIN)} ${n(rectTop - height)}`
      + ` ${n(CONTENT_W)} ${n(height)} re f Q`);
    const capHeight = fontSize * 0.717;
    for (let i = 0; i < lines.length; i++) {
      const lineTop = rectTop - pad / 2 - i * lead;
      place(lines[i], 'F2', fontSize, MARGIN + 6, lineTop - lead / 2 - capHeight / 2, WHITE);
    }
    y = rectTop - height - 4;
  }

  function drawHeading(el) {
    const second = Number(el.level) === 2;
    const size = second ? 13 : 16;
    const lead = second ? 17 : 20;
    const before = second ? 9 : 12;
    const after = second ? 4 : 6;
    const title = String(el.text);
    const meta = String(el.meta || '');
    const count = String(el.count || '');
    // D6: the title carries no number of its own. The section's finding count
    // is set at the right edge of the content column, level with the title, so
    // a reader meets how many findings a section claims at the same moment as
    // its name and cannot mistake a count for a section number. The lane
    // metadata follows the title in the lighter grey.
    const countW = count ? measure(count, 'F1', 9) : 0;
    const metaW = meta ? measure(` ${meta}`, 'F1', 9) : 0;
    const room = CONTENT_W - (countW ? countW + 10 : 0) - metaW;
    const lines = wrap(title, 'F2', size, room);
    if (lines.length === 0) return;
    // Keep the heading with the first body line where the page allows it.
    if (y - (before + lines.length * lead + BODY_LEAD) < BOTTOM) newPage();
    y -= y >= TOP ? 0 : before;
    const baseline = y - size * 0.82;
    for (const line of lines) {
      place(line, 'F2', size, MARGIN, y - size * 0.82, BLACK);
      y -= lead;
    }
    if (meta) place(meta, 'F1', 9, MARGIN + measure(lines[0], 'F2', size) + 6, baseline, META_GREY);
    if (count) place(count, 'F1', 9, MARGIN + CONTENT_W - countW, baseline, META_GREY);
    y -= after;
  }

  function drawParagraph(el) {
    for (const line of wrap(String(el.text), 'F1', BODY, CONTENT_W)) {
      need(BODY_LEAD);
      place(line, 'F1', BODY, MARGIN, y - BODY * 0.82, BLACK);
      y -= BODY_LEAD;
    }
    y -= 4;
  }

  function drawKv(el) {
    const labelLines = wrap(String(el.label), 'F2', BODY, LABEL_COL);
    const valueLines = wrap(String(el.value), 'F1', BODY, CONTENT_W - LABEL_COL);
    const rows = Math.max(labelLines.length, valueLines.length);
    for (let i = 0; i < rows; i++) {
      need(BODY_LEAD);
      if (labelLines[i]) place(labelLines[i], 'F2', BODY, MARGIN, y - BODY * 0.82, BLACK);
      if (valueLines[i]) {
        place(valueLines[i], 'F1', BODY, MARGIN + LABEL_COL, y - BODY * 0.82, BLACK);
      }
      y -= BODY_LEAD;
    }
    y -= 2;
  }

  function drawBullets(el) {
    const items = Array.isArray(el.items) ? el.items : [];
    for (const item of items) {
      const lines = wrap(String(item), 'F1', BODY, CONTENT_W - BULLET_INDENT);
      for (let i = 0; i < lines.length; i++) {
        need(BODY_LEAD);
        const x = i === 0 ? MARGIN : MARGIN + BULLET_INDENT;
        const shown = i === 0 ? '\u2022 ' + lines[i] : lines[i];
        place(shown, 'F1', BODY, x, y - BODY * 0.82, BLACK);
        y -= BODY_LEAD;
      }
    }
    y -= 3;
  }

  function drawSpacer() {
    y -= 6;
    if (y < BOTTOM) y = BOTTOM;
  }

  function drawRule() {
    need(8);
    const at = y - 4;
    ops.push(`q 0.5 w 0.62 0.62 0.62 RG ${n(MARGIN)} ${n(at)} m`
      + ` ${n(MARGIN + CONTENT_W)} ${n(at)} l S Q`);
    y -= 8;
  }

  // D13's cap block, in one bordered band so a capped section cannot be read
  // as a section that simply ended. The three lines are lib/report.mjs
  // `capLines`, printed verbatim: the count withheld, the promise that
  // nothing was discarded, and the exact command that lists the rest.
  function drawCap(el) {
    const [head, promise, command] = capLines({
      shown: Number(el.shown), total: Number(el.total), command: String(el.command),
    });
    const inner = CONTENT_W - 16;
    const bold = wrap(head, 'F2', BODY, inner);
    const prose = wrap(promise, 'F1', BODY, inner);
    const code = wrap(command, 'F2', BODY - 1, inner);
    const height = 10 + bold.length * BODY_LEAD + 5 + prose.length * BODY_LEAD
      + 5 + code.length * (BODY_LEAD - 1) + 12;
    // A band taller than a page could never be drawn whole; in that case the
    // page is turned instead of squeezing the box into the space that is left.
    if (height <= TOP - BOTTOM) need(height);
    else newPage();
    const top = y - 4;
    let cursor = top - 10;
    for (const line of bold) {
      place(line, 'F2', BODY, MARGIN + 8, cursor, BLACK);
      cursor -= BODY_LEAD;
    }
    cursor -= 5;
    for (const line of prose) {
      place(line, 'F1', BODY, MARGIN + 8, cursor, BLACK);
      cursor -= BODY_LEAD;
    }
    cursor -= 5;
    for (const line of code) {
      place(line, 'F2', BODY - 1, MARGIN + 8, cursor, BLACK);
      cursor -= BODY_LEAD - 1;
    }
    const bottom = cursor - 7;
    ops.push(`q 0.5 w 0.62 0.62 0.62 RG ${n(MARGIN)} ${n(bottom)} ${n(CONTENT_W)}`
      + ` ${n(top - bottom)} re S Q`);
    y = bottom - 8;
  }

  // One grouped issue: the severity banner, the marker row (shaded code
  // swatch, the category's own name as the text label, and the group's size
  // only when it is more than one occurrence), then exactly the block
  // pushFinding draws — Current, Should be, the explanation, the audit
  // marker, the heuristic note, the six provenance rows — and the structured
  // Occurrences list: one File / Location / Content / Should be block per
  // hit, separated by rules, every value wrapped within the measure. The
  // banner already carries ` · line L:C` when the group holds a single
  // occurrence, so no location is added here.
  function drawIssue(el) {
    drawBanner({ kind: el.kind, text: el.text });

    const count = Number(el.count);
    const showCount = count > 1;
    need(16);
    const rowTop = y;
    const baseline = rowTop - 10;
    // D11: the row's marks are drawn, not written. Severity artwork first,
    // then the category's own artwork, then the coloured swatch carrying the
    // category's short code — D12's order, and the reason colour is never the
    // only signal: two shapes and a code all say what the row is before a
    // word is read. The artwork is set in black on white here rather than
    // knocked out of the banner, because these marks knock their counters out
    // in white and would erase themselves on a dark field.
    const iconSize = 9;
    const iconY = rowTop - iconSize - 1;
    const sevShapes = severityIcon(el.kind);
    if (sevShapes) ops.push(pdfIcon(sevShapes, { x: MARGIN, y: iconY, size: iconSize }));
    const catShapes = el.category ? categoryIcon(el.category) : null;
    if (catShapes) ops.push(pdfIcon(catShapes, { x: MARGIN + 11, y: iconY, size: iconSize }));
    const swatchX = MARGIN + 22;
    const colour = typeof el.colour === 'string' && el.colour !== ''
      ? rgbFill(el.colour) : '';
    if (colour) {
      ops.push(`q ${colour} rg ${n(swatchX)} ${n(rowTop - 12.6)} 26 11 re f Q`);
    }
    const marker = String(el.marker || '');
    if (marker) {
      const codeWidth = measure(marker, 'F2', 8);
      place(marker, 'F2', 8, swatchX + (26 - codeWidth) / 2, baseline,
        colour ? WHITE : BLACK);
    }
    // A count is shown only when it is greater than one: a group of one is
    // not a summary, and "1 occurrence" beside a lone finding reads as though
    // something was counted that was not there.
    const countText = showCount ? `${count} occurrences` : '';
    const countWidth = countText ? measure(countText, 'F1', BODY) : 0;
    const nameX = MARGIN + 54;
    const nameWidth = MARGIN + CONTENT_W - countWidth - 8 - nameX;
    const name = wrap(String(el.category || ''), 'F2', BODY, Math.max(40, nameWidth))[0] || '';
    if (name) place(name, 'F2', BODY, nameX, baseline, BLACK);
    if (countText) {
      place(countText, 'F1', BODY, MARGIN + CONTENT_W - countWidth, baseline, BLACK);
    }
    y = rowTop - 16;

    drawKv({ type: 'kv', label: 'Current', value: el.current });
    drawKv({ type: 'kv', label: 'Should be', value: el.should });
    drawParagraph({ type: 'paragraph', text: el.message });
    if (el.audit) drawKv({ type: 'kv', label: 'Audit', value: el.audit });
    if (el.heuristic) {
      drawParagraph({ type: 'paragraph', text: 'Heuristic finding — routed to review.' });
    }
    if (Array.isArray(el.provenance)) {
      for (const row of el.provenance) {
        drawKv({ type: 'kv', label: row.label, value: row.value });
      }
    }
    const occurrences = Array.isArray(el.occurrences) ? el.occurrences : [];
    if (occurrences.length) {
      drawHeading({ type: 'heading', level: 2, text: 'Occurrences' });
      for (const occurrence of occurrences) {
        drawRule();
        // A PDF-derived finding carries the source page; a plain text finding
        // has no page and prints the position alone.
        const location = Number.isInteger(occurrence.pdfPage)
          ? `${occurrence.line}:${occurrence.column} · page ${occurrence.pdfPage}`
          : `${occurrence.line}:${occurrence.column}`;
        drawKv({ type: 'kv', label: 'File', value: occurrence.file });
        drawKv({ type: 'kv', label: 'Location', value: location });
        drawKv({ type: 'kv', label: 'Content', value: occurrence.content });
        drawKv({ type: 'kv', label: 'Should be', value: occurrence.should });
      }
    }
  }

  // The category legend: four column headers, then one row per category —
  // shaded code swatch, the category's own name (the text label, so colour
  // and shape are never the only signal), what the category covers, and how
  // many findings fired it (zero-count rows included: a legend that dropped
  // them would read as though those categories do not exist).
  function drawLegend(el) {
    const rows = Array.isArray(el.rows) ? el.rows : [];
    // D11: the row leads with the category's own artwork, then the coloured
    // swatch carrying its short code, then its name — the same order the
    // finding rows use, so the legend teaches a mark the report actually
    // draws rather than one it never prints.
    const ICON = 9;
    const SWATCH_X = MARGIN + ICON + 2;
    const NAME_X = MARGIN + 41;
    const INTENT_X = MARGIN + 146;
    const RIGHT = MARGIN + CONTENT_W;
    const NAME_W = INTENT_X - NAME_X - 8;
    const INTENT_W = RIGHT - INTENT_X - 46;
    const ROW_H = 14;
    need(ROW_H + 16);
    const headerBaseline = y - 9 * 0.82;
    place('Marker', 'F2', 9, MARGIN, headerBaseline, BLACK);
    place('Category', 'F2', 9, NAME_X, headerBaseline, BLACK);
    place('What it covers', 'F2', 9, INTENT_X, headerBaseline, BLACK);
    const findingsWidth = measure('Findings', 'F2', 9);
    place('Findings', 'F2', 9, RIGHT - findingsWidth, headerBaseline, BLACK);
    y -= 16;
    for (const row of rows) {
      need(ROW_H);
      const rowTop = y;
      const baseline = rowTop - 10;
      // The artwork is set in black on white: these marks knock their
      // counters out in white, so a coloured or reversed field would erase
      // them. An unknown category simply has no icon here — its code and its
      // name still say what it is, which is what keeps the row readable.
      const shapes = categoryIcon(row.category);
      if (shapes) {
        ops.push(pdfIcon(shapes, { x: MARGIN, y: rowTop - ICON - 1, size: ICON }));
      }
      ops.push(`q ${rgbFill(row.colour)} rg ${n(SWATCH_X)} ${n(rowTop - 12.6)}`
        + ` 26 11 re f Q`);
      const code = String(row.code || '');
      if (code) {
        const codeWidth = measure(code, 'F2', 8);
        place(code, 'F2', 8, SWATCH_X + (26 - codeWidth) / 2, baseline, WHITE);
      }
      const name = wrap(String(row.category || ''), 'F2', BODY, NAME_W)[0] || '';
      if (name) place(name, 'F2', BODY, NAME_X, baseline, BLACK);
      const intent = wrap(String(row.intent || ''), 'F1', 9, INTENT_W)[0] || '';
      if (intent) place(intent, 'F1', 9, INTENT_X, baseline, BLACK);
      const countText = String(row.count ?? 0);
      place(countText, 'F1', 9, RIGHT - measure(countText, 'F1', 9), baseline, BLACK);
      y = rowTop - ROW_H;
    }
  }

  newPage();
  for (const el of laidOut) {
    const kind = el && typeof el === 'object' ? el.type : undefined;
    switch (kind) {
      case 'banner': drawBanner(el); break;
      case 'heading': drawHeading(el); break;
      case 'paragraph': drawParagraph(el); break;
      case 'kv': drawKv(el); break;
      case 'bullets': drawBullets(el); break;
      case 'spacer': drawSpacer(); break;
      case 'rule': drawRule(); break;
      case 'issue': drawIssue(el); break;
      case 'cap': drawCap(el); break;
      case 'legend': drawLegend(el); break;
      default: throw new Error('unknown element type: ' + String(kind));
    }
  }

  // Second pass: the footer needs the final page count, so the three cells —
  // D3's page position (the renderer is the only place that knows how many
  // pages it drew), the copyright with its year read from the scan's date, and
  // the repository address — are stamped onto the finished pages before
  // serialization. Each cell is placed at its own edge of the measure: the
  // left cell from the left margin, the centre cell on the middle of it, the
  // right cell ending at the right margin. They read as three columns rather
  // than as one centred pile, which is what the plan's mockup draws and what
  // the footer cells are named for.
  const total = pages.length;
  const baseline = FOOTER_Y;
  for (let i = 0; i < total; i++) {
    const cells = footerCells({ date: furnitureInput.date, page: i + 1, pages: total });
    const draws = [
      { text: cells.left, x: MARGIN },
      { text: cells.centre, x: MARGIN + (CONTENT_W - measure(cells.centre, 'F1', FOOTER_SIZE)) / 2 },
      { text: cells.right, x: MARGIN + CONTENT_W - measure(cells.right, 'F1', FOOTER_SIZE) },
    ];
    for (const d of draws) {
      pages[i].push(`${FOOTER_GREY} rg BT /F1 ${n(FOOTER_SIZE)} Tf ${n(d.x)} ${n(baseline)}`
        + ` Td ${pdfLiteral(d.text)} Tj ET`);
    }
  }

  return serialize(pages);
}
