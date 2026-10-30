import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSchema } from '../src/runtime/schema.js';
import { createZeyosClient, ZeyosValidationError } from '../src/index.js';
import { SCHEMA } from '../src/generated/schema.js';
import { SERVICES } from '../src/generated/operations.js';

// These checks exercise local validation against the shipped reference snapshot.
// No HTTP transport or mock API is involved.
const schema = createSchema({ services: SERVICES, schema: SCHEMA });

test('resolves every relationship segment and terminal field in selection aliases', () => {
  assert.equal(schema.validate('listAccounts', {
    fields: { City: 'contact.city', AgentCity: 'assigneduser.contact.city' },
  }).valid, true);
  for (const field of ['contact.inventedColumn', 'assigneduser.contact.inventedColumn', 'lastname.city', 'contact.city.name']) {
    const result = schema.validate('listAccounts', { fields: [field] });
    assert.equal(result.valid, false, field);
    assert.equal(result.errors[0].field, field);
  }
  const result = schema.validate('listAccounts', { fields: ['contact.postalcod'] });
  assert.equal(result.errors[0].suggestion, 'contact.postalcode');
});

test('checks joined filter enums and paths inside nested logical groups', () => {
  const good = { '0': ['AND', { 'contact.visibility': { IN: [0, 1] } }, {
    '1': ['OR', { 'assigneduser.contact.city': 'Vienna' }, { 'contact.city': 'Berlin' }],
  }] };
  assert.equal(schema.validate('listAccounts', { filters: good }).valid, true);
  const bad = { '0': ['OR', { 'contact.visibility': { IN: [99] } }, {
    '1': ['NOT', { 'assigneduser.contact.inventedColumn': null }],
  }] };
  const result = schema.validate('listAccounts', { filters: bad });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === 'contact.visibility' && error.code === 'invalid_enum'));
  assert.ok(result.errors.some((error) => error.field === 'assigneduser.contact.inventedColumn'));
  assert.equal(schema.validate('listAccounts', { filters: { 'contact.visibility': { '>': 10 } } }).valid, true);
});

test('checks complete sort paths and preserves existing prefix/suffix handling', () => {
  assert.equal(schema.validate('listAccounts', { sort: ['-assigneduser.contact.city', '+contact.country:asc'] }).valid, true);
  const result = schema.validate('listAccounts', { sort: '-contact.inventedColumn:desc' });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].field, 'contact.inventedColumn');
});

test('body and data wrappers are validated with the same precedence as requests', () => {
  const invalid = { fields: ['contact.inventedColumn'] };
  assert.equal(schema.validate('listAccounts', { body: invalid }).valid, false);
  assert.equal(schema.validate('listAccounts', { data: invalid }).valid, false);
  assert.equal(schema.validate('listAccounts', { body: { fields: ['contact.city'] }, data: invalid, fields: invalid.fields }).valid, true);
  assert.equal(schema.validate('listAccounts', { body: null, data: { fields: ['ID'] } }).valid, false);
  assert.equal(schema.validate('getAccount', { ID: 1, query: invalid }).valid, false);
  assert.equal(schema.validate('listAccounts', { extdata: 1, fields: ['contact.city'] }).valid, true);
  assert.equal(schema.validate('getAccount', { ID: 1, query: { extdata: 1 } }).valid, true);
  assert.equal(schema.validate('listAccounts', { fields: ['extdata'] }).valid, false);
});

test('malformed selectors and logical groups cannot skip path validation', () => {
  for (const input of [
    { fields: 'contact.inventedColumn' }, { fields: [null] }, { fields: { City: {} } },
    { fields: new Array(1) }, { fields: new Map([['City', 'contact.inventedColumn']]) },
    { fields: ['contact..city'] }, { fields: ['contact. city'] }, { fields: [' contact.city'] },
    { fields: ['contact.constructor'] }, { sort: {} }, { sort: [42] },
    { filters: [] }, { filters: { '0': ['OR', 'contact.inventedColumn'] } },
  ]) assert.equal(schema.validate('listAccounts', input).valid, false, JSON.stringify(input));
  const circular = {};
  circular['0'] = ['AND', circular];
  assert.equal(schema.validate('listAccounts', { filters: circular }).valid, false);
  const circularOperand = {};
  circularOperand['='] = circularOperand;
  assert.equal(schema.validate('listAccounts', { filters: { 'contact.visibility': circularOperand } }).valid, false);
  assert.equal(schema.validate('listAccounts', { filters: { 'contact.visibility': true } }).valid, false);
  for (const field of ['contact.city', 'extdata.region']) {
    const result = schema.validate('listAccounts', { filters: { [field]: undefined } });
    assert.equal(result.valid, false);
    assert.equal(result.errors[0].code, 'invalid_filters');
    assert.equal(result.errors[0].field, field);
  }
});

