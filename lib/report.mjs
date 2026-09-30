// Report model: the pure data layer between scan findings and the renderer.
//
// `buildReport` turns a scan result (contract: .feedbacks/PHASE3-CONTRACT.md §2)
// into the flat element union that lib/pdf.mjs consumes. The module is pure by
// contract: no file system, no process access and no clock — the date arrives
// with the input, so identical input always produces identical, deeply equal
// output. Input findings are never mutated: grouping happens in a Map and every
// sort runs on a copy, so a frozen input renders exactly like a fresh one.
// Since Wave 3 each finding is annotated with its lane and metadata before
// rendering; that annotation resolves once, at first use, from the shipped
// rules/catalogue.json through lib/output.mjs — buildReport itself performs no
// I/O, and for a fixed catalogue its output still depends only on input data.

import { summarize, annotate, countLanes, LANE_NAMES } from './output.mjs';
import { categoryMarker } from './legend.mjs';
import { TITLE } from './furniture.mjs';

const ELEMENT_TYPES = new Set([
  'banner', 'heading', 'paragraph', 'kv', 'bullets', 'spacer', 'rule', 'issue',
]);

/**
 * Check every element against the union above. A renderer switches on `type`,
 * so an unknown type must fail loudly instead of vanishing from the report.
 */
export function assertElements(elements) {
  for (const element of elements) {
    const type = element !== null && typeof element === 'object' ? element.type : undefined;
    if (!ELEMENT_TYPES.has(type)) {
      throw new Error(`unknown element type: ${String(type)}`);
    }
  }
  return elements;
}

// Severity presentation: `info` and anything unexpected read as notes.
const SEVERITY_LABEL = { error: 'ERROR', warning: 'WARNING', info: 'NOTE' };

function severityLabel(severity) {
  return SEVERITY_LABEL[severity] || 'NOTE';
}

function severityKind(severity) {
  if (severity === 'error') return 'error';
  if (severity === 'warning') return 'warning';
  return 'note';
}

// A finding with no captured copy (audits, hate-speech review) must not show a
// developer placeholder in the director-facing PDF — "(not applicable)" reads
// as an editorial statement, not as missing plumbing.
const NO_CONTEXT = '(not applicable)';
const MANUAL_SUFFIX = ' — manual / agent rewrite; not --fix-able';
const FIXABLE_SUFFIX = ' — --fix-able';

// One block per finding: severity banner, current text, should-be guidance,
// the full explanation, an audit marker when present, the heuristic note that
// keeps judgement questions out of definitive language, and the five lane
// rows (lane, source, profile, limitation, action) that close the block.
function pushFinding(elements, finding) {
  elements.push({
    type: 'banner',
    kind: severityKind(finding.severity),
    text: `[${severityLabel(finding.severity)}] ${finding.ruleId} · ${finding.category} · ${finding.confidence} · line ${finding.line}:${finding.column}`,
  });
  elements.push({ type: 'kv', label: 'Current', value: String(finding.current ?? NO_CONTEXT) });
  const should = String(finding.proposed ?? finding.suggestion ?? finding.message);
  const suffix = finding._replacement == null ? MANUAL_SUFFIX : FIXABLE_SUFFIX;
  elements.push({ type: 'kv', label: 'Should be', value: should + suffix });
  elements.push({ type: 'paragraph', text: String(finding.message) });
  if (finding.audit) {
    elements.push({ type: 'kv', label: 'Audit', value: String(finding.audit) });
  }
  if (finding.confidence === 'heuristic') {
    elements.push({ type: 'paragraph', text: 'Heuristic finding — routed to review.' });
  }
  // Lane metadata closes the block (Wave 3): where the finding is routed,
  // which rule file its check comes from, which profile asserted it, what
  // the check cannot establish, and the recommended human action. The
  // defaults mirror lib/output.mjs's annotate() so a hand-built finding
  // still renders every row.
  elements.push({ type: 'kv', label: 'Lane', value: String(finding.lane || 'deterministic') });
  elements.push({ type: 'kv', label: 'Source', value: String(finding.source || 'rules/catalogue.json') });
  elements.push({ type: 'kv', label: 'Profile', value: String(finding.profile || 'editorial baseline') });
  elements.push({ type: 'kv', label: 'Limitation', value: String(finding.limitation || '') });
  elements.push({ type: 'kv', label: 'Action', value: String(finding.action || '') });
}

