// Structural verification for lib/pdf.mjs — written first, per the Phase 3
// contract, because xref correctness is the named risk of the hand-rolled
// writer.
//
// The suite builds synthetic element lists, renders them, then reads the
// bytes back: magic and end marker, xref offsets against `N 0 obj`, page and
// font objects, text extraction from the uncompressed `Tj` operands,
// transliteration, literal-string escaping, a footer on every page, an
// unbroken 600-character token, and byte-identical determinism. Line widths
// are re-measured against an independent AFM table so the wrap logic cannot
// drift. Only node:assert and the module under test are used.

import assert from 'node:assert/strict';
import { renderPdf } from '../lib/pdf.mjs';

// --- page geometry (mirrors the contract, restated independently) ----------

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 54;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const LABEL_COL = 84;

// --- independent AFM width tables (units per 1000 em) ----------------------
// Helvetica and Helvetica-Bold, ASCII 32..126 with the standard Adobe values,
// Latin-1 160..255; anything else falls back to 0.5 em, as the contract sets.

const REG_ASCII = [
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

const BOLD_ASCII = [
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

const REG_LATIN1 = [
  278, 333, 556, 556, 556, 556, 260, 556, // 160..167 nbsp ¡ ¢ £ ¤ ¥ ¦ §
  333, 737, 370, 556, 584, 333, 737, 333, // 168..175 ¨ © ª « ¬ (soft) ® ¯
  400, 584, 333, 333, 333, 556, 537, 278, // 176..183 ° ± ² ³ ´ µ ¶ ·
  333, 333, 365, 556, 834, 834, 834, 611, // 184..191 ¸ ¹ º » ¼ ½ ¾ ¿
  667, 667, 667, 667, 667, 667, 1000, 722, // 192..199 À Á Â Ã Ä Å Æ Ç
  667, 667, 667, 667, 278, 278, 278, 278, // 200..207 È É Ê Ë Ì Í Î Ï
  722, 722, 778, 778, 778, 778, 584, 778, // 208..215 Ð Ñ Ò Ó Ô Õ Ö ×
  722, 722, 722, 722, 667, 667, 611, 556, // 216..223 Ø Ù Ú Û Ü Ý Þ ß
  556, 556, 556, 556, 556, 556, 889, 500, // 224..231 à á â ã ä å æ ç
  556, 556, 556, 556, 278, 278, 278, 278, // 232..239 è é ê ë ì í î ï
  556, 556, 556, 556, 556, 556, 556, 584, // 240..247 ð ñ ò ó ô õ ö ÷
  611, 556, 556, 556, 556, 500, 556, 500, // 248..255 ø ù ú û ü ý þ ÿ
];

const BOLD_LATIN1 = [
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
    return (bold ? BOLD_ASCII : REG_ASCII)[codePoint - 32];
  }
  if (codePoint >= 160 && codePoint <= 255) {
    return (bold ? BOLD_LATIN1 : REG_LATIN1)[codePoint - 160];
  }
  return 500;
}

// Spot locks: the ASCII widths must be the real AFM values, not a guess.
assert.equal(afmWidth(0x20, false), 278, 'space is 278 in Helvetica');
assert.equal(afmWidth(0x69, false), 222, 'i is 222 in Helvetica');
assert.equal(afmWidth(0x57, false), 944, 'W is 944 in Helvetica');
assert.equal(afmWidth(0x69, true), 278, 'i is 278 in Helvetica-Bold');
assert.equal(afmWidth(0x57, true), 944, 'W is 944 in Helvetica-Bold');

function lineWidth(text, font, size) {
  let width = 0;
  for (const ch of text) {
    width += (afmWidth(ch.codePointAt(0), font === 'F2') * size) / 1000;
  }
  return width;
}

// --- extraction from the uncompressed content streams ------------------------

const LINE_RE = /\/(F[123]) ([0-9.]+) Tf ([0-9.-]+) ([0-9.-]+) Td \(((?:\\[\s\S]|[^\\()])*)\) Tj/g;

function unpdf(operand) {
  return operand.replace(/\\([()\\])/g, '$1');
}

function extractLines(pdf) {
  const out = [];
  for (const m of pdf.toString('latin1').matchAll(LINE_RE)) {
    out.push({
      font: m[1],
      size: Number(m[2]),
      x: Number(m[3]),
      y: Number(m[4]),
      text: unpdf(m[5]),
    });
  }
  return out;
}

function streamBodies(pdf) {
  return [...pdf.toString('latin1').matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => m[1]);
}

// --- structural validation ---------------------------------------------------

function validateStructure(pdf, label, minPages) {
  assert(Buffer.isBuffer(pdf), `${label}: renderPdf returns a Buffer`);
  const s = pdf.toString('latin1');

  assert(s.startsWith('%PDF-1.4\n'), `${label}: file starts with the PDF 1.4 magic`);
  assert(s.endsWith('%%EOF\n'), `${label}: file ends with the end-of-file marker line`);

  const startxref = s.match(/startxref\n(\d+)\n%%EOF\n$/);
  assert(startxref, `${label}: startxref present before EOF`);
  const xrefOffset = Number(startxref[1]);
  assert.equal(s.slice(xrefOffset, xrefOffset + 4), 'xref',
    `${label}: startxref offset points at the xref table`);

  const header = s.slice(xrefOffset).match(/^xref\n0 (\d+)\n/);
  assert(header, `${label}: xref subsection header present`);
  const slots = Number(header[1]);
  const entriesBase = xrefOffset + header[0].length;
  assert(s.startsWith('0000000000 65535 f \n', entriesBase),
    `${label}: free head entry occupies exactly 20 bytes`);

  for (let i = 1; i < slots; i++) {
    const entry = s.slice(entriesBase + i * 20, entriesBase + (i + 1) * 20);
    const m = entry.match(/^(\d{10}) (\d{5}) ([nf]) \n$/);
    assert(m, `${label}: xref entry ${i} is a 20-byte record: ${JSON.stringify(entry)}`);
    if (m[3] === 'n') {
      const offset = Number(m[1]);
      assert(s.startsWith(`${i} 0 obj\n`, offset),
        `${label}: xref entry ${i} offset ${offset} points at "${i} 0 obj"`);
    }
  }

  assert.equal((s.match(/^\d+ 0 obj\n/gm) || []).length, slots - 1,
    `${label}: exactly one object per xref slot`);
  assert(s.includes(`trailer\n<< /Size ${slots} /Root 1 0 R >>`),
    `${label}: trailer names size and root`);
  assert(s.includes('/MediaBox [0 0 595.28 841.89]'),
    `${label}: A4 portrait media box`);
  assert(s.includes('/Type /Catalog'), `${label}: document root object declared`);

  const pages = (s.match(/\/Type \/Page(?!s)/g) || []).length;
  assert(pages >= minPages, `${label}: at least ${minPages} page object(s), found ${pages}`);
  assert.equal(streamBodies(pdf).length, pages,
    `${label}: one uncompressed content stream per page`);

  for (const baseFont of ['/BaseFont /Helvetica', '/BaseFont /Helvetica-Bold',
    '/BaseFont /Helvetica-Oblique']) {
    assert(s.includes(baseFont), `${label}: declares ${baseFont.slice(11)}`);
  }
  assert.equal((s.match(/\/Encoding \/WinAnsiEncoding/g) || []).length, 3,
    `${label}: all three fonts use WinAnsi encoding`);
  for (const ref of ['/F1 3 0 R', '/F2 4 0 R', '/F3 5 0 R']) {
    assert(s.includes(ref), `${label}: page resources reference ${ref.slice(0, 3)}`);
  }

  for (const body of streamBodies(pdf)) {
    for (let i = 0; i < body.length; i++) {
      const code = body.charCodeAt(i);
      assert(code >= 32 || code === 10,
        `${label}: content streams carry no control bytes (found ${code})`);
    }
  }
  return s;
}

function assertLinesFit(pdf, label) {
  const lines = extractLines(pdf);
  assert(lines.length > 0, `${label}: extraction finds drawn lines`);
  for (const line of lines) {
    let box = CONTENT_W;
    if (line.x === MARGIN + LABEL_COL) box = CONTENT_W - LABEL_COL;
    else if (line.x === MARGIN && line.font === 'F2' && line.size === 10.5) box = LABEL_COL;
    const width = lineWidth(line.text, line.font, line.size);
    assert(width <= box + 0.01,
      `${label}: line fits its column (${width.toFixed(2)} > ${box}): ${line.text.slice(0, 48)}`);
  }
  return lines;
}

// --- fixture: enough element variety and length for >= 2 pages ---------------

const SENT_A = 'The committee reviewed the draft text clause by clause and noted each point for the record.';
const SENT_B = 'Delegates welcomed the clarification on procedure and asked the secretariat to circulate the revised version before the next meeting.';
const SENT_C = 'The secretariat will update the annex and circulate it to all participants once the corrections are approved.';
const SENT_D = 'Several delegations asked for a plain explanation of the timetable and for the supporting material in good time.';

const paragraphSeed = SENT_A + ' ' + SENT_B + ' ' + SENT_C + ' ' + SENT_D + ' ';
const longOne = paragraphSeed.repeat(8);
const longTwo = paragraphSeed.repeat(8);
const longThree = (SENT_B + ' ' + SENT_D + ' ' + SENT_A + ' ' + SENT_C + ' ').repeat(8);

const elements = [
  { type: 'banner', kind: 'title', text: 'UN Editorial Review' },
  { type: 'kv', label: 'Version', value: '9.9.9' },
  { type: 'kv', label: 'Date', value: '27 September 2026' },
  { type: 'spacer' },
  { type: 'paragraph', text: 'The phrase ‘smart’ – ok… appears in the draft.' },
  { type: 'paragraph', text: 'The quoted span a (b) c stays whole.' },
  { type: 'heading', level: 1, text: 'Findings by file' },
  { type: 'heading', level: 2, text: 'docs/draft-note.md' },
  { type: 'banner', kind: 'error', text: 'error · line 12:5' },
  { type: 'kv', label: 'Current', value: 'a (b) c' },
  { type: 'kv', label: 'Should be', value: 'a parenthetical in plain form' },
  { type: 'bullets', items: ['first bullet point', 'second bullet point'] },
  { type: 'rule' },
  { type: 'banner', kind: 'warning', text: 'warning · line 20:1' },
  { type: 'paragraph', text: longOne },
  { type: 'banner', kind: 'note', text: 'note · line 30:2' },
  { type: 'paragraph', text: longTwo },
  { type: 'heading', level: 1, text: 'Review queue' },
  { type: 'paragraph', text: longThree },
];

// --- 1-3: magic, xref, pages, fonts ------------------------------------------

const opts = { version: '9.9.9' };
const pdf = renderPdf(elements, opts);
const s = validateStructure(pdf, 'report', 2);

// Severity and banner colours exactly as the contract fixes them.
for (const colour of ['0.216 0.278 0.31 rg', '0.776 0.157 0.157 rg',
  '0.902 0.318 0 rg', '0.082 0.396 0.753 rg', '1 1 1 rg', '0 0 0 rg']) {
  assert(s.includes(colour), `fill colour "${colour}" appears in the streams`);
}
assert(s.includes('/F1 10.5 Tf'), 'body text renders at 10.5 pt');
assert(s.includes('/F2 16 Tf'), 'level 1 headings render at 16 pt bold');
assert(s.includes('/F2 13 Tf'), 'level 2 headings render at 13 pt bold');
assert(s.includes(' re f '), 'banners draw a filled rectangle');
assert(s.includes('0.5 w '), 'rules draw a half-point line');

// --- 4: extraction and transliteration ---------------------------------------

const lines = assertLinesFit(pdf, 'report');
const texts = lines.map((line) => line.text);
assert(texts.some((t) => t.includes('UN Editorial Review')),
  'title banner text round-trips through extraction');
assert(texts.some((t) => t.includes("'smart' \u0096 ok...")),
  'curly quotes and the ellipsis fold to ASCII; the en dash keeps WinAnsi byte 0x96');
assert(!texts.some((t) => t.includes("'smart' - ok...")),
  'the en dash must never fold to a plain hyphen (that hid UE-NU002\u2019s defect)');
assert(!pdf.includes(Buffer.from('‘', 'utf8')), 'no raw left quote bytes in the file');
assert(!texts.some((t) => /[‘’“”–—…]/.test(t)),
  'no typographic character survives in any extracted line');
assert(texts.some((t) => t.startsWith('• ') || t.startsWith('\u0095 ')),
  'bullet items render with the WinAnsi bullet glyph');
assert(lines.some((line) => line.x === MARGIN + LABEL_COL),
  'key-value values start in the 84 pt label column');

// --- 5: literal-string escaping round-trips ---------------------------------

assert(texts.some((t) => t.includes('a (b) c')),
  'a paragraph containing "a (b) c" extracts back unchanged');
assert(s.includes('a \\(b\\) c'), 'parentheses are escaped inside the raw literal');

// --- 6: footer on every page -------------------------------------------------

const bodies = streamBodies(pdf);
assert(bodies.length >= 2, `fixture renders at least two pages, got ${bodies.length}`);
bodies.forEach((body, i) => {
  const footer = `un-editorial-check 9.9.9 - page ${i + 1}/${bodies.length}`
    + ' - report only; findings are not changed by this report.';
  assert(body.includes(footer), `page ${i + 1} stream carries its footer`);
});
assert(s.includes('page 1/'), 'page 1 footer stamp present');
assert(s.includes('page 2/'), 'page 2 footer stamp present');

// --- 7: one unbroken 600-character token -------------------------------------

const stress = renderPdf([
  { type: 'paragraph', text: 'A long token follows: ' + 'x'.repeat(600) + ' end of line.' },
], opts);
validateStructure(stress, 'stress', 1);
const stressLines = assertLinesFit(stress, 'stress');
assert(stressLines.map((line) => line.text).join('').includes('x'.repeat(600)),
  'the long token survives extraction intact across the cut lines');

// --- 8: determinism ----------------------------------------------------------

assert.equal(Buffer.compare(renderPdf(elements, opts), pdf), 0,
  'the same input renders a byte-identical Buffer');

// --- extras: unknown types and the default version --------------------------

assert.throws(() => renderPdf([{ type: 'mystery' }]), /unknown element type/,
  'an unknown element type is rejected with the contract error');

const bare = renderPdf([{ type: 'paragraph', text: 'A short closing line.' }]);
validateStructure(bare, 'bare', 1);
assert(bare.toString('latin1').includes('un-editorial-check - page 1/1 -'),
  'an empty version still produces a well-formed footer');

console.log('ok — pdf structure: magic, xref offsets, pages, fonts, extraction, '
  + 'transliteration, escaping, footers, stress token, determinism');
