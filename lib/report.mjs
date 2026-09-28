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

const ELEMENT_TYPES = new Set([
  'banner', 'heading', 'paragraph', 'kv', 'bullets', 'spacer', 'rule',
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

/**
 * @param {object} input  { version, date, targets, profiles, filesCount, findings, sources }
 * @returns {object[]}    renderable elements in contract order
 */
export function buildReport(input) {
  const targets = input.targets || [];
  const profiles = input.profiles || [];
  // Annotate before any grouping: every consumer (counts, blocks, queue,
  // quoted section) works on the lane-annotated copy. annotate() returns a
  // new object, so input findings are never mutated and a frozen input
  // renders exactly like a fresh one.
  const findings = (input.findings || []).map(f => annotate(f));
  const sources = input.sources || [];

  const elements = [];

  // 1. Cover block: title banner plus the scan's vital statistics.
  elements.push({ type: 'banner', kind: 'title', text: 'UN Editorial Review' });
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

  // 4. Findings grouped by file, sorted by line then column inside each file.
  // Quoted material is a context, not a lane: a quoted finding keeps its lane
  // metadata but renders in its own section — reported separately, never
  // skipped, never mixed into the authored copy.
  const heuristics = [];
  const byFile = new Map();
  const quoted = [];
  for (const finding of findings) {
    if (finding.context === 'quoted') {
      quoted.push(finding);
    } else {
      if (!byFile.has(finding.file)) byFile.set(finding.file, []);
      byFile.get(finding.file).push(finding);
    }
  }
  if (!findings.length) {
    elements.push({ type: 'paragraph', text: 'No findings.' });
  } else {
    if (byFile.size) {
      elements.push({ type: 'spacer' });
      elements.push({ type: 'heading', level: 1, text: 'Findings by file' });
      for (const [file, group] of byFile) {
        elements.push({ type: 'heading', level: 2, text: String(file) });
        const ordered = [...group].sort((a, b) => (a.line - b.line) || (a.column - b.column));
        for (const finding of ordered) {
          if (finding.confidence === 'heuristic') heuristics.push(finding);
          pushFinding(elements, finding);
        }
      }
    }
    if (quoted.length) {
      elements.push({ type: 'spacer' });
      elements.push({ type: 'heading', level: 1, text: `Quoted material (${quoted.length})` });
      for (const finding of quoted) pushFinding(elements, finding);
    }
  }

  // 5. Review queue: every heuristic finding of the authored copy, in the
  // order it was rendered. Quoted heuristics stay out of the queue — they
  // live in the quoted section, where a reviewer reads them as quotations.
  if (heuristics.length) {
    elements.push({ type: 'spacer' });
    elements.push({ type: 'heading', level: 1, text: 'Review queue (heuristic findings)' });
    for (const finding of heuristics) {
      const message = String(finding.message);
      // A cut mid-word with no mark reads as a typo; anything past the limit
      // is marked with an ASCII "..." and anything at or under it stands whole.
      const excerpt = message.length > 80 ? `${message.slice(0, 80)}...` : message;
      elements.push({
        type: 'paragraph',
        text: `${finding.file}:${finding.line}:${finding.column} ${finding.ruleId} — ${excerpt}`,
      });
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
