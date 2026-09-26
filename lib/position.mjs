// Offset -> line/column mapping for extracted copy spans.
//
// Every unit carries the exact source slice it was built from (`raw`) and the
// offset where that slice starts. Findings are positioned by locating the
// matched token inside `raw`, so a finding on the fortieth word of a paragraph
// points at that word, not at column 1 of the paragraph.

export function lineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

export function posAt(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, column: offset - starts[low] + 1 };
}

function tokenAt(raw, matched) {
  const direct = raw.indexOf(matched);
  if (direct >= 0) return direct;
  // The matched phrase may span a newline or an entity that normalisation
  // rewrote; fall back to its leading word, then its trailing word.
  const words = matched.split(/\s+/).filter(Boolean);
  for (const word of [words[0], words[words.length - 1]]) {
    if (!word) continue;
    const at = raw.indexOf(word);
    if (at >= 0) return at;
  }
  return -1;
}

/**
 * Position of `matched` (found at `index` in the cleaned unit text) inside the
 * original source. Falls back to the start of the copy span.
 */
export function locate(unit, matched, index) {
  const needle = matched || '';
  const map = unit.map;

  // Preferred: the unit's offset map points at the exact source character each
  // piece of copy came from, so the position cannot land on a masked region.
  if (map && typeof index === 'number' && index >= 0 && index < map.length && needle) {
    const offset = map[index];
    return { offset, ...posAt(unit.starts, offset) };
  }

  const raw = unit.raw || '';
  let at = -1;
  if (needle && typeof index === 'number' && index >= 0 && raw.startsWith(needle, index)) {
    at = index;
  } else if (needle) {
    at = tokenAt(raw, needle);
  }
  const offset = unit.offset + (at >= 0 ? at : 0);
  return { offset, ...posAt(unit.starts, offset) };
}
