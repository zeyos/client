#!/usr/bin/env node
/**
 * ZeyOS CLI — entry point
 *
 * Usage: zeyos <command> [options] [args…]
 *
 * Commands:
 *   login                Authenticate with ZeyOS
 *   logout               Revoke session and clear tokens
 *   whoami               Show current user info
 *   list <resource>      List records
 *   count <resource>     Count records
 *   get <resource> <id>  Fetch a single record
 *   show <resource> <id> Alias for get
 *   create <resource>    Create a new record
 *   update <resource>    Update a record
 *   delete <resource>    Delete a record
 *   resources            List available resource types
 *   doctor agent         Check local CLI readiness for coding agents
 */

// ── Version ───────────────────────────────────────────────────────────────────

import { createRequire as _createRequire } from 'node:module';
import { dirname as _dirname } from 'node:path';
import { fileURLToPath as _fileURLToPath } from 'node:url';
import { colors as _c } from '../lib/output.mjs';
const _require = _createRequire(import.meta.url);
const _VERSION = _require('../package.json').version;

// ── Global help ───────────────────────────────────────────────────────────────

// Section headers are bold and the `zeyos` binary / command names are cyan,
// gated by USE_COLOR in output.mjs (so `zeyos --help | less` stays plain text).
const _z = _c.cyan('zeyos');
const HELP = `\
Usage: ${_z} <command> [options] [args…]

${_c.bold('Commands:')}
  ${_c.cyan('login')}                Authenticate with a ZeyOS instance
  ${_c.cyan('logout')}               Revoke session and clear stored tokens
  ${_c.cyan('whoami')}               Show currently authenticated user
  ${_c.cyan('list')}   <resource>    List / query records
  ${_c.cyan('count')}  <resource>    Count records (with optional filter)
  ${_c.cyan('get')}    <resource> <id>  Fetch a single record by ID
  ${_c.cyan('show')}   <resource> <id>  Alias for get
  ${_c.cyan('create')} <resource>    Create a new record
  ${_c.cyan('update')} <resource> <id>  Update an existing record
  ${_c.cyan('delete')} <resource> <id>  Delete a record
  ${_c.cyan('resources')}            List all available resource types
  ${_c.cyan('describe')} <resource>  Show a resource's fields, types and enums
  ${_c.cyan('doctor')} agent         Check local CLI readiness for coding agents
  ${_c.cyan('skills')} <command>     List / show / install ZeyOS agent skills

${_c.bold('Global options:')}
  --json               Output as JSON
  --yaml               Output as YAML
  --query              Print the API route + JSON payload without sending it
  --no-color           Disable ANSI colors
  -h, --help           Show help for a command
  -v, --version        Print the CLI version and exit

${_c.bold('Examples:')}
  ${_z} login --base-url https://cloud.zeyos.com/demo --client-id myapp --secret "$ZEYOS_CLIENT_SECRET"
  ${_z} list tickets --filter '{"status":1}' --sort -lastmodified
  ${_z} list tickets --filter-file ./filters/open-tickets.json
  ${_z} count tickets --filter '{"status":1}'
  ${_z} get ticket 42
  ${_z} get ticket 42 --all
  ${_z} create ticket --name "Fix login bug" --priority 3
  ${_z} update ticket 42 --status 2
  ${_z} delete ticket 42 --force
`;

// ── Argument definitions ──────────────────────────────────────────────────────

