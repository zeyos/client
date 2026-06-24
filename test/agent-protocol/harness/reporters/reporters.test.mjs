// Offline coverage for the JUnit and coverage reporters.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toJUnitXml } from './junit.mjs';
import { computeCoverage, renderCoverageMarkdown, scenarioDimensions } from './coverage.mjs';

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
