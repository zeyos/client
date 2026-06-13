import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dir = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dir, '..', 'bin', 'zeyos.mjs');

function cli(args) {
  return new Promise((resolveResult) => {
    execFile(process.execPath, [CLI_BIN, ...args], { env: { ...process.env, NO_COLOR: '1' } }, (err, stdout, stderr) => {
      resolveResult({
        code: err?.code ?? 0,
        stdout: stdout ?? '',
        stderr: stderr ?? ''
      });
    });
  });
}

test('global help is available without credentials', async () => {
  const result = await cli(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage: zeyos/);
  assert.match(result.stdout, /resources/);
});

test('resources supports JSON output for automation', async () => {
  const result = await cli(['resources', '--json']);
  assert.equal(result.code, 0, result.stderr);

  const resources = JSON.parse(result.stdout);
  assert.equal(Array.isArray(resources), true);

  const ticket = resources.find((resource) => resource.name === 'ticket');
  assert.ok(ticket);
  assert.deepEqual(ticket.operations, ['list', 'get', 'create', 'update', 'delete']);
});

test('unknown commands fail with a non-zero exit code', async () => {
  const result = await cli(['not-a-command']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown command/);
});
