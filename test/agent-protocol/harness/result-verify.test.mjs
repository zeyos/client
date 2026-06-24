// Offline coverage for verifyResult (schema + path assertions) and verifyFile (rows).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyResult, verifyFile } from './result-verify.mjs';

test('verifyResult validates against a JSON Schema', () => {
  const expect = {
    schema: {
      type: 'object',
      required: ['method', 'sent'],
      properties: { method: { type: 'string' }, sent: { const: false } }
    }
  };
  assert.equal(verifyResult(expect, { resultValue: { method: 'POST', url: '/x', sent: false } }).pass, true);
  assert.equal(verifyResult(expect, { resultValue: { method: 'POST', sent: true } }).pass, false);
});

test('verifyResult fails with OUTPUT_CONTRACT_FAILURE when nothing parsed', () => {
  const res = verifyResult({ schema: { type: 'object' } }, { resultValue: null, result: 'I think the answer is...' });
  assert.equal(res.pass, false);
  assert.match(res.detail, /OUTPUT_CONTRACT_FAILURE/);
});

test('verifyResult path assertions: equals, tolerance, sorted, unique, set', () => {
  const value = { invoiceNet: 150.25, ids: [1, 2, 3], currency: 'EUR' };
  assert.equal(verifyResult({ assertions: [{ path: '$.invoiceNet', equals: 150.25, tolerance: 0.005 }] }, { resultValue: value }).pass, true);
  assert.equal(verifyResult({ assertions: [{ path: '$.ids', sorted: 'asc' }] }, { resultValue: value }).pass, true);
  assert.equal(verifyResult({ assertions: [{ path: '$.ids', unique: true }] }, { resultValue: value }).pass, true);
  assert.equal(verifyResult({ assertions: [{ path: '$.currency', oneOf: ['EUR', 'USD'] }] }, { resultValue: value }).pass, true);
  assert.equal(verifyResult({ assertions: [{ path: '$.ids', set: [3, 2, 1] }] }, { resultValue: value }).pass, true);
  assert.equal(verifyResult({ assertions: [{ path: '$.missing', present: true }] }, { resultValue: value }).pass, false);
});

test('verifyResult exact key requirement (aliased fields)', () => {
  const value = { Customer: 'Müller', 'Primary email': 'qa+agent@example.test' };
  const res = verifyResult({ assertions: [{ path: '$', keys: ['Customer', 'Primary email'] }] }, { resultValue: value });
  assert.equal(res.pass, true);
});

test('verifyFile checks headers, row count, schema and exact row set', () => {
  const rows = [
    { account_id: '11', name: 'Beta', has_shipping: 'true' },
    { account_id: '12', name: 'Gamma', has_shipping: 'false' }
  ];
  const expect = {
    headers: ['account_id', 'name', 'has_shipping'],
    rowCount: 2,
    rowSchema: { type: 'object', required: ['account_id', 'name', 'has_shipping'] },
    rows: [
      { account_id: '12', name: 'Gamma', has_shipping: 'false' },
      { account_id: '11', name: 'Beta', has_shipping: 'true' }
    ]
  };
  assert.equal(verifyFile(expect, { resultValue: rows }).pass, true);

  const extraCol = verifyFile({ headers: ['account_id'] }, { resultValue: rows });
  assert.equal(extraCol.pass, false); // extra columns rejected by default
});

test('verifyFile enforces sort order and uniqueness', () => {
  const rows = [{ id: '2' }, { id: '1' }];
  assert.equal(verifyFile({ sortBy: { field: 'id', dir: 'asc' } }, { resultValue: rows }).pass, false);
  assert.equal(verifyFile({ sortBy: { field: 'id', dir: 'desc' } }, { resultValue: rows }).pass, true);
  assert.equal(verifyFile({ uniqueBy: 'id' }, { resultValue: [{ id: '1' }, { id: '1' }] }).pass, false);
});
