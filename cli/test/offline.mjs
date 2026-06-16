import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dir = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dir, '..', 'bin', 'zeyos.mjs');

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

test('describe rejects an unknown resource', async () => {
  const result = await cli(['describe', 'nonexistent-resource']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown resource/);
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
