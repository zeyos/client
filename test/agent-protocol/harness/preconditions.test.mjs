// Offline coverage for precondition evaluation -> ENVIRONMENT_SKIP.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePreconditions } from './verify.mjs';

function fakeClient(ops, schema) {
  return { api: ops, schema: schema ? { describe: (r) => schema[r] } : undefined };
}

test('operationExists passes for a present op and skips for a missing one', async () => {
  const client = fakeClient({ listTickets: async () => [] });
  assert.equal((await evaluatePreconditions([{ kind: 'operationExists', operation: 'listTickets' }], { client })).ok, true);
  const miss = await evaluatePreconditions([{ kind: 'operationExists', operation: 'listNope' }], { client });
  assert.equal(miss.ok, false);
  assert.match(miss.skipReason, /listNope/);
});

test('minimumRows skips when the instance has too few rows', async () => {
  const client = fakeClient({ listObjects: async () => [{ ID: 1 }] });
  assert.equal((await evaluatePreconditions([{ kind: 'minimumRows', op: 'listObjects', min: 1 }], { client })).ok, true);
  const skip = await evaluatePreconditions([{ kind: 'minimumRows', op: 'listObjects', min: 5 }], { client });
  assert.equal(skip.ok, false);
  assert.match(skip.skipReason, /< 5/);
});

test('schemaHasFields skips when a field is absent', async () => {
  const client = fakeClient({}, { tickets: { fields: { ID: {}, status: {} } } });
  assert.equal((await evaluatePreconditions([{ kind: 'schemaHasFields', resource: 'tickets', fields: ['status'] }], { client })).ok, true);
  const skip = await evaluatePreconditions([{ kind: 'schemaHasFields', resource: 'tickets', fields: ['nope'] }], { client });
  assert.equal(skip.ok, false);
});

test('minimumActiveUsers counts users', async () => {
  const client = fakeClient({ listUsers: async () => [{ ID: 1 }, { ID: 2 }] });
  assert.equal((await evaluatePreconditions([{ kind: 'minimumActiveUsers', min: 2 }], { client })).ok, true);
  assert.equal((await evaluatePreconditions([{ kind: 'minimumActiveUsers', min: 3 }], { client })).ok, false);
});

test('unknown/undeterminable kinds default to available', async () => {
  const client = fakeClient({});
  assert.equal((await evaluatePreconditions([{ kind: 'instanceFeature', feature: 'x' }], { client })).ok, true);
});
