import { execFile, spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dir = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dir, '..', 'bin', 'zeyos.mjs');
const PKG_VERSION = createRequire(import.meta.url)('../package.json').version;

const ZEYOS_ENV_KEYS = [
  'ZEYOS_BASE_URL',
  'ZEYOS_INSTANCE',
  'ZEYOS_CLIENT_ID',
  'ZEYOS_CLIENT_SECRET',
  'ZEYOS_TOKEN',
  'ZEYOS_REFRESH_TOKEN',
  'ZEYOS_NO_REFRESH',
  'ZEYOS_CREDENTIALS_READONLY'
];

function cli(args, options = {}) {
  return new Promise((resolveResult) => {
    execFile(process.execPath, [CLI_BIN, ...args], {
      cwd: options.cwd,
      env: { ...process.env, NO_COLOR: '1', ...options.env }
    }, (err, stdout, stderr) => {
      resolveResult({
        code: err?.code ?? 0,
        stdout: stdout ?? '',
        stderr: stderr ?? ''
      });
    });
  });
}

function cliWithInput(args, input, options = {}) {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [CLI_BIN, ...args], {
      cwd: options.cwd,
      env: { ...process.env, NO_COLOR: '1', ...options.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => {
      resolveResult({ code: code ?? 0, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

function isolatedEnv(home, overrides = {}) {
  const env = {
    ...process.env,
    NO_COLOR: '1',
    HOME: home,
    USERPROFILE: home,
    ...overrides
  };

  for (const key of ZEYOS_ENV_KEYS) {
    if (!(key in overrides)) {
      delete env[key];
    }
  }

  return env;
}

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'zeyos-cli-offline-'));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function jsonServer(t, handler) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body
      });
      handler(req, res, body);
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });

  t.after(async () => {
    await new Promise((resolveClose) => {
      server.close(resolveClose);
    });
  });

  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}/dev`,
    requests
  };
}

async function freePort(t) {
  const server = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const { port } = server.address();
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function writeFakeBrowserCommand(dir) {
  const bin = join(dir, 'bin');
  await mkdir(bin, { recursive: true });
  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';
  const target = join(bin, command);
  await writeFile(target, '#!/bin/sh\nexit 0\n', 'utf8');
  await chmod(target, 0o755);
  return bin;
}

test('global help is available without credentials', async () => {
  const result = await cli(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage: zeyos/);
  assert.match(result.stdout, /resources/);
});

test('--version and -v print the version number', async () => {
  const longForm  = await cli(['--version']);
  const shortForm = await cli(['-v']);
  assert.equal(longForm.code, 0);
  assert.equal(shortForm.code, 0);
  // Version string is a semver like "0.1.0"
  assert.match(longForm.stdout,  /^\d+\.\d+\.\d+\n$/);
  assert.match(shortForm.stdout, /^\d+\.\d+\.\d+\n$/);
});

test('--key=value form is parsed correctly', async () => {
  // describe supports --json and runs offline; verify --json='' is treated as the value
  // and the known --json flag via =value form still works as boolean (value ignored)
  // More concretely: --key=value for string options must be split at '='
  const result = await cli(['describe', 'ticket', '--json']);
  assert.equal(result.code, 0);
  const def = JSON.parse(result.stdout);
  assert.equal(def.name, 'tickets');
});

test('resources supports JSON output for automation', async () => {
  const result = await cli(['resources', '--json']);
  assert.equal(result.code, 0, result.stderr);

  const resources = JSON.parse(result.stdout);
  assert.equal(Array.isArray(resources), true);

  const ticket = resources.find((resource) => resource.name === 'ticket');
  assert.ok(ticket);
  assert.deepEqual(ticket.operations, ['list', 'get', 'create', 'update', 'delete']);

  const actionstep = resources.find((resource) => resource.name === 'actionstep');
  assert.ok(actionstep);
  assert.deepEqual(actionstep.operations, ['list', 'get', 'create', 'update', 'delete']);

  const customfield = resources.find((resource) => resource.name === 'customfield');
  assert.ok(customfield);
  assert.deepEqual(customfield.operations, ['list', 'get']);

  const address = resources.find((resource) => resource.name === 'address');
  assert.ok(address);
  assert.deepEqual(address.operations, ['list', 'get', 'create', 'update', 'delete']);

  const dunning = resources.find((resource) => resource.name === 'dunning');
  assert.ok(dunning);
  assert.deepEqual(dunning.operations, ['list', 'get', 'create', 'update', 'delete']);
});

test('actionstep aliases and schema are available offline', async () => {
  const described = await cli(['describe', 'time-entries', '--json']);
  assert.equal(described.code, 0, described.stderr);

  const schema = JSON.parse(described.stdout);
  assert.equal(schema.name, 'actionsteps');
  assert.ok(schema.fields.effort);
  assert.deepEqual(schema.fields.status.enum, {
    0: 'DRAFT',
    1: 'COMPLETED',
    2: 'CANCELLED',
    3: 'BOOKED'
  });
});

test('dunning aliases resolve to the dunning-notice schema offline', async () => {
  const described = await cli(['describe', 'dunning-notices', '--json']);
  assert.equal(described.code, 0, described.stderr);

  const schema = JSON.parse(described.stdout);
  assert.equal(schema.name, 'dunning');
  assert.ok(schema.fields.dunningnum);
  assert.deepEqual(schema.fields.status.enum, {
    0: 'DRAFT',
    1: 'BOOKED',
    2: 'CANCELLED',
    3: 'CLOSED'
  });
});

test('address aliases resolve to address operations and schema offline', async () => {
  const described = await cli(['describe', 'addresses', '--json']);
  assert.equal(described.code, 0, described.stderr);

  const schema = JSON.parse(described.stdout);
  assert.equal(schema.name, 'addresses');
  assert.ok(schema.fields.account);
  assert.deepEqual(schema.fields.type.enum, {
    0: 'BILLING_SHIPPING',
    1: 'BILLING_BILLING',
    2: 'PROCUREMENT_SHIPPING',
    3: 'PROCUREMENT_BILLING',
    4: 'COLLECTION',
    5: 'BILLING_SELLER',
    6: 'PROCUREMENT_SELLER'
  });
});

test('unknown commands fail with a non-zero exit code', async () => {
  const result = await cli(['not-a-command']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown command/);
});

test('skills list works without credentials and supports JSON', async () => {
  const result = await cli(['skills', 'list', '--json']);
  assert.equal(result.code, 0, result.stderr);

  const skills = JSON.parse(result.stdout);
  assert.ok(Array.isArray(skills) && skills.length >= 10);
  assert.ok(skills.some((skill) => skill.name === 'zeyos-work-management' && skill.description));
});

test('skills install --target writes into that agent\'s local directory', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(
    ['skills', 'install', 'zeyos-work-management', '--target', 'opencode', '--local', '--yes'],
    { cwd, env: isolatedEnv(cwd) }
  );

  assert.equal(result.code, 0, result.stderr);
  assert.ok(await exists(join(cwd, '.opencode', 'skills', 'zeyos-work-management', 'SKILL.md')));
  // Shared references are copied alongside so cross-links resolve.
  assert.ok(await exists(join(cwd, '.opencode', 'skills', 'shared')));
});

test('skills install --json reports the resolved target and installed skills', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(
    ['skills', 'install', 'zeyos-work-management', '--target', 'codex', '--local', '--json'],
    { cwd, env: isolatedEnv(cwd) }
  );

  assert.equal(result.code, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.target.agent, 'codex');
  assert.equal(summary.target.scope, 'local');
  assert.deepEqual(summary.installed, ['zeyos-work-management']);
  assert.equal(summary.shared, true);
});

test('skills install --dir overrides the agent and installs into that path', async (t) => {
  const cwd = await tempDir(t);
  const dest = join(cwd, 'vendor', 'skills');
  const result = await cli(
    ['skills', 'install', 'zeyos-work-management', '--dir', dest, '--yes'],
    { cwd, env: isolatedEnv(cwd) }
  );

  assert.equal(result.code, 0, result.stderr);
  assert.ok(await exists(join(dest, 'zeyos-work-management', 'SKILL.md')));
});

test('skills install --global installs into the agent home directory', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  const result = await cli(
    ['skills', 'install', 'zeyos-work-management', '--target', 'claude', '--global', '--yes'],
    { cwd, env: isolatedEnv(home) }
  );

  assert.equal(result.code, 0, result.stderr);
  assert.ok(await exists(join(home, '.claude', 'skills', 'zeyos-work-management', 'SKILL.md')));
});

test('skills install rejects an unknown --target', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(
    ['skills', 'install', '--target', 'bogus', '--yes'],
    { cwd, env: isolatedEnv(cwd) }
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown --target "bogus"/);
  assert.match(result.stderr, /claude, codex, opencode, droid, pi, agents/);
});

test('skills install skips existing skills without --force', async (t) => {
  const cwd = await tempDir(t);
  const args = ['skills', 'install', 'zeyos-work-management', '--target', 'claude', '--local', '--yes'];

  const first = await cli(args, { cwd, env: isolatedEnv(cwd) });
  assert.equal(first.code, 0, first.stderr);

  const second = await cli(args, { cwd, env: isolatedEnv(cwd) });
  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stderr, /already exist/);
});

test('describe reads the schema offline (fields, enums)', async () => {
  const result = await cli(['describe', 'tickets', '--json']);
  assert.equal(result.code, 0, result.stderr);

  const def = JSON.parse(result.stdout);
  assert.equal(def.name, 'tickets');
  assert.ok(def.fields.status.enum);
  assert.equal(def.fields.account.fk, 'accounts');
});

test('describe resolves customfield aliases to the customfields schema', async () => {
  const result = await cli(['describe', 'customfields', '--json']);
  assert.equal(result.code, 0, result.stderr);

  const def = JSON.parse(result.stdout);
  assert.equal(def.name, 'customfields');
  assert.equal(def.fields.identifier.indexed, true);
  assert.ok(def.fields.activity.enum);
});

test('describe rejects an unknown resource', async () => {
  const result = await cli(['describe', 'nonexistent-resource']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown resource/);
});

test('table output stays plain and full when piped/NO_COLOR (scriptability)', async () => {
  // Width-aware truncation and semantic color are TTY-only. Under NO_COLOR and a
  // piped (non-TTY) stdout the output must carry no ANSI escapes AND must not drop
  // data — so `| grep`/`| awk` keep working. The describe enums block also prints
  // the full code=LABEL pairs below the (truncatable) table.
  const result = await cli(['describe', 'tickets']);
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /\x1b\[[0-9;]*m/, 'piped output must contain no ANSI color codes');
  assert.match(result.stdout, /NOTSTARTED/);
  assert.match(result.stdout, /BOOKED/); // last enum value survives in full
});

test('help output is plain (no ANSI) when color is disabled', async () => {
  const result = await cli(['--help']);
  assert.doesNotMatch(result.stdout, /\x1b\[[0-9;]*m/, 'help must contain no ANSI when NO_COLOR is set');
  assert.match(result.stdout, /Commands:/);
});

test('command help includes shared global profile options', async () => {
  const result = await cli(['whoami', '--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Global options:/);
  assert.match(result.stdout, /--profile <name>/);
});

test('invalid local credential config fails loudly', async (t) => {
  const cwd = await tempDir(t);
  await mkdir(join(cwd, '.zeyos'), { recursive: true });
  await writeFile(join(cwd, '.zeyos', 'auth.json'), '{not json', 'utf8');

  const result = await cli(['whoami'], {
    cwd,
    env: isolatedEnv(cwd)
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Failed to read .*\.zeyos[/\\]auth\.json/);
});

// Blank out every ZEYOS_* var so no ambient credentials (env or global
// ~/.config file, via the temp HOME) can let create/update reach the network.
const NO_CREDENTIALS = Object.fromEntries(ZEYOS_ENV_KEYS.map((key) => [key, '']));

test('create adopts a JSON object passed positionally as --data', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(['create', 'tickets', '{"name":"Positional ticket","status":0}'], {
    cwd,
    env: isolatedEnv(cwd, NO_CREDENTIALS)
  });

  // No credentials are configured, so the command still exits non-zero — but it
  // must get *past* payload parsing: adopt the body and never say "No fields".
  assert.match(result.stderr, /Treating positional JSON argument as --data/);
  assert.doesNotMatch(result.stderr, /No fields provided/);
  assert.match(result.stderr, /Missing required configuration/);
});

test('update adopts a JSON object passed positionally as --data', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(['update', 'tickets', '42', '{"status":2}'], {
    cwd,
    env: isolatedEnv(cwd, NO_CREDENTIALS)
  });

  assert.match(result.stderr, /Treating positional JSON argument as --data/);
  assert.doesNotMatch(result.stderr, /No fields provided/);
  assert.match(result.stderr, /Missing required configuration/);
});

test('create guides toward --data when a positional JSON body is malformed', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(['create', 'tickets', '{not valid json'], {
    cwd,
    env: isolatedEnv(cwd, NO_CREDENTIALS)
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /malformed JSON object positionally/);
  assert.match(result.stderr, /--data/);
  assert.doesNotMatch(result.stderr, /No fields provided/);
});

test('create still reports "No fields provided" when nothing usable is passed', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(['create', 'tickets'], {
    cwd,
    env: isolatedEnv(cwd, NO_CREDENTIALS)
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /No fields provided/);
});

test('invalid local resource config fails loudly', async (t) => {
  const cwd = await tempDir(t);
  await mkdir(join(cwd, '.zeyos', 'api'), { recursive: true });
  await writeFile(join(cwd, '.zeyos', 'api', 'ticket.json'), '{not json', 'utf8');

  const result = await cli(['list', 'tickets'], {
    cwd,
    env: isolatedEnv(cwd, {
      ZEYOS_BASE_URL: 'https://cloud.zeyos.com/demo',
      ZEYOS_CLIENT_ID: 'client-id',
      ZEYOS_CLIENT_SECRET: 'client-secret',
      ZEYOS_TOKEN: 'access-token'
    })
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Failed to read resource config .*\.zeyos[/\\]api[/\\]ticket\.json/);
});

// Credentials sufficient for buildCliClient to succeed. --query never sends a
// request, so these stay fully offline.
const CREDENTIALS = {
  ZEYOS_BASE_URL: 'https://zeyos.example.com/dev',
  ZEYOS_CLIENT_ID: 'client-id',
  ZEYOS_CLIENT_SECRET: 'client-secret',
  ZEYOS_TOKEN: 'access-token'
};

test('unknown flags fail loudly instead of being ignored', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(['list', 'tickets', '--invalid'], {
    cwd,
    env: isolatedEnv(cwd, CREDENTIALS)
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown option: --invalid/);
});

test('a near-miss flag suggests the intended option', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(['list', 'tickets', '--filterr', '{}'], {
    cwd,
    env: isolatedEnv(cwd, CREDENTIALS)
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /did you mean --filter\?/);
});

test('a leading flag is reported as an unknown option, not a command', async () => {
  const result = await cli(['--invalid']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown option: "--invalid"/);
});

test('known string options require a value', async (t) => {
  const cwd = await tempDir(t);
  const profile = await cli(['whoami', '--profile', '--json'], {
    cwd,
    env: isolatedEnv(cwd, NO_CREDENTIALS)
  });
  assert.equal(profile.code, 1);
  assert.match(profile.stderr, /Option --profile requires a value/);

  const limit = await cli(['list', 'tickets', '--limit', '--query'], {
    cwd,
    env: isolatedEnv(cwd, CREDENTIALS)
  });
  assert.equal(limit.code, 1);
  assert.match(limit.stderr, /Option --limit requires a value/);
});

test('create still accepts arbitrary --<field> flags', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(['create', 'tickets', '--name', 'Hi', '--anything', 'goes', '--query'], {
    cwd,
    env: isolatedEnv(cwd, CREDENTIALS)
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /"anything": "goes"/);
});

test('--query prints the route + JSON payload without sending a request', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(
    ['list', 'tickets', '--filter', '{"status":1}', '--limit', '5', '--query'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0);
  // Route line: METHOD + resolved URL for the configured instance.
  assert.match(result.stdout, /POST https:\/\/zeyos\.example\.com\/dev\/api\/v1\/tickets/);
  // Pretty-printed JSON body reflecting the filter + limit.
  assert.match(result.stdout, /"filters"/);
  assert.match(result.stdout, /"status": 1/);
  assert.match(result.stdout, /"limit": 5/);
});

test('leading --query and --json are applied to the command', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(
    ['--query', '--json', 'list', 'tickets', '--limit', '3'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0, result.stderr);
  const descriptor = JSON.parse(result.stdout);
  assert.equal(descriptor.operationId, 'listTickets');
  assert.equal(descriptor.body.limit, 3);
});

test('list --filter-file reads JSON filters from disk', async (t) => {
  const cwd = await tempDir(t);
  await writeFile(join(cwd, 'filter.json'), JSON.stringify({ status: 1, visibility: 0 }), 'utf8');

  const result = await cli(
    ['list', 'tickets', '--filter-file', 'filter.json', '--limit', '5', '--query'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /"filters"/);
  assert.match(result.stdout, /"status": 1/);
  assert.match(result.stdout, /"visibility": 0/);
});

test('count --filter-file reads JSON filters from disk', async (t) => {
  const cwd = await tempDir(t);
  await writeFile(join(cwd, 'filter.json'), JSON.stringify({ status: 2 }), 'utf8');

  const result = await cli(
    ['count', 'tickets', '--filter-file', 'filter.json', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0, result.stderr);
  const descriptor = JSON.parse(result.stdout);
  assert.equal(descriptor.operationId, 'listTickets');
  assert.deepEqual(descriptor.body, { count: true, filters: { status: 2 } });
});

test('list and count normalize common Mongo-style range filter operators', async (t) => {
  const cwd = await tempDir(t);

  const count = await cli(
    ['count', 'actionsteps', '--filter', '{"status":0,"duedate":{"$lte":4102444800}}', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );
  assert.equal(count.code, 0, count.stderr);
  assert.deepEqual(JSON.parse(count.stdout).body.filters, {
    status: 0,
    duedate: { '<=': 4102444800 }
  });

  const list = await cli(
    ['list', 'transactions', '--filter', '{"date":{"$gte":1893456000,"$lt":1893715200}}', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );
  assert.equal(list.code, 0, list.stderr);
  assert.deepEqual(JSON.parse(list.stdout).body.filters, {
    date: { '>=': 1893456000, '<': 1893715200 }
  });

  const notIn = await cli(
    ['count', 'tickets', '--filter', '{"visibility":0,"status":{"$nin":[8,9,10]}}', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );
  assert.equal(notIn.code, 0, notIn.stderr);
  assert.deepEqual(JSON.parse(notIn.stdout).body.filters, {
    visibility: 0,
    status: { '!IN': [8, 9, 10] }
  });

  const bareOperator = await cli(
    ['count', 'tickets', '--filter', '{"visibility":0,"status":{"gt":-1}}', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );
  assert.equal(bareOperator.code, 0, bareOperator.stderr);
  assert.deepEqual(JSON.parse(bareOperator.stdout).body.filters, {
    visibility: 0,
    status: { '>': -1 }
  });

  const addresses = await cli(
    ['list', 'addresses', '--filter', '{"account":[4628,4629,4630],"type":[0,1]}', '--fields', 'ID,account,type', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );
  assert.equal(addresses.code, 0, addresses.stderr);
  const descriptor = JSON.parse(addresses.stdout);
  assert.equal(descriptor.operationId, 'listAddresses');
  assert.deepEqual(descriptor.body.filters, {
    account: { IN: [4628, 4629, 4630] },
    type: { IN: [0, 1] }
  });
  assert.deepEqual(descriptor.body.fields, { ID: 'ID', account: 'account', type: 'type' });
});

test('list normalizes common suffix filter operators and account name aliases', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(
    [
      'list',
      'accounts',
      '--filter',
      '{"name__startswith":"AGENTTEST-run addr-","customernum__ne":null,"ID__gt":4000}',
      '--fields',
      'ID,name',
      '--query',
      '--json'
    ],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0, result.stderr);
  const descriptor = JSON.parse(result.stdout);
  assert.equal(descriptor.operationId, 'listAccounts');
  assert.deepEqual(descriptor.body.fields, { ID: 'ID', name: 'lastname' });
  assert.deepEqual(descriptor.body.filters, {
    lastname: { '~~*': 'AGENTTEST-run addr-%' },
    customernum: { '!=': null },
    ID: { '>': 4000 }
  });
});

test('count customfields uses the listCustomFields operation', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(
    ['count', 'customfields', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0, result.stderr);
  const descriptor = JSON.parse(result.stdout);
  assert.equal(descriptor.operationId, 'listCustomFields');
  assert.deepEqual(descriptor.body, { count: true });
  assert.match(descriptor.url, /\/api\/v1\/customfields$/);
});

test('count dunning uses the listDunningNotices operation', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(
    ['count', 'dunning', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0, result.stderr);
  const descriptor = JSON.parse(result.stdout);
  assert.equal(descriptor.operationId, 'listDunningNotices');
  assert.deepEqual(descriptor.body, { count: true });
  assert.match(descriptor.url, /\/api\/v1\/dunning$/);
});

test('--filter-file errors do not echo file contents', async (t) => {
  const cwd = await tempDir(t);
  await writeFile(join(cwd, 'filter.json'), '{"token":"very-secret-token",', 'utf8');

  const result = await cli(
    ['list', 'tickets', '--filter-file', 'filter.json', '--query'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /--filter-file file must contain valid JSON/);
  assert.doesNotMatch(result.stderr, /very-secret-token/);
});

test('create --data-file reads JSON request bodies from disk', async (t) => {
  const cwd = await tempDir(t);
  await writeFile(join(cwd, 'ticket.json'), JSON.stringify({ name: 'From file', status: 0 }), 'utf8');

  const result = await cli(
    ['create', 'ticket', '--data-file', 'ticket.json', '--priority', '3', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0, result.stderr);
  const descriptor = JSON.parse(result.stdout);
  assert.deepEqual(descriptor.body, { name: 'From file', status: 0, priority: 3 });
});

test('update --data-file reads JSON request bodies from disk', async (t) => {
  const cwd = await tempDir(t);
  await writeFile(join(cwd, 'ticket-update.json'), JSON.stringify({ status: 4 }), 'utf8');

  const result = await cli(
    ['update', 'ticket', '42', '--data-file', 'ticket-update.json', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0, result.stderr);
  const descriptor = JSON.parse(result.stdout);
  assert.deepEqual(descriptor.body, { status: 4 });
  assert.deepEqual(descriptor.pathParams, { ID: '42' });
});

test('--data-file errors do not echo file contents', async (t) => {
  const cwd = await tempDir(t);
  await writeFile(join(cwd, 'ticket.json'), '{"secret":"very-secret-token",', 'utf8');

  const result = await cli(['create', 'ticket', '--data-file', 'ticket.json'], {
    cwd,
    env: isolatedEnv(cwd, NO_CREDENTIALS)
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /--data-file file must contain valid JSON/);
  assert.doesNotMatch(result.stderr, /very-secret-token/);
});

test('--data and --data-file cannot be combined', async (t) => {
  const cwd = await tempDir(t);
  await writeFile(join(cwd, 'ticket.json'), JSON.stringify({ name: 'From file' }), 'utf8');

  const result = await cli(
    ['create', 'ticket', '--data', '{"name":"Inline"}', '--data-file', 'ticket.json'],
    { cwd, env: isolatedEnv(cwd, NO_CREDENTIALS) }
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Use either --data or --data-file, not both/);
});

test('count --json emits a stable object', async (t) => {
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ count: 129 }));
  });

  const result = await cli(['count', 'tickets', '--json'], {
    cwd,
    env: isolatedEnv(cwd, {
      ...CREDENTIALS,
      ZEYOS_BASE_URL: server.baseUrl
    })
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { count: 129 });
  assert.equal(server.requests.length, 1);
  assert.equal(server.requests[0].method, 'POST');
  assert.match(server.requests[0].url, /\/dev\/api\/v1\/tickets$/);
  assert.deepEqual(JSON.parse(server.requests[0].body), { count: true });
});

test('sum dry-run builds a paged list request and normalizes array filters', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(
    ['sum', 'actionsteps', 'effort', '--filter', '{"status":[1,3]}', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0, result.stderr);
  const descriptor = JSON.parse(result.stdout);
  assert.equal(descriptor.operationId, 'listActionSteps');
  assert.deepEqual(descriptor.body, {
    fields: ['effort'],
    filters: { status: { IN: [1, 3] } },
    limit: 50,
    offset: 0
  });
});

test('sum pages through matching records and emits a numeric total', async (t) => {
  const cwd = await tempDir(t);
  const rows = [
    { effort: 10 },
    { effort: 20 },
    { effort: null },
    { effort: 5 },
    { effort: 15 }
  ];
  const server = await jsonServer(t, (_req, res, body) => {
    const parsed = JSON.parse(body || '{}');
    const offset = parsed.offset || 0;
    const limit = parsed.limit || 50;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(rows.slice(offset, offset + limit)));
  });

  const result = await cli(
    ['sum', 'actionsteps', 'effort', '--filter', '{"status":[1,3]}', '--page-size', '2', '--json'],
    { cwd, env: isolatedEnv(cwd, { ...CREDENTIALS, ZEYOS_BASE_URL: server.baseUrl }) }
  );

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { sum: 50, count: 5, field: 'effort' });
  assert.equal(server.requests.length, 3);
  assert.deepEqual(JSON.parse(server.requests[0].body), {
    fields: ['effort'],
    filters: { status: { IN: [1, 3] } },
    limit: 2,
    offset: 0
  });
  assert.deepEqual(JSON.parse(server.requests[2].body), {
    fields: ['effort'],
    filters: { status: { IN: [1, 3] } },
    limit: 2,
    offset: 4
  });
});

test('read-only resources reject unsupported write actions before auth', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(['create', 'customfields', '--name', 'Nope'], {
    cwd,
    env: isolatedEnv(cwd, NO_CREDENTIALS)
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Resource "customfields" does not support creation/);
  assert.doesNotMatch(result.stderr, /Missing required configuration/);
});

test('list default dry-run includes configured fields and default limit', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(['list', 'tickets', '--query', '--json'], {
    cwd,
    env: isolatedEnv(cwd, CREDENTIALS)
  });

  assert.equal(result.code, 0, result.stderr);
  const descriptor = JSON.parse(result.stdout);
  assert.equal(descriptor.operationId, 'listTickets');
  assert.equal(descriptor.body.limit, 50);
  assert.equal(descriptor.body.fields.ID, 'ID');
  assert.equal(descriptor.body.fields.Name, 'name');
});

test('list --fields JSON object is sent as an alias map', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(
    ['list', 'tickets', '--fields', '{"Title":"name","Due":"duedate"}', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0, result.stderr);
  const descriptor = JSON.parse(result.stdout);
  assert.deepEqual(descriptor.body.fields, { Title: 'name', Due: 'duedate' });
});

test('list --sort and --offset are reflected in the request body', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(
    ['list', 'tickets', '--sort', '+name,-lastmodified', '--offset', '25', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0, result.stderr);
  const descriptor = JSON.parse(result.stdout);
  assert.deepEqual(descriptor.body.sort, ['+name', '-lastmodified']);
  assert.equal(descriptor.body.offset, 25);
});

test('list --extdata and --expand are reflected in the request body', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(
    ['list', 'tickets', '--extdata', '--expand', 'binfile,items', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0, result.stderr);
  const descriptor = JSON.parse(result.stdout);
  assert.equal(descriptor.body.extdata, 1);
  assert.deepEqual(descriptor.body.expand, ['binfile', 'items']);
});

test('list table output formats date fields with the configured dateFormat', async (t) => {
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ ID: 1, name: 'Due soon', duedate: 1767312000 }]));
  });

  await mkdir(join(cwd, '.zeyos'), { recursive: true });
  await writeFile(join(cwd, '.zeyos', 'auth.json'), JSON.stringify({
    baseUrl: server.baseUrl,
    clientId: 'client-id',
    clientSecret: 'client-secret',
    accessToken: 'access-token',
    dateFormat: 'YYYY/MM/DD'
  }, null, 2));

  const result = await cli(['list', 'tickets', '--fields', 'ID,name,duedate'], {
    cwd,
    env: isolatedEnv(cwd, { ...NO_CREDENTIALS, ZEYOS_PROFILE: '' })
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /2026\/01\/02/);
  assert.equal(server.requests.length, 1);
});

test('list empty results use a neutral info message', async (t) => {
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([]));
  });

  const result = await cli(['list', 'tickets'], {
    cwd,
    env: isolatedEnv(cwd, { ...CREDENTIALS, ZEYOS_BASE_URL: server.baseUrl })
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /No tickets match/);
  assert.doesNotMatch(result.stderr, /⚠/);
});

test('list emits a pagination count hint when the page is truncated', async (t) => {
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res, body) => {
    const parsed = JSON.parse(body || '{}');
    res.writeHead(200, { 'content-type': 'application/json' });
    if (parsed.count) {
      res.end(JSON.stringify({ count: 5 }));
    } else {
      res.end(JSON.stringify([{ ID: 1, name: 'A' }, { ID: 2, name: 'B' }]));
    }
  });

  const result = await cli(['list', 'tickets', '--limit', '2', '--json'], {
    cwd,
    env: isolatedEnv(cwd, { ...CREDENTIALS, ZEYOS_BASE_URL: server.baseUrl })
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).length, 2);
  assert.match(result.stderr, /Showing 1–2 of 5/);
  assert.match(result.stderr, /zeyos count tickets/);
  assert.equal(server.requests.length, 2);
  assert.deepEqual(JSON.parse(server.requests[1].body), { count: true });
});

test('get --fields JSON object controls record labels in table output', async (t) => {
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ID: 42, name: 'Labeled ticket', status: 1, duedate: 1767312000 }));
  });

  const result = await cli(
    ['get', 'ticket', '42', '--fields', '{"Title":"name","Due":"duedate"}'],
    { cwd, env: isolatedEnv(cwd, { ...CREDENTIALS, ZEYOS_BASE_URL: server.baseUrl }) }
  );

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Title\s+Labeled ticket/);
  assert.match(result.stdout, /Due\s+2026-01-02/);
  assert.doesNotMatch(result.stdout, /status/);
});

test('get --all and --expand build the expected query params', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(
    ['get', 'ticket', '42', '--all', '--expand', 'binfile,data', '--query', '--json'],
    { cwd, env: isolatedEnv(cwd, CREDENTIALS) }
  );

  assert.equal(result.code, 0, result.stderr);
  const descriptor = JSON.parse(result.stdout);
  assert.deepEqual(descriptor.query, {
    extdata: 1,
    tags: 1,
    positions: 1,
    binfile: 1,
    data: 1
  });
});

test('delete without --force aborts on a non-yes confirmation without sending the request', async (t) => {
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  const result = await cliWithInput(['delete', 'ticket', '42'], 'n\n', {
    cwd,
    env: isolatedEnv(cwd, { ...CREDENTIALS, ZEYOS_BASE_URL: server.baseUrl })
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /Delete ticket #42\? \[y\/N\]/);
  assert.match(result.stderr, /Aborted/);
  assert.equal(server.requests.length, 0);
});

test('create sends coerced field flags and prints the created record as JSON', async (t) => {
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res, body) => {
    const payload = JSON.parse(body || '{}');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ID: 101, ...payload }));
  });

  const result = await cli(
    ['create', 'ticket', '--name', 'Mock create', '--status', '0', '--priority', '3', '--json'],
    { cwd, env: isolatedEnv(cwd, { ...CREDENTIALS, ZEYOS_BASE_URL: server.baseUrl }) }
  );

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { ID: 101, name: 'Mock create', status: 0, priority: 3 });
  assert.equal(server.requests.length, 1);
  assert.equal(server.requests[0].method, 'PUT');
  assert.match(server.requests[0].url, /\/dev\/api\/v1\/tickets$/);
  assert.deepEqual(JSON.parse(server.requests[0].body), { name: 'Mock create', status: 0, priority: 3 });
});

test('edit alias sends coerced update fields to the update endpoint', async (t) => {
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res, body) => {
    const payload = JSON.parse(body || '{}');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ID: 42, ...payload }));
  });

  const result = await cli(
    ['edit', 'ticket', '42', '--priority', '1', '--status', '4', '--json'],
    { cwd, env: isolatedEnv(cwd, { ...CREDENTIALS, ZEYOS_BASE_URL: server.baseUrl }) }
  );

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { ID: 42, priority: 1, status: 4 });
  assert.equal(server.requests.length, 1);
  assert.equal(server.requests[0].method, 'PATCH');
  assert.match(server.requests[0].url, /\/dev\/api\/v1\/tickets\/42$/);
  assert.deepEqual(JSON.parse(server.requests[0].body), { priority: 1, status: 4 });
});

test('rm alias with --force sends a delete request without prompting', async (t) => {
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  const result = await cli(['rm', 'ticket', '42', '--force'], {
    cwd,
    env: isolatedEnv(cwd, { ...CREDENTIALS, ZEYOS_BASE_URL: server.baseUrl })
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /Deleted ticket #42/);
  assert.equal(server.requests.length, 1);
  assert.equal(server.requests[0].method, 'DELETE');
  assert.match(server.requests[0].url, /\/dev\/api\/v1\/tickets\/42$/);
});

test('doctor agent --json reports local readiness without secret values', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(['doctor', 'agent', '--json'], {
    cwd,
    env: isolatedEnv(cwd, {
      ZEYOS_BASE_URL: 'https://zeyos.example.com/dev',
      ZEYOS_INSTANCE: 'dev',
      ZEYOS_CLIENT_ID: 'client-id',
      ZEYOS_CLIENT_SECRET: 'client-secret-value',
      ZEYOS_TOKEN: 'access-token-value'
    })
  });

  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /client-secret-value/);
  assert.doesNotMatch(result.stdout, /access-token-value/);

  const report = JSON.parse(result.stdout);
  assert.equal(report.cli.version, PKG_VERSION);
  assert.equal(report.connection.baseUrl, 'https://zeyos.example.com/dev');
  assert.equal(report.connection.instance, 'dev');
  assert.equal(report.auth.ready, true);
  assert.equal(report.auth.env.present, true);
  assert.ok(report.auth.env.variables.includes('ZEYOS_TOKEN'));
  assert.equal(report.auth.effective.clientSecret, true);
  assert.equal(report.auth.effective.accessToken, true);
  assert.equal(report.resources.ok, true);
  assert.ok(report.resources.count > 0);
});

test('whoami --json fetches user info and hides the access token by default', async (t) => {
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ sub: 'user-1', name: 'Test User', updated_at: 1767312000 }));
  });

  const env = isolatedEnv(cwd, { ...CREDENTIALS, ZEYOS_BASE_URL: server.baseUrl });
  const hidden = await cli(['whoami', '--json'], { cwd, env });
  assert.equal(hidden.code, 0, hidden.stderr);
  assert.deepEqual(JSON.parse(hidden.stdout), { sub: 'user-1', name: 'Test User', updated_at: 1767312000 });
  assert.doesNotMatch(hidden.stdout, /access-token/);

  const shown = await cli(['whoami', '--show-token', '--json'], { cwd, env });
  assert.equal(shown.code, 0, shown.stderr);
  assert.equal(JSON.parse(shown.stdout).accessToken, 'access-token');

  assert.equal(server.requests.length, 2);
  assert.match(server.requests[0].url, /\/dev\/oauth2\/v1\/userinfo$/);
  assert.equal(server.requests[0].headers.authorization, 'Bearer access-token');
});

test('whoami accepts --profile before the command name', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ sub: 'profile-user', name: 'Profile User' }));
  });

  await writeProfilesFile(home, { active: null, profiles: {
    dev: {
      baseUrl: server.baseUrl,
      clientId: 'client-id',
      clientSecret: 'client-secret',
      accessToken: 'profile-access-token'
    }
  } });

  const result = await cli(['--profile', 'dev', 'whoami', '--json'], {
    cwd,
    env: isolatedEnv(home, { ...NO_CREDENTIALS, ZEYOS_PROFILE: '' })
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { sub: 'profile-user', name: 'Profile User' });
  assert.equal(server.requests.length, 1);
  assert.equal(server.requests[0].headers.authorization, 'Bearer profile-access-token');
});

test('whoami reports invalid refresh tokens with platform and source details', async (t) => {
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (req, res) => {
    if (/\/oauth2\/v1\/userinfo$/.test(req.url)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_token' }));
      return;
    }
    if (/\/oauth2\/v1\/token$/.test(req.url)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden: Invalid or expired refresh_token');
      return;
    }
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'unexpected request' }));
  });

  await mkdir(join(cwd, '.zeyos'), { recursive: true });
  await writeFile(join(cwd, '.zeyos', 'auth.json'), JSON.stringify({
    baseUrl: server.baseUrl,
    clientId: 'client-id',
    clientSecret: 'client-secret',
    accessToken: 'expired-access-token',
    refreshToken: 'bad-refresh-token',
    expiresAt: 1
  }, null, 2));

  const result = await cli(['whoami'], {
    cwd,
    env: isolatedEnv(cwd, { ...NO_CREDENTIALS, ZEYOS_PROFILE: '' })
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Your stored refresh token is invalid or expired/);
  assert.match(result.stderr, /Platform URL: http:\/\/127\.0\.0\.1:\d+\/dev/);
  assert.match(result.stderr, /Credential source: local file .*\.zeyos[/\\]auth\.json/);
  assert.match(result.stderr, /OAuth endpoint: http:\/\/127\.0\.0\.1:\d+\/dev\/oauth2\/v1\/token/);
  assert.match(result.stderr, /HTTP status: 403/);
  assert.match(result.stderr, /OAuth error: Forbidden: Invalid or expired refresh_token/);
  assert.match(result.stderr, /Next step: zeyos login --force/);
  assert.doesNotMatch(result.stderr, /Re-authenticate now/);
  assert.doesNotMatch(result.stderr, /Failed to fetch user info/);
  const tokenRequest = server.requests.find((request) => /\/dev\/oauth2\/v1\/token$/.test(request.url));
  assert.ok(server.requests.some((request) => /\/dev\/oauth2\/v1\/userinfo$/.test(request.url)));
  assert.ok(tokenRequest, 'expected a refresh-token request after userinfo returned 401');
  assert.match(tokenRequest.body, /grant_type=refresh_token/);
});

test('explicit ZEYOS_TOKEN is token-only and never refreshes from local credentials', async (t) => {
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (req, res) => {
    if (/\/oauth2\/v1\/userinfo$/.test(req.url)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_token' }));
      return;
    }
    if (/\/oauth2\/v1\/token$/.test(req.url)) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'token endpoint should not be called' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await mkdir(join(cwd, '.zeyos'), { recursive: true });
  await writeFile(join(cwd, '.zeyos', 'auth.json'), JSON.stringify({
    baseUrl: 'https://wrong.example.com/other',
    clientId: 'local-client',
    clientSecret: 'local-secret',
    accessToken: 'local-access-token',
    refreshToken: 'local-refresh-token',
    expiresAt: 1
  }, null, 2));

  const result = await cli(['whoami', '--json'], {
    cwd,
    env: isolatedEnv(cwd, {
      ...NO_CREDENTIALS,
      ZEYOS_BASE_URL: server.baseUrl,
      ZEYOS_TOKEN: 'env-access-token'
    })
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Your session has expired or is invalid/);
  assert.match(result.stderr, /Credential source: environment variables/);
  assert.equal(server.requests.length, 1);
  assert.match(server.requests[0].url, /\/dev\/oauth2\/v1\/userinfo$/);
  assert.equal(server.requests[0].headers.authorization, 'Bearer env-access-token');
});

test('ZEYOS_TOKEN ignores local credentials instead of merging their baseUrl', async (t) => {
  const cwd = await tempDir(t);
  await mkdir(join(cwd, '.zeyos'), { recursive: true });
  await writeFile(join(cwd, '.zeyos', 'auth.json'), JSON.stringify({
    baseUrl: 'https://wrong.example.com/other',
    clientId: 'local-client',
    clientSecret: 'local-secret',
    accessToken: 'local-access-token'
  }, null, 2));

  const result = await cli(['whoami', '--json'], {
    cwd,
    env: isolatedEnv(cwd, {
      ...NO_CREDENTIALS,
      ZEYOS_TOKEN: 'env-access-token'
    })
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Missing required configuration/);
  assert.match(result.stderr, /baseUrl/);
  assert.doesNotMatch(result.stderr, /clientId/);
  assert.doesNotMatch(result.stderr, /clientSecret/);
});

test('ZEYOS_CREDENTIALS_READONLY blocks auth-mutating commands without touching local auth', async (t) => {
  const cwd = await tempDir(t);
  const authPath = join(cwd, '.zeyos', 'auth.json');
  const original = JSON.stringify({
    baseUrl: 'https://zeyos.example.com/dev',
    clientId: 'local-client',
    clientSecret: 'local-secret',
    accessToken: 'local-access-token',
    refreshToken: 'local-refresh-token'
  }, null, 2);
  await mkdir(dirname(authPath), { recursive: true });
  await writeFile(authPath, original);

  const result = await cli(['logout'], {
    cwd,
    env: isolatedEnv(cwd, {
      ...NO_CREDENTIALS,
      ZEYOS_CREDENTIALS_READONLY: '1'
    })
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Credential command "logout" is disabled/);
  assert.equal(await readFile(authPath, 'utf8'), original);
});

test('doctor agent accepts token-only env auth without client credentials', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(['doctor', 'agent', '--json'], {
    cwd,
    env: isolatedEnv(cwd, {
      ...NO_CREDENTIALS,
      ZEYOS_BASE_URL: 'https://zeyos.example.com/dev',
      ZEYOS_TOKEN: 'access-token-value'
    })
  });

  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.auth.ready, true);
  assert.equal(report.auth.effective.tokenOnly, true);
  assert.equal(report.auth.effective.clientId, false);
  assert.equal(report.auth.effective.clientSecret, false);
});

test('--query --json emits a machine-readable request descriptor', async (t) => {
  const cwd = await tempDir(t);
  const result = await cli(['get', 'ticket', '42', '--query', '--json'], {
    cwd,
    env: isolatedEnv(cwd, CREDENTIALS)
  });

  assert.equal(result.code, 0);
  const descriptor = JSON.parse(result.stdout);
  assert.equal(descriptor.dryRun, true);
  assert.equal(descriptor.method, 'GET');
  assert.match(descriptor.url, /\/api\/v1\/tickets\/42(\?|$)/);
});

// ── profiles ────────────────────────────────────────────────────────────────

// NO_CREDENTIALS blanks the ZEYOS_* cred vars; also blank ZEYOS_PROFILE so a
// stray parent env var cannot select a profile in tests that don't intend it.
const CLEAN_ENV = { ...NO_CREDENTIALS, ZEYOS_PROFILE: '' };

async function writeProfilesFile(home, data) {
  const p = join(home, '.config', 'zeyos', 'profiles.json');
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 2));
  return p;
}

async function writeGlobalCredentialsFile(home, data) {
  const p = join(home, '.config', 'zeyos', 'credentials.json');
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 2));
  return p;
}

test('profile add prompts for name and OAuth config when run without options', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  const env = isolatedEnv(home, CLEAN_ENV);

  const res = await cliWithInput(
    ['profile', 'add'],
    'dev\nhttps://zeyos.example.com/dev\napp-id\nsecret-value\n',
    { cwd, env }
  );

  assert.equal(res.code, 0, res.stderr);
  assert.equal(res.stdout, '');
  assert.match(res.stderr, /Profile name:/);
  assert.match(res.stderr, /ZeyOS platform URL:/);
  assert.match(res.stderr, /Application ID:/);
  assert.match(res.stderr, /Application secret:/);
  assert.match(res.stderr, /Created profile "dev"/);
  assert.match(res.stderr, /zeyos login --profile dev/);

  const reg = JSON.parse((await cli(['profile', 'list', '--json'], { cwd, env })).stdout);
  assert.equal(reg.active, 'dev');
  assert.equal(reg.profiles.dev.baseUrl, 'https://zeyos.example.com/dev');
  assert.equal(reg.profiles.dev.clientId, 'app-id');
  assert.equal(reg.profiles.dev.clientSecret, 'secret-value');
  assert.equal(reg.profiles.dev.accessToken, undefined);
});

test('profile add with explicit fields remains non-interactive', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  const env = isolatedEnv(home, CLEAN_ENV);

  const res = await cli(['profile', 'add', 'minimal', '--base-url', 'https://zeyos.example.com/minimal'], { cwd, env });

  assert.equal(res.code, 0, res.stderr);
  assert.doesNotMatch(res.stderr, /Application ID:/);
  const reg = JSON.parse((await cli(['profile', 'list', '--json'], { cwd, env })).stdout);
  assert.equal(reg.profiles.minimal.baseUrl, 'https://zeyos.example.com/minimal');
  assert.equal(reg.profiles.minimal.clientId, undefined);
  assert.equal(reg.profiles.minimal.clientSecret, undefined);
});

test('profile add/list/use/remove round-trips through the global registry', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  const env = isolatedEnv(home, CLEAN_ENV);

  await cli(['profile', 'add', 'dev', '--base-url', 'https://zeyos.example.com/dev', '--client-id', 'd', '--secret', 's1'], { cwd, env });
  await cli(['profile', 'add', 'prod', '--base-url', 'https://cloud.zeyos.com/acme', '--client-id', 'p', '--secret', 's2'], { cwd, env });

  let reg = JSON.parse((await cli(['profile', 'list', '--json'], { cwd, env })).stdout);
  assert.equal(reg.active, 'dev'); // first added becomes active
  assert.deepEqual(Object.keys(reg.profiles).sort(), ['dev', 'prod']);
  assert.equal(reg.profiles.prod.baseUrl, 'https://cloud.zeyos.com/acme');

  await cli(['profile', 'use', 'prod'], { cwd, env });
  reg = JSON.parse((await cli(['profile', 'list', '--json'], { cwd, env })).stdout);
  assert.equal(reg.active, 'prod');

  await cli(['profile', 'remove', 'prod'], { cwd, env });
  reg = JSON.parse((await cli(['profile', 'list', '--json'], { cwd, env })).stdout);
  assert.equal(reg.active, 'dev');
  assert.deepEqual(Object.keys(reg.profiles), ['dev']);
});

test('a project pin (.zeyos/profile) selects a profile', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  const env = isolatedEnv(home, CLEAN_ENV);
  await writeProfilesFile(home, { active: 'dev', profiles: {
    dev:  { baseUrl: 'https://zeyos.example.com/dev' },
    prod: { baseUrl: 'https://cloud.zeyos.com/acme' }
  } });

  const pin = await cli(['profile', 'use', 'prod', '--local'], { cwd, env });
  assert.equal(pin.code, 0);
  assert.ok(await exists(join(cwd, '.zeyos', 'profile')));

  const out = JSON.parse((await cli(['profile', 'current', '--json'], { cwd, env })).stdout);
  assert.equal(out.profile, 'prod');
  assert.equal(out.origin, 'pin');
  assert.equal(out.baseUrl, 'https://cloud.zeyos.com/acme');
});

test('--profile flag overrides ZEYOS_PROFILE env and the active pointer', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  await writeProfilesFile(home, { active: 'dev', profiles: {
    dev:  { baseUrl: 'https://zeyos.example.com/dev' },
    prod: { baseUrl: 'https://cloud.zeyos.com/acme' }
  } });

  let out = JSON.parse((await cli(['profile', 'current', '--json'], { cwd, env: isolatedEnv(home, CLEAN_ENV) })).stdout);
  assert.equal(out.origin, 'active');
  assert.equal(out.profile, 'dev');

  out = JSON.parse((await cli(['profile', 'current', '--json'], { cwd, env: isolatedEnv(home, { ...NO_CREDENTIALS, ZEYOS_PROFILE: 'prod' }) })).stdout);
  assert.equal(out.origin, 'env');
  assert.equal(out.profile, 'prod');

  out = JSON.parse((await cli(['profile', 'current', '--profile', 'dev', '--json'], { cwd, env: isolatedEnv(home, { ...NO_CREDENTIALS, ZEYOS_PROFILE: 'prod' }) })).stdout);
  assert.equal(out.origin, 'flag');
  assert.equal(out.profile, 'dev');
});

test('leading --profile=value and --json are applied before command dispatch', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  await writeProfilesFile(home, { active: 'dev', profiles: {
    dev:  { baseUrl: 'https://zeyos.example.com/dev' },
    prod: { baseUrl: 'https://cloud.zeyos.com/acme' }
  } });

  const out = JSON.parse((await cli(
    ['--profile=prod', '--json', 'profile', 'current'],
    { cwd, env: isolatedEnv(home, CLEAN_ENV) }
  )).stdout);

  assert.equal(out.origin, 'flag');
  assert.equal(out.profile, 'prod');
  assert.equal(out.baseUrl, 'https://cloud.zeyos.com/acme');
});

test('an unknown --profile fails loudly with the known profiles listed', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  await writeProfilesFile(home, { active: 'dev', profiles: {
    dev: { baseUrl: 'https://zeyos.example.com/dev', clientId: 'd', clientSecret: 's', accessToken: 't' }
  } });
  const res = await cli(['whoami', '--profile', 'nope'], { cwd, env: isolatedEnv(home, CLEAN_ENV) });
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /Profile "nope" not found/);
  assert.match(res.stderr, /Known profiles: dev/);
});

test('logout --profile fails loudly when the selected profile is unknown', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  await writeProfilesFile(home, { active: 'dev', profiles: {
    dev: { baseUrl: 'https://zeyos.example.com/dev', clientId: 'd', clientSecret: 's', accessToken: 't' }
  } });

  const res = await cli(['logout', '--profile', 'nope'], { cwd, env: isolatedEnv(home, CLEAN_ENV) });
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /Profile "nope" not found/);
  assert.match(res.stderr, /Known profiles: dev/);
});

test('logout clears the full legacy local credential set', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  await mkdir(join(cwd, '.zeyos'), { recursive: true });
  await writeFile(join(cwd, '.zeyos', 'auth.json'), JSON.stringify({
    baseUrl: server.baseUrl,
    instance: 'dev',
    clientId: 'local-client',
    clientSecret: 'local-secret',
    accessToken: 'local-token',
    refreshToken: 'local-refresh',
    expiresAt: 123,
    refreshTokenExpiresAt: 456,
    dateFormat: 'YYYY/MM/DD'
  }, null, 2));

  const res = await cli(['logout'], { cwd, env: isolatedEnv(home, CLEAN_ENV) });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stderr, /Logged out \(local credentials\)/);

  const saved = JSON.parse(await readFile(join(cwd, '.zeyos', 'auth.json'), 'utf8'));
  assert.equal(saved.baseUrl, undefined);
  assert.equal(saved.instance, undefined);
  assert.equal(saved.clientId, undefined);
  assert.equal(saved.clientSecret, undefined);
  assert.equal(saved.accessToken, undefined);
  assert.equal(saved.refreshToken, undefined);
  assert.equal(saved.expiresAt, undefined);
  assert.equal(saved.refreshTokenExpiresAt, undefined);
  assert.equal(saved.dateFormat, 'YYYY/MM/DD');
  assert.equal(server.requests.length, 1);
  assert.match(server.requests[0].url, /\/dev\/oauth2\/v1\/revoke$/);
});

test('logout clears stale local connection params even without an access token', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);

  await mkdir(join(cwd, '.zeyos'), { recursive: true });
  await writeFile(join(cwd, '.zeyos', 'auth.json'), JSON.stringify({
    baseUrl: 'https://zeyos.example.com/dev',
    clientId: 'local-client',
    clientSecret: 'local-secret',
    dateFormat: 'YYYY/MM/DD'
  }, null, 2));

  const res = await cli(['logout'], { cwd, env: isolatedEnv(home, CLEAN_ENV) });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stderr, /Logged out \(local credentials\)/);
  assert.doesNotMatch(res.stderr, /Not currently logged in/);

  const saved = JSON.parse(await readFile(join(cwd, '.zeyos', 'auth.json'), 'utf8'));
  assert.deepEqual(saved, { dateFormat: 'YYYY/MM/DD' });
});

test('logout --global clears legacy global credentials even when local config exists', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  const globalPath = await writeGlobalCredentialsFile(home, {
    baseUrl: server.baseUrl,
    clientId: 'global-client',
    clientSecret: 'global-secret',
    accessToken: 'global-token',
    refreshToken: 'global-refresh'
  });

  await mkdir(join(cwd, '.zeyos'), { recursive: true });
  await writeFile(join(cwd, '.zeyos', 'auth.json'), JSON.stringify({
    baseUrl: 'https://zeyos.example.com/local',
    clientId: 'local-client',
    clientSecret: 'local-secret'
  }, null, 2));

  const res = await cli(['logout', '--global'], { cwd, env: isolatedEnv(home, CLEAN_ENV) });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stderr, /Logged out \(global credentials\)/);

  const saved = JSON.parse(await readFile(globalPath, 'utf8'));
  assert.equal(saved.baseUrl, server.baseUrl);
  assert.equal(saved.clientId, 'global-client');
  assert.equal(saved.clientSecret, 'global-secret');
  assert.equal(saved.accessToken, undefined);
  assert.equal(saved.refreshToken, undefined);
  assert.equal(server.requests.length, 1);
  assert.match(server.requests[0].url, /\/dev\/oauth2\/v1\/revoke$/);
});

test('login reports "already logged in" per-profile when the token is still valid', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  const future = Math.floor(Date.now() / 1000) + 3600;
  await writeProfilesFile(home, { active: 'dev', profiles: {
    dev: { baseUrl: 'https://zeyos.example.com/dev', clientId: 'd', clientSecret: 's', accessToken: 'tok', expiresAt: future }
  } });
  const res = await cli(['login', '--profile', 'dev'], { cwd, env: isolatedEnv(home, CLEAN_ENV) });
  assert.equal(res.code, 0);
  assert.match(`${res.stdout}${res.stderr}`, /Already logged in \(profile "dev"\)/);
});

test('login prompts for missing OAuth config before manual code exchange', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  const callbackPort = await freePort(t);
  const server = await jsonServer(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      token_type: 'Bearer',
      access_token: 'prompt-access',
      refresh_token: 'prompt-refresh',
      expires_in: 3600
    }));
  });

  const child = spawn(process.execPath, [
    CLI_BIN,
    'login',
    '--manual',
    '--port', String(callbackPort)
  ], {
    cwd,
    env: isolatedEnv(home, CLEAN_ENV),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  t.after(() => {
    if (child.exitCode == null) child.kill('SIGTERM');
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const waitForStderr = (pattern) => new Promise((resolveMatch, rejectMatch) => {
    const check = () => {
      if (!pattern.test(stderr)) return false;
      clearTimeout(timer);
      child.stderr.off('data', onData);
      resolveMatch();
      return true;
    };
    const onData = () => { check(); };
    const timer = setTimeout(() => {
      child.stderr.off('data', onData);
      rejectMatch(new Error(`Timed out waiting for ${pattern}. stderr:\n${stderr}`));
    }, 5000);
    child.stderr.on('data', onData);
    check();
  });

  await waitForStderr(/ZeyOS platform URL:/);
  child.stdin.write(`${server.baseUrl}\n`);

  await waitForStderr(/Application ID:/);
  child.stdin.write('prompt-client\n');

  await waitForStderr(/Application secret:/);
  child.stdin.write('prompt-secret\n');

  await waitForStderr(/Paste the authorization code:/);
  child.stdin.end('prompt-code\n');

  const code = await new Promise((resolveClose) => {
    child.on('close', (exitCode) => resolveClose(exitCode));
  });

  assert.equal(code, 0, stderr);
  assert.equal(stdout, '');
  assert.match(stderr, new RegExp(`http://127\\.0\\.0\\.1:${callbackPort}/callback`));
  assert.ok(
    stderr.indexOf('Add this callback URL') < stderr.indexOf('Application ID:'),
    'callback URL guidance should be shown before prompting for app credentials'
  );
  assert.match(stderr, /Logged in successfully/);

  assert.equal(server.requests.length, 1);
  assert.match(server.requests[0].url, /\/dev\/oauth2\/v1\/token$/);
  const body = new URLSearchParams(server.requests[0].body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code'), 'prompt-code');

  const saved = JSON.parse(await readFile(join(cwd, '.zeyos', 'auth.json'), 'utf8'));
  assert.equal(saved.baseUrl, server.baseUrl);
  assert.equal(saved.clientId, 'prompt-client');
  assert.equal(saved.clientSecret, 'prompt-secret');
  assert.equal(saved.accessToken, 'prompt-access');
  assert.equal(saved.refreshToken, 'prompt-refresh');
});

