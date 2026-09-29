// Category markers — the vocabulary the report legend is built from.
//
// The twelve entries are exactly the categories in rules/catalogue.json today.
// Nothing here invents a taxonomy: an invented category would be a claim the
// tool cannot source, and a legend is the one place a reader would reasonably
// take a category list as the tool's own vocabulary. When the catalogue gains a
// category this list must gain it too — tests/audit-html-report.mjs asserts the
// two stay equal, so a new category cannot be shipped silently.
//
// Three surfaces, three degradations, one rule (PHASE-9-PLAN §5): the PDF is
// set in WinAnsi Helvetica and has no icon glyphs or emoji, so a marker there
// is the short code plus shading; HTML draws the marker as inline SVG; the
// terminal prints text. On every surface the category's own name is printed
// beside its marker, because colour and shape are never the only signal — the
// report has to read the same in greyscale and to a screen reader.
//
// The colours are decoration. They are deliberately not the severity palette
// lib/pdf.mjs draws banners with: severity is what a banner means, category is
// what kind of rule fired, and one hue doing two jobs is how a reader misreads
// an error as a grammar problem.

/** The twelve categories, in the order the plan lists them. */
export const CATEGORY_LEGEND = [
  { category: 'spelling', code: 'SP', colour: '#1f6fa8', intent: 'orthography' },
  { category: 'grammar', code: 'GR', colour: '#d2691e', intent: 'high-precision grammar' },
  { category: 'numerals', code: 'NU', colour: '#2e8b57', intent: 'dates, ranges, figures' },
  { category: 'terminology', code: 'TM', colour: '#7b4397', intent: 'institutional terminology' },
  { category: 'register', code: 'RG', colour: '#c0392b', intent: 'voice, tone, promotion, threat posture' },
  { category: 'agent-review', code: 'AR', colour: '#b8860b', intent: 'judgement calls routed to review' },
  { category: 'hate-speech', code: 'HS', colour: '#17767b', intent: 'dehumanising and collective framing' },
  { category: 'discriminatory', code: 'DS', colour: '#b03a78', intent: 'demeaning and discriminatory wording' },
  { category: 'diplomacy', code: 'DP', colour: '#7a5230', intent: 'contested territorial status' },
  { category: 'publishing', code: 'PB', colour: '#4a5560', intent: 'page title, meta, headings, cards' },
  { category: 'accessibility', code: 'AC', colour: '#5b7c20', intent: 'labelling and form controls' },
  { category: 'security', code: 'SC', colour: '#4b3f8f', intent: 'bounded source-code policies' },
];

const BY_CATEGORY = new Map(CATEGORY_LEGEND.map(entry => [entry.category, entry]));

/**
 * A finding's marker, or `null` for a category the catalogue does not carry.
 * Callers fall back to the bare category name rather than inventing a code —
 * a code the legend never defined would be a marker with no entry behind it.
 */
export function categoryMarker(category) {
  return BY_CATEGORY.get(category) || null;
}

/**
 * The legend for one scan: all twelve rows, in catalogue order, each with the
 * number of findings that fired it. Categories absent from the scan are listed
 * with a count of zero rather than dropped — a legend that omits part of its
 * own vocabulary reads as though the missing categories do not exist.
 *
 * Counts are over the findings handed in and nothing else, so the rows sum to
 * exactly the number of findings a caller already holds.
 *
 * @param {object[]} findings  annotated findings
 * @returns {Array<{category: string, code: string, colour: string, intent: string, count: number}>}
 */
export function legendRows(findings) {
  const counts = new Map(CATEGORY_LEGEND.map(entry => [entry.category, 0]));
  for (const finding of findings || []) {
    const category = finding && finding.category;
    if (counts.has(category)) counts.set(category, counts.get(category) + 1);
    // A finding whose category is not in the catalogue (an audit rule that
    // carries its own) is not counted here: the legend is the catalogue's
    // vocabulary, and folding an outside category into it would be the
    // invention the legend exists to avoid.
  }
  return CATEGORY_LEGEND.map(entry => ({ ...entry, count: counts.get(entry.category) }));
}
