#!/usr/bin/env node
/**
 * ZeyOS CLI — entry point
 *
 * Usage: zeyos <command> [options] [args…]
 *
 * Commands:
 *   login                Authenticate with ZeyOS
 *   logout               Revoke session and clear stored credentials
 *   whoami               Show current user info
 *   list <resource>      List records
 *   find <resource>      Resolve text to records
 *   count <resource>     Count records
 *   sum <resource>       Sum a numeric field across matching records
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
import { colors as _c, currentOutputMode, emitError, setOutputModeFromArgv } from '../lib/output.mjs';
import { OPTIONS } from '../lib/options.mjs';
import { ALWAYS_FLAGS, COMMANDS, COMMAND_FLAGS, LEADING_FLAGS } from '../lib/command-graph.mjs';
import { EXIT } from '../lib/exit.mjs';
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
  ${_c.cyan('logout')}               Revoke session and clear stored credentials
  ${_c.cyan('whoami')}               Show currently authenticated user
  ${_c.cyan('list')}   <resource>    List / query records
  ${_c.cyan('find')}   <resource> <text>  Resolve text to records
  ${_c.cyan('count')}  <resource>    Count records (with optional filter)
  ${_c.cyan('sum')}    <resource> <field>  Sum a numeric field
  ${_c.cyan('get')}    <resource> <id>  Fetch a single record by ID
  ${_c.cyan('show')}   <resource> <id>  Alias for get
  ${_c.cyan('create')} <resource>    Create a new record
  ${_c.cyan('update')} <resource> <id>  Update an existing record
  ${_c.cyan('delete')} <resource> <id>  Delete a record
  ${_c.cyan('resources')}            List all available resource types
  ${_c.cyan('describe')} <resource>  Show a resource's fields, types and enums
  ${_c.cyan('doctor')} agent         Check local CLI readiness for coding agents
  ${_c.cyan('skills')} <command>     List / show / install ZeyOS agent skills
  ${_c.cyan('okf')} <command>        List / show / check / export the OKF knowledge bundle
  ${_c.cyan('profile')} <command>    Manage credential profiles / switch instances

${_c.bold('Global options:')}
  --json               Output as JSON
  --yaml               Output as YAML
  --dry-run            Print the API route + JSON payload without sending it
  --profile <name>     Use a named credential profile for this command
  --timeout <seconds>  Per-request timeout (default 30)
  --no-validate        Skip schema validation of fields and filters
  --no-color           Disable ANSI colors
  -h, --help           Show help for a command
  -v, --version        Print the CLI version and exit

${_c.bold('Examples:')}
  ${_z} login --base-url https://cloud.zeyos.com/demo --client-id myapp --secret "$ZEYOS_CLIENT_SECRET"
  ${_z} list tickets --filter '{"status":1}' --sort -lastmodified
  ${_z} find accounts "Zfx Lyon"
  ${_z} list tickets --filter-file ./filters/open-tickets.json
  ${_z} count tickets --filter '{"status":1}'
  ${_z} sum actionsteps effort --filter '{"status":[1,3]}'
  ${_z} get ticket 42
  ${_z} get ticket 42 --all
  ${_z} create ticket --name "Fix login bug" --priority 3
  ${_z} update ticket 42 --status 2
  ${_z} delete ticket 42 --force
`;

// ── Argument definitions ──────────────────────────────────────────────────────

// Option table lives in lib/options.mjs so lib/flags.mjs can reserve the same
// names; see the note there.


const COMMON_COMMAND_HELP = `\
Global options:
  --profile <name>     Use a named credential profile for this command
  --no-color           Disable ANSI colors
`;

// Command tables live in lib/command-graph.mjs so `zeyos commands` can publish
// them as data; see the note there.

const CREDENTIAL_MUTATION_COMMANDS = new Set(['login', 'logout', 'profile', 'profiles']);

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Strip 'node' and script path from argv
  const argv = process.argv.slice(2);

  // Determine the output mode before any parsing, so failures during parsing
  // can still emit a machine-readable envelope.
  setOutputModeFromArgv(argv);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(HELP);
    process.exit(0);
  }

  if (argv[0] === '--version' || argv[0] === '-v') {
    process.stdout.write(_VERSION + '\n');
    process.exit(0);
  }

  const lead = _splitLeadingFlags(argv);
  if (lead.values.help && lead.argv.length === 0) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (lead.values.version && lead.argv.length === 0) {
    process.stdout.write(_VERSION + '\n');
    process.exit(0);
  }
  if (lead.argv.length === 0) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const command = lead.argv[0];
  if (command.startsWith('-')) {
    _failLeadingOption(command);
  }

  const rest    = lead.argv.slice(1);

  if (process.env.ZEYOS_CREDENTIALS_READONLY && CREDENTIAL_MUTATION_COMMANDS.has(command)) {
    // A policy refusal, not a usage mistake: the command and its flags were valid.
    emitError(`Credential command "${command}" is disabled because ZEYOS_CREDENTIALS_READONLY is set.`,
      { exitCode: EXIT.ERROR, code: 'credentials_readonly' });
    process.exit(EXIT.ERROR);
  }

  // Parse remaining args permissively: known options are parsed normally and
  // unknown --key value flags are captured too (so create/update accept fields).
  const parsed = _parsePermissive(rest, OPTIONS);
  const values = { ...lead.values, ...parsed.values };
  const positional = parsed.positional;

  const modulePath = COMMANDS[command];
  if (!modulePath) {
    const hint = _suggestFlag(command, Object.keys(COMMANDS));
    emitError(
      `Unknown command: "${command}".` + (hint ? `  Did you mean "${hint}"?` : ''),
      { exitCode: EXIT.USAGE, code: 'unknown_command', ...(hint ? { suggestion: hint } : {}),
        actions: ["Run 'zeyos --help' for the command list."] }
    );
    if (currentOutputMode() === 'table') process.stderr.write(`\n${HELP}`);
    process.exit(EXIT.USAGE);
  }

  const mod = await import(modulePath);

  if (values.help) {
    process.stdout.write(_formatCommandHelp(mod.USAGE ?? HELP));
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
      emitError(
        `Unknown option: --${flag}${hint ? `  (did you mean --${hint}?)` : ''}\n` +
          `Run 'zeyos ${command} --help' for available options.`,
        { exitCode: EXIT.USAGE, code: 'unknown_option', field: flag,
          ...(hint ? { suggestion: hint } : {}),
          actions: [`Run 'zeyos ${command} --help' for available options.`] }
      );
      process.exit(EXIT.USAGE);
    }
  }

  _validateKnownStringValues(values);

  await mod.run(values, positional);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse documented global flags that appear before the command name, e.g.
 * `zeyos --profile dev whoami`. Command-specific flags remain after the
 * command so the per-command allow-list can validate them.
 */
