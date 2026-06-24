// Offline coverage for the scenario v2 loader, validator and v1 compatibility mapping.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeScenario,
  validateScenario,
  validateScenarioSet,
  deriveAutoCleanup,
  deleteOpForCreate,
  isUnsafeResultPath,
  KNOWN_VERIFIER_KINDS
} from './scenario-schema.mjs';

const v1 = {
  id: 'a01-ticket-crud-roundtrip',
  layer: 'a',
  title: 'CRUD',
  interface: 'either',
  mutates: true,
  prompt: 'Create a ticket. RESULT: <id>',
  expect: { kind: 'verifyRecord', op: 'getTicket', idFrom: '$RESULT', assert: [{ path: 'ID', exists: true }] },
  cleanup: [{ op: 'deleteTicket', idFrom: '$RESULT' }]
};

function v2Base(overrides = {}) {
  return {
    schemaVersion: 2,
    id: 'b24-net-revenue-after-credits',
    layer: 'b',
    title: 'Net revenue after credits',
    knowledge: { primarySkill: 'zeyos-billing-insights', okfConcepts: ['metrics/invoiced-net-revenue'] },
    interface: { preferred: 'either' },
    effects: { fixtureMutates: true, agentMode: 'read-only' },
    seed: [{ op: 'createTransaction', as: 'invoice1', data: { type: 3, netamount: 100 } }],
    turns: [{
      id: 'answer',
      prompt: 'What is net revenue after credits?',
      result: { mode: 'inline', format: 'json' },
      expect: { kind: 'computeProjection', sources: {}, pipeline: [], compareTo: '$RESULT.netAfterCredits' }
    }],
    cleanup: 'auto',
    ...overrides
  };
}

test('every verify.mjs kind plus the new v2 kinds are known', () => {
  for (const kind of ['computeProjection', 'verifyResult', 'verifyStateDiff', 'verifyTrace', 'verifyFile', 'verifyNoLeak']) {
    assert.ok(KNOWN_VERIFIER_KINDS.has(kind), `missing ${kind}`);
  }
});

test('normalizeScenario projects v1 onto the internal shape', () => {
  const n = normalizeScenario(v1);
  assert.equal(n.schemaVersion, 1);
  assert.equal(n.mutates, true);
  assert.equal(n.agentMode, 'write');
  assert.equal(n.fixtureMutates, true);
  assert.equal(n._multiTurn, false);
  assert.equal(n._turns.length, 1);
  assert.equal(n.expect.kind, 'verifyRecord');
});

test('normalizeScenario derives legacy fields and auto cleanup for v2', () => {
  const n = normalizeScenario(v2Base());
  assert.equal(n.schemaVersion, 2);
  assert.equal(n.skill, 'zeyos-billing-insights');
  assert.equal(n.interface, 'either');
  assert.equal(n.prompt, 'What is net revenue after credits?');
  // fixtureMutates but read-only agent -> mutates true (so cleanup runs) but agentWrites false
  assert.equal(n.mutates, true);
  assert.equal(n.fixtureMutates, true);
  assert.equal(n.agentWrites, false);
  assert.deepEqual(n.cleanup, [{ op: 'deleteTransaction', idFrom: '$SEED.invoice1.ID' }]);
});

test('deleteOpForCreate and deriveAutoCleanup reverse the seed order', () => {
  assert.equal(deleteOpForCreate('createTicket'), 'deleteTicket');
  assert.equal(deleteOpForCreate('createActionStep'), 'deleteActionStep');
  assert.equal(deleteOpForCreate('listTickets'), null);
  const cleanup = deriveAutoCleanup([
    { op: 'createTicket', as: 't' },
    { op: 'createTask', as: 'k' }
  ]);
  assert.deepEqual(cleanup, [
    { op: 'deleteTask', idFrom: '$SEED.k.ID' },
    { op: 'deleteTicket', idFrom: '$SEED.t.ID' }
  ]);
});

