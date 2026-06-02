#!/usr/bin/env node
/**
 * Integration test suite for the ZeyOS CLI.
 *
 * Runs against a **live** ZeyOS platform using the credential cascade
 * (env vars → .zeyos file → global config).  You must be logged in first:
 *
 *   zeyos login --base-url https://… --client-id … --secret …
 *   node cli/test/integration.mjs
 *
 * What it tests:
 *   - whoami                         (authenticated identity)
 *   - resources                      (resource registry listing)
 *   - config fields                  (server-side field selection, aliases, joins)
 *   - config get defaults            (default expand from config)
 *   - config list accounts           (join fields: contact.city, contact.country)
 *   - list   <resource>              (query, --json, --yaml, --limit, --sort, --fields)
 *   - get    <resource> <id>         (single record, --json, --yaml, --expand)
 *   - create <resource>              (field flags + --data, --json)
 *   - update <resource> <id>         (field flags + --data, --json)
 *   - delete <resource> <id> --force (delete with --force)
 *   - error paths                    (unknown resource, missing ID, 404)
 *
 * All records created during the run are cleaned up automatically.
 *
 * Exit codes:
 *   0 — all tests passed
 *   1 — one or more failures (summary printed)
 *
 * No external test framework is used — zero dependencies.
 */

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ── Paths ────────────────────────────────────────────────────────────────────

const __dir    = dirname(fileURLToPath(import.meta.url));
const CLI_BIN  = resolve(__dir, '..', 'bin', 'zeyos.mjs');
const NODE_BIN = process.execPath;                // same Node that runs us

// ── Test runner helpers ──────────────────────────────────────────────────────

let _passed  = 0;
let _failed  = 0;
let _skipped = 0;
const _failures = [];

/** IDs of records we created that need cleanup. */
const _cleanup = [];

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
};

function pass(name) {
  _passed++;
  process.stdout.write(`  ${c.green('✓')} ${name}\n`);
}

function fail(name, reason) {
  _failed++;
  _failures.push({ name, reason });
  process.stdout.write(`  ${c.red('✗')} ${name}\n`);
  if (reason) process.stdout.write(`    ${c.dim(String(reason).split('\n')[0])}\n`);
}

function skip(name, reason) {
  _skipped++;
  process.stdout.write(`  ${c.yellow('○')} ${name} ${c.dim(`(${reason})`)}\n`);
}

function section(title) {
  process.stdout.write(`\n${c.bold(c.cyan(`▸ ${title}`))}\n`);
}

// ── CLI executor ─────────────────────────────────────────────────────────────

/**
 * Run a CLI command and return { code, stdout, stderr }.
 *
 * @param {string[]} args - e.g. ['list', 'tickets', '--json']
 * @param {object}   [opts]
 * @param {number}   [opts.timeout=30000]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function cli(args, opts = {}) {
  const { timeout = 30_000 } = opts;
  return new Promise(resolve => {
    execFile(
      NODE_BIN,
      [CLI_BIN, ...args],
      { timeout, env: { ...process.env, NO_COLOR: '1' } },
      (err, stdout, stderr) => {
        resolve({
          code:   err?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 0 : (err?.code ?? 0),
          stdout: stdout ?? '',
          stderr: stderr ?? '',
        });
      },
    );
  });
}

/** Run CLI, parse stdout as JSON.  Returns null on parse failure. */
async function cliJson(args) {
  const r = await cli(args);
  try {
    return { ...r, data: JSON.parse(r.stdout) };
  } catch {
    return { ...r, data: null };
  }
}

// ── Assertions ───────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label ?? 'Value'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(str, needle, label) {
  if (!String(str).includes(needle)) {
    throw new Error(`${label ?? 'String'} does not include "${needle}"`);
  }
}

function assertIsArray(val, label) {
  if (!Array.isArray(val)) {
    throw new Error(`${label ?? 'Value'} is not an array: ${typeof val}`);
  }
}

// ── Test suites ──────────────────────────────────────────────────────────────

