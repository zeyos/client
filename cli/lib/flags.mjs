/**
 * Helpers for turning loose `--<field> <value>` CLI flags into a record payload
 * for the create/update commands.
 */

// Global CLI flags that are never record fields. Any other --flag on
// create/update is treated as a field on the record being written.
const RESERVED_FLAGS = new Set([
  'data', 'data-file', 'json', 'yaml', 'help', 'h',
  'no-color', 'force', 'fields', 'filter', 'filter-file', 'sort',
  'limit', 'offset', 'expand', 'base-url', 'client-id',
  'secret', 'scope', 'global', 'port', 'manual', 'show-token',
  'extdata', 'tags', 'all', 'clean', 'query', 'profile',
]);

/**
 * Coerce a raw string flag value to its natural JS type
 * (boolean, null, or number) where it unambiguously looks like one.
 *
 * @param {string|boolean} value
 * @returns {string|number|boolean|null}
 */
function coerceFlagValue(value) {
  if (value === 'true')  return true;
  if (value === 'false') return false;
  if (value === 'null')  return null;
  if (typeof value === 'string' && value !== '' && !isNaN(Number(value))) return Number(value);
  return value;
}

/**
 * Collect non-reserved `--<field> <value>` flags into a record-field object,
 * coercing each value to its natural JS type.
 *
 * @param {Record<string, string|boolean>} values - parsed CLI flag values
 * @returns {Record<string, string|number|boolean|null>}
 */
export function collectFieldFlags(values) {
  const data = {};
  for (const [key, value] of Object.entries(values)) {
    if (!RESERVED_FLAGS.has(key)) data[key] = coerceFlagValue(value);
  }
  return data;
}
