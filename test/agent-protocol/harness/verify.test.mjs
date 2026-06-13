// Offline unit coverage for the agent-protocol verification engine and rotation
// classifier. Runs under the repo's existing `npm test` (node --test scans test/).
// Uses a fake client — no live instance or credentials required.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import {
  parseResultLine,
  coerceResult,
  evaluateExpect,
  orphanSweep
} from './verify.mjs';
import { runAgent } from './opencode-adapter.mjs';
import { classify, globToRe } from './run.mjs';

const ctxBase = { runId: 'run-1', recordPrefix: 'AGENTTEST' };

function fakeClient(ops) {
  return { api: ops };
}

test('parseResultLine takes the last RESULT line and trims it', () => {
  assert.equal(parseResultLine('noise\nRESULT: 41\nmore\nRESULT:  42 '), '42');
  assert.equal(parseResultLine('no result here'), null);
});

test('coerceResult parses numbers, JSON, and falls back to string', () => {
  assert.equal(coerceResult('42'), 42);
  assert.deepEqual(coerceResult('{"a":1}'), { a: 1 });
  assert.deepEqual(coerceResult('[1,2]'), [1, 2]);
  assert.equal(coerceResult('hello'), 'hello');
  assert.equal(coerceResult(null), null);
});

test('computeCount applies in/notIn/equals predicates and compares to the agent number', async () => {
  const rows = [
    { ID: 1, priority: 4, status: 4 },
    { ID: 2, priority: 3, status: 9 }, // completed -> excluded
    { ID: 3, priority: 1, status: 4 }, // low priority -> excluded
    { ID: 4, priority: 3, status: 4 }
  ];
  const client = fakeClient({ listTickets: async () => rows });
  const expect = {
    kind: 'computeCount',
    op: 'listTickets',
    params: { filters: { visibility: 0 } },
    predicates: [{ field: 'priority', in: [3, 4] }, { field: 'status', notIn: [8, 9, 10] }]
  };

  const good = await evaluateExpect(expect, { ...ctxBase, client, result: '2' });
  assert.equal(good.pass, true);
  assert.equal(good.expected, 2);

  const bad = await evaluateExpect(expect, { ...ctxBase, client, result: '5' });
  assert.equal(bad.pass, false);
  assert.equal(bad.expected, 2);
});

test('verifyRecord fetches by $RESULT id and checks assertions with token substitution', async () => {
  const client = fakeClient({
    getTicket: async ({ ID }) => ({ ID, name: 'AGENTTEST-run-1 smoke', priority: 4 })
  });
  const expect = {
    kind: 'verifyRecord',
    op: 'getTicket',
    idFrom: '$RESULT',
    assert: [
      { path: 'ID', exists: true },
      { path: 'name', equals: '{recordPrefix}-{runId} smoke' },
      { path: 'priority', equals: 4 }
    ]
  };
  const ok = await evaluateExpect(expect, { ...ctxBase, client, result: '123' });
  assert.equal(ok.pass, true);

  const mismatch = await evaluateExpect(
    { ...expect, assert: [{ path: 'priority', equals: 1 }] },
    { ...ctxBase, client, result: '123' }
  );
  assert.equal(mismatch.pass, false);

  const noId = await evaluateExpect(expect, { ...ctxBase, client, result: null });
  assert.equal(noId.pass, false);
});

test('computeMembership resolves $RESULT.field tokens in params and checks presence', async () => {
  const client = fakeClient({
    listTickets: async ({ filters }) => {
      assert.equal(filters.account, 111); // token resolved from RESULT
      return [{ ID: 222 }, { ID: 999 }];
    }
  });
  const expect = {
    kind: 'computeMembership',
    listOp: 'listTickets',
    listParams: { filters: { account: '$RESULT.accountId', visibility: 0 } },
    idFrom: '$RESULT.ticketId',
    idField: 'ID',
    expectPresent: true
  };
  const res = await evaluateExpect(expect, { ...ctxBase, client, result: '{"accountId":111,"ticketId":222}' });
  assert.equal(res.pass, true);
});

test('expectText matches any configured keyword case-insensitively', async () => {
  const expect = { kind: 'expectText', mode: 'contains', anyOf: ['404', 'not found'] };
  assert.equal((await evaluateExpect(expect, { ...ctxBase, result: 'Got 404 Not Found' })).pass, true);
  assert.equal((await evaluateExpect(expect, { ...ctxBase, result: 'all good' })).pass, false);
});

test('manual scenarios defer to human/judge (pass: null)', async () => {
  const res = await evaluateExpect({ kind: 'manual', rubric: 'x' }, { ...ctxBase, result: 'whatever' });
  assert.equal(res.pass, null);
  assert.equal(res.manual, true);
});

test('orphanSweep dry-run reports AGENTTEST-* records without deleting', async () => {
  let deleted = 0;
  const client = fakeClient({
    listTickets: async () => [{ ID: 1, name: 'AGENTTEST-old smoke' }, { ID: 2, name: 'real ticket' }],
    listAccounts: async () => [{ ID: 5, lastname: 'Normal' }],
    deleteTicket: async () => { deleted += 1; },
    deleteAccount: async () => { deleted += 1; }
  });
  const report = await orphanSweep(client, 'AGENTTEST', { dryRun: true });
  assert.equal(deleted, 0);
  assert.equal(report.filter((r) => r.wouldDelete).length, 1);
});

test('classify implements the rotation escalation rule', () => {
  assert.equal(classify([{ pass: true }], false), 'PASS');
  assert.equal(classify([{ pass: false }, { pass: true }], false), 'MODEL_FLAKE');
  assert.equal(classify([{ pass: false }, { pass: false }], false), 'CLIENT_DEFECT');
  assert.equal(classify([{ pass: null }], false), 'MANUAL_REVIEW');
  // canary: all pass -> PASS, mixed -> divergence, all fail -> defect
  assert.equal(classify([{ pass: true }, { pass: true }], true), 'PASS');
  assert.equal(classify([{ pass: true }, { pass: false }], true), 'MODEL_DIVERGENCE');
  assert.equal(classify([{ pass: false }, { pass: false }], true), 'CLIENT_DEFECT');
});

test('globToRe: ** crosses path separators, * stays within a segment', () => {
  assert.equal(globToRe('**').test('layer-a/a01'), true);
  assert.equal(globToRe('layer-a/*').test('layer-a/a01'), true);
  assert.equal(globToRe('layer-a/*').test('layer-b/b01'), false);
});

test('runAgent resolves (does not hang) when the runner binary is missing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ap-adapter-'));
  try {
    const res = await runAgent({
      runner: { command: 'definitely-not-a-real-binary-xyz123', args: ['{model}'], timeoutMs: 5000 },
      model: 'x/y', prompt: 'hi', env: process.env, repoRoot: dir, resultsDir: dir, scenarioId: 'enoent'
    });
    assert.equal(res.code, 127);
    assert.match(res.stderr, /ENOENT|not found|spawn/i);
    assert.equal(res.timedOut, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