async function testWhoami() {
  section('whoami');

  // Default output
  try {
    const r = await cli(['whoami']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assert(r.stdout.length > 0, 'No stdout output');
    pass('whoami — default output');
  } catch (e) {
    fail('whoami — default output', e);
  }

  // JSON output
  try {
    const r = await cliJson(['whoami', '--json']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assert(r.data !== null, 'Invalid JSON output');
    assert(typeof r.data === 'object', 'Output is not an object');
    pass('whoami --json');
  } catch (e) {
    fail('whoami --json', e);
  }

  // YAML output
  try {
    const r = await cli(['whoami', '--yaml']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assert(r.stdout.length > 0, 'No YAML output');
    // YAML should contain key: value lines
    assert(r.stdout.includes(':'), 'YAML output missing key:value pairs');
    pass('whoami --yaml');
  } catch (e) {
    fail('whoami --yaml', e);
  }
}

async function testResources() {
  section('resources');

  try {
    const r = await cli(['resources']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertIncludes(r.stdout, 'ticket', 'resources output');
    assertIncludes(r.stdout, 'account', 'resources output');
    assertIncludes(r.stdout, 'list', 'resources output');
    pass('resources — lists known types');
  } catch (e) {
    fail('resources — lists known types', e);
  }
}

async function testListTickets() {
  section('list tickets');

  // Default table output
  try {
    const r = await cli(['list', 'tickets']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assert(r.stdout.length > 0, 'No output');
    pass('list tickets — default table');
  } catch (e) {
    fail('list tickets — default table', e);
  }

  // JSON output
  try {
    const r = await cliJson(['list', 'tickets', '--json']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertIsArray(r.data, 'tickets list');
    assert(r.data.length > 0, 'No tickets returned');
    assert(r.data[0].ID !== undefined, 'First ticket missing ID');
    pass('list tickets --json');
  } catch (e) {
    fail('list tickets --json', e);
  }

  // YAML output
  try {
    const r = await cli(['list', 'tickets', '--yaml']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assert(r.stdout.length > 0, 'No YAML output');
    pass('list tickets --yaml');
  } catch (e) {
    fail('list tickets --yaml', e);
  }

  // --limit
  try {
    const r = await cliJson(['list', 'tickets', '--json', '--limit', '2']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertIsArray(r.data, 'tickets');
    assert(r.data.length <= 2, `Expected ≤2 results, got ${r.data.length}`);
    pass('list tickets --limit 2');
  } catch (e) {
    fail('list tickets --limit 2', e);
  }

  // --sort
  try {
    const r = await cliJson(['list', 'tickets', '--json', '--sort', '-lastmodified', '--limit', '5']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertIsArray(r.data, 'tickets');
    pass('list tickets --sort -lastmodified');
  } catch (e) {
    fail('list tickets --sort -lastmodified', e);
  }

  // --fields (custom display — just ensure no crash via JSON mode)
  try {
    const r = await cliJson(['list', 'tickets', '--json', '--fields', 'ID,name,status', '--limit', '3']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertIsArray(r.data, 'tickets');
    pass('list tickets --fields ID,name,status');
  } catch (e) {
    fail('list tickets --fields ID,name,status', e);
  }

  // plural alias (tickets = ticket)
  try {
    const r = await cliJson(['list', 'ticket', '--json', '--limit', '1']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertIsArray(r.data, 'tickets');
    pass('list ticket (singular alias)');
  } catch (e) {
    fail('list ticket (singular alias)', e);
  }
}

async function testListOtherResources() {
  section('list other resources');

  const resources = ['accounts', 'projects', 'tasks', 'items'];

  for (const res of resources) {
    try {
      const r = await cliJson(['list', res, '--json', '--limit', '3']);
      assert(r.code === 0, `Exit code: ${r.code}`);
      assertIsArray(r.data, res);
      pass(`list ${res} --json`);
    } catch (e) {
      fail(`list ${res} --json`, e);
    }
  }
}

async function testGetTicket() {
  section('get ticket');

  // First, find a ticket ID to fetch
  const list = await cliJson(['list', 'tickets', '--json', '--limit', '1']);
  if (!list.data || list.data.length === 0) {
    skip('get ticket — no tickets to fetch', 'empty instance');
    return;
  }

  const ticketId = list.data[0].ID;

  // Default output
  try {
    const r = await cli(['get', 'ticket', String(ticketId)]);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assert(r.stdout.length > 0, 'No output');
    pass(`get ticket ${ticketId} — default`);
  } catch (e) {
    fail(`get ticket ${ticketId} — default`, e);
  }

  // JSON output
  try {
    const r = await cliJson(['get', 'ticket', String(ticketId), '--json']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assert(r.data !== null, 'Invalid JSON');
    assertEq(r.data.ID, ticketId, 'Ticket ID');
    pass(`get ticket ${ticketId} --json`);
  } catch (e) {
    fail(`get ticket ${ticketId} --json`, e);
  }

  // YAML output
  try {
    const r = await cli(['get', 'ticket', String(ticketId), '--yaml']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertIncludes(r.stdout, 'ID:', 'YAML output');
    pass(`get ticket ${ticketId} --yaml`);
  } catch (e) {
    fail(`get ticket ${ticketId} --yaml`, e);
  }

  // --expand extdata
  try {
    const r = await cliJson(['get', 'ticket', String(ticketId), '--expand', 'extdata', '--json']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assert(r.data !== null, 'Invalid JSON');
    // extdata may be null or an object — just verify it's present in response
    assert('extdata' in r.data, 'extdata key not in response');
    pass(`get ticket ${ticketId} --expand extdata`);
  } catch (e) {
    fail(`get ticket ${ticketId} --expand extdata`, e);
  }

  // show alias
  try {
    const r = await cliJson(['show', 'ticket', String(ticketId), '--json']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertEq(r.data?.ID, ticketId, 'show alias ID');
    pass(`show ticket ${ticketId} (alias)`);
  } catch (e) {
    fail(`show ticket ${ticketId} (alias)`, e);
  }
}

async function testCRUDLifecycle() {
  section('create → update → get → delete lifecycle');

  const testName = `CLI_TEST_${Date.now()}`;
  let createdId;

  // ── CREATE ──────────────────────────────────────────────────────────────────
  try {
    const r = await cliJson(['create', 'ticket', '--name', testName, '--status', '0', '--priority', '2', '--json']);
    assert(r.code === 0, `Exit code: ${r.code}\nstderr: ${r.stderr}`);
    assert(r.data !== null, `Invalid JSON.\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    createdId = r.data.ID;
    assert(createdId, 'Created record missing ID');
    _cleanup.push(createdId);
    pass(`create ticket --name "${testName}" → #${createdId}`);
  } catch (e) {
    fail(`create ticket --name "${testName}"`, e);
    return; // Can't continue without an ID
  }

  // ── GET (verify create) ────────────────────────────────────────────────────
  try {
    const r = await cliJson(['get', 'ticket', String(createdId), '--json']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertEq(r.data?.name, testName, 'Ticket name');
    pass(`get ticket ${createdId} — verify name`);
  } catch (e) {
    fail(`get ticket ${createdId} — verify name`, e);
  }

  // ── UPDATE (individual flags) ──────────────────────────────────────────────
  const updatedName = `${testName}_UPDATED`;
  try {
    const r = await cliJson(['update', 'ticket', String(createdId), '--name', updatedName, '--priority', '3', '--json']);
    assert(r.code === 0, `Exit code: ${r.code}\nstderr: ${r.stderr}`);
    pass(`update ticket ${createdId} --name --priority`);
  } catch (e) {
    fail(`update ticket ${createdId} --name --priority`, e);
  }

  // ── GET (verify update) ────────────────────────────────────────────────────
  try {
    const r = await cliJson(['get', 'ticket', String(createdId), '--json']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertEq(r.data?.name, updatedName, 'Updated ticket name');
    pass(`get ticket ${createdId} — verify updated name`);
  } catch (e) {
    fail(`get ticket ${createdId} — verify updated name`, e);
  }

  // ── UPDATE (--data JSON) ───────────────────────────────────────────────────
  try {
    const json = JSON.stringify({ status: 1 });
    const r = await cliJson(['update', 'ticket', String(createdId), '--data', json, '--json']);
    assert(r.code === 0, `Exit code: ${r.code}\nstderr: ${r.stderr}`);
    pass(`update ticket ${createdId} --data '${json}'`);
  } catch (e) {
    fail(`update ticket ${createdId} --data`, e);
  }

  // ── GET (verify --data update) ─────────────────────────────────────────────
  try {
    const r = await cliJson(['get', 'ticket', String(createdId), '--json']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertEq(r.data?.status, 1, 'Updated status');
    pass(`get ticket ${createdId} — verify status=1`);
  } catch (e) {
    fail(`get ticket ${createdId} — verify status=1`, e);
  }

  // ── UPDATE (via edit alias) ────────────────────────────────────────────────
  try {
    const r = await cliJson(['edit', 'ticket', String(createdId), '--priority', '1', '--json']);
    assert(r.code === 0, `Exit code: ${r.code}\nstderr: ${r.stderr}`);
    pass(`edit ticket ${createdId} --priority 1 (alias)`);
  } catch (e) {
    fail(`edit ticket ${createdId} --priority 1 (alias)`, e);
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  try {
    const r = await cli(['delete', 'ticket', String(createdId), '--force']);
    assert(r.code === 0, `Exit code: ${r.code}\nstderr: ${r.stderr}`);
    assertIncludes(r.stderr, 'Deleted', 'delete output');
    pass(`delete ticket ${createdId} --force`);
    // Remove from cleanup since it's already deleted
    const idx = _cleanup.indexOf(createdId);
    if (idx !== -1) _cleanup.splice(idx, 1);
  } catch (e) {
    fail(`delete ticket ${createdId} --force`, e);
  }

  // ── GET (verify delete → 404) ──────────────────────────────────────────────
  try {
    const r = await cli(['get', 'ticket', String(createdId), '--json']);
    assert(r.code !== 0, 'Expected non-zero exit code for deleted ticket');
    assertIncludes(r.stderr, 'not found', 'error message');
    pass(`get ticket ${createdId} — confirm 404 after delete`);
  } catch (e) {
    fail(`get ticket ${createdId} — confirm 404 after delete`, e);
  }
}

async function testCreateWithData() {
  section('create with --data JSON');

  const testName = `CLI_DATA_TEST_${Date.now()}`;
  const payload = JSON.stringify({ name: testName, status: 0, priority: 1 });

  try {
    const r = await cliJson(['create', 'ticket', '--data', payload, '--json']);
    assert(r.code === 0, `Exit code: ${r.code}\nstderr: ${r.stderr}`);
    assert(r.data !== null, 'Invalid JSON');
    const id = r.data.ID;
    assert(id, 'Missing ID');
    _cleanup.push(id);
    assertEq(r.data.name, testName, 'name');
    pass(`create ticket --data '${payload}' → #${id}`);

    // Clean up
    await cli(['delete', 'ticket', String(id), '--force']);
    const idx = _cleanup.indexOf(id);
    if (idx !== -1) _cleanup.splice(idx, 1);
  } catch (e) {
    fail(`create ticket --data JSON`, e);
  }
}

async function testDeleteAlias() {
  section('delete aliases (rm, remove)');

  // Create a throwaway ticket
  const testName = `CLI_RM_TEST_${Date.now()}`;
  const cr = await cliJson(['create', 'ticket', '--name', testName, '--status', '0', '--json']);

  if (!cr.data?.ID) {
    skip('rm alias', 'could not create test ticket');
    return;
  }

  const id = cr.data.ID;
  _cleanup.push(id);

  try {
    const r = await cli(['rm', 'ticket', String(id), '--force']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertIncludes(r.stderr, 'Deleted', 'rm output');
    pass(`rm ticket ${id} --force (alias)`);
    const idx = _cleanup.indexOf(id);
    if (idx !== -1) _cleanup.splice(idx, 1);
  } catch (e) {
    fail(`rm ticket ${id} (alias)`, e);
  }
}

async function testErrorPaths() {
  section('error handling');

  // Unknown resource
  try {
    const r = await cli(['list', 'nonexistent']);
    assert(r.code !== 0, 'Expected non-zero exit');
    assertIncludes(r.stderr, 'Unknown resource', 'error message');
    pass('list nonexistent → error');
  } catch (e) {
    fail('list nonexistent → error', e);
  }

  // Missing resource name
  try {
    const r = await cli(['list']);
    assert(r.code !== 0, 'Expected non-zero exit');
    assertIncludes(r.stderr, 'Missing resource', 'error message');
    pass('list (no resource) → error');
  } catch (e) {
    fail('list (no resource) → error', e);
  }

  // Missing ID for get
  try {
    const r = await cli(['get', 'ticket']);
    assert(r.code !== 0, 'Expected non-zero exit');
    assertIncludes(r.stderr, 'Missing record ID', 'error message');
    pass('get ticket (no ID) → error');
  } catch (e) {
    fail('get ticket (no ID) → error', e);
  }

  // 404 for non-existent ticket
  try {
    const r = await cli(['get', 'ticket', '999999999']);
    assert(r.code !== 0, 'Expected non-zero exit');
    assertIncludes(r.stderr, 'not found', 'error message');
    pass('get ticket 999999999 → 404');
  } catch (e) {
    fail('get ticket 999999999 → 404', e);
  }

  // Missing fields for create
  try {
    const r = await cli(['create', 'ticket']);
    assert(r.code !== 0, 'Expected non-zero exit');
    assertIncludes(r.stderr, 'No fields provided', 'error message');
    pass('create ticket (no fields) → error');
  } catch (e) {
    fail('create ticket (no fields) → error', e);
  }

  // Missing ID for update
  try {
    const r = await cli(['update', 'ticket']);
    assert(r.code !== 0, 'Expected non-zero exit');
    assertIncludes(r.stderr, 'Missing record ID', 'error message');
    pass('update ticket (no ID) → error');
  } catch (e) {
    fail('update ticket (no ID) → error', e);
  }

  // Missing ID for delete
  try {
    const r = await cli(['delete', 'ticket']);
    assert(r.code !== 0, 'Expected non-zero exit');
    assertIncludes(r.stderr, 'Missing record ID', 'error message');
    pass('delete ticket (no ID) → error');
  } catch (e) {
    fail('delete ticket (no ID) → error', e);
  }

  // Invalid --data JSON
  try {
    const r = await cli(['create', 'ticket', '--data', '{broken']);
    assert(r.code !== 0, 'Expected non-zero exit');
    assertIncludes(r.stderr, '--data must be valid JSON', 'error message');
    pass('create ticket --data {broken → error');
  } catch (e) {
    fail('create ticket --data {broken → error', e);
  }

  // Invalid --limit
  try {
    const r = await cli(['list', 'tickets', '--limit', 'abc']);
    assert(r.code !== 0, 'Expected non-zero exit');
    assertIncludes(r.stderr, '--limit must be a number', 'error message');
    pass('list tickets --limit abc → error');
  } catch (e) {
    fail('list tickets --limit abc → error', e);
  }
}

async function testHelp() {
  section('help output');

  // Global help
  try {
    const r = await cli(['--help']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertIncludes(r.stdout, 'Usage:', 'help output');
    assertIncludes(r.stdout, 'Commands:', 'help output');
    pass('--help (global)');
  } catch (e) {
    fail('--help (global)', e);
  }

  // Command-specific help
  const commands = ['login', 'list', 'get', 'create', 'update', 'delete'];
  for (const cmd of commands) {
    try {
      const r = await cli([cmd, '--help']);
      assert(r.code === 0, `Exit code: ${r.code}`);
      assertIncludes(r.stdout, 'Usage:', `${cmd} help output`);
      pass(`${cmd} --help`);
    } catch (e) {
      fail(`${cmd} --help`, e);
    }
  }
}

async function testValueCoercion() {
  section('value coercion (create + get verify)');

  // Create a ticket with various coercible values
  const testName = `CLI_COERCE_TEST_${Date.now()}`;
  let id;

  try {
    const r = await cliJson([
      'create', 'ticket',
      '--name', testName,
      '--status', '0',
      '--priority', '3',
      '--json',
    ]);
    assert(r.code === 0, `Exit code: ${r.code}\nstderr: ${r.stderr}`);
    id = r.data?.ID;
    assert(id, 'Missing ID');
    _cleanup.push(id);

    // status should be coerced from string "0" to number 0
    assertEq(r.data.status, 0, 'status coerced to 0');
    // priority should be coerced from string "3" to number 3
    assertEq(r.data.priority, 3, 'priority coerced to 3');
    pass('create with coerced values (status=0, priority=3)');
  } catch (e) {
    fail('create with coerced values', e);
    return;
  }

  // Clean up
  try {
    await cli(['delete', 'ticket', String(id), '--force']);
    const idx = _cleanup.indexOf(id);
    if (idx !== -1) _cleanup.splice(idx, 1);
  } catch { /* best effort */ }
}

async function testListWithExpand() {
  section('list with --expand');

  // Note: The ZeyOS list (POST) endpoints may not support "expand" in the
  // request body (returns HTTP 400).  Expand is fully supported on GET
  // single-record endpoints via query params (tested in testGetTicket).
  // We test here that the CLI handles both success and API rejection gracefully.
  try {
    const r = await cliJson(['list', 'tickets', '--json', '--limit', '2', '--expand', 'extdata']);
    if (r.code === 0) {
      assertIsArray(r.data, 'tickets');
      if (r.data.length > 0) {
        assert('extdata' in r.data[0], 'extdata key not in first record');
      }
      pass('list tickets --expand extdata (supported)');
    } else {
      // API rejected expand → verify the CLI reports a clear error
      assertIncludes(r.stderr, 'API error', 'error message');
      pass('list tickets --expand extdata (API rejects with clear error)');
    }
  } catch (e) {
    fail('list tickets --expand extdata', e);
  }
}

async function testListWithOffset() {
  section('list with --offset');

  try {
    // Get first 2 tickets
    const first = await cliJson(['list', 'tickets', '--json', '--limit', '2', '--sort', 'ID']);
    assert(first.code === 0, `First request exit code: ${first.code}`);
    assertIsArray(first.data, 'tickets (first)');

    if (first.data.length < 2) {
      skip('list --offset', 'not enough tickets');
      return;
    }

    // Get second ticket via offset
    const offset = await cliJson(['list', 'tickets', '--json', '--limit', '1', '--offset', '1', '--sort', 'ID']);
    assert(offset.code === 0, `Offset request exit code: ${offset.code}`);
    assertIsArray(offset.data, 'tickets (offset)');
    assert(offset.data.length > 0, 'No results with offset');

    // The first record with offset=1 should match the second record from the first request
    assertEq(offset.data[0].ID, first.data[1].ID, 'offset=1 matches second record');
    pass('list tickets --offset 1');
  } catch (e) {
    fail('list tickets --offset 1', e);
  }
}

// ── Config-driven field tests ────────────────────────────────────────────────

async function testConfigFields() {
  section('config-driven field selection (list)');

  // Test 1: list with config fields — JSON response should contain only aliased keys
  try {
    const r = await cliJson(['list', 'tickets', '--json', '--limit', '2']);
    assert(r.code === 0, `Exit code: ${r.code}\nstderr: ${r.stderr}`);
    assertIsArray(r.data, 'tickets');
    if (r.data.length > 0) {
      const keys = Object.keys(r.data[0]);
      // Config fields should be aliased keys (ID, Num, Name, Status, etc.)
      assert(keys.includes('ID'), 'Missing "ID" alias in config-driven response');
      assert(keys.includes('Name'), 'Missing "Name" alias in config-driven response');
      assert(keys.includes('Status'), 'Missing "Status" alias in config-driven response');
      // Should NOT contain non-configured native fields
      assert(!keys.includes('visibility'), '"visibility" should not be present (not in config)');
      pass('list tickets — config fields restrict response to aliased keys');
    } else {
      skip('list tickets — config fields', 'no tickets');
    }
  } catch (e) {
    fail('list tickets — config fields restrict response to aliased keys', e);
  }

  // Test 2: config includes join fields (account.lastname → Account alias)
  try {
    const r = await cliJson(['list', 'tickets', '--json', '--limit', '2']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assertIsArray(r.data, 'tickets');
    if (r.data.length > 0) {
      const keys = Object.keys(r.data[0]);
      // The "Account" alias maps to "account.lastname" join
      assert(keys.includes('Account'), 'Missing "Account" join alias in response');
      pass('list tickets — join field "Account" (account.lastname) present');
    } else {
      skip('list tickets — join fields', 'no tickets');
    }
  } catch (e) {
    fail('list tickets — join field "Account" (account.lastname) present', e);
  }

  // Test 3: --fields CLI override restricts to only those fields
  try {
    const r = await cliJson(['list', 'tickets', '--json', '--limit', '2', '--fields', 'ID,name']);
    assert(r.code === 0, `Exit code: ${r.code}\nstderr: ${r.stderr}`);
    assertIsArray(r.data, 'tickets');
    if (r.data.length > 0) {
      const keys = Object.keys(r.data[0]);
      assert(keys.includes('ID'), 'ID missing with --fields override');
      assert(keys.includes('name'), 'name missing with --fields override');
      // Should NOT contain config fields that weren't in the override
      assert(!keys.includes('Status'), '"Status" should not be present with --fields ID,name');
      assert(!keys.includes('Account'), '"Account" should not be present with --fields ID,name');
      pass('list tickets --fields ID,name — override restricts API response');
    } else {
      skip('--fields override', 'no tickets');
    }
  } catch (e) {
    fail('list tickets --fields ID,name — override restricts API response', e);
  }

  // Test 4: --fields with dot-notation join
  try {
    const r = await cliJson(['list', 'tickets', '--json', '--limit', '2', '--fields', 'ID,name,account.lastname']);
    assert(r.code === 0, `Exit code: ${r.code}\nstderr: ${r.stderr}`);
    assertIsArray(r.data, 'tickets');
    if (r.data.length > 0) {
      const keys = Object.keys(r.data[0]);
      assert(keys.includes('account.lastname'), 'join field "account.lastname" missing from override response');
      pass('list tickets --fields with dot-notation join');
    } else {
      skip('dot-notation join override', 'no tickets');
    }
  } catch (e) {
    fail('list tickets --fields with dot-notation join', e);
  }

  // Test 5: table output uses alias column headers
  try {
    const r = await cli(['list', 'tickets', '--limit', '2']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    // Table headers should be the alias keys in uppercase
    assertIncludes(r.stdout, 'NAME', 'table header');
    assertIncludes(r.stdout, 'STATUS', 'table header');
    assertIncludes(r.stdout, 'ACCOUNT', 'table header for join field');
    pass('list tickets — table headers use config aliases');
  } catch (e) {
    fail('list tickets — table headers use config aliases', e);
  }
}

async function testConfigGetExpand() {
  section('config-driven get defaults');

  // Test: get ticket without --expand should still have extdata (from config default)
  const list = await cliJson(['list', 'tickets', '--json', '--limit', '1']);
  if (!list.data || list.data.length === 0) {
    skip('get ticket config expand', 'no tickets');
    return;
  }

  const ticketId = list.data[0].ID;

  try {
    const r = await cliJson(['get', 'ticket', String(ticketId), '--json']);
    assert(r.code === 0, `Exit code: ${r.code}`);
    assert(r.data !== null, 'Invalid JSON');
    // extdata should be present due to config default expand: ["extdata"]
    assert('extdata' in r.data, 'extdata not present from config default expand');
    pass(`get ticket ${ticketId} — config default expand includes extdata`);
  } catch (e) {
    fail(`get ticket ${ticketId} — config default expand includes extdata`, e);
  }

  // Test: get ticket display fields from config (table mode shows only configured fields)
  try {
    const r = await cli(['get', 'ticket', String(ticketId)]);
    assert(r.code === 0, `Exit code: ${r.code}`);
    // Config get.fields includes "name" and "status"
    assertIncludes(r.stdout, 'name', 'get display');
    assertIncludes(r.stdout, 'status', 'get display');
    pass(`get ticket ${ticketId} — config display fields applied`);
  } catch (e) {
    fail(`get ticket ${ticketId} — config display fields applied`, e);
  }
}

async function testConfigListAccounts() {
  section('config-driven list accounts (with joins)');

  try {
    const r = await cliJson(['list', 'accounts', '--json', '--limit', '3']);
    assert(r.code === 0, `Exit code: ${r.code}\nstderr: ${r.stderr}`);
    assertIsArray(r.data, 'accounts');
    if (r.data.length > 0) {
      const keys = Object.keys(r.data[0]);
      // Config aliases: ID, Num, Lastname, Firstname, City, Country, Agent, Modified
      assert(keys.includes('ID'), 'Missing "ID" in account response');
      assert(keys.includes('Lastname'), 'Missing "Lastname" alias in account response');
      // City and Country are join fields (contact.city, contact.country)
      assert(keys.includes('City'), 'Missing "City" join alias (contact.city) in account response');
      assert(keys.includes('Country'), 'Missing "Country" join alias (contact.country) in account response');
      pass('list accounts — config aliases + join fields present');
    } else {
      skip('list accounts — config fields', 'no accounts');
    }
  } catch (e) {
    fail('list accounts — config aliases + join fields present', e);
  }
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  if (_cleanup.length === 0) return;
  process.stdout.write(`\n${c.dim(`Cleaning up ${_cleanup.length} leftover record(s)…`)}\n`);
  for (const id of _cleanup) {
    try {
      await cli(['delete', 'ticket', String(id), '--force']);
      process.stdout.write(`  ${c.dim(`Deleted ticket #${id}`)}\n`);
    } catch {
      process.stdout.write(`  ${c.yellow(`⚠ Could not delete ticket #${id}`)}\n`);
    }
  }
}

// ── Preflight check ──────────────────────────────────────────────────────────

async function preflight() {
  process.stdout.write(`\n${c.bold('ZeyOS CLI Integration Tests')}\n`);
  process.stdout.write(`${c.dim('────────────────────────────────────────')}\n`);

  // Verify we're authenticated
  const r = await cli(['whoami', '--json']);
  if (r.code !== 0) {
    process.stderr.write(`\n${c.red('✗ Not authenticated. Run `zeyos login` first.')}\n`);
    process.stderr.write(`  ${c.dim(r.stderr.trim())}\n\n`);
    process.exit(1);
  }

  try {
    const user = JSON.parse(r.stdout);
    process.stdout.write(`${c.dim(`Platform: authenticated as ${user.name ?? user.username ?? 'unknown'}`)}\n`);
  } catch {
    process.stdout.write(`${c.dim('Platform: authenticated (could not parse user info)')}\n`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await preflight();

  await testWhoami();
  await testResources();
  await testConfigFields();
  await testConfigGetExpand();
  await testConfigListAccounts();
  await testListTickets();
  await testListOtherResources();
  await testListWithExpand();
  await testListWithOffset();
  await testGetTicket();
  await testCRUDLifecycle();
  await testCreateWithData();
  await testDeleteAlias();
  await testValueCoercion();
  await testErrorPaths();
  await testHelp();

  await cleanup();

  // ── Summary ──────────────────────────────────────────────────────────────
  const total = _passed + _failed + _skipped;
  process.stdout.write(`\n${c.bold('────────────────────────────────────────')}\n`);
  process.stdout.write(`  ${c.green(`${_passed} passed`)}`);
  if (_failed > 0) process.stdout.write(`  ${c.red(`${_failed} failed`)}`);
  if (_skipped > 0) process.stdout.write(`  ${c.yellow(`${_skipped} skipped`)}`);
  process.stdout.write(`  ${c.dim(`(${total} total)`)}\n`);

  if (_failures.length > 0) {
    process.stdout.write(`\n${c.red('Failures:')}\n`);
    for (const f of _failures) {
      process.stdout.write(`  ${c.red('✗')} ${f.name}\n`);
      if (f.reason) process.stdout.write(`    ${c.dim(String(f.reason))}\n`);
    }
  }

  process.stdout.write('\n');
  process.exit(_failed > 0 ? 1 : 0);
}

main().catch(err => {
  process.stderr.write(`\n${c.red('Fatal:')} ${err.message}\n`);
  process.exit(1);
});
