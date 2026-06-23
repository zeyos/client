/**
 * zeyos profile <list|current|use|add|remove>
 *
 * Manage named credential profiles (e.g. dev, prod, client-x) and switch between
 * ZeyOS instances without re-running login each time.
 *
 *   list                     Show all profiles (active marked with *)
 *   current                  Show the profile that resolves right now, and why
 *   use <name> [--local]     Make <name> active globally, or pin it to this project
 *   add <name> [opts]        Create/update a profile's connection params
 *   remove <name>            Delete a profile
 *
 * `add` options: --base-url, --client-id, --secret, or --from-current to snapshot
 * the credentials currently in effect (including tokens) into the new profile.
 */

import { createInterface } from 'node:readline';
import {
  listProfiles, getProfile, upsertProfile, removeProfile,
  setActiveProfile, writeLocalPin, readLocalPin,
  resolveProfileSelection, loadConfigWithSource, profilesConfigPath
} from '../lib/config.mjs';
import { outputMode, printJson, printYaml, printTable, success, error, info, warn } from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos profile <command> [options]

Manage named credential profiles and switch between ZeyOS instances.

Commands:
  list                       List all profiles (active marked with *)
  current                    Show which profile is in effect, and why
  use <name>                 Make <name> the active profile (global)
  use <name> --local         Pin <name> to the current project (.zeyos/profile)
  add [<name>] [options]     Create or update a profile; prompts when run without connection options
  remove <name>              Delete a profile

Add options:
  --base-url <url>           ZeyOS platform URL for the profile
  --client-id <id>           OAuth client ID
  --secret <secret>          OAuth client secret
  --from-current             Snapshot the credentials currently in effect (incl. tokens)

Global options:
  --json | --yaml            Machine-readable output (list / current)
  -h, --help                 Show this help

Examples:
  zeyos profile add                         # prompt for name and connection params
  zeyos profile add dev  --base-url https://zeyos.cms-it.de/dev
  zeyos profile add prod --from-current
  zeyos profile use prod
  zeyos profile use dev --local        # only inside this project
  zeyos whoami --profile dev           # one-off override on any command