test('missing relationship metadata is an explicit error rather than a validation pass', () => {
  const withoutContacts = { ...SCHEMA };
  delete withoutContacts.contacts;
  const partial = createSchema({ services: SERVICES, schema: withoutContacts });
  const result = partial.validate('listAccounts', { fields: ['contact.city'] });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'schema_unavailable');
});

test('schema descriptions cannot mutate future relationship or enum validation', () => {
  const account = schema.describe('accounts');
  account.fields.contact.fk = 'accounts';
  account.fields.type.enum['999'] = 'invented';
  assert.equal(schema.validate('listAccounts', { fields: ['contact.city'] }).valid, true);
  assert.equal(schema.validate('listAccounts', { filters: { type: 999 } }).valid, false);
});

test('joins resolve the target resource custom-field contract and reject unknown keys', () => {
  const withCustom = createSchema({ services: SERVICES, schema: SCHEMA, customFields: {
    accounts: { region: { type: 'string', enum: ['west', 'east'] } },
    contacts: { region: { type: 'integer' }, 'external..code': { type: 'string' }, 'code with spaces ': {} },
  } });
  assert.equal(withCustom.validate('listAccounts', {
    fields: ['extdata.region', 'contact.extdata.region', 'contact.extdata.external..code', 'contact.extdata.code with spaces '],
    filters: { 'extdata.region': 'west', 'contact.extdata.region': 2 },
  }).valid, true);
  assert.equal(withCustom.validate('listAccounts', { filters: { 'contact.extdata.region': 'west' } }).valid, false);
  assert.equal(withCustom.validate('listAccounts', { fields: ['contact.extdata.invented'] }).valid, false);
  assert.equal(schema.validate('listAccounts', { fields: ['contact.extdata.region'] }).errors[0].code, 'custom_fields_unavailable');
  assert.deepEqual(withCustom.describe('contacts').customFields.region, { type: 'integer' });
});

test('write payloads validate extdata but reject query-only joined keys', () => {
  const withCustom = createSchema({ services: SERVICES, schema: SCHEMA, customFields: {
    accounts: { region: { type: 'string', enum: ['west', 'east'] } },
  } });
  for (const wrap of [(x) => x, (x) => ({ body: x }), (x) => ({ data: x })]) {
    assert.equal(withCustom.validate('updateAccount', { ID: 1, ...wrap({ extdata: { region: 'west' } }) }).valid, true);
    assert.equal(withCustom.validate('updateAccount', { ID: 1, ...wrap({ extdata: { invented: 'west' } }) }).valid, false);
  }
  assert.equal(withCustom.validate('updateAccount', { ID: 1, body: { 'contact.city': 'Vienna' } }).errors[0].code, 'invalid_write_field');
  assert.equal(withCustom.validate('updateAccount', { ID: 1, body: { type: { IN: [1] } } }).errors[0].code, 'invalid_enum');
  assert.equal(withCustom.validate('updateAccount', { ID: 1, body: { type: [1] } }).errors[0].code, 'invalid_enum');
});

test('enabled validation blocks invalid paths before building a request', async () => {
  const client = createZeyosClient({ auth: { mode: 'none' }, validate: true });
  await assert.rejects(client.api.listAccounts({ fields: ['contact.inventedColumn'] }, { dryRun: true }), ZeyosValidationError);
  const preview = await client.api.listAccounts({ fields: ['contact.city'] }, { dryRun: true });
  assert.deepEqual(preview.body.fields, ['contact.city']);
});