test('login --manual exchanges the pasted code and stores tokens', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  const server = await jsonServer(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      token_type: 'Bearer',
      access_token: 'manual-access',
      refresh_token: 'manual-refresh',
      expires_in: 3600,
      refresh_token_expires_in: 7200
    }));
  });

  const res = await cliWithInput([
    'login',
    '--base-url', server.baseUrl,
    '--client-id', 'client-id',
    '--secret', 'client-secret',
    '--manual'
  ], 'auth-code\n', {
    cwd,
    env: isolatedEnv(home, CLEAN_ENV)
  });

  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stderr, /Paste the authorization code:/);
  assert.match(res.stderr, /Logged in successfully/);

  assert.equal(server.requests.length, 1);
  assert.match(server.requests[0].url, /\/dev\/oauth2\/v1\/token$/);
  assert.equal(server.requests[0].method, 'POST');
  assert.match(server.requests[0].headers.authorization, /^Basic\s+/);
  const body = new URLSearchParams(server.requests[0].body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code'), 'auth-code');

  const saved = JSON.parse(await readFile(join(cwd, '.zeyos', 'auth.json'), 'utf8'));
  assert.equal(saved.baseUrl, server.baseUrl);
  assert.equal(saved.clientId, 'client-id');
  assert.equal(saved.clientSecret, 'client-secret');
  assert.equal(saved.accessToken, 'manual-access');
  assert.equal(saved.refreshToken, 'manual-refresh');
});

