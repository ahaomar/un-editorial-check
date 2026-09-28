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
// Framing wording is reused from the shipped surfaces: the three legend
// paragraphs of lib/report.mjs, the footer fragment of lib/pdf.mjs and the
// disclaimer row of docs/CLAIM-EVIDENCE-AUDIT.md, so the HTML never promises
// more than the PDF does.

import { annotate, countLanes, escapeControl, LANE_NAMES, summarize } from './output.mjs';

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
// Footer fragment, verbatim from lib/pdf.mjs (minus the page stamp: an HTML
// report is not paginated).
const FOOTER_TAIL = 'report only; findings are not changed by this report.';
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
footer { max-width: 54rem; margin: 1rem auto 0; text-align: center;
  color: #5c5850; font-size: 0.85rem; }
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

/**
 * Render the report model into one self-contained HTML document.
 *
 * @param {object} input  { version, date, targets, profiles, filesCount, findings, sources }
 * @param {object} [opts] `{ version }` — stamped into the footer, as in lib/pdf.mjs
 * @returns {string} the whole file; deterministic for identical input
 */
export function renderHtml(input, opts = {}) {
  const version = typeof opts.version === 'string'
    ? opts.version
    : String(input.version == null ? '' : input.version);
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
  // Render order of the authored copy: the lane sections in LANE_NAMES order,
  // each already ordered. The review queue is drawn from this order, so it
  // matches the sequence the reader has just scrolled through.
  const sections = [];
  for (const lane of LANE_NAMES) {
    const group = byLane.get(lane);
    if (group && group.length) sections.push({ lane, group: orderFindings(group) });
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
  parts.push(`<title>UN Editorial Review - un-editorial-check ${safe(version)}</title>`);
  parts.push(`<style>${STYLE}</style>`);
  parts.push('</head>');
  parts.push('<body>');
  parts.push('<main>');

  // 1. Cover block: title plus the scan's vital statistics, in the order
  // lib/report.mjs renders them.
  parts.push('<h1>UN Editorial Review</h1>');
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

  // 3. Legend and framing: the three promises of the PDF report, then the
  // disclaimer. Both formats now say exactly the same thing.
  parts.push('<section class="framing">');
  parts.push(`<p>${safe(LEGEND_DETERMINISTIC)}</p>`);
  parts.push(`<p>${safe(LEGEND_HEURISTIC)}</p>`);
  parts.push(`<p>${safe(LEGEND_REPORT_ONLY)}</p>`);
  parts.push(`<p class="disclaimer">${safe(FRAMING)}</p>`);
  parts.push('</section>');

  // 4. Findings: the clean sentence when the scan found nothing, otherwise
  // one section per lane that has findings, then quoted material.
  if (!findings.length) {
    parts.push(`<p class="clean">${safe(CLEAN)}</p>`);
  } else {
    for (const section of sections) {
      parts.push(`<section class="lane" id="lane-${safe(section.lane)}">`);
      parts.push(`<h2>${safe(LANE_TITLES[section.lane])} (${section.group.length})</h2>`);
      for (const finding of section.group) parts.push(findingCard(finding));
      parts.push('</section>');
    }
    if (quoted.length) {
      parts.push('<section class="quoted" id="quoted-material">');
      parts.push(`<h2>Quoted material (${quoted.length})</h2>`);
      for (const finding of quoted) parts.push(findingCard(finding));
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
  parts.push(`<footer>un-editorial-check ${safe(version)} - ${safe(FOOTER_TAIL)}</footer>`);
  parts.push('</body>');
  parts.push('</html>');
  return parts.join('\n');
}
