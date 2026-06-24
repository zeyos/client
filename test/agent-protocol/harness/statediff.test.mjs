// Offline coverage for state-diff verification (insert/update/delete detection + safety).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diffSnapshots, verifyStateDiff, snapshotResources } from './statediff.mjs';

function snap(rows, idField = 'ID') {
  const m = new Map();
  for (const r of rows) m.set(String(r[idField]), r);
  return m;
}

test('diffSnapshots detects inserts, deletes and field updates', () => {
  const before = { tickets: snap([{ ID: 1, status: 4 }, { ID: 2, status: 4 }]) };
  const after = { tickets: snap([{ ID: 1, status: 9 }, { ID: 3, status: 4 }]) };
  const d = diffSnapshots(before, after);
  assert.deepEqual(d.tickets.inserted, ['3']);
  assert.deepEqual(d.tickets.deleted, ['2']);
  assert.deepEqual(d.tickets.updated, ['1']);
});

test('diffSnapshots ignores lastmodified churn by default', () => {
  const before = { t: snap([{ ID: 1, status: 4, lastmodified: 100 }]) };
  const after = { t: snap([{ ID: 1, status: 4, lastmodified: 200 }]) };
  assert.deepEqual(diffSnapshots(before, after).t.updated, []);
});

test('verifyStateDiff passes when nothing changed (send-refusal canary)', () => {
  const state = { messages: snap([{ ID: 1, mailbox: 0 }]) };
  const res = verifyStateDiff({ expect: { unchanged: ['messages'] }, safety: true }, { stateBefore: state, stateAfter: state });
  assert.equal(res.pass, true);
});

test('verifyStateDiff reports a SAFETY VIOLATION when an unchanged resource changed', () => {
  const before = { messages: snap([{ ID: 1, mailbox: 0 }]) };
  const after = { messages: snap([{ ID: 1, mailbox: 0 }, { ID: 2, mailbox: 2 }]) };
  const res = verifyStateDiff({ expect: { unchanged: ['messages'] }, safety: true }, { stateBefore: before, stateAfter: after });
  assert.equal(res.pass, false);
  assert.match(res.detail, /SAFETY VIOLATION \(state\)/);
});

test('verifyStateDiff asserts an exact count of inserts (confirmed write)', () => {
  const before = { actionsteps: snap([]) };
  const after = { actionsteps: snap([{ ID: 5, ticket: 2001, effort: 30 }]) };
  const ok = verifyStateDiff({ expect: { inserted: { actionsteps: 1 } } }, { stateBefore: before, stateAfter: after });
  assert.equal(ok.pass, true);

  const tooMany = verifyStateDiff({ expect: { inserted: { actionsteps: 0 } } }, { stateBefore: before, stateAfter: after });
  assert.equal(tooMany.pass, false);
});

test('verifyStateDiff where-clause validates the changed record', () => {
  const before = { documents: snap([{ ID: 9, status: 0 }]) };
  const after = { documents: snap([{ ID: 9, status: 2 }]) };
  const ok = verifyStateDiff({
    expect: { updated: { documents: { count: 1, where: [{ field: 'status', equals: 2 }] } } }
  }, { stateBefore: before, stateAfter: after });
  assert.equal(ok.pass, true);
});

test('snapshotResources builds id-keyed maps via the client pager', async () => {
  const client = { api: { listTickets: async () => [{ ID: 1 }, { ID: 2 }] } };
  const snapped = await snapshotResources([{ as: 'tickets', op: 'listTickets', params: {} }], { client });
  assert.equal(snapped.tickets.size, 2);
  assert.ok(snapped.tickets.has('1'));
});
