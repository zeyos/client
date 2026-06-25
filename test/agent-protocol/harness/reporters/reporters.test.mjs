// Offline coverage for the JUnit and coverage reporters.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toJUnitXml } from './junit.mjs';
import { computeCoverage, renderCoverageMarkdown, scenarioDimensions } from './coverage.mjs';
import { renderHtmlScorecardDocument, recordStats, transcriptSection } from './html.mjs';

const records = [
  { id: 'a01', layer: 'a', title: 'CRUD', classification: 'PASS', attempts: [{ model: 'm', pass: true, durationMs: 1000 }] },
  { id: 'b24', layer: 'b', title: 'Net revenue', classification: 'CLIENT_DEFECT', attempts: [{ model: 'm', pass: false, durationMs: 2000, detail: 'wrong sum', expected: 130, actual: 150 }] },
  { id: 'b37', layer: 'b', title: 'Perms', classification: 'ENVIRONMENT_SKIP', attempts: [{ model: 'm', pass: false, durationMs: 0, detail: 'no data' }] }
];

test('toJUnitXml marks defects as failures and env skips as skipped', () => {
  const xml = toJUnitXml(records);
  assert.match(xml, /<testsuites name="zeyos-agent-protocol" tests="3" failures="1" skipped="1"/);
  assert.match(xml, /<failure message="CLIENT_DEFECT: wrong sum">/);
  assert.match(xml, /<skipped message="no data"\/>/);
  assert.match(xml, /name="a01 — CRUD"/);
});

test('toJUnitXml escapes XML metacharacters', () => {
  const xml = toJUnitXml([{ id: 'x', layer: 'a', title: 'a < b & "c"', classification: 'PASS', attempts: [] }]);
  assert.match(xml, /a &lt; b &amp; &quot;c&quot;/);
});

test('scenarioDimensions extracts coverage facets', () => {
  const s = {
    id: 'b24', layer: 'b', skill: 'zeyos-billing-insights', agentMode: 'read-only',
    knowledge: { okfConcepts: ['metrics/invoiced-net-revenue'] },
    coverage: { entities: ['transactions'], operations: ['listTransactions'], formats: ['json'], rules: ['R-016'] },
    interface: { preferred: 'either' }, tags: ['billing'], _multiTurn: false,
    _turns: [{ expect: { kind: 'computeProjection' } }]
  };
  const d = scenarioDimensions(s);
  assert.deepEqual(d.skill, ['zeyos-billing-insights']);
  assert.deepEqual(d.entity, ['transactions']);
  assert.deepEqual(d.verifierKind, ['computeProjection']);
  assert.deepEqual(d.turns, ['single-turn']);
  assert.deepEqual(d.rule, ['R-016']);
});

test('computeCoverage tallies totals and pass counts per dimension', () => {
  const scenarios = [
    { id: 'a01', layer: 'a', skill: 'zeyos', agentMode: 'write', _turns: [{ expect: { kind: 'verifyRecord' } }], coverage: { entities: ['tickets'] } },
    { id: 'b24', layer: 'b', skill: 'zeyos-billing-insights', agentMode: 'read-only', _turns: [{ expect: { kind: 'computeProjection' } }], coverage: { entities: ['transactions'] } }
  ];
  const cov = computeCoverage(scenarios, records);
  assert.equal(cov.totals.scenarios, 2);
  assert.equal(cov.totals.skills, 2);
  assert.equal(cov.dimensions.entity.tickets.total, 1);
  assert.equal(cov.dimensions.entity.transactions.pass, 0); // b24 is a defect in records
  assert.match(renderCoverageMarkdown(cov), /# Coverage/);
});

test('renderHtmlScorecardDocument creates an expandable single-file report', () => {
  const transcript = [
    '# scenario: b02-answer',
    '',
    '===== PROMPT =====',
    '/zeyos',
    'Count customers.',
    '',
    '===== STDOUT =====',
    'RESULT: 42',
    '',
    '===== STDERR =====',
    '$ zeyos count accounts --filter \'{"type":1}\' --json',
    '42'
  ].join('\n');
  const transcripts = new Map([['transcripts/b02.txt', transcript]]);
  const reportRecords = [{
    id: 'b02-account-customer-count',
    layer: 'b',
    title: 'Count customers',
    classification: 'PASS',
    attempts: [{
      model: 'openrouter/deepseek/deepseek-v4-flash',
      pass: true,
      durationMs: 1234,
      expected: 42,
      actual: 42,
      transcriptPath: 'transcripts/b02.txt',
      traceSummary: { apiErrors: 0 }
    }]
  }];

  const html = renderHtmlScorecardDocument({
    runId: 'html-test',
    instance: 'demo',
    baseUrl: 'https://cloud.zeyos.com/demo',
    models: ['openrouter/deepseek/deepseek-v4-flash'],
    records: reportRecords,
    generatedAt: '2026-06-25T00:00:00.000Z',
    transcriptsByPath: transcripts
  });

  assert.match(html, /Name of test case/);
  assert.match(html, /Time to complete/);
  assert.match(html, /ZeyOS command calls/);
  assert.match(html, /Total tool calls/);
  assert.match(html, /API errors/);
  assert.match(html, /Pass\/Fail/);
  assert.match(html, /data-detail-id="details-0"/);
  assert.match(html, /\/zeyos/);
  assert.match(html, /Expected Result/);
  assert.match(html, /Agent Protocol/);
  assert.match(html, /1\.2s/);

  assert.deepEqual(recordStats(reportRecords[0], transcripts), {
    durationMs: 1234,
    zeyosCalls: 1,
    zeyosCallsKnown: true,
    toolCalls: 1,
    toolCallsKnown: true,
    apiErrors: 0,
    verdict: 'PASS'
  });
  assert.equal(transcriptSection(transcript, 'PROMPT'), '/zeyos\nCount customers.');
});

test('recordStats marks command counts unknown when API trace exists without a tool stream', () => {
  const record = {
    id: 'b02',
    classification: 'PASS',
    attempts: [{
      model: 'm',
      pass: true,
      durationMs: 100,
      transcriptPath: 'missing.txt',
      toolSummary: { source: 'runner-transcript', observed: false, totalCalls: 0, zeyosCalls: 0 },
      traceSummary: { count: 1, apiErrors: 0 }
    }]
  };

  assert.deepEqual(recordStats(record, new Map()), {
    durationMs: 100,
    zeyosCalls: 0,
    zeyosCallsKnown: false,
    toolCalls: 0,
    toolCallsKnown: false,
    apiErrors: 0,
    verdict: 'PASS'
  });
});
