// Self-contained HTML report renderer — the first-class peer to the PDF,
// dispatched from --report on the path extension (.html). Input is the report
// model contract shared with lib/report.mjs: an object of { version, date,
// targets, profiles, filesCount, findings, sources }.
//
// The renderer is lane-aware: annotated findings are grouped into the five
// output lanes in lib/output.mjs order (deterministic, heuristic review,
// harmful-discriminatory, diplomacy, audit) with quoted material reported in
// its own section and counted on its own, and the audits section renders only
// when the run produced audit findings — which requires audits to have been
// requested. Every finding carries the six lane fields (lane, source, profile,
// confidence, limitation, action) beside the current-to-should-be block
// mirrored from lib/report.mjs, and the PDF's review queue is carried over
// unchanged, so nothing the PDF shows is dropped here.
//
// Contract, test-locked in tests/audit-html-report.mjs:
//   * pure — no file system, no process and no clock: identical input always
//     produces byte-identical HTML, so two runs can be diffed and hashed. The
//     scan date arrives with the input, exactly as lib/report.mjs documents;
//   * zero dependencies and no network: one file, one inline style block, no
//     scripts and no external fonts, assets or stylesheets;
//   * every piece of user text and every path passes through escapeControl
//     (lib/output.mjs) and then through HTML escaping, so a file containing
//     markup never becomes executable output;
//   * a clean scan states exactly "No findings under the enabled, documented
//     local rules." and that sentence never appears on a report carrying a
//     finding — the same rule lib/output.mjs applies to the text report.
//
// Since Phase 9 the renderer takes `opts.detail`: 'grouped' (the default)
// collapses findings that would render identically into one issue block whose
// occurrence table lists every place they were found — the groups come from
// lib/report.mjs groupIssues, so this format and the PDF agree on what one
// issue is — while 'full' is the pre-Phase-9 layout, one card per finding.
// The switch is presentation only: summary counts are computed from the
// findings before either layout runs. Two surfaces appear in both modes: the
// twelve-row category legend (lib/legend.mjs, marker code and category name
// printed together so colour is never the only signal) and the UN-style
// document furniture (lib/furniture.mjs), whose header reads EDITORIAL
// REVIEW and never UNITED NATIONS — claim row 22 promises the report never
// presents itself as United Nations endorsement.
//
// Framing wording is reused from the shipped surfaces: the three legend
// paragraphs of lib/report.mjs, the footer fragment of lib/pdf.mjs and the
// disclaimer row of docs/CLAIM-EVIDENCE-AUDIT.md, so the HTML never promises
// more than the PDF does.

import { annotate, countLanes, escapeControl, LANE_NAMES, summarize } from './output.mjs';
import { groupIssues } from './report.mjs';
import { categoryMarker, legendRows } from './legend.mjs';
import { footerCells, headerRows, TITLE } from './furniture.mjs';

// Canonical clean-run sentence, restated from lib/output.mjs renderText (the
// text report prints it when no section renders; this report prints it when
// the scan produced no finding at all).
const CLEAN = 'No findings under the enabled, documented local rules.';

// Section titles for the five lanes, in report order. The canonical lane ids
// stay visible in the lane counts paragraph and in every finding's Lane row.
const LANE_TITLES = {
  deterministic: 'Deterministic violations',
  'heuristic-review': 'Heuristic editorial review',
  'harmful-discriminatory': 'Harmful-discriminatory review',
  diplomacy: 'Diplomatic sensitivity',
  audit: 'Optional audits',
};

// Severity presentation, mirrored from lib/report.mjs: info and anything
// unexpected read as notes.
const SEVERITY_LABEL = { error: 'ERROR', warning: 'WARNING', info: 'NOTE' };

// Block wording, mirrored byte for byte from lib/report.mjs: a finding with no
// captured copy must not show a developer placeholder, and the fixable marker
// separates --fix-able findings from rewrites that need a human or an agent.
const NO_CONTEXT = '(not applicable)';
const MANUAL_SUFFIX = ' — manual / agent rewrite; not --fix-able';
const FIXABLE_SUFFIX = ' — --fix-able';

