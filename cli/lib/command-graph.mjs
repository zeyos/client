/**
 * The command graph: which commands exist, what they alias, and which flags each
 * accepts.
 *
 * These tables live in lib/ rather than the entry point so `zeyos commands` can
 * publish them as data. An agent otherwise has to infer the flag set from prose
 * help — the gap `sf commands --json` exists to close.
 */

import { OPTIONS } from './options.mjs';

// ── Command registry ──────────────────────────────────────────────────────────
// Maps every command and alias to the module that implements it.

export const COMMANDS = {
  login:     '../commands/login.mjs',
  logout:    '../commands/logout.mjs',
  whoami:    '../commands/whoami.mjs',
  list:      '../commands/list.mjs',
  find:      '../commands/find.mjs',
  count:     '../commands/count.mjs',
  sum:       '../commands/sum.mjs',
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
  commands:  '../commands/commands.mjs',
  doctor:    '../commands/doctor.mjs',
  skills:    '../commands/skills.mjs',
  skill:     '../commands/skills.mjs',
  okf:       '../commands/okf.mjs',
  profile:   '../commands/profile.mjs',
  profiles:  '../commands/profile.mjs',
};

// ── Per-command flag allow-lists ────────────────────────────────────────────────
// Unknown flags are rejected (e.g. `zeyos list --invalid`) so typos surface
// immediately instead of being silently ignored. `create`/`update` are the
// exception: they accept arbitrary `--<field>` flags, marked with `null` below.

export const ALWAYS_FLAGS = ['help', 'json', 'yaml', 'no-color', 'profile'];
export const LEADING_FLAGS = [...ALWAYS_FLAGS, 'version', 'dry-run', 'query'];
const SKILLS_FLAGS = ['target', 'dir', 'global', 'local', 'force', 'yes', 'no-logo'];
const OKF_FLAGS    = ['dir', 'out', 'force', 'no-logo'];
const PROFILE_FLAGS = ['base-url', 'client-id', 'secret', 'local', 'from-current'];
const DATA_FLAGS   = ['dry-run', 'query', 'no-validate', 'timeout'];
const DELETE_FLAGS = ['force', 'yes', ...DATA_FLAGS];
const GET_FLAGS    = ['fields', 'extdata', 'tags', 'expand', 'all', ...DATA_FLAGS];

export const COMMAND_FLAGS = {
  login:     ['base-url', 'client-id', 'secret', 'scope', 'port', 'global', 'force', 'clean', 'manual'],
  logout:    ['global'],
  whoami:    ['show-token'],
  list:      ['fields', 'filter', 'filter-file', 'search', 'preset', 'sort', 'limit', 'offset', 'extdata', 'expand', ...DATA_FLAGS],
  find:      ['fields', 'limit', ...DATA_FLAGS],
  count:     ['filter', 'filter-file', 'search', 'preset', ...DATA_FLAGS],
  sum:       ['filter', 'filter-file', 'preset', 'limit', 'offset', 'page-size', ...DATA_FLAGS],
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
  commands:  [],
  doctor:    ['profile'],
  skills:    SKILLS_FLAGS,
  skill:     SKILLS_FLAGS,
  okf:       OKF_FLAGS,
  profile:   PROFILE_FLAGS,
  profiles:  PROFILE_FLAGS,
};

/** Commands that accept arbitrary `--<field>` flags as record data. */
const ARBITRARY_FIELD_COMMANDS = new Set(
  Object.entries(COMMAND_FLAGS).filter(([, v]) => v === null).map(([k]) => k)
);

/** Canonical command names, with their aliases folded in. */
function buildCommands() {
  const byModule = new Map();
  for (const [name, modulePath] of Object.entries(COMMANDS)) {
    if (!byModule.has(modulePath)) byModule.set(modulePath, []);
    byModule.get(modulePath).push(name);
  }

  return [...byModule.values()].map((names) => {
    // The shortest spelling is the canonical one; the rest are aliases.
    const [name, ...aliases] = [...names].sort((a, b) => a.length - b.length || a.localeCompare(b));
    const allowed = COMMAND_FLAGS[name];
    const flags = allowed === null
      ? [...ALWAYS_FLAGS]
      : [...new Set([...ALWAYS_FLAGS, ...(allowed ?? [])])];
    return {
      name,
      aliases: aliases.sort(),
      acceptsArbitraryFields: ARBITRARY_FIELD_COMMANDS.has(name),
      flags: flags.sort().map((f) => `--${f}`)
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The published command graph. `options` carries each flag's type so a caller
 * knows whether it takes a value.
 */
export const COMMAND_GRAPH = Object.freeze({
  commands: buildCommands(),
  globalFlags: ALWAYS_FLAGS.map((f) => `--${f}`).sort(),
  options: Object.fromEntries(
    Object.entries(OPTIONS).map(([name, def]) => [
      `--${name}`,
      { type: def.type, ...(def.short ? { short: `-${def.short}` } : {}) }
    ])
  )
});