// --- grouping ---------------------------------------------------------------
//
// A report issue is a group of findings that would render identically except
// for where they were found. The key is built from what the issue block
// actually prints, which is a stronger guarantee than any hand-picked list of
// columns: two findings may only share a block if every value the reader will
// see for that block is the same for both. Different advice, a different
// explanation or a different severity all keep findings apart, because a group
// that printed one of them for two occurrences that disagree would be the
// silent merging of unlike things the plan names as the failure mode.
//
// `file` is deliberately not a key part — the same defect in two files is one
// issue, and the occurrence table carries each file. Grouping is presentation:
// no count anywhere is derived from it.

function issueKey(finding) {
  const should = String(finding.proposed ?? finding.suggestion ?? finding.message);
  return JSON.stringify([
    finding.ruleId,
    finding.lane,
    finding.severity,
    finding.confidence,
    finding.category,
    finding.current ?? null,
    should,
    String(finding.message),
    finding.audit ?? null,
  ]);
}

/**
 * Group an ordered list of findings into issues, in the order each group's
 * first occurrence appears. Occurrences inside a group keep the list's own
 * order, so a report reads in position order and never jumps around.
 *
 * @param {object[]} findings annotated findings, in rendering order
 * @returns {object[]} one issue per distinct group
 */
export function groupIssues(findings) {
  const order = [];
  const byKey = new Map();
  for (const finding of findings) {
    const key = issueKey(finding);
    let issue = byKey.get(key);
    if (!issue) {
      issue = { finding, occurrences: [] };
      byKey.set(key, issue);
      order.push(issue);
    }
    issue.occurrences.push(finding);
  }
  return order;
}

/**
 * One grouped issue: the same block a single finding draws, plus the count and
 * the occurrence table behind it.
 *
 * The six provenance fields are laid out explicitly rather than left to fall
 * out of the banner, because the requirement is that every issue carries them
 * — including when the group has a hundred occurrences and nobody is going to
 * cross-check the banner against the catalogue to work out what was asserted.
 */
function pushIssue(elements, issue) {
  const { finding, occurrences } = issue;
  const marker = categoryMarker(finding.category);
  const kind = severityKind(finding.severity);
  const count = occurrences.length;
  // A count is shown only when it is more than one: a group of one is not a
  // summary, and printing "1 occurrence" next to a lone finding reads as
  // though something was counted that was not there.
  const location = count === 1
    ? ` · line ${finding.line}:${finding.column}`
    : '';
  elements.push({
    type: 'issue',
    kind,
    ruleId: String(finding.ruleId),
    category: String(finding.category),
    confidence: String(finding.confidence),
    severity: String(finding.severity),
    lane: String(finding.lane || 'deterministic'),
    marker: marker ? marker.code : '',
    colour: marker ? marker.colour : '',
    count,
    text: `[${severityLabel(finding.severity)}] ${finding.ruleId} · ${finding.category} · ${finding.confidence}${location}`,
    current: String(finding.current ?? NO_CONTEXT),
    should: String(finding.proposed ?? finding.suggestion ?? finding.message) + (finding._replacement == null ? MANUAL_SUFFIX : FIXABLE_SUFFIX),
    message: String(finding.message),
    audit: finding.audit ? String(finding.audit) : null,
    heuristic: finding.confidence === 'heuristic',
    provenance: [
      { label: 'Lane', value: String(finding.lane || 'deterministic') },
      { label: 'Source', value: String(finding.source || 'rules/catalogue.json') },
      { label: 'Profile', value: String(finding.profile || 'editorial baseline') },
      { label: 'Confidence', value: String(finding.confidence) },
      { label: 'Limitation', value: String(finding.limitation || '') },
      { label: 'Action', value: String(finding.action || '') },
    ],
    occurrences: occurrences.map(occurrence => ({
      file: String(occurrence.file),
      line: occurrence.line,
      column: occurrence.column,
      pdfPage: occurrence.pdfPage ?? null,
      // The line of copy the finding sits on, with the match marked. Built at
      // scan time and never by re-reading the file, so a document that changed
      // after the scan cannot put words in a report that were never scanned.
      // A finding that carries no excerpt (an audit rule, or copy that was
      // masked away from its match) falls back to the matched token, which is
      // the only copy the finding can prove.
      content: occurrence.excerpt ?? String(occurrence.current ?? NO_CONTEXT),
      should: String(occurrence.proposed ?? occurrence.suggestion ?? occurrence.message),
      fixable: occurrence._replacement != null,
    })),
  });
}

