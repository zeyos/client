// Offline coverage for the ownership manifest, derived cleanup and orphan recipes.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOwnershipManifest, orphanRecipesFromScenarios, ownershipGap, labelFieldFor } from './fixtures.mjs';

test('manifest registers seeds and exposes ownership keys', () => {
  const m = createOwnershipManifest();
  m.register({ operationId: 'createTicket', id: 50, alias: 'ticket' });
  m.register({ operationId: 'createActionStep', id: 77, alias: 'step' });
  const keys = m.ownedKeys();
  assert.ok(keys.has('tickets:50'));
  assert.ok(keys.has('50'));
  assert.ok(keys.has('actionsteps:77'));
});

test('cleanupSteps run in reverse registration order with derived delete ops', () => {
  const m = createOwnershipManifest();
  m.register({ operationId: 'createTicket', id: 1 });
  m.register({ operationId: 'createTask', id: 2 });
  m.register({ operationId: 'createActionStep', id: 3 });
  const steps = m.cleanupSteps();
  assert.deepEqual(steps.map((s) => s.op), ['deleteActionStep', 'deleteTask', 'deleteTicket']);
  assert.deepEqual(steps.map((s) => s.id), ['3', '2', '1']);
});

test('registerSeedReport ingests a runSeed report', () => {
  const m = createOwnershipManifest();
  m.registerSeedReport(
    [{ op: 'createTicket', as: 't', id: 10 }, { op: 'createMessage', as: 'msg', id: 11 }],
    [{ op: 'createTicket', as: 't' }, { op: 'createMessage', as: 'msg' }]
  );
  assert.ok(m.ownedKeys().has('messages:11'));
  assert.equal(m.ids('tickets').length, 1);
});

test('orphanRecipesFromScenarios derives sweep targets from seed recipes', () => {
  const scenarios = [
    { seed: [{ op: 'createTicket', as: 't' }, { op: 'createMessage', as: 'm' }] },
    { seed: [{ op: 'createTransaction', as: 'tx' }] }
  ];
  const recipes = orphanRecipesFromScenarios(scenarios);
  const byResource = Object.fromEntries(recipes.map((r) => [r.resource, r]));
  assert.equal(byResource.tickets.deleteOp, 'deleteTicket');
  assert.equal(byResource.messages.field, 'subject');
  assert.equal(byResource.transactions.listOp, 'listTransactions');
});

test('labelFieldFor knows the per-resource human label', () => {
  assert.equal(labelFieldFor('accounts'), 'lastname');
  assert.equal(labelFieldFor('messages'), 'subject');
  assert.equal(labelFieldFor('tickets'), 'name');
});

test('ownershipGap flags write scenarios that cannot scope their writes', () => {
  assert.match(ownershipGap({ id: 'x', agentMode: 'write', allowedOperations: [] }), /no allowedOperations/);
  assert.equal(ownershipGap({ id: 'x', agentMode: 'write', allowedOperations: ['createTicket'] }), null);
  assert.equal(ownershipGap({ id: 'x', agentMode: 'read-only' }), null);
});
