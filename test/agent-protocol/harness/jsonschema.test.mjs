// Offline coverage for the minimal JSON Schema validator (no deps, no live instance).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateSchema, deepEqual } from './jsonschema.mjs';

test('validateSchema enforces type and required', () => {
  const schema = { type: 'object', required: ['a', 'b'], properties: { a: { type: 'string' }, b: { type: 'number' } } };
  assert.equal(validateSchema({ a: 'x', b: 1 }, schema).valid, true);

  const missing = validateSchema({ a: 'x' }, schema);
  assert.equal(missing.valid, false);
  assert.match(missing.errors.join(' '), /missing required property "b"/);

  const wrongType = validateSchema({ a: 1, b: 1 }, schema);
  assert.equal(wrongType.valid, false);
  assert.match(wrongType.errors.join(' '), /expected type string/);
});

test('validateSchema handles integer vs number, enum and const', () => {
  assert.equal(validateSchema(3, { type: 'integer' }).valid, true);
  assert.equal(validateSchema(3.5, { type: 'integer' }).valid, false);
  assert.equal(validateSchema('EUR', { enum: ['EUR', 'USD'] }).valid, true);
  assert.equal(validateSchema('GBP', { enum: ['EUR', 'USD'] }).valid, false);
  assert.equal(validateSchema(false, { const: false }).valid, true);
  assert.equal(validateSchema(true, { const: false }).valid, false);
});

test('validateSchema enforces additionalProperties:false and array items', () => {
  const obj = { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false };
  assert.equal(validateSchema({ a: 'x' }, obj).valid, true);
  assert.equal(validateSchema({ a: 'x', b: 1 }, obj).valid, false);

  const arr = { type: 'array', items: { type: 'number' }, minItems: 1, uniqueItems: true };
  assert.equal(validateSchema([1, 2, 3], arr).valid, true);
  assert.equal(validateSchema([], arr).valid, false);
  assert.equal(validateSchema([1, 1], arr).valid, false);
  assert.equal(validateSchema([1, 'x'], arr).valid, false);
});

test('validateSchema supports anyOf, numeric bounds and patterns', () => {
  const schema = { anyOf: [{ type: 'string' }, { type: 'number', minimum: 0 }] };
  assert.equal(validateSchema('x', schema).valid, true);
  assert.equal(validateSchema(5, schema).valid, true);
  assert.equal(validateSchema(-1, schema).valid, false);
  assert.equal(validateSchema({}, schema).valid, false);

  assert.equal(validateSchema('a1b2', { type: 'string', pattern: '^[a-z0-9]+$' }).valid, true);
  assert.equal(validateSchema('A!', { type: 'string', pattern: '^[a-z0-9]+$' }).valid, false);
});

test('validateSchema resolves local $ref', () => {
  const schema = {
    type: 'object',
    properties: { row: { $ref: '#/$defs/row' } },
    $defs: { row: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } } }
  };
  assert.equal(validateSchema({ row: { id: 1 } }, schema).valid, true);
  assert.equal(validateSchema({ row: { id: 'x' } }, schema).valid, false);
});

test('deepEqual compares nested structures', () => {
  assert.equal(deepEqual({ a: [1, 2], b: { c: 3 } }, { a: [1, 2], b: { c: 3 } }), true);
  assert.equal(deepEqual({ a: [1, 2] }, { a: [1, 3] }), false);
});