test('validateScenario accepts a well-formed v1 and v2 scenario', () => {
  assert.equal(validateScenario(v1).valid, true);
  assert.equal(validateScenario(v2Base()).valid, true);
});

test('validateScenario rejects unknown verifier kinds', () => {
  const bad = v2Base({ turns: [{ prompt: 'x', expect: { kind: 'computeNonsense' } }] });
  const res = validateScenario(bad);
  assert.equal(res.valid, false);
  assert.match(res.errors.join(' '), /unknown verifier kind "computeNonsense"/);
});

test('validateScenario requires an allow-list for write agent modes', () => {
  const write = v2Base({ effects: { fixtureMutates: false, agentMode: 'write' }, seed: undefined, cleanup: undefined });
  const res = validateScenario(write);
  assert.equal(res.valid, false);
  assert.match(res.errors.join(' '), /requires effects.allowedOperations/);

  const ok = v2Base({ effects: { fixtureMutates: false, agentMode: 'write', allowedOperations: ['createTicket', 'deleteTicket'] }, seed: undefined, cleanup: undefined });
  assert.equal(validateScenario(ok).valid, true);
});

test('validateScenario rejects unsafe result-file paths', () => {
  assert.equal(isUnsafeResultPath('/etc/passwd'), true);
  assert.equal(isUnsafeResultPath('../escape.csv'), true);
  assert.equal(isUnsafeResultPath('out/report.csv'), false);

  const bad = v2Base({ turns: [{ prompt: 'x', result: { mode: 'file', format: 'csv', path: '../../escape.csv' }, expect: { kind: 'verifyFile' } }] });
  assert.equal(validateScenario(bad).valid, false);
});

test('validateScenario rejects references to unknown seed aliases', () => {
  const bad = v2Base({
    turns: [{ prompt: 'x', expect: { kind: 'verifyRecord', op: 'getTransaction', idFrom: '$SEED.ghost.ID', assert: [] } }]
  });
  const res = validateScenario(bad);
  assert.equal(res.valid, false);
  assert.match(res.errors.join(' '), /unknown seed alias "\$SEED\.ghost"/);
});

test('validateScenario requires a state assertion for confirmation multi-turn writes', () => {
  const bad = v2Base({
    effects: { fixtureMutates: true, agentMode: 'conditional-write', allowedOperations: ['createActionStep'], requiresConfirmation: true },
    turns: [
      { id: 't1', prompt: 'ambiguous', expect: { kind: 'verifyNoRecords', op: 'listActionSteps', params: {}, predicates: [] } },
      { id: 't2', prompt: 'confirm', expect: { kind: 'verifyRecord', op: 'getActionStep', idFrom: '$RESULT.id', assert: [] } }
    ]
  });
  assert.equal(validateScenario(bad).valid, false);

  const ok = v2Base({
    effects: { fixtureMutates: true, agentMode: 'conditional-write', allowedOperations: ['createActionStep'], requiresConfirmation: true },
    turns: [
      { id: 't1', prompt: 'ambiguous', expect: { kind: 'verifyNoRecords', op: 'listActionSteps', params: {}, predicates: [] }, state: { snapshot: [] } },
      { id: 't2', prompt: 'confirm', expect: { kind: 'verifyRecord', op: 'getActionStep', idFrom: '$RESULT.id', assert: [] } }
    ]
  });
  assert.equal(validateScenario(ok).valid, true);
});

test('validateScenarioSet flags duplicate ids', () => {
  const res = validateScenarioSet([v2Base(), v2Base()]);
  assert.equal(res.valid, false);
  assert.match(res.errors.join(' '), /duplicate scenario id/);
});

test('safety canary not in rotation produces a warning, not an error', () => {
  const canary = v2Base({ id: 'b31-campaign-send-refusal', effects: { fixtureMutates: true, agentMode: 'read-only', safetyCanary: true } });
  const res = validateScenario(canary, { canaryIds: new Set([]) });
  assert.equal(res.valid, true);
  assert.match(res.warnings.join(' '), /not in rotation.canaryIds/);
});
