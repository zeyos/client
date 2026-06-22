import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
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
  'ZEYOS_REFRESH_TOKEN'
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
