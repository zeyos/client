import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { summarizeToolCalls } from '../opencode-adapter.mjs';

export async function renderHtmlScorecard({ runId, instance, baseUrl, models = [], records = [], resultsDir, generatedAt = new Date().toISOString(), transcriptsByPath = null }) {
  const transcripts = transcriptsByPath || await loadTranscriptMap(records, resultsDir);
  return renderHtmlScorecardDocument({ runId, instance, baseUrl, models, records, generatedAt, transcriptsByPath: transcripts });
}

export function renderHtmlScorecardDocument({ runId, instance, baseUrl, models = [], records = [], generatedAt = new Date().toISOString(), transcriptsByPath = new Map() }) {
  const rows = records.map((record, index) => ({ record, index, stats: recordStats(record, transcriptsByPath) }));
  const totals = rows.reduce((out, row) => {
    out.durationMs += row.stats.durationMs;
    if (row.stats.zeyosCallsKnown) out.zeyosCalls += row.stats.zeyosCalls;
    else out.zeyosUnknown += 1;
    if (row.stats.toolCallsKnown) out.toolCalls += row.stats.toolCalls;
    else out.toolUnknown += 1;
    out.upstreamCalls += row.stats.upstreamCalls;
    out.apiErrors += row.stats.apiErrors;
    out.costUsd += row.stats.costUsd;
    out.tokens += row.stats.tokens;
    if (row.stats.verdict === 'PASS') out.pass += 1;
    else if (row.stats.verdict === 'EXPENSIVE') out.expensive += 1;
    else out.fail += 1;
    return out;
  }, { durationMs: 0, zeyosCalls: 0, zeyosUnknown: 0, toolCalls: 0, toolUnknown: 0, upstreamCalls: 0, apiErrors: 0, costUsd: 0, tokens: 0, pass: 0, expensive: 0, fail: 0 });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ZeyOS Agent Test Report - ${esc(runId)}</title>
<style>
:root {
  color-scheme: light;
  --bg: #f7f8fa;
  --panel: #ffffff;
  --text: #17202a;
  --muted: #5d6b7a;
  --line: #d9dee5;
  --pass: #18794e;
  --fail: #b42318;
  --review: #8a5a00;
  --expensive: #6b3fa0;
  --code: #101828;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
header { padding: 28px 32px 18px; background: var(--panel); border-bottom: 1px solid var(--line); }
h1 { margin: 0 0 10px; font-size: 24px; letter-spacing: 0; }
.meta, .summary { display: flex; flex-wrap: wrap; gap: 10px 18px; color: var(--muted); }
.summary { margin-top: 16px; color: var(--text); }
.metric { padding: 7px 10px; border: 1px solid var(--line); border-radius: 6px; background: #fbfcfd; }
main { padding: 24px 32px 40px; }
table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); }
th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { font-size: 12px; text-transform: uppercase; color: var(--muted); background: #f1f4f8; }
td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.summary-row { cursor: pointer; }
.summary-row:hover, .summary-row:focus { background: #eef5ff; outline: none; }
.case-title { font-weight: 650; }
.case-id { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.verdict { font-weight: 750; }
.verdict-pass { color: var(--pass); }
.verdict-fail { color: var(--fail); }
.verdict-review { color: var(--review); }
.verdict-expensive { color: var(--expensive); }
.detail-cell { background: #fbfcfd; padding: 0; }
.detail-wrap { padding: 16px; display: grid; gap: 16px; }
.detail-section { border: 1px solid var(--line); border-radius: 6px; background: var(--panel); overflow: hidden; }
.detail-section h2 { margin: 0; padding: 10px 12px; font-size: 13px; background: #f6f8fb; border-bottom: 1px solid var(--line); }
.attempt-list { display: grid; gap: 12px; padding: 12px; }
.attempt-card { border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.attempt-head { display: flex; flex-wrap: wrap; gap: 8px 14px; padding: 9px 10px; background: #fbfcfd; border-bottom: 1px solid var(--line); }
pre { margin: 0; padding: 12px; overflow: auto; color: var(--code); background: #f8fafc; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.empty { color: var(--muted); padding: 12px; }
@media (max-width: 760px) {
  header, main { padding-left: 16px; padding-right: 16px; }
  th, td { padding: 8px; }
  .hide-sm { display: none; }
}
</style>
</head>
<body>
<header>
  <h1>ZeyOS Agent Test Report</h1>
  <div class="meta">
    <span>Run <strong>${esc(runId)}</strong></span>
    <span>Instance <strong>${esc(instance || '(unknown)')}</strong></span>
    <span>${esc(baseUrl || '')}</span>
    <span>Generated ${esc(generatedAt)}</span>
    <span>Models ${esc(models.join(', ') || '(none)')}</span>
  </div>
  <div class="summary">
    <span class="metric">${records.length} test cases</span>
    <span class="metric">${totals.pass} pass</span>
    <span class="metric">${totals.expensive} pass but expensive</span>
    <span class="metric">${totals.fail} non-pass</span>
    <span class="metric">${formatDuration(totals.durationMs)} total</span>
    <span class="metric">${formatAggregateCount(totals.zeyosCalls, totals.zeyosUnknown)} zeyos calls</span>
    <span class="metric">${formatAggregateCount(totals.toolCalls, totals.toolUnknown)} tool calls</span>
    <span class="metric">${totals.upstreamCalls} upstream calls</span>
    <span class="metric">${totals.apiErrors} API errors</span>
    <span class="metric">${formatMoney(totals.costUsd)} cost</span>
    <span class="metric">${formatTokens(totals.tokens)} tokens</span>
  </div>
</header>
<main>
  <table aria-label="Agent test cases">
    <thead>
      <tr>
        <th>Name of test case</th>
        <th class="num">Time to complete</th>
        <th class="num">ZeyOS command calls</th>
        <th class="num">Total tool calls</th>
        <th class="num">Upstream API calls</th>
        <th class="num">API errors</th>
        <th class="num">Cost</th>
        <th class="num">Tokens</th>
        <th>Pass/Fail</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(renderRecordRows).join('\n')}
    </tbody>
  </table>
</main>
<script>
document.addEventListener('click', function (event) {
  var row = event.target.closest('tr[data-detail-id]');
  if (!row) return;
  toggle(row);
});
document.addEventListener('keydown', function (event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  var row = event.target.closest('tr[data-detail-id]');
  if (!row) return;
  event.preventDefault();
  toggle(row);
});
function toggle(row) {
  var detail = document.getElementById(row.getAttribute('data-detail-id'));
  if (!detail) return;
  var nextOpen = detail.hasAttribute('hidden');
  detail.toggleAttribute('hidden', !nextOpen);
  row.setAttribute('aria-expanded', String(nextOpen));
}
</script>
</body>
</html>
`;

  function renderRecordRows({ record, index, stats }) {
    const detailId = `details-${index}`;
    const verdictClass = stats.verdict === 'PASS'
      ? 'verdict-pass'
      : stats.verdict === 'EXPENSIVE' ? 'verdict-expensive'
        : stats.verdict === 'FAIL' ? 'verdict-fail' : 'verdict-review';
    return `<tr class="summary-row" tabindex="0" aria-expanded="false" data-detail-id="${detailId}">
  <td><div class="case-title">${esc(record.title || record.id)}</div><div class="case-id">${esc(record.id || '')}${record.classification ? ` - ${esc(record.classification)}` : ''}</div></td>
  <td class="num">${esc(formatDuration(stats.durationMs))}</td>
  <td class="num">${formatCount(stats.zeyosCalls, stats.zeyosCallsKnown)}</td>
  <td class="num">${formatCount(stats.toolCalls, stats.toolCallsKnown)}</td>
  <td class="num">${stats.upstreamCalls}</td>
  <td class="num">${stats.apiErrors}</td>
  <td class="num">${esc(formatMoney(stats.costUsd))}</td>
  <td class="num">${esc(formatTokens(stats.tokens))}</td>
  <td><span class="verdict ${verdictClass}">${esc(stats.verdict)}</span></td>
</tr>
<tr id="${detailId}" hidden>
  <td class="detail-cell" colspan="9">${renderRecordDetail(record, transcriptsByPath)}</td>
</tr>`;
  }
}

async function loadTranscriptMap(records, resultsDir) {
  const out = new Map();
  if (!resultsDir) return out;
  for (const record of records || []) {
    for (const attempt of record.attempts || []) {
      if (!attempt.transcriptPath || out.has(attempt.transcriptPath)) continue;
      try {
        out.set(attempt.transcriptPath, await readFile(path.resolve(resultsDir, attempt.transcriptPath), 'utf8'));
      } catch (err) {
        out.set(attempt.transcriptPath, `Unable to read transcript ${attempt.transcriptPath}: ${err.message || err}`);
      }
    }
  }
  return out;
}

function recordStats(record, transcriptsByPath) {
  const attempts = record.attempts || [];
  const summary = attempts.reduce((out, attempt) => {
    const tools = attemptToolSummary(attempt, transcriptsByPath);
    const known = tools.observed !== false || (Number(tools.totalCalls) || 0) > 0 || (Number(attempt.traceSummary?.count) || 0) === 0;
    out.durationMs += Number(attempt.durationMs) || 0;
    if (known) {
      out.zeyosCalls += Number(tools.zeyosCalls) || 0;
      out.toolCalls += Number(tools.totalCalls) || 0;
    } else {
      out.zeyosCallsKnown = false;
      out.toolCallsKnown = false;
    }
    out.upstreamCalls += Number(attempt.traceSummary?.upstream) || 0;
    out.apiErrors += Number(attempt.traceSummary?.apiErrors) || 0;
    out.costUsd += Number(attempt.usage?.costUsd) || 0;
    out.tokens += Number(attempt.usage?.tokens?.total) || 0;
    return out;
  }, { durationMs: 0, zeyosCalls: 0, zeyosCallsKnown: true, toolCalls: 0, toolCallsKnown: true, upstreamCalls: 0, apiErrors: 0, costUsd: 0, tokens: 0 });
  return {
    ...summary,
    verdict: record.classification === 'PASS'
      ? 'PASS'
      : record.classification === 'EFFICIENCY_REGRESSION' ? 'EXPENSIVE'
      : record.classification === 'MANUAL_REVIEW' ? 'REVIEW'
        : record.classification === 'ENVIRONMENT_SKIP' ? 'SKIP'
          : 'FAIL'
  };
}

function attemptToolSummary(attempt, transcriptsByPath) {
  if (attempt.toolSummary) return attempt.toolSummary;
  const transcript = transcriptsByPath.get(attempt.transcriptPath);
  if (!transcript) return { observed: false, totalCalls: 0, zeyosCalls: 0 };
  return summarizeToolCalls(transcriptSection(transcript, 'STDERR') || transcript);
}

function renderRecordDetail(record, transcriptsByPath) {
  const prompt = firstPrompt(record, transcriptsByPath);
  return `<div class="detail-wrap">
  <section class="detail-section">
    <h2>Prompt Used</h2>
    ${prompt ? `<pre>${esc(prompt)}</pre>` : '<div class="empty">No prompt recorded.</div>'}
  </section>
  <section class="detail-section">
    <h2>Expected Result</h2>
    <pre>${esc(expectedBlock(record))}</pre>
  </section>
  <section class="detail-section">
    <h2>Agent Protocol</h2>
    <div class="attempt-list">
      ${(record.attempts || []).map((attempt) => renderAttempt(attempt, transcriptsByPath)).join('\n') || '<div class="empty">No attempts recorded.</div>'}
    </div>
  </section>
</div>`;
}

function renderAttempt(attempt, transcriptsByPath) {
  const transcript = transcriptsByPath.get(attempt.transcriptPath) || '(transcript not recorded)';
  const tools = attemptToolSummary(attempt, transcriptsByPath);
  const known = tools.observed !== false || (Number(tools.totalCalls) || 0) > 0 || (Number(attempt.traceSummary?.count) || 0) === 0;
  const verdict = attempt.pass === true ? 'PASS' : attempt.pass === null ? 'REVIEW' : 'FAIL';
  const postTrace = attempt.successfulApiTrace ? '<span>post-trace runner/provider failure</span>' : '';
  const envLeak = attempt.environmentLeaks?.length ? `<span>environment leak: ${esc(attempt.environmentLeaks[0].sample)}</span>` : '';
  return `<article class="attempt-card">
  <div class="attempt-head">
    <strong>${esc(attempt.model || '(unknown model)')}</strong>
    <span>${esc(verdict)}</span>
    <span>${esc(formatDuration(Number(attempt.durationMs) || 0))}</span>
    <span>${formatCount(Number(tools.zeyosCalls) || 0, known)} zeyos calls</span>
    <span>${formatCount(Number(tools.totalCalls) || 0, known)} tool calls</span>
    <span>${Number(attempt.traceSummary?.upstream) || 0} upstream calls</span>
    <span>${Number(attempt.traceSummary?.apiErrors) || 0} API errors</span>
    <span>${esc(formatMoney(Number(attempt.usage?.costUsd) || 0))}</span>
    <span>${esc(formatTokens(Number(attempt.usage?.tokens?.total) || 0))} tokens</span>
    ${postTrace}
    ${envLeak}
  </div>
  <pre>${esc(transcript)}</pre>
</article>`;
}

function firstPrompt(record, transcriptsByPath) {
  for (const attempt of record.attempts || []) {
    const transcript = transcriptsByPath.get(attempt.transcriptPath);
    const prompt = transcriptSection(transcript, 'PROMPT');
    if (prompt) return prompt;
  }
  return null;
}

function expectedBlock(record) {
  const lines = [];
  for (const attempt of record.attempts || []) {
    const expected = attempt.expected !== undefined
      ? attempt.expected
      : attempt.turns ? attempt.turns.map((turn) => ({ id: turn.id, expected: turn.expected })).filter((turn) => turn.expected !== undefined)
        : undefined;
    lines.push(`${attempt.model || '(unknown model)'}: ${expected === undefined ? '(not recorded)' : JSON.stringify(expected, null, 2)}`);
  }
  return lines.join('\n\n') || '(not recorded)';
}

function transcriptSection(text, name) {
  if (!text) return null;
  const marker = `===== ${name} =====`;
  const start = String(text).indexOf(marker);
  if (start < 0) return null;
  const bodyStart = start + marker.length;
  const rest = String(text).slice(bodyStart).replace(/^\r?\n/, '');
  const next = rest.search(/\r?\n===== [A-Z]+ =====\r?\n/);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function formatDuration(ms) {
  const n = Number(ms) || 0;
  if (n < 1000) return `${Math.round(n)}ms`;
  const seconds = n / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function formatCount(value, known) {
  return known ? String(Number(value) || 0) : 'n/a';
}

function formatAggregateCount(value, unknownRows) {
  const rendered = String(Number(value) || 0);
  return unknownRows ? `${rendered} + ${unknownRows} n/a` : rendered;
}

function formatMoney(value) {
  const n = Number(value) || 0;
  return `$${n.toFixed(6)}`;
}

function formatTokens(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US');
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { recordStats, transcriptSection, formatDuration };
