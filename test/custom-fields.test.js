import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomFieldValidator } from '../src/runtime/custom-fields.js';
import { createZeyosClient } from '../src/index.js';

const contract = {
  accounts: {
    region: { type: 'string', enum: ['EMEA', 'APAC'] },
    seats: { type: 'integer' },
    enabled: { type: 'boolean' },
    details: { type: 'object' },
    segments: { type: 'array' },
    'billing.category': {},
    'billing..category': {},
  },
  contacts: { preferred: { type: 'boolean' } },
  tickets: {},
};

test('custom fields fail closed on absent metadata and unknown keys', () => {
  const validator = createCustomFieldValidator(contract);
  const missing = [];
  assert.equal(validator.resolve('users', 'region', 'owneruser.extdata.region', missing), null);
  assert.equal(missing[0].code, 'custom_fields_unavailable');
  assert.equal(missing[0].field, 'owneruser.extdata.region');
  const empty = [];
  assert.equal(validator.resolve('tickets', 'region', 'extdata.region', empty), null);
  assert.equal(empty[0].code, 'unknown_custom_field');
  const typo = [];
  validator.resolve('accounts', 'regoin', 'extdata.regoin', typo);
  assert.equal(typo[0].suggestion, 'region');
});

test('custom-field references use exact keys, including dots, and do not infer nested properties', () => {
  const validator = createCustomFieldValidator(contract);
  const errors = [];
  assert.deepEqual(validator.resolve('accounts', 'billing.category', 'extdata.billing.category', errors), {});
  assert.deepEqual(validator.resolve('accounts', 'billing..category', 'extdata.billing..category', errors), {});
  assert.equal(validator.resolve('accounts', 'details.invented', 'extdata.details.invented', errors), null);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'unknown_custom_field');
});

test('custom-field filter operands check configured types and enum members', () => {
  const validator = createCustomFieldValidator(contract);
  const errors = [];
  validator.resolve('accounts', 'region', 'extdata.region', errors, { IN: ['EMEA', 'INVALID'] });
  validator.resolve('accounts', 'seats', 'extdata.seats', errors, { '>=': '5' });
  assert.deepEqual(errors.map((error) => error.code), ['invalid_custom_field_enum', 'invalid_custom_field_type']);
  const valid = [];
  validator.resolve('accounts', 'region', 'extdata.region', valid, ['EMEA', 'APAC']);
  validator.resolve('accounts', 'region', 'extdata.region', valid, null);
  validator.resolve('accounts', 'region', 'extdata.region', valid, { '>': 'A' });
  validator.resolve('accounts', 'seats', 'extdata.seats', valid, { '>=': 5 });
  assert.deepEqual(valid, []);
});

test('custom-field writes validate each value and allow documented null removal', () => {
  const validator = createCustomFieldValidator(contract);
  const errors = [];
  validator.validatePayload('accounts', {
    region: 'EMEA', seats: 3, enabled: false, details: { note: 'ok' }, segments: ['one'],
    'billing.category': 'custom',
  }, errors);
  validator.validatePayload('accounts', { region: null, seats: null }, errors);
  assert.deepEqual(errors, []);
  validator.validatePayload('accounts', { region: 3, seats: 1.5, enabled: 'false', invented: null }, errors);
  assert.deepEqual(errors.map((error) => error.code), [
    'invalid_custom_field_type', 'invalid_custom_field_type', 'invalid_custom_field_type', 'unknown_custom_field',
  ]);
});

test('custom-field payloads reject non-object shapes and undefined values', () => {
  const validator = createCustomFieldValidator(contract);
  for (const payload of [null, [], 'text', 1]) {
    const errors = [];
    validator.validatePayload('accounts', payload, errors);
    assert.equal(errors[0].code, 'invalid_custom_fields_payload');
  }
  const errors = [];
  validator.validatePayload('accounts', { seats: undefined }, errors);
  assert.equal(errors[0].code, 'invalid_custom_field_value');
});

test('custom fields reject non-JSON values even without a declared wire type', () => {
  const validator = createCustomFieldValidator(contract);
  const circular = {};
  circular.self = circular;
  for (const value of [Infinity, NaN, 1n, () => {}, Symbol('value'), new Date(), new Map(),
    circular, { nested: undefined }, Array(1), [1, undefined]]) {
    const errors = [];
    validator.validatePayload('accounts', { 'billing.category': value }, errors);
    assert.equal(errors[0]?.code, 'invalid_custom_field_value');
  }
  const malformed = [];
  validator.resolve('accounts', 'region', 'extdata.region', malformed, { IN: 'EMEA' });
  assert.equal(malformed[0].code, 'invalid_custom_field_filter');
});

