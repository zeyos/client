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
 */

// ── Global help ───────────────────────────────────────────────────────────────

const HELP = `\
Usage: zeyos <command> [options] [args…]

Commands:
  login                Authenticate with a ZeyOS instance
  logout               Revoke session and clear stored tokens
  whoami               Show currently authenticated user
  list   <resource>    List / query records
  count  <resource>    Count records (with optional filter)
  get    <resource> <id>  Fetch a single record by ID
  show   <resource> <id>  Alias for get
  create <resource>    Create a new record
  update <resource> <id>  Update an existing record
  delete <resource> <id>  Delete a record
  resources            List all available resource types

Global options:
  --json               Output as JSON
  --yaml               Output as YAML
  --no-color           Disable ANSI colors
  -h, --help           Show help for a command

Examples:
  zeyos login --base-url https://cloud.zeyos.com/demo --client-id myapp --secret "$ZEYOS_CLIENT_SECRET"
  zeyos list tickets --filter '{"status":1}' --sort -lastmodified
  zeyos count tickets --filter '{"status":1}'
  zeyos get ticket 42
  zeyos get ticket 42 --all
  zeyos create ticket --name "Fix login bug" --priority 3
  zeyos update ticket 42 --status 2
  zeyos delete ticket 42 --force
`;

// ── Argument definitions ──────────────────────────────────────────────────────

const OPTIONS = {
  // Global
  'help':       { type: 'boolean', short: 'h' },
  'json':       { type: 'boolean' },
  'yaml':       { type: 'boolean' },
  'no-color':   { type: 'boolean' },
  // login
  'base-url':   { type: 'string' },
  'client-id':  { type: 'string' },
  'secret':     { type: 'string' },
  'scope':      { type: 'string' },
  'port':       { type: 'string' },
  'global':     { type: 'boolean' },
  'force':      { type: 'boolean' },
  'clean':      { type: 'boolean' },
  'manual':     { type: 'boolean' },
  // list
  'fields':     { type: 'string' },
  'filter':     { type: 'string' },
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
  // delete
  // (--force is already declared above)
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
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Strip 'node' and script path from argv
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const command = argv[0];
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

  await mod.run(values, positional);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse argv with known options; capture unknown --key value pairs too.
 * This lets create/update accept arbitrary --fieldName value flags.
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
      const key = arg.slice(2);
      const opt = options[key];

      if (opt?.type === 'boolean') {
        values[key] = true;
        i++;
        continue;
      }

      if (opt?.type === 'string') {
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
        continue;
      }

      // Unknown option — treat as string if next token is available and is not
      // another option flag (but allow negative numbers like -1, -3.5)
      if (i + 1 < argv.length && (!argv[i + 1].startsWith('-') || /^-\d/.test(argv[i + 1]))) {
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

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