// The three legend paragraphs, verbatim from lib/report.mjs so the framing of
// both report formats cannot drift apart.
const LEGEND_DETERMINISTIC = 'Deterministic finding: the wording proves the defect.';
const LEGEND_HEURISTIC = 'Heuristic finding: routed to review; this report never asserts that a claim is true or false, or that any legal threshold is met.';
const LEGEND_REPORT_ONLY = 'This report changes nothing; re-run the checker to verify corrections.';
// Framing disclaimer, worded from row 22 of docs/CLAIM-EVIDENCE-AUDIT.md (the
// row states it without a closing full stop, so the sentence mark below is the
// only addition). It is the sanctioned way of saying all three of the things
// the report must not be, without ever writing one of the banned phrases.
const FRAMING = 'The report never presents itself as verification of facts, legal opinion or United Nations endorsement.';
// Review-queue excerpt limit, mirrored from lib/report.mjs: a cut mid-word with
// no mark reads as a typo, so anything past the limit is marked with "..." and
// anything at or under it stands whole.
const QUEUE_EXCERPT = 80;

// Inline style only: system font stacks, no @import, no url(), no external
// asset of any kind. Static, so it contributes nothing to run-to-run variance.
const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; padding: 2rem 1rem; background: #f4f4f2; color: #1c1c1c;
  font-family: Georgia, "Times New Roman", serif; line-height: 1.5; }