const OPTIONS = {
  // Global
  'help':       { type: 'boolean', short: 'h' },
  'version':    { type: 'boolean', short: 'v' },
  'json':       { type: 'boolean' },
  'yaml':       { type: 'boolean' },
  'no-color':   { type: 'boolean' },
  'query':      { type: 'boolean' },
  // login
  'base-url':   { type: 'string' },
  'client-id':  { type: 'string' },
  'secret':     { type: 'string' },
  'scope':      { type: 'string' },
  'port':       { type: 'string' },
  'global':     { type: 'boolean' },
  'local':      { type: 'boolean' },
  'force':      { type: 'boolean' },
  'clean':      { type: 'boolean' },
  'manual':     { type: 'boolean' },
  'yes':        { type: 'boolean', short: 'y' },
  // list
  'fields':     { type: 'string' },
  'filter':     { type: 'string' },
  'filter-file': { type: 'string' },
  'sort':       { type: 'string' },
  'limit':      { type: 'string' },
  'offset':     { type: 'string' },
  'expand':     { type: 'string' },
  'extdata':    { type: 'boolean' },
  'tags':       { type: 'boolean' },
  // get
  'all':        { type: 'boolean' },
  // whoami
  'show-token': { type: 'boolean' },
  // create / update
  'data':       { type: 'string' },
  'data-file':  { type: 'string' },
  // delete
  // (--force is already declared above)
  // skills install
  'target':     { type: 'string' },
  'dir':        { type: 'string' },
  'no-logo':    { type: 'boolean' },
};

// ── Command registry ──────────────────────────────────────────────────────────
// Maps every command and alias to the module that implements it.

const COMMANDS = {
  login:     '../commands/login.mjs',
  logout:    '../commands/logout.mjs',
  whoami:    '../commands/whoami.mjs',
  list:      '../commands/list.mjs',
  count:     '../commands/count.mjs',
  get:       '../commands/get.mjs',
  show:      '../commands/get.mjs',
  create:    '../commands/create.mjs',
  update:    '../commands/update.mjs',
  edit:      '../commands/update.mjs',
  delete:    '../commands/delete.mjs',
  rm:        '../commands/delete.mjs',
  remove:    '../commands/delete.mjs',
  resources: '../commands/resources.mjs',
  resource:  '../commands/resources.mjs',
  describe:  '../commands/describe.mjs',
  doctor:    '../commands/doctor.mjs',
  skills:    '../commands/skills.mjs',
  skill:     '../commands/skills.mjs',
};

// ── Per-command flag allow-lists ────────────────────────────────────────────────
// Unknown flags are rejected (e.g. `zeyos list --invalid`) so typos surface
// immediately instead of being silently ignored. `create`/`update` are the
// exception: they accept arbitrary `--<field>` flags, marked with `null` below.

const ALWAYS_FLAGS = ['help', 'json', 'yaml', 'no-color'];
const SKILLS_FLAGS = ['target', 'dir', 'global', 'local', 'force', 'yes', 'no-logo'];
const DELETE_FLAGS = ['force', 'query'];
const GET_FLAGS    = ['fields', 'extdata', 'tags', 'expand', 'all', 'query'];

const COMMAND_FLAGS = {
  login:     ['base-url', 'client-id', 'secret', 'scope', 'port', 'global', 'force', 'clean', 'manual'],
  logout:    ['global'],
  whoami:    ['show-token'],
  list:      ['fields', 'filter', 'filter-file', 'sort', 'limit', 'offset', 'extdata', 'expand', 'query'],
  count:     ['filter', 'filter-file', 'query'],
  get:       GET_FLAGS,
  show:      GET_FLAGS,
  create:    null,
  update:    null,
  edit:      null,
  delete:    DELETE_FLAGS,
  rm:        DELETE_FLAGS,
  remove:    DELETE_FLAGS,
  resources: [],
  resource:  [],
  describe:  [],
  doctor:    [],
  skills:    SKILLS_FLAGS,
  skill:     SKILLS_FLAGS,
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Strip 'node' and script path from argv
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(HELP);
    process.exit(0);
  }

  if (argv[0] === '--version' || argv[0] === '-v') {
    process.stdout.write(_VERSION + '\n');
    process.exit(0);
  }

  const command = argv[0];

  // A leading flag (e.g. `zeyos --invalid`) is not a command — surface it as a
  // bad option rather than letting it masquerade as one.
  if (command.startsWith('-')) {
    process.stderr.write(`Unknown option: "${command}".  Run 'zeyos --help' for usage.\n`);
    process.exit(1);
  }

  const rest    = argv.slice(1);

  // Parse remaining args permissively: known options are parsed normally and
  // unknown --key value flags are captured too (so create/update accept fields).
  const { values, positional } = _parsePermissive(rest, OPTIONS);

  const modulePath = COMMANDS[command];
  if (!modulePath) {
    process.stderr.write(`Unknown command: "${command}"\n\n${HELP}`);
    process.exit(1);
  }

  const mod = await import(modulePath);

  if (values.help) {
    process.stdout.write(mod.USAGE ?? HELP);
    process.exit(0);
  }

  // Reject unknown flags so typos / unsupported options fail loudly instead of
  // being silently ignored. `create`/`update` opt out (COMMAND_FLAGS = null)
  // because they accept arbitrary `--<field>` flags as record data.
  const allowed = COMMAND_FLAGS[command];
  if (allowed) {
    const allowedSet = new Set([...ALWAYS_FLAGS, ...allowed]);
    const unknown = Object.keys(values).filter((key) => !allowedSet.has(key));
    if (unknown.length > 0) {
      const flag = unknown[0];
      const hint = _suggestFlag(flag, [...allowedSet]);
      process.stderr.write(
        `Unknown option: --${flag}${hint ? `  (did you mean --${hint}?)` : ''}\n\n` +
          `Run 'zeyos ${command} --help' for available options.\n`
      );
      process.exit(1);
    }
  }

  await mod.run(values, positional);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse argv with known options; capture unknown --key value pairs too.
 * This lets create/update accept arbitrary --fieldName value flags.
 *
 * Supports both `--key value` and `--key=value` forms.
 */