/**
 * @param {object} input  { version, date, targets, profiles, filesCount, findings, sources }
 * @param {object} [opts] { detail: 'grouped' | 'full' }
 * @returns {object[]}    renderable elements in contract order
 *
 * `detail: 'full'` is the pre-Phase-9 layout — one block per finding, exactly
 * as it always rendered. `grouped` is the default and collapses findings that
 * would render identically into a single issue carrying an occurrence table.
 * The switch changes presentation only: counts, lanes and the clean-run
 * sentence are computed from the findings before either layout runs, so the
 * two modes cannot disagree about what was found.
 */
export function buildReport(input, opts = {}) {
  const detail = opts.detail === 'full' ? 'full' : 'grouped';
  const targets = input.targets || [];
  const profiles = input.profiles || [];
  // Annotate before any grouping: every consumer (counts, blocks, queue,
  // quoted section) works on the lane-annotated copy. annotate() returns a
  // new object, so input findings are never mutated and a frozen input
  // renders exactly like a fresh one.
  const findings = (input.findings || []).map(f => annotate(f));
  const sources = input.sources || [];

  const elements = [];

  // Render one ordered list of findings: as blocks when the reader asked for
  // the old layout, as grouped issues otherwise. Grouping happens inside the
  // section, so a section's findings can only ever merge with each other.
  const render = (list) => {
    if (detail === 'full') {
      for (const finding of list) pushFinding(elements, finding);
      return;
    }
    for (const issue of groupIssues(list)) pushIssue(elements, issue);
  };

  // 1. Cover block: title banner plus the scan's vital statistics. The title
  // is one constant (D1) shared with the HTML `<h1>` and `<title>`, so the two
  // formats cannot name the document differently.
  elements.push({ type: 'banner', kind: 'title', text: TITLE });
  elements.push({ type: 'kv', label: 'Version', value: String(input.version) });
  elements.push({ type: 'kv', label: 'Date', value: String(input.date) });
  elements.push({ type: 'kv', label: 'Targets', value: targets.join(' ') });
  if (profiles.length) {
    elements.push({ type: 'kv', label: 'Profiles', value: profiles.join(', ') });
  }
  elements.push({ type: 'kv', label: 'Files scanned', value: String(input.filesCount) });
  elements.push({ type: 'rule' });

  // 2. Counts: editorial findings only; audits get their own row. The lane
  // line follows the severity counts (skipped on an empty scan) so routing
  // and quoted material are visible before any finding is read.
  const summary = summarize(findings);
  elements.push({
    type: 'paragraph',
    text: `${summary.errors} errors · ${summary.warnings} warnings · ${summary.info} notes`,
  });
  if (findings.length) {
    const laneCounts = countLanes(findings);
    const lanes = LANE_NAMES.map(name => `${name} ${laneCounts[name]}`)
      .concat(`quoted ${laneCounts.quoted}`);
    elements.push({ type: 'paragraph', text: `lanes: ${lanes.join(' · ')}` });
  }
  const auditNames = Object.keys(summary.audits).sort();
  if (auditNames.length) {
    elements.push({
      type: 'kv',
      label: 'Audits',
      value: auditNames.map(name => `${name} ${summary.audits[name]}`).join(', '),
    });
  }

  // 3. Legend: what deterministic and heuristic confidence each promise, and
  // the report-only guarantee that nothing here changes the scan.
  elements.push({ type: 'paragraph', text: 'Deterministic finding: the wording proves the defect.' });
  elements.push({
    type: 'paragraph',
    text: 'Heuristic finding: routed to review; this report never asserts that a claim is true or false, or that any legal threshold is met.',
  });
  elements.push({
    type: 'paragraph',
    text: 'This report changes nothing; re-run the checker to verify corrections.',
  });

  // 4. Findings. Two layouts over the same list.
  //
  // `full` groups by file, exactly as this report always has: a heading per
  // file, findings in line then column order inside it.
  //
  // `grouped` groups into issues across the whole scan. It has to be across
  // the whole scan rather than inside each file's section, because `file` is
  // not part of an issue's identity — a defect that occurs in three files is
  // one issue with three places, and the occurrence table carries each file.
  // Grouping per file instead would report it as three issues of a size that
  // depends on where the reader is looking, and lib/html.mjs, which sections
  // by lane rather than by file, would report a fourth number again. Since
  // `lane` is part of the key, grouping inside lib/html.mjs's lane sections
  // yields exactly these same issues, so both formats agree on what one issue
  // is and on how many occurrences it has.
  //
  // Quoted material is a context, not a lane: a quoted finding keeps its lane
  // metadata but renders in its own section — reported separately, never
  // skipped, never mixed into the authored copy. It is sectioned before
  // grouping for the same reason in both layouts, so a quotation and the copy
  // beside it are never summarised into one issue.
  const heuristics = [];
  const byFile = new Map();
  const quoted = [];
  const authored = [];
  for (const finding of findings) {
    if (finding.context === 'quoted') {
      quoted.push(finding);
      continue;
    }
    authored.push(finding);
    if (!byFile.has(finding.file)) byFile.set(finding.file, []);
    byFile.get(finding.file).push(finding);
  }
  if (!findings.length) {
    elements.push({ type: 'paragraph', text: 'No findings.' });
  } else if (detail === 'full') {
    if (byFile.size) {
      elements.push({ type: 'spacer' });
      elements.push({ type: 'heading', level: 1, text: 'Findings by file' });
      for (const [file, group] of byFile) {
        elements.push({ type: 'heading', level: 2, text: String(file) });
        const ordered = [...group].sort((a, b) => (a.line - b.line) || (a.column - b.column));
        for (const finding of ordered) {
          if (finding.confidence === 'heuristic') heuristics.push(finding);
        }
        render(ordered);
      }
    }
  } else if (authored.length) {
    for (const finding of authored) {
      if (finding.confidence === 'heuristic') heuristics.push(finding);
    }
    elements.push({ type: 'spacer' });
    elements.push({ type: 'heading', level: 1, text: 'Issues' });
    render(authored);
  }
  if (quoted.length) {
    elements.push({ type: 'spacer' });
    elements.push({ type: 'heading', level: 1, text: `Quoted material (${quoted.length})` });
    render(quoted);
  }

  // 5. Review queue: every heuristic finding of the authored copy, in the
  // order it was rendered. Quoted heuristics stay out of the queue — they
  // live in the quoted section, where a reviewer reads them as quotations.
  if (heuristics.length) {
    elements.push({ type: 'spacer' });
    elements.push({ type: 'heading', level: 1, text: 'Review queue (heuristic findings)' });
    // A cut mid-word with no mark reads as a typo; anything past the limit
    // is marked with an ASCII "..." and anything at or under it stands whole.
    const cut = (message) => (message.length > 80 ? `${message.slice(0, 80)}...` : message);
    if (detail === 'full') {
      for (const finding of heuristics) {
        elements.push({
          type: 'paragraph',
          text: `${finding.file}:${finding.line}:${finding.column} ${finding.ruleId} — ${cut(String(finding.message))}`,
        });
      }
    } else {
      for (const issue of groupIssues(heuristics)) {
        const first = issue.occurrences[0];
        // The queue is a review list, not the detail: it names one position
        // and says how many others there are, and points a reader at the issue
        // block above, where every occurrence is listed with its own file,
        // line and column. It never implies there is only one.
        const extra = issue.occurrences.length > 1
          ? ` (+${issue.occurrences.length - 1} more occurrences)` : '';
        elements.push({
          type: 'paragraph',
          text: `${first.file}:${first.line}:${first.column} ${issue.finding.ruleId} — ${cut(String(issue.finding.message))}${extra}`,
        });
      }
    }
  }

  // 6. Sources appendix.
  if (sources.length) {
    elements.push({ type: 'spacer' });
    elements.push({ type: 'heading', level: 1, text: 'Sources' });
    elements.push({ type: 'bullets', items: sources.map(source => String(source)) });
  }

  return assertElements(elements);
}