function _splitLeadingFlags(argv) {
  const values = {};
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--') {
      return { values, argv: argv.slice(i + 1) };
    }

    if (arg.startsWith('--')) {
      const eqIdx    = arg.indexOf('=');
      const key      = eqIdx === -1 ? arg.slice(2) : arg.slice(2, eqIdx);
      const inlineVal = eqIdx === -1 ? undefined : arg.slice(eqIdx + 1);
      const opt      = OPTIONS[key];

      if (!LEADING_FLAGS.includes(key)) {
        _failLeadingOption(arg);
      }

      if (opt?.type === 'boolean') {
        if (inlineVal !== undefined) _failBooleanValue(key, inlineVal);
        values[key] = true;
        i++;
        continue;
      }

      if (opt?.type === 'string') {
        if (inlineVal !== undefined) {
          values[key] = inlineVal;
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
        continue;
      }
    }

    if (arg.startsWith('-') && arg.length === 2) {
      const short = arg[1];
      const match = Object.entries(OPTIONS).find(([, o]) => o.short === short);
      if (!match || !LEADING_FLAGS.includes(match[0])) {
        _failLeadingOption(arg);
      }

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
      continue;
    }

    break;
  }

  return { values, argv: argv.slice(i) };
}

function _failLeadingOption(flag) {
  emitError(`Unknown option: "${flag}".`, { exitCode: EXIT.USAGE, code: 'unknown_option', field: flag,
    actions: ["Run 'zeyos --help' for usage."] });
  process.exit(EXIT.USAGE);
}

/**
 * `--flag=value` on a boolean option is always a mistake: the value cannot be
 * honoured, and silently reading it as `true` inverts the caller's intent for
 * safety flags like `--force`. Fail instead of guessing.
 */
function _failBooleanValue(key, value) {
  emitError(
    `Option --${key} is a flag and takes no value (got --${key}=${value}).`,
    { exitCode: EXIT.USAGE, code: 'flag_takes_no_value', field: key,
      actions: [`Pass --${key} to enable it, or omit it entirely to leave it off.`] }
  );
  process.exit(EXIT.USAGE);
}

function _formatCommandHelp(usage) {
  if (usage === HELP || /--profile\s+<name>/.test(usage)) {
    return usage;
  }
  if (/Global options:\n/.test(usage)) {
    return usage.replace(
      /Global options:\n/,
      `Global options:\n  --profile <name>           Use a named credential profile for this command\n  --no-color                 Disable ANSI colors\n`
    );
  }
  const trimmed = usage.endsWith('\n') ? usage : `${usage}\n`;
  return `${trimmed}\n${COMMON_COMMAND_HELP}`;
}

function _validateKnownStringValues(values) {
  for (const [key, value] of Object.entries(values)) {
    if (OPTIONS[key]?.type === 'string' && value === '') {
      emitError(`Option --${key} requires a value.`, { exitCode: EXIT.USAGE, code: 'missing_value', field: key });
      process.exit(EXIT.USAGE);
    }
  }
}

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
        // Reject `--flag=value` rather than silently reading it as `true`.
        // `--force=false` previously skipped the delete confirmation, which is
        // the exact opposite of what the caller wrote.
        if (inlineVal !== undefined) _failBooleanValue(key, inlineVal);
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
        // Unknown short flags used to be discarded silently, so `zeyos list
        // tickets -j` printed a table and exited 0 — the opposite of what an
        // agent reaching for a `-j` JSON prior expects. Fail like a long flag.
        emitError(`Unknown option: "${arg}".`, { exitCode: EXIT.USAGE, code: 'unknown_option', field: arg,
          actions: ["Use the long form, e.g. --json.", "Run 'zeyos --help' for usage."] });
        process.exit(EXIT.USAGE);
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
  // `fetch` reports connection problems as a bare "fetch failed"; the useful
  // detail (DNS, refused, TLS) is on err.cause. Surface it, or the user has
  // nothing to act on.
  const cause = err?.cause?.message ?? err?.cause?.code;
  const timeout = err?.isTimeout ? '  Try a longer --timeout.' : '';
  emitError(`${err.message}${cause ? ` (${cause})` : ''}`, {
    exitCode: EXIT.ERROR,
    code: err?.isTimeout ? 'timeout' : (cause ? 'network' : 'error'),
    ...(timeout ? { actions: ['Try a longer --timeout.'] } : {})
  });
  process.exit(EXIT.ERROR);
});
