// Report rendering: text (default), JSON and SARIF 2.1.0.
//
// Every finding carries file, line, column, rule id, category, severity,
// confidence and scope; the text report groups them into editorial errors,
// editorial warnings, agent-review items and — only when explicitly
// requested — the optional audits, so a reader can never mistake a security
// finding for an editorial one.

const INTERNAL = new Set(['_unit', '_index', '_matched', '_offset', '_replacement']);

// C0/C1 controls, bidi overrides and isolate markers: none of them may reach a
// terminal inside a file name, a message or a copy excerpt, because a terminal
// escape sequence inside a scanned file could redraw or hide a finding. JSON
// and SARIF need no help: JSON.stringify escapes on its way out.
const CONTROL_RE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u202a-\\u202e\\u2066-\\u2069]', 'g');

export function escapeControl(text) {
  return String(text).replace(CONTROL_RE, char =>
    `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function publicFinding(finding) {
  const out = {};
  for (const [key, value] of Object.entries(finding)) {
    if (INTERNAL.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function summarize(findings) {
  const summary = { errors: 0, warnings: 0, info: 0, audits: {} };
  for (const finding of findings) {
    if (finding.audit) {
      summary.audits[finding.audit] = (summary.audits[finding.audit] || 0) + 1;
      continue;
    }
    if (finding.severity === 'error') summary.errors++;
    else if (finding.severity === 'warning') summary.warnings++;
    else summary.info++;
  }
  return summary;
}

/** Exit code input: error-severity editorial findings only. */
export function editorialErrors(findings) {
  return findings.filter(f => !f.audit && f.severity === 'error');
}

function line(finding) {
  const position = `${escapeControl(finding.file)}:${finding.line}:${finding.column}`;
  const suggestion = finding.suggestion ? `  → ${escapeControl(finding.suggestion)}` : '';
  return `  ${position}  ${finding.ruleId}  [${finding.confidence}]  ${escapeControl(finding.message)}${suggestion}`;
}

export function renderText({ findings, files, version, fixes = [], applied = false }) {
  const editorial = findings.filter(f => !f.audit);
  const audits = findings.filter(f => f.audit);
  const sections = [];

  const errors = editorial.filter(f => f.severity === 'error');
  const warnings = editorial.filter(f => f.severity === 'warning');
  const info = editorial.filter(f => f.severity === 'info');
  const review = editorial.filter(f => f.category === 'agent-review');
  const reviewKeys = new Set(review.map(keyOf));
  const style = editorial.filter(f =>
    f.category !== 'agent-review' && (f.severity !== 'error') && !reviewKeys.has(keyOf(f)));

  const push = (title, list) => {
    if (!list.length) return;
    sections.push(`${title} (${list.length})\n${list.map(line).join('\n')}`);
  };

  push('EDITORIAL ERRORS', errors);
  push('EDITORIAL WARNINGS', style.filter(f => f.severity === 'warning'));
  push('EDITORIAL NOTES', style.filter(f => f.severity !== 'warning'));
  push('AGENT REVIEW REQUIRED', review);

  const byAudit = new Map();
  for (const finding of audits) {
    if (!byAudit.has(finding.audit)) byAudit.set(finding.audit, []);
    byAudit.get(finding.audit).push(finding);
  }
  for (const [name, list] of [...byAudit].sort((a, b) => a[0].localeCompare(b[0]))) {
    push(`OPTIONAL AUDIT — ${name}`, list);
  }

  const summary = summarize(findings);
  const header = [
    `un-editorial-check ${version}`,
    `scanned ${files} file${files === 1 ? '' : 's'}`,
    `editorial: ${summary.errors} error${summary.errors === 1 ? '' : 's'}, ${summary.warnings} warning${summary.warnings === 1 ? '' : 's'}, ${summary.info} note${summary.info === 1 ? '' : 's'}`
      + (audits.length ? `, audits: ${Object.entries(summary.audits).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''),
  ].join(' — ');

  const out = [header, ''];
  if (sections.length) out.push(sections.join('\n\n'), '');
  else out.push('No editorial findings.', '');

  const replacements = fixes.reduce((n, plan) => n + plan.edits.length, 0);
  if (fixes.length) {
    out.push(`${applied ? 'APPLIED' : 'FIXABLE'} — ${replacements} replacement${replacements === 1 ? '' : 's'} in ${fixes.length} file${fixes.length === 1 ? '' : 's'}`, '');
  }
  return out.join('\n');
}

function keyOf(finding) {
  return `${finding.file}:${finding.line}:${finding.column}:${finding.ruleId}`;
}

export function renderJSON({ findings, files, version, fixes = [] }) {
  return `${JSON.stringify({
    version,
    files,
    summary: summarize(findings),
    findings: findings.map(publicFinding),
    fixes: fixes.map(plan => ({
      file: plan.file,
      edits: plan.edits.map(edit => ({
        line: edit.line,
        column: edit.column,
        ruleId: edit.ruleId,
        from: edit.from,
        to: edit.to,
        message: edit.message,
      })),
    })),
  }, null, 2)}\n`;
}

const SARIF_LEVEL = { error: 'error', warning: 'warning', info: 'note' };

export function renderSARIF({ findings, version, informationUri }) {
  const ruleIndex = new Map();
  const rules = [];
  for (const finding of findings) {
    if (ruleIndex.has(finding.ruleId)) continue;
    ruleIndex.set(finding.ruleId, rules.length);
    rules.push({
      id: finding.ruleId,
      name: finding.ruleId.replace(/-/g, '_'),
      shortDescription: { text: finding.message },
      properties: {
        category: finding.category,
        confidence: finding.confidence,
        scope: finding.scope,
        audit: finding.audit || null,
      },
    });
  }
  const results = findings.map(finding => ({
    ruleId: finding.ruleId,
    ruleIndex: ruleIndex.get(finding.ruleId),
    level: SARIF_LEVEL[finding.severity] || 'warning',
    message: { text: finding.suggestion ? `${finding.message} ${finding.suggestion}` : finding.message },
    locations: [{
      physicalLocation: {
        artifactLocation: { uri: finding.file.split('/').join('/') },
        region: { startLine: finding.line, startColumn: finding.column },
      },
    }],
    properties: {
      category: finding.category,
      confidence: finding.confidence,
      scope: finding.scope,
      audit: finding.audit || null,
    },
  }));

  return `${JSON.stringify({
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'un-editorial-check',
          version,
          informationUri,
          rules,
        },
      },
      results,
    }],
  }, null, 2)}\n`;
}
