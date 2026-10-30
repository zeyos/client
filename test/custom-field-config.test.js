import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadCustomFieldConfig } from '../cli/lib/custom-field-config.mjs';

function snapshot(t, value) {
  const dir = mkdtempSync(join(tmpdir(), 'zeyos-field-contract-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'fields.json');
  writeFileSync(file, JSON.stringify(value));
  return file;
}

const platform = 'https://example.invalid/sandbox/';
const customFields = { accounts: { region: { type: 'string', enum: ['EMEA'] } } };

test('CLI snapshots bind metadata to the full instance URL', (t) => {
  const file = snapshot(t, { platform, customFields });
  assert.deepEqual(loadCustomFieldConfig({ file, platform: 'https://example.invalid/sandbox' }), customFields);
  assert.throws(() => loadCustomFieldConfig({ file, platform: 'https://example.invalid/production' }), /different ZeyOS instance/);
  assert.throws(() => loadCustomFieldConfig({ file, platform: 'https://other.invalid/sandbox' }), /different ZeyOS instance/);
  assert.deepEqual(loadCustomFieldConfig({ file }), customFields); // Offline inspection requires no credentials.
});

test('snapshot configuration errors are actionable without disclosing JSON contents', (t) => {
  assert.throws(() => loadCustomFieldConfig({ file: 'relative.json' }), /absolute path/);
  const file = snapshot(t, { platform, customFields });
  writeFileSync(file, '{"secret":"DO_NOT_ECHO",');
  assert.throws(() => loadCustomFieldConfig({ file }), (error) => /valid JSON/.test(error.message) && !error.message.includes('DO_NOT_ECHO'));
  for (const value of [[], { customFields }, { platform, customfields: {} }, { platform, customFields: [], typo: true },
    { platform: 'https://user:secret@example.invalid/sandbox', customFields },
    { platform: 'https://example.invalid/sandbox?token=secret', customFields }]) {
    writeFileSync(file, JSON.stringify(value));
    assert.throws(() => loadCustomFieldConfig({ file }));
  }
});

test('CLI describe and request previews share a fresh custom-field snapshot', (t) => {
  const file = snapshot(t, { platform, customFields });
  const env = {
    ...process.env,
    ZEYOS_TOKEN: 'offline-preview-only',
    ZEYOS_BASE_URL: platform,
    ZEYOS_CUSTOM_FIELDS_FILE: file,
    NO_COLOR: '1',
  };
  const run = (args) => execFileSync(process.execPath, ['cli/bin/zeyos.mjs', ...args], {
    cwd: new URL('..', import.meta.url), env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000,
  });
  const described = JSON.parse(run(['describe', 'accounts', '--json']));
  assert.deepEqual(described.customFields, customFields.accounts);
  assert.deepEqual(described.customFieldSource, { platform: platform.replace(/\/$/, ""), live: false });
  const preview = JSON.parse(run(['list', 'accounts', '--fields', 'ID,extdata.region', '--dry-run', '--json']));
  assert.equal(preview.method, 'POST');
  assert.ok(JSON.stringify(preview.body.fields).includes('extdata.region'));
  assert.throws(() => run(['list', 'accounts', '--fields', 'contact.invented', '--dry-run', '--json']), /Unknown field/);
  assert.throws(() => run(['create', 'account', '--lastname', 'Preview', '--currency', 'EUR', '--data', '{"extdata":{"region":"INVALID"}}', '--dry-run', '--json']), /configured enum/);
  writeFileSync(file, JSON.stringify({ platform: 'https://example.invalid/other-instance', customFields }));
  assert.throws(() => run(['list', 'accounts', '--fields', 'extdata.region', '--dry-run', '--json']), /different ZeyOS instance/);
  writeFileSync(file, JSON.stringify({ platform, customFields: { accounts: {} } }));
  assert.throws(() => run(['list', 'accounts', '--fields', 'extdata.region', '--dry-run', '--json']), /Unknown custom field/);
});

test('MCP preflight rejects missing or unknown custom fields before authentication', async (t) => {
  const { callMcpTool } = await import('../cli/lib/mcp-tools.mjs');
  const before = process.env.ZEYOS_CUSTOM_FIELDS_FILE;
  t.after(() => {
    if (before === undefined) delete process.env.ZEYOS_CUSTOM_FIELDS_FILE;
    else process.env.ZEYOS_CUSTOM_FIELDS_FILE = before;
  });
  const file = snapshot(t, { platform, customFields: { accounts: {} } });
  process.env.ZEYOS_CUSTOM_FIELDS_FILE = file;
  const discovery = await callMcpTool('describe_resource', { resource: 'accounts' });
  assert.deepEqual(discovery.structuredContent.data.customFieldSource, { platform: platform.replace(/\/$/, ''), live: false });
  const unknown = await callMcpTool('list_records', { resource: 'accounts', fields: ['extdata.region'] });
  assert.equal(unknown.isError, true);
  assert.match(unknown.structuredContent.error.message, /Unknown custom field/);
  writeFileSync(file, JSON.stringify({ platform, customFields: {} }));
  const unavailable = await callMcpTool('list_records', { resource: 'accounts', fields: ['extdata.region'] });
  assert.equal(unavailable.isError, true);
  assert.match(unavailable.structuredContent.error.message, /metadata.*unavailable/);
});
