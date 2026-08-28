/**
 * The CLI's option table — the single source of truth for what counts as a
 * flag rather than a record field.
 *
 * `bin/zeyos.mjs` parses against this; `lib/flags.mjs` derives its reserved-name
 * set from it. Keeping one table means a flag added for one command can never
 * silently become a record field on `create`/`update`, which is what happened
 * when the two lists were maintained by hand.
 */

/** @typedef {{ type: 'boolean'|'string', short?: string }} OptionDef */

/** @type {Record<string, OptionDef>} */
export const OPTIONS = {
  // Global
  'help':       { type: 'boolean', short: 'h' },
  'version':    { type: 'boolean', short: 'v' },
  'json':       { type: 'boolean' },
  'yaml':       { type: 'boolean' },
  'no-color':   { type: 'boolean' },
  'query':      { type: 'boolean' },
  'dry-run':    { type: 'boolean' },
  'no-validate': { type: 'boolean' },
  'profile':    { type: 'string' },
  'timeout':    { type: 'string' },
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
  'search':     { type: 'string' },
  'preset':     { type: 'string' },
  'sort':       { type: 'string' },
  'limit':      { type: 'string' },
  'offset':     { type: 'string' },
  'page-size':  { type: 'string' },
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
  // okf
  'out':        { type: 'string' },
  // profile
  'from-current': { type: 'boolean' },
};

/** Every declared option name — used to reserve flags from record payloads. */
export const OPTION_NAMES = Object.freeze(Object.keys(OPTIONS));