test('login browser callback flow captures the redirect code and stores tokens', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  const openerRoot = await tempDir(t);
  const fakeBin = await writeFakeBrowserCommand(openerRoot);
  const callbackPort = await freePort(t);
  const server = await jsonServer(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      token_type: 'Bearer',
      access_token: 'browser-access',
      refresh_token: 'browser-refresh',
      expires_in: 3600
    }));
  });

  const env = isolatedEnv(home, {
    ...CLEAN_ENV,
    PATH: `${fakeBin}:${process.env.PATH || ''}`
  });

  const child = spawn(process.execPath, [
    CLI_BIN,
    'login',
    '--base-url', server.baseUrl,
    '--client-id', 'browser-client',
    '--secret', 'browser-secret',
    '--port', String(callbackPort)
  ], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  t.after(() => {
    if (child.exitCode == null) child.kill('SIGTERM');
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const state = await new Promise((resolveState, rejectState) => {
    const timer = setTimeout(() => rejectState(new Error(`Timed out waiting for authorization URL. stderr:\n${stderr}`)), 5000);
    child.stderr.on('data', () => {
      const match = stderr.match(/https?:\/\/[^\s]+\/oauth2\/v1\/authorize\?[^\s]+/);
      if (!match) return;
      clearTimeout(timer);
      resolveState(new URL(match[0]).searchParams.get('state'));
    });
  });

  assert.ok(state, 'authorization URL should contain an OAuth state');

  let callbackResponse;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      callbackResponse = await fetch(`http://127.0.0.1:${callbackPort}/callback?code=browser-code&state=${encodeURIComponent(state)}`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  assert.ok(callbackResponse, 'callback server did not accept a redirect request');
  assert.equal(callbackResponse.status, 200);

  const code = await new Promise((resolveClose) => {
    child.on('close', (exitCode) => resolveClose(exitCode));
  });

  assert.equal(code, 0, stderr);
  assert.equal(stdout, '');
  assert.match(stderr, /Starting local callback server and opening browser/);
  assert.match(stderr, /Logged in successfully/);

  assert.equal(server.requests.length, 1);
  assert.match(server.requests[0].url, /\/dev\/oauth2\/v1\/token$/);
  const body = new URLSearchParams(server.requests[0].body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code'), 'browser-code');

  const saved = JSON.parse(await readFile(join(cwd, '.zeyos', 'auth.json'), 'utf8'));
  assert.equal(saved.baseUrl, server.baseUrl);
  assert.equal(saved.clientId, 'browser-client');
  assert.equal(saved.clientSecret, 'browser-secret');
  assert.equal(saved.accessToken, 'browser-access');
  assert.equal(saved.refreshToken, 'browser-refresh');
});

test('login rejects an invalid callback port before prompting', async (t) => {
  const home = await tempDir(t);
  const cwd = await tempDir(t);
  const res = await cli(['login', '--port', 'not-a-port'], { cwd, env: isolatedEnv(home, CLEAN_ENV) });

  assert.equal(res.code, 1);
  assert.match(res.stderr, /--port must be an integer between 1 and 65535/);
});

test('okf list works without credentials and supports JSON', async () => {
  const res = await cli(['okf', 'list', '--json']);
  assert.equal(res.code, 0, res.stderr);
  const data = JSON.parse(res.stdout);
  assert.equal(data.version, '0.1');
  assert.ok(data.concepts.some((c) => c.concept === 'entities/tickets'));
});

test('okf show resolves a bare resource name to its entity concept', async () => {
  const res = await cli(['okf', 'show', 'tickets']);
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /type: ZeyOS Entity/);
  assert.match(res.stdout, /listTickets/);
});

test('okf show rejects an unknown concept', async () => {
  const res = await cli(['okf', 'show', 'nope-not-a-concept']);
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /Unknown concept/);
});

test('okf check validates the shipped bundle and exits 0', async () => {
  const res = await cli(['okf', 'check']);
  assert.equal(res.code, 0, res.stderr);
  assert.match(`${res.stdout}${res.stderr}`, /conformant/i);
});

test('okf export copies the bundle and the copy is conformant', async (t) => {
  const out = await tempDir(t);
  const dest = join(out, 'okf');
  const exp = await cli(['okf', 'export', '--out', dest]);
  assert.equal(exp.code, 0, exp.stderr);
  assert.ok(await exists(join(dest, 'index.md')));
  assert.ok(await exists(join(dest, 'entities', 'tickets.md')));
  const check = await cli(['okf', 'check', '--dir', dest]);
  assert.equal(check.code, 0, check.stderr);
});

test('okf build synthesizes a conformant bundle from the client schema', async (t) => {
  const out = await tempDir(t);
  const res = await cli(['okf', 'build', '--out', out]);
  assert.equal(res.code, 0, res.stderr);
  assert.ok(await exists(join(out, 'entities', 'tickets.md')));
  const check = await cli(['okf', 'check', '--dir', out]);
  assert.equal(check.code, 0, check.stderr);
});

test('okf rejects unknown flags', async () => {
  const res = await cli(['okf', 'list', '--bogus']);
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /Unknown option/);
});
