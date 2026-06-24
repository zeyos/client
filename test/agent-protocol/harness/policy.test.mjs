// Offline coverage for the transport policy decision engine.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decide } from './policy.mjs';

const read = { operationId: 'listTickets', verb: 'list', resource: 'tickets', id: null, method: 'POST' };

test('reads are allowed in every agent mode', () => {
  for (const mode of ['offline-read-only', 'read-only', 'preview-only', 'conditional-write', 'write']) {
    assert.equal(decide(read, { mode }).allow, true, mode);
  }
});

test('writes are blocked in read-only modes', () => {
  const create = { operationId: 'createTicket', verb: 'create', resource: 'tickets', id: null, method: 'PUT' };
  const res = decide(create, { mode: 'read-only', allowedOperations: ['createTicket'] });
  assert.equal(res.allow, false);
  assert.match(res.reason, /agent mode is read-only/);
});

test('a write is allowed only when in the allow-list', () => {
  const create = { operationId: 'createActionStep', verb: 'create', resource: 'actionsteps', id: null, method: 'PUT', body: { name: 'x' } };
  assert.equal(decide(create, { mode: 'conditional-write', allowedOperations: ['createActionStep'], confirmed: true }).allow, true);
  assert.equal(decide(create, { mode: 'conditional-write', allowedOperations: ['createTicket'], confirmed: true }).allow, false);
});

test('deletes/updates require ownership and reject bulk', () => {
  const owned = new Set(['tickets:50']);
  const del = { operationId: 'deleteTicket', verb: 'delete', resource: 'tickets', id: '50', method: 'DELETE' };
  assert.equal(decide(del, { mode: 'write', allowedOperations: ['deleteTicket'], ownedRecordsOnly: true, ownedKeys: owned }).allow, true);

  const unowned = { ...del, id: '999' };
  assert.equal(decide(unowned, { mode: 'write', allowedOperations: ['deleteTicket'], ownedRecordsOnly: true, ownedKeys: owned }).allow, false);

  const bulk = { ...del, id: null };
  assert.match(decide(bulk, { mode: 'write', allowedOperations: ['deleteTicket'], ownedKeys: owned }).reason, /bulk/);
});

test('forbidden operations are always blocked', () => {
  const res = decide(read, { mode: 'read-only', forbiddenOperations: ['listTickets'] });
  assert.equal(res.allow, false);
  assert.match(res.reason, /forbidden list/);
});

test('outbound/dispatch operations and sent-state transitions are blocked', () => {
  const send = { operationId: 'sendCampaign', verb: 'create', resource: 'campaigns', id: null, method: 'PUT' };
  assert.equal(decide(send, { mode: 'write', allowedOperations: [] }).allow, false);

  const sentMail = { operationId: 'updateMessage', verb: 'update', resource: 'messages', id: '7', method: 'PATCH', body: { mailbox: 2 } };
  const res = decide(sentMail, { mode: 'write', allowedOperations: ['updateMessage'], ownedKeys: new Set(['messages:7']) });
  assert.equal(res.allow, false);
  assert.match(res.reason, /sent-state/);
});

test('confirmation gate blocks a write until confirmed', () => {
  const create = { operationId: 'createActionStep', verb: 'create', resource: 'actionsteps', id: null, method: 'PUT', body: {} };
  const base = { mode: 'conditional-write', allowedOperations: ['createActionStep'], requiresConfirmation: true };
  assert.equal(decide(create, { ...base, confirmed: false }).allow, false);
  assert.equal(decide(create, { ...base, confirmed: true }).allow, true);
});
