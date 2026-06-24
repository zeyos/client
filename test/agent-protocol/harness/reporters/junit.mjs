/**
 * JUnit XML reporter (spec §8.12). Lets the protocol's results import into any standard
 * CI test viewer. Each scenario is a <testcase>; a release-blocking classification
 * (CLIENT_DEFECT / SAFETY_REGRESSION) becomes a <failure>, an ENVIRONMENT_SKIP becomes
 * <skipped>, everything else passes. Grouped into one <testsuite> per layer.
 */

const BLOCKING = new Set(['CLIENT_DEFECT', 'SAFETY_REGRESSION', 'POLICY_BLOCKED_UNSAFE_ATTEMPT']);

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function lastDetail(record) {
  const a = record.attempts?.[record.attempts.length - 1];
  return a?.detail || record.summaryLine || '';
}

/** Render records → JUnit XML string. */
export function toJUnitXml(records, { name = 'zeyos-agent-protocol' } = {}) {
  const byLayer = new Map();
  for (const r of records) {
    const key = `layer-${r.layer || '?'}`;
    if (!byLayer.has(key)) byLayer.set(key, []);
    byLayer.get(key).push(r);
  }

  const totalTime = records.reduce((s, r) => s + ((r.attempts || []).reduce((t, a) => t + (a.durationMs || 0), 0) / 1000), 0);
  const totalFail = records.filter((r) => BLOCKING.has(r.classification)).length;
  const totalSkip = records.filter((r) => r.classification === 'ENVIRONMENT_SKIP').length;

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<testsuites name="${esc(name)}" tests="${records.length}" failures="${totalFail}" skipped="${totalSkip}" time="${totalTime.toFixed(3)}">`);
  for (const [suiteName, items] of byLayer) {
    const fails = items.filter((r) => BLOCKING.has(r.classification)).length;
    const skips = items.filter((r) => r.classification === 'ENVIRONMENT_SKIP').length;
    const time = items.reduce((s, r) => s + ((r.attempts || []).reduce((t, a) => t + (a.durationMs || 0), 0) / 1000), 0);
    lines.push(`  <testsuite name="${esc(suiteName)}" tests="${items.length}" failures="${fails}" skipped="${skips}" time="${time.toFixed(3)}">`);
    for (const r of items) {
      const time2 = ((r.attempts || []).reduce((t, a) => t + (a.durationMs || 0), 0) / 1000).toFixed(3);
      lines.push(`    <testcase classname="${esc(name)}.${esc(r.layer)}" name="${esc(r.id)} — ${esc(r.title)}" time="${time2}">`);
      if (BLOCKING.has(r.classification)) {
        lines.push(`      <failure message="${esc(r.classification)}: ${esc(lastDetail(r))}">${esc(detailBlock(r))}</failure>`);
      } else if (r.classification === 'ENVIRONMENT_SKIP') {
        lines.push(`      <skipped message="${esc(lastDetail(r))}"/>`);
      } else if (r.classification === 'MANUAL_REVIEW') {
        lines.push('      <system-out>MANUAL_REVIEW — see transcript</system-out>');
      }
      lines.push('    </testcase>');
    }
    lines.push('  </testsuite>');
  }
  lines.push('</testsuites>');
  return `${lines.join('\n')}\n`;
}

function detailBlock(r) {
  return (r.attempts || [])
    .map((a) => `${a.model} -> ${a.pass === true ? 'PASS' : a.pass === null ? 'REVIEW' : 'FAIL'}${a.expected !== undefined ? ` expected=${JSON.stringify(a.expected)} actual=${JSON.stringify(a.actual)}` : ''} ${a.detail || ''}`)
    .join('\n');
}

export { BLOCKING };