test('the compiled custom contract and introspection cannot be mutated through caller objects', () => {
  const input = { accounts: { region: { type: 'string', enum: ['EMEA'] } } };
  const validator = createCustomFieldValidator(input);
  input.accounts.region.enum.push('INJECTED');
  input.accounts.invented = {};
  const described = validator.describe('accounts');
  described.region.enum.push('INJECTED');
  described.invented = {};
  const errors = [];
  validator.resolve('accounts', 'region', 'extdata.region', errors, 'INJECTED');
  validator.resolve('accounts', 'invented', 'extdata.invented', errors);
  assert.deepEqual(errors.map((error) => error.code), ['invalid_custom_field_enum', 'unknown_custom_field']);
  assert.deepEqual(validator.describe('tickets'), null);
});

test('malformed custom-field contracts reject misspelled constraints and unsupported display types', () => {
  for (const value of [null, [], 'text', { accounts: [] }, { accounts: { region: null } },
    { accounts: { region: { tpye: 'string' } } },
    { accounts: { region: { type: 'money' } } },
    { accounts: { region: { enum: { EMEA: 'Europe' } } } },
    { accounts: { region: { enum: [Infinity] } } },
    { accounts: { region: { enum: Array(1) } } },
    { accounts: { region: { type: 'integer', enum: ['one'] } } },
  ]) assert.throws(() => createCustomFieldValidator(value), TypeError);
});

test('own-key handling prevents inherited resource or field names from becoming metadata', () => {
  const validator = createCustomFieldValidator({ accounts: {} });
  const errors = [];
  validator.resolve('toString', 'name', 'extdata.name', errors);
  validator.resolve('accounts', 'constructor', 'extdata.constructor', errors);
  assert.deepEqual(errors.map((error) => error.code), ['custom_fields_unavailable', 'unknown_custom_field']);
});

test('configured custom fields reach client schema validation and joined resources', () => {
  const client = createZeyosClient({ auth: { mode: 'none' }, customFields: contract, validate: true });
  assert.equal(client.schema.validate('listAccounts', {
    fields: { Region: 'extdata.region', Preferred: 'contact.extdata.preferred', Dotted: 'extdata.billing..category' },
    filters: { 'extdata.region': 'EMEA' },
  }).valid, true);
  const unknown = client.schema.validate('listAccounts', { fields: ['contact.extdata.invented'] });
  assert.equal(unknown.valid, false);
  assert.equal(unknown.errors[0].code, 'unknown_custom_field');
  assert.equal(client.schema.validate('updateAccount', { ID: 1, body: { extdata: { region: null } } }).valid, true);
  const invalid = client.schema.validate('updateAccount', { ID: 1, body: { extdata: { region: 'INVALID' } } });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors[0].code, 'invalid_custom_field_enum');
});

test('custom-field checks apply through request body/data wrappers, sorting, and logical groups', () => {
  const client = createZeyosClient({ auth: { mode: 'none' }, customFields: contract, validate: true });
  for (const wrapper of ['body', 'data']) {
    const result = client.schema.validate('listAccounts', {
      [wrapper]: {
        fields: ['extdata.region'],
        sort: ['contact.extdata.invented'],
        filters: { '0': ['AND', { 'contact.extdata.preferred': 'yes' }, { 'extdata.region': 'UNKNOWN' }] },
      },
    });
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors.map((error) => error.code), [
      'invalid_custom_field_type', 'invalid_custom_field_enum', 'unknown_custom_field',
    ]);
    assert.equal(client.schema.validate('updateAccount', { ID: 1, [wrapper]: { extdata: { unknown: null } } }).valid, false);
  }
});

test('known-operation request calls enforce the same join and custom-field contract before dry-run', async () => {
  const client = createZeyosClient({ auth: { mode: 'none' }, customFields: contract, validate: true });
  for (const body of [
    { fields: ['contact.invented'] },
    { fields: ['contact.extdata.invented'] },
    { filters: { 'extdata.region': 'UNKNOWN' } },
  ]) {
    await assert.rejects(client.request({ service: 'api', operationId: 'listAccounts', body }, { dryRun: true }),
      { name: 'ZeyosValidationError' });
  }
  await assert.rejects(client.request({
    service: 'api', operationId: 'updateAccount', pathParams: { ID: 1 }, body: { extdata: { region: 'UNKNOWN' } },
  }, { dryRun: true }), { name: 'ZeyosValidationError' });
  const valid = await client.request({
    service: 'api', operationId: 'listAccounts', body: { fields: ['contact.lastname', 'extdata.region'] },
  }, { dryRun: true });
  assert.equal(valid.method, 'POST');
  const get = await client.request({
    service: 'api', operationId: 'getAccount', pathParams: { ID: 1 }, query: { extdata: 1 },
  }, { dryRun: true });
  assert.equal(get.method, 'GET');
  const optIn = createZeyosClient({ auth: { mode: 'none' } });
  await assert.rejects(optIn.request({
    service: 'api', operationId: 'listAccounts', body: { fields: ['extdata.region'] },
  }, { dryRun: true, validate: true }), { name: 'ZeyosValidationError' });
});
