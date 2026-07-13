import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, '..', 'bin', 'zeyos-mcp.mjs');

function startServer(t, overrides = {}) {
  const env = {
    ...process.env,
    ZEYOS_BASE_URL: 'https://example.invalid/dev',
    ZEYOS_TOKEN: 'dummy-token',
    ZEYOS_NO_REFRESH: '1',
    ...overrides
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, 'ZEYOS_MCP_ALLOW_WRITES')) {
    delete env.ZEYOS_MCP_ALLOW_WRITES;
  }

  const child = spawn(process.execPath, [SERVER], {
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  let stdout = '';
  let stderr = '';
  const messages = [];
  const waiters = [];

  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    while (stdout.includes('\n')) {
      const newline = stdout.indexOf('\n');
      const line = stdout.slice(0, newline);
      stdout = stdout.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(message);
      else messages.push(message);
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  t.after(() => {
    child.stdin.end();
    if (!child.killed) child.kill('SIGTERM');
  });

  let nextId = 1;
  function nextMessage() {
    if (messages.length) return Promise.resolve(messages.shift());
    return new Promise((resolveMessage, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for MCP response. stderr: ${stderr}`)), 3000);
      waiters.push({
        resolve(message) {
          clearTimeout(timeout);
          resolveMessage(message);
        }
      });
    });
  }

  async function request(method, params) {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`);
    const response = await nextMessage();
    assert.equal(response.id, id);
    return response;
  }

  function notify(method, params) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) })}\n`);
  }

  return { child, nextMessage, notify, request };
}

test('MCP server initializes, lists read tools, and handles offline validation', async (t) => {
  const server = startServer(t);

  const initialized = await server.request('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' }
  });
  assert.equal(initialized.result.protocolVersion, '2025-03-26');
  assert.deepEqual(initialized.result.capabilities, { tools: {} });
  assert.equal(initialized.result.serverInfo.name, 'zeyos-mcp');

  server.notify('notifications/initialized');
  const listed = await server.request('tools/list');
  const names = listed.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, [
    'list_resource_types',
    'describe_resource',
    'find_records',
    'list_records',
    'count_records',
    'sum_records',
    'get_record'
  ]);
  assert.equal(names.includes('create_record'), false);
  const resourceEnum = listed.result.tools.find((tool) => tool.name === 'describe_resource')
    .inputSchema.properties.resource.enum;
  assert.ok(resourceEnum.length > 0);

  const described = await server.request('tools/call', {
    name: 'describe_resource',
    arguments: { resource: 'accounts' }
  });
  assert.equal(described.result.isError, undefined);
  const description = JSON.parse(described.result.content[0].text);
  assert.equal(description.name, 'accounts');
  assert.ok(description.fields.lastname);
  assert.equal(description.aliases.filters.companyname, 'lastname');

  const invalid = await server.request('tools/call', {
    name: 'list_records',
    arguments: { resource: 'accounts', filter: { definitely_not_a_field: 1 } }
  });
  assert.equal(invalid.result.isError, true);
  assert.match(invalid.result.content[0].text, /Unknown field/);

  const unknown = await server.request('tools/call', {
    name: 'not_a_tool',
    arguments: {}
  });
  assert.equal(unknown.error.code, -32602);

  server.child.stdin.write('{not valid json}\n');
  const parseError = await server.nextMessage();
  assert.equal(parseError.id, null);
  assert.equal(parseError.error.code, -32700);

  const ping = await server.request('ping');
  assert.deepEqual(ping.result, {});
});

test('MCP server exposes write tools only when explicitly enabled', async (t) => {
  const server = startServer(t, { ZEYOS_MCP_ALLOW_WRITES: '1' });
  await server.request('initialize', { protocolVersion: 'unsupported-version' });
  const listed = await server.request('tools/list');
  const names = listed.result.tools.map((tool) => tool.name);
  assert.ok(names.includes('create_record'));
  assert.ok(names.includes('update_record'));
  assert.equal(names.includes('delete_record'), false);
});