`;

export async function run(values, positional) {
  const sub = positional[0] || 'list';
  switch (sub) {
    case 'list':    return cmdList(values);
    case 'current': return cmdCurrent(values);
    case 'use':     return cmdUse(values, positional[1]);
    case 'add':     return cmdAdd(values, positional[1]);
    case 'remove':
    case 'rm':
    case 'delete':  return cmdRemove(values, positional[1]);
    default:
      error(`Unknown profile command: "${sub}".`);
      process.stderr.write(`\n${USAGE}`);
      process.exit(1);
  }
}

// ── list ───────────────────────────────────────────────────────────────────────

function cmdList(values) {
  const { active, profiles } = listProfiles();
  const names = Object.keys(profiles);
  const mode = outputMode(values);

  if (mode === 'json') return printJson({ active, profiles });
  if (mode === 'yaml') return printYaml({ active, profiles });

  if (names.length === 0) {
    info('No profiles defined yet.');
    console.error(`Create one with:  zeyos profile add <name> --base-url <url>`);
    console.error(`              or:  zeyos login --profile <name>`);
    return;
  }

  const rows = names.map((name) => ({
    name: `${name === active ? '*' : ' '} ${name}`,
    baseUrl: profiles[name].baseUrl || '(no URL)',
    token: tokenStatus(profiles[name])
  }));
  printTable(rows, ['name', 'baseUrl', 'token'], { name: 'PROFILE', baseUrl: 'BASE URL', token: 'TOKEN' });
  console.error(`\nProfiles file: ${profilesConfigPath()}`);
}

// ── current ────────────────────────────────────────────────────────────────────

function cmdCurrent(values) {
  const selection = resolveProfileSelection({ profileFlag: values.profile });
  const loaded = loadConfigWithSource({ profile: values.profile });
  const mode = outputMode(values);

  const out = {
    profile: selection.name || null,
    origin: selection.origin || null,
    source: loaded.source,
    baseUrl: loaded.config.baseUrl || null,
    token: tokenStatus(loaded.config)
  };

  if (mode === 'json') return printJson(out);
  if (mode === 'yaml') return printYaml(out);

  if (selection.name) {
    if (selection.missing) {
      warn(`Selected profile "${selection.name}" (via ${selection.origin}) does not exist.`);
      return;
    }
    success(`Active profile: ${selection.name}  (selected via ${selection.origin})`);
  } else if (loaded.source) {
    info(`No named profile in effect — using legacy ${loaded.source.kind} credentials.`);
  } else {
    warn('No credentials configured. Run `zeyos login` or `zeyos profile add`.');
    return;
  }
  console.error(`  base URL: ${out.baseUrl || '(none)'}`);
  console.error(`  token:    ${out.token}`);
}

// ── use ────────────────────────────────────────────────────────────────────────

function cmdUse(values, name) {
  if (!name) fail('Usage: zeyos profile use <name> [--local]');
  if (!getProfile(name)) failUnknown(name);

  if (values.local) {
    const path = writeLocalPin(name);
    success(`Pinned profile "${name}" to this project.`);
    console.error(`  ${path}`);
    return;
  }
  setActiveProfile(name);
  success(`Active profile: ${name}`);
}

// ── add ────────────────────────────────────────────────────────────────────────

async function cmdAdd(values, name) {
  let promptSession = null;
  const ask = (question, opts) => {
    promptSession ??= createPromptSession();
    return promptSession.ask(question, opts);
  };

  try {
    const profileName = name || await ask('Profile name');
    if (!profileName) fail('Profile name is required.');

    let updates = {};
    if (values['from-current']) {
      const cfg = loadConfigWithSource().config; // whatever is in effect right now
      for (const k of ['baseUrl', 'instance', 'clientId', 'clientSecret', 'accessToken', 'refreshToken', 'expiresAt', 'refreshTokenExpiresAt']) {
        if (cfg[k] != null) updates[k] = cfg[k];
      }
      if (!updates.baseUrl) fail('Nothing to snapshot: no credentials are currently in effect.');
    } else {
      if (values['base-url'])  updates.baseUrl      = values['base-url'];
      if (values['client-id']) updates.clientId     = values['client-id'];
      if (values.secret)       updates.clientSecret = values.secret;

      if (Object.keys(updates).length === 0) {
        updates = await promptProfileCredentials(profileName, ask);
      }
    }

    const existed = Boolean(getProfile(profileName));
    upsertProfile(profileName, updates);
    success(`${existed ? 'Updated' : 'Created'} profile "${profileName}".`);
    if (!updates.accessToken) {
      info(`Finish authenticating with:  zeyos login --profile ${profileName}`);
    }
  } finally {
    promptSession?.close();
  }
}

// ── remove ─────────────────────────────────────────────────────────────────────

function cmdRemove(values, name) {
  if (!name) fail('Usage: zeyos profile remove <name>');
  const removed = removeProfile(name);
  if (!removed) failUnknown(name);
  success(`Removed profile "${name}".`);
  const pin = readLocalPin();
  if (pin && pin.name === name) {
    warn(`This project still pins "${name}" (${pin.path}); that pin will no longer resolve.`);
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────

/** Human-readable token status from stored creds. Handles seconds or ms expiry. */
function tokenStatus(creds = {}) {
  if (!creds.accessToken) return 'none';
  const exp = creds.expiresAt;
  if (exp == null) return 'present';
  const expSec = Number(exp) > 2e10 ? Number(exp) / 1000 : Number(exp);
  const now = Math.floor(Date.now() / 1000);
  return expSec < now ? 'expired' : 'ok';
}

function failUnknown(name) {
  const names = Object.keys(listProfiles().profiles);
  const known = names.length ? `Known profiles: ${names.join(', ')}.` : 'No profiles defined yet.';
  fail(`No such profile: "${name}". ${known}`);
}

function fail(message) {
  error(message);
  process.exit(1);
}

async function promptProfileCredentials(name, ask) {
  const existing = getProfile(name) || {};

  info(`Creating profile "${name}".`);
  info('This stores the platform and OAuth app credentials; tokens are added by login.');
  console.error('');

  const baseUrl = await ask('ZeyOS platform URL', { currentValue: existing.baseUrl });
  const clientId = await ask('Application ID', { currentValue: existing.clientId });
  const clientSecret = await ask('Application secret', { currentValue: existing.clientSecret, secret: true });

  if (!baseUrl || !clientId || !clientSecret) {
    fail('ZeyOS URL, application ID and secret are all required.');
  }

  return { baseUrl, clientId, clientSecret };
}

function createPromptSession() {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: process.stdin.isTTY && process.stderr.isTTY });
  const originalWrite = rl._writeToOutput.bind(rl);
  let hiddenPrompt = null;
  let closed = false;
  const queuedLines = [];
  const waitingResolvers = [];

  rl.on('line', (line) => {
    const resolve = waitingResolvers.shift();
    if (resolve) {
      resolve(line);
    } else {
      queuedLines.push(line);
    }
  });

  rl.on('close', () => {
    closed = true;
    let resolve;
    while ((resolve = waitingResolvers.shift())) {
      resolve('');
    }
  });

  rl._writeToOutput = (value) => {
    if (!hiddenPrompt || String(value).includes(hiddenPrompt) || value === '\n' || value === '\r\n') {
      originalWrite(value);
    }
  };

  const readLine = () => {
    if (queuedLines.length) {
      return Promise.resolve(queuedLines.shift());
    }
    if (closed) {
      return Promise.resolve('');
    }
    return new Promise(resolve => {
      waitingResolvers.push(resolve);
    });
  };

  return {
    ask(question, opts = {}) {
      const currentValue = opts.currentValue || '';
      const defaultLabel = opts.secret && currentValue ? 'stored, press Enter to keep' : currentValue;
      const prompt = defaultLabel ? `${question} [${defaultLabel}]` : question;
      hiddenPrompt = opts.secret && process.stdin.isTTY && process.stderr.isTTY ? prompt : null;
      process.stderr.write(`${prompt}: `);

      return readLine()
        .then(answer => {
          hiddenPrompt = null;
          return answer.trim() || currentValue || '';
        });
    },
    close() {
      rl.close();
    }
  };
}