function _parsePermissive(argv, options) {
  const values     = {};
  const positional = [];
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--') {
      // Everything after -- is positional
      positional.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith('--')) {
      // Split --key=value form into key + inline value
      const eqIdx     = arg.indexOf('=');
      const key        = eqIdx === -1 ? arg.slice(2) : arg.slice(2, eqIdx);
      const inlineVal  = eqIdx === -1 ? undefined : arg.slice(eqIdx + 1);
      const opt        = options[key];

      if (opt?.type === 'boolean') {
        // --key=value is unusual for booleans; treat as true and ignore =value
        values[key] = true;
        i++;
        continue;
      }

      if (opt?.type === 'string') {
        if (inlineVal !== undefined) {
          // --key=value form
          values[key] = inlineVal;
          i++;
        } else {
          const next = argv[i + 1];
          // Don't consume the next token as the value if it looks like a flag
          // (starts with '--'), unless it's a negative number like -3 or -3.5.
          if (next !== undefined && next.startsWith('--')) {
            values[key] = '';
            i++;
          } else {
            values[key] = next ?? '';
            i += 2;
          }
        }
        continue;
      }

      // Unknown option — treat as string
      if (inlineVal !== undefined) {
        // --key=value form for unknown option
        values[key] = inlineVal;
        i++;
      } else if (i + 1 < argv.length && (!argv[i + 1].startsWith('-') || /^-\d/.test(argv[i + 1]))) {
        values[key] = argv[i + 1];
        i += 2;
      } else {
        values[key] = true;
        i++;
      }
      continue;
    }

    if (arg.startsWith('-') && arg.length === 2) {
      // Short option
      const short = arg[1];
      const match = Object.entries(options).find(([, o]) => o.short === short);
      if (match) {
        const [key, opt] = match;
        if (opt.type === 'boolean') {
          values[key] = true;
          i++;
        } else {
          const next = argv[i + 1];
          if (next !== undefined && next.startsWith('--')) {
            values[key] = '';
            i++;
          } else {
            values[key] = next ?? '';
            i += 2;
          }
        }
      } else {
        i++;
      }
      continue;
    }

    positional.push(arg);
    i++;
  }

  return { values, positional };
}

/** Suggest the closest allowed flag for an unknown one, if it's a near miss. */
function _suggestFlag(input, candidates) {
  let best = null;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    const dist = _levenshtein(input, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  // Only suggest a reasonably close match (avoid nonsense "did you mean").
  return bestDist <= Math.max(2, Math.floor(input.length / 2)) ? best : null;
}

/** Levenshtein edit distance between two short strings. */
function _levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[m];
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
