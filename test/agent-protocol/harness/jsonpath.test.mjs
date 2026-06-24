// Offline coverage for the minimal JSONPath evaluator.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jsonPath, jsonPathFirst } from './jsonpath.mjs';

const doc = {
  netAfterCredits: 130.15,
  rows: [
    { id: 1, type: 3, amount: 100 },
    { id: 2, type: 4, amount: 20 },
    { id: 3, type: 3, amount: 50 }
  ],
  events: [
    { operationId: 'listAccounts', request: { body: { filters: { type: 1 } } } },
    { operationId: 'listTransactions', request: { body: { filters: {} } } }
  ]
};

test('dotted and bracket member access', () => {
  assert.equal(jsonPathFirst(doc, '$.netAfterCredits'), 130.15);
  assert.equal(jsonPathFirst(doc, "$['netAfterCredits']"), 130.15);
});

test('array index, negative index and wildcard', () => {
  assert.equal(jsonPathFirst(doc, '$.rows[0].id'), 1);
  assert.equal(jsonPathFirst(doc, '$.rows[-1].id'), 3);
  assert.deepEqual(jsonPath(doc, '$.rows[*].id').values, [1, 2, 3]);
});

test('filter predicate selects matching elements', () => {
  const credits = jsonPath(doc, "$.rows[?(@.type==4)].amount");
  assert.deepEqual(credits.values, [20]);
  const invoices = jsonPath(doc, '$.rows[?(@.type==3)].amount');
  assert.deepEqual(invoices.values, [100, 50]);
});

test('absent vs present detection for trace assertions', () => {
  const present = jsonPath(doc, "$.events[?(@.operationId=='listAccounts')].request.body.filters.type");
  assert.equal(present.found, true);
  assert.deepEqual(present.values, [1]);

  const absent = jsonPath(doc, "$.events[?(@.operationId=='listTransactions')].request.body.filters.visibility");
  assert.equal(absent.found, false);
});

test('recursive descent finds nested members', () => {
  const all = jsonPath(doc, '$..amount');
  assert.deepEqual(all.values.sort((a, b) => a - b), [20, 50, 100]);
});