main { max-width: 54rem; margin: 0 auto; padding: 2rem; background: #ffffff;
  border: 1px solid #d9d6d1; }
h1 { margin: 0 0 1rem; font-size: 1.6rem; }
h2 { font-size: 1.2rem; margin: 2rem 0 0.5rem; padding-bottom: 0.25rem;
  border-bottom: 2px solid #2f4858; }
h3 { font-size: 0.95rem; margin: 0.2rem 0 0.7rem; overflow-wrap: anywhere; }
dl { display: grid; grid-template-columns: 11rem minmax(0, 1fr);
  gap: 0.2rem 0.8rem; margin: 0 0 1rem; }
dt { font-weight: 700; }
dd { margin: 0; overflow-wrap: anywhere; }
hr { border: 0; border-top: 1px solid #c9c5be; margin: 1rem 0; }
.counts, .lanes { margin: 0.25rem 0; font-size: 0.9rem;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; }
.framing { margin: 1.5rem 0; padding: 0.75rem 1rem; background: #f7f5f2;
  border-left: 4px solid #2f4858; }
.framing p { margin: 0.35rem 0; }
.disclaimer { font-weight: 700; }
.clean { padding: 1rem; background: #e8f2e8; border: 1px solid #7fa87f;
  font-weight: 700; }
article.finding { margin: 1rem 0; padding: 0.9rem 1rem; background: #fbfaf8;
  border: 1px solid #ddd8d0; border-left: 5px solid #5c5850; }
article.severity-error { border-left-color: #c62828; }
article.severity-warning { border-left-color: #e07b00; }
article.severity-note { border-left-color: #1565c0; }
article dl { margin-bottom: 0.6rem; }
article dl.fields { grid-template-columns: 7rem minmax(0, 1fr); margin-bottom: 0; }
.message, .heuristic { margin: 0.3rem 0 0.7rem; }
.doc-header { margin: 0 0 1.5rem; padding: 0.6rem 0.9rem; background: #f7f5f2;
  border: 1px solid #2f4858; }
/* Each header row is two cells pushed to the edges, exactly as the plan's
   mockup draws them: the left cell reads from the left margin and the right
   cell from the right, so the boundary word sits against the tool name rather
   than wherever the text happens to run out. */
.doc-header p { display: flex; justify-content: space-between; gap: 0.5rem 1rem;
  margin: 0.15rem 0; font-size: 0.85rem; letter-spacing: 0.04em; }
.doc-header .r { text-align: right; }
.marker { display: inline-block; min-width: 1.7em; padding: 0 0.3em; margin-right: 0.4em;
  background: #5c5850; color: #ffffff; border-radius: 2px; vertical-align: baseline;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 0.72rem; font-weight: 700; line-height: 1.7; text-align: center; }
.count { margin: 0.3rem 0 0.4rem; font-weight: 700; font-size: 0.9rem; }
table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 0.3rem; font-size: 0.9rem; }
th, td { border: 1px solid #c9c5be; padding: 0.3rem 0.45rem; text-align: left;
  vertical-align: top; overflow-wrap: anywhere; }
th { background: #eceae6; font-size: 0.85rem; }
.legend th, .legend td { font-size: 0.85rem; }
/* The footer is three columns, left, centre and right — decision D3, drawn
   from the same grid the plan's mockup uses. */
footer { max-width: 54rem; margin: 1rem auto 0; display: grid;
  grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; color: #5c5850;
  font-size: 0.85rem; }
footer .c { text-align: center; }
footer .r { text-align: right; overflow-wrap: anywhere; }
ul { margin: 0 0 1rem; padding-left: 1.4rem; }
li { margin: 0.2rem 0; overflow-wrap: anywhere; }
`;

/**
 * HTML-escape every markup character. Applied to every piece of user text and
 * every path through `safe` below, so hostile copy is displayed, never parsed.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Neutralise terminal and bidi control characters, then HTML-escape. */
function safe(value) {
  return escapeHtml(escapeControl(String(value)));
}

function pushRow(parts, label, value) {
  parts.push(`<dt>${safe(label)}</dt><dd>${safe(value)}</dd>`);
}

// One card per finding, mirroring the lib/report.mjs block: severity banner,
// current text, should-be guidance with its fixable marker, the full
// explanation, the audit marker when present, the heuristic note, then the six
// lane rows (lane, source, profile, confidence, limitation, action) that close
// the block. The file position is its own row because lane sections span
// files, where the PDF has a heading per file instead.
function findingCard(finding) {
  const kind = finding.severity === 'error' ? 'error'
    : finding.severity === 'warning' ? 'warning' : 'note';
  const severity = SEVERITY_LABEL[finding.severity] || 'NOTE';
  const headline = `[${severity}] ${finding.ruleId} · ${finding.category} · ${finding.confidence} · line ${finding.line}:${finding.column}`;
  const should = String(finding.proposed ?? finding.suggestion ?? finding.message);
  const suffix = finding._replacement == null ? MANUAL_SUFFIX : FIXABLE_SUFFIX;

  const parts = [];
  parts.push(`<article class="finding severity-${kind}">`);
  parts.push(`<h3>${safe(headline)}</h3>`);
  parts.push('<dl>');
  pushRow(parts, 'File', finding.file);
  pushRow(parts, 'Current', finding.current ?? NO_CONTEXT);
  pushRow(parts, 'Should be', should + suffix);
  parts.push('</dl>');
  parts.push(`<p class="message">${safe(finding.message)}</p>`);
  if (finding.audit) {
    parts.push(`<dl class="audit"><dt>Audit</dt><dd>${safe(finding.audit)}</dd></dl>`);
  }
  if (finding.confidence === 'heuristic') {
    parts.push('<p class="heuristic">Heuristic finding — routed to review.</p>');
  }
  parts.push('<dl class="fields">');
  pushRow(parts, 'Lane', finding.lane);
  pushRow(parts, 'Source', finding.source);
  pushRow(parts, 'Profile', finding.profile);
  pushRow(parts, 'Confidence', finding.confidence);
  pushRow(parts, 'Limitation', finding.limitation);
  pushRow(parts, 'Action', finding.action);
  parts.push('</dl>');
  parts.push('</article>');
  return parts.join('\n');
}

// Report order inside a lane: files in first-appearance order, then line,
// then column — the same ordering lib/report.mjs applies inside each file
// group, restated here because lane sections span files.
function orderFindings(list) {
  const files = new Map();
  for (const finding of list) {
    if (!files.has(finding.file)) files.set(finding.file, files.size);
  }
  return [...list].sort((a, b) =>
    (files.get(a.file) - files.get(b.file))
    || (a.line - b.line)
    || (a.column - b.column));
}

// One grouped issue: the same values lib/report.mjs pushIssue puts on its
// `issue` element, built from a group lib/report.mjs groupIssues produced —
// grouping is never reimplemented here, so both formats agree on what one
// issue is and on how many occurrences it has. The banner carries a location
// only when the group holds a single occurrence, and the count is rendered
// only when it is greater than one (issueCard below): a group of one is not
// a summary.
function groupedIssue(group) {
  const { finding, occurrences } = group;
  const marker = categoryMarker(finding.category);
  const kind = finding.severity === 'error' ? 'error'
    : finding.severity === 'warning' ? 'warning' : 'note';
  const severity = SEVERITY_LABEL[finding.severity] || 'NOTE';
  const count = occurrences.length;
  const location = count === 1 ? ` · line ${finding.line}:${finding.column}` : '';
  const should = String(finding.proposed ?? finding.suggestion ?? finding.message);
  const suffix = finding._replacement == null ? MANUAL_SUFFIX : FIXABLE_SUFFIX;
  return {
    kind,
    marker: marker ? marker.code : '',
    colour: marker ? marker.colour : '',
    count,
    text: `[${severity}] ${finding.ruleId} · ${finding.category} · ${finding.confidence}${location}`,
    current: String(finding.current ?? NO_CONTEXT),
    should: should + suffix,
    message: String(finding.message),
    audit: finding.audit ? String(finding.audit) : null,
    heuristic: finding.confidence === 'heuristic',
    provenance: [
      ['Lane', String(finding.lane || 'deterministic')],
      ['Source', String(finding.source || 'rules/catalogue.json')],
      ['Profile', String(finding.profile || 'editorial baseline')],
      ['Confidence', String(finding.confidence)],
      ['Limitation', String(finding.limitation || '')],
      ['Action', String(finding.action || '')],
    ],
    // The excerpt, match marked » … « by the scanner, with the same fallback
    // lib/report.mjs uses: an audit finding or masked copy falls back to the
    // matched token, the only copy the finding can prove. No copy is ever
    // re-read from disk here — the renderer is pure.
    occurrences: occurrences.map(occurrence => ({
      file: String(occurrence.file),
      line: occurrence.line,
      column: occurrence.column,
      pdfPage: occurrence.pdfPage ?? null,
      content: occurrence.excerpt ?? String(occurrence.current ?? NO_CONTEXT),
      should: String(occurrence.proposed ?? occurrence.suggestion ?? occurrence.message),
    })),
  };
}

// One grouped issue block: severity banner (marker code beside the text —
// the category name is already in the banner, so colour is never the only
// signal), the count when the group is larger than one, Current and Should
// be, the explanation, the audit marker and heuristic note, the six
// provenance fields, and finally the occurrence table — a real <table> with
// File / Location / Content / Should be. Every cell carries user text through
// safe(), so an excerpt or a path containing markup is displayed, never
// parsed. The table comes last so the provenance rows still close the block,
// exactly as the finding card does.
function issueCard(issue) {
  const parts = [];
  parts.push(`<article class="finding issue severity-${issue.kind}">`);
  const badge = issue.marker
    ? `<span class="marker" style="background:${safe(issue.colour)}">${safe(issue.marker)}</span>`
    : '';
  parts.push(`<h3>${badge}${badge ? ' ' : ''}${safe(issue.text)}</h3>`);
  // A count is shown only when it is greater than one — "1 occurrence" next
  // to a lone finding reads as though something was counted that was not.
  if (issue.count > 1) parts.push(`<p class="count">${issue.count} occurrences</p>`);
  parts.push('<dl>');
  pushRow(parts, 'Current', issue.current);
  pushRow(parts, 'Should be', issue.should);
  parts.push('</dl>');
  parts.push(`<p class="message">${safe(issue.message)}</p>`);
  if (issue.audit) {
    parts.push(`<dl class="audit"><dt>Audit</dt><dd>${safe(issue.audit)}</dd></dl>`);
  }
  if (issue.heuristic) {
    parts.push('<p class="heuristic">Heuristic finding — routed to review.</p>');
  }
  parts.push('<dl class="fields">');
  for (const [label, value] of issue.provenance) pushRow(parts, label, value);
  parts.push('</dl>');
  parts.push('<table class="occurrences">');
  parts.push('<thead><tr><th scope="col">File</th><th scope="col">Location</th>'
    + '<th scope="col">Content</th><th scope="col">Should be</th></tr></thead>');
  parts.push('<tbody>');
  for (const occurrence of issue.occurrences) {
    const location = Number.isInteger(occurrence.pdfPage)
      ? `${occurrence.line}:${occurrence.column} · page ${occurrence.pdfPage}`
      : `${occurrence.line}:${occurrence.column}`;
    parts.push(`<tr><td>${safe(occurrence.file)}</td><td>${safe(location)}</td>`
      + `<td>${safe(occurrence.content)}</td><td>${safe(occurrence.should)}</td></tr>`);
  }
  parts.push('</tbody>');
  parts.push('</table>');
  parts.push('</article>');
  return parts.join('\n');
}

// The category legend: all twelve catalogue categories in catalogue order,
// zero-count rows included, each row printing the marker code and the
// category's own name side by side — colour and shape are never the only
// signal, so a greyscale printout and a screen reader get the same twelve
// rows. Rows come from lib/legend.mjs legendRows, so the counts are exactly
// the findings this report already holds.
function legendSection(findings) {
  const parts = [];
  parts.push('<section class="category-legend" id="category-legend">');
  parts.push('<h2>Category legend</h2>');
  parts.push('<table class="legend">');
  parts.push('<thead><tr><th scope="col">Marker</th><th scope="col">Category</th>'
    + '<th scope="col">What it covers</th><th scope="col">Findings</th></tr></thead>');
  parts.push('<tbody>');
  for (const row of legendRows(findings)) {
    parts.push(`<tr><td><span class="marker" style="background:${safe(row.colour)}">`
      + `${safe(row.code)}</span></td><td>${safe(row.category)}</td>`
      + `<td>${safe(row.intent)}</td><td>${row.count}</td></tr>`);
  }
  parts.push('</tbody>');
  parts.push('</table>');
  parts.push('</section>');
  return parts.join('\n');
}

/**
 * Render the report model into one self-contained HTML document.
 *
 * @param {object} input  { version, date, targets, profiles, filesCount, findings, sources }
 * @param {object} [opts] `{ version }` — stamped into the footer, as in lib/pdf.mjs;
 *                         `{ detail }` — 'grouped' (default) renders issue blocks
 *                         with an occurrence table, 'full' the pre-Phase-9
 *                         one-card-per-finding layout. Presentation only: counts,
 *                         lanes and the clean-run sentence are computed from the
 *                         findings before either layout runs.
 * @returns {string} the whole file; deterministic for identical input
 */
export function renderHtml(input, opts = {}) {
  const version = typeof opts.version === 'string'
    ? opts.version
    : String(input.version == null ? '' : input.version);
  // Same switch lib/report.mjs applies: anything that is not 'full' groups.
  const detail = opts.detail === 'full' ? 'full' : 'grouped';
  const findings = (input.findings || []).map(finding => annotate(finding));
  const targets = input.targets || [];
  const profiles = input.profiles || [];
  const sources = input.sources || [];
  const summary = summarize(findings);
  const laneCounts = countLanes(findings);

  // Quoted material is a context, not a lane: a quoted finding keeps its lane
  // metadata but renders in its own section — reported separately, never
  // skipped, never mixed into the authored copy.
  const quoted = findings.filter(finding => finding.context === 'quoted');
  const byLane = new Map();
  for (const finding of findings) {
    if (finding.context === 'quoted') continue;
    if (!byLane.has(finding.lane)) byLane.set(finding.lane, []);
    byLane.get(finding.lane).push(finding);
  }
  // Render order of the authored copy: the lane sections in LANE_NAMES order.
  // `full` orders each section the way this renderer always has (file first
  // appearance, then line, then column) so the pre-Phase-9 layout stays byte
  // for byte. `grouped` keeps the order the model received the findings in,
  // which is the order lib/report.mjs groups them in, so an issue's
  // occurrence rows match that issue element row for row — grouping inside
  // this renderer must never move a row the shared model would print. The
  // review queue is drawn from this order, so it matches the sequence the
  // reader has just scrolled through.
  const sections = [];
  for (const lane of LANE_NAMES) {
    const group = byLane.get(lane);
    if (group && group.length) {
      sections.push({ lane, group: detail === 'full' ? orderFindings(group) : group });
    }
  }
  // Every heuristic finding of the authored copy, in rendered order. Quoted
  // heuristics stay out: they live in the quoted section, where a reviewer
  // reads them as quotations — the same exclusion lib/report.mjs makes.
  const heuristics = sections.flatMap(section => section.group)
    .filter(finding => finding.confidence === 'heuristic');

  const parts = [];
  parts.push('<!DOCTYPE html>');
  parts.push('<html lang="en">');
  parts.push('<head>');
  parts.push('<meta charset="utf-8">');
  parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  parts.push(`<title>${safe(TITLE)} - un-editorial-check ${safe(version)}</title>`);
  parts.push(`<style>${STYLE}</style>`);
  parts.push('</head>');
  parts.push('<body>');
  parts.push('<main>');

  // 1. Document header (lib/furniture.mjs headerRows): two rows of two cells,
  // drawn on the cover and on every continuation page alike, so the same block
  // frames every page of the document. EDITORIAL REVIEW sits opposite the tool
  // and its version — never UNITED NATIONS — so no masthead can imply the tool
  // speaks for the United Nations. The title is deliberately not part of the
  // repeating header; it is the <h1> below, and the cover block that follows
  // carries the scan's vital statistics in the order lib/report.mjs renders
  // them.
  parts.push('<header class="doc-header">');
  for (const row of headerRows(input, version)) {
    parts.push(`<p><span class="l">${safe(row.left)}</span>`
      + `<span class="r">${safe(row.right)}</span></p>`);
  }
  parts.push('</header>');
  parts.push(`<h1>${safe(TITLE)}</h1>`);
  parts.push('<dl class="cover">');
  pushRow(parts, 'Version', version);
  pushRow(parts, 'Date', input.date);
  pushRow(parts, 'Targets', targets.join(' '));
  if (profiles.length) pushRow(parts, 'Profiles', profiles.join(', '));
  pushRow(parts, 'Files scanned', input.filesCount);
  parts.push('</dl>');
  parts.push('<hr>');

  // 2. Counts: editorial findings only; audits get their own row. The lane
  // line follows the severity counts so routing and quoted material are
  // visible before any finding is read — all five lanes plus quoted, with
  // quoted counted on top of the lane counts, never inside them.
  parts.push(`<p class="counts">${summary.errors} errors · ${summary.warnings} warnings · ${summary.info} notes</p>`);
  if (findings.length) {
    const lanes = LANE_NAMES.map(name => `${name} ${laneCounts[name]}`)
      .concat(`quoted ${laneCounts.quoted}`);
    parts.push(`<p class="lanes">lanes: ${safe(lanes.join(' · '))}</p>`);
  }
  const auditNames = Object.keys(summary.audits).sort();
  if (auditNames.length) {
    parts.push('<dl class="audits">');
    pushRow(parts, 'Audits',
      auditNames.map(name => `${name} ${summary.audits[name]}`).join(', '));
    parts.push('</dl>');
  }

  // 3. Framing: the three promises of the PDF report, then the disclaimer.
  // Both formats now say exactly the same thing. The framing block still
  // leads everything a reader could mistake for a finding.
  parts.push('<section class="framing">');
  parts.push(`<p>${safe(LEGEND_DETERMINISTIC)}</p>`);
  parts.push(`<p>${safe(LEGEND_HEURISTIC)}</p>`);
  parts.push(`<p>${safe(LEGEND_REPORT_ONLY)}</p>`);
  parts.push(`<p class="disclaimer">${safe(FRAMING)}</p>`);
  parts.push('</section>');

  // 3b. Category legend: all twelve categories in both detail modes, drawn
  // from lib/legend.mjs so the vocabulary and its counts cannot drift from
  // the catalogue or from the other report formats.
  parts.push(legendSection(findings));

  // 4. Findings: the clean sentence when the scan found nothing, otherwise
  // one section per lane that has findings, then quoted material. The section
  // count is the lane's finding count in both modes — grouping is
  // presentation, so what the `lanes:` line above states is what each header
  // states. Inside a section, `grouped` renders one issue per group (the
  // groups come from lib/report.mjs groupIssues, run inside the section so a
  // section's findings can only ever merge with each other) and `full`
  // renders one card per finding, exactly as it always has.
  if (!findings.length) {
    parts.push(`<p class="clean">${safe(CLEAN)}</p>`);
  } else {
    const blocks = (list) => (detail === 'full'
      ? list.map(findingCard)
      : groupIssues(list).map(group => issueCard(groupedIssue(group))));
    for (const section of sections) {
      parts.push(`<section class="lane" id="lane-${safe(section.lane)}">`);
      parts.push(`<h2>${safe(LANE_TITLES[section.lane])} (${section.group.length})</h2>`);
      for (const block of blocks(section.group)) parts.push(block);
      parts.push('</section>');
    }
    if (quoted.length) {
      parts.push('<section class="quoted" id="quoted-material">');
      parts.push(`<h2>Quoted material (${quoted.length})</h2>`);
      for (const block of blocks(quoted)) parts.push(block);
      parts.push('</section>');
    }
  }

  // 5. Review queue: every heuristic finding of the authored copy, in the
  // order it was rendered — the PDF's queue, kept so no content is dropped.
  if (heuristics.length) {
    parts.push('<section class="queue" id="review-queue">');
    parts.push(`<h2>Review queue (heuristic findings) (${heuristics.length})</h2>`);
    parts.push('<ul>');
    for (const finding of heuristics) {
      const message = String(finding.message);
      const excerpt = message.length > QUEUE_EXCERPT
        ? `${message.slice(0, QUEUE_EXCERPT)}...`
        : message;
      const position = `${finding.file}:${finding.line}:${finding.column}`;
      parts.push(`<li>${safe(`${position} ${finding.ruleId} — ${excerpt}`)}</li>`);
    }
    parts.push('</ul>');
    parts.push('</section>');
  }

  // 6. Sources appendix.
  if (sources.length) {
    parts.push('<section class="sources" id="sources">');
    parts.push('<h2>Sources</h2>');
    parts.push('<ul>');
    for (const source of sources) parts.push(`<li>${safe(source)}</li>`);
    parts.push('</ul>');
    parts.push('</section>');
  }

  parts.push('</main>');
  // Footer (lib/furniture.mjs footerCells): three cells — the page position,
  // the copyright with its year read from the scan's date, and the repository
  // address — placed left, centre and right so both formats state the same
  // three things in the same order.
  const footer = footerCells({ date: input.date, page: 1, pages: 1 });
  parts.push('<footer>');
  parts.push(`<span class="l">${safe(footer.left)}</span>`);
  parts.push(`<span class="c">${safe(footer.centre)}</span>`);
  parts.push(`<span class="r">${safe(footer.right)}</span>`);
  parts.push('</footer>');
  parts.push('</body>');
  parts.push('</html>');
  return parts.join('\n');
}
