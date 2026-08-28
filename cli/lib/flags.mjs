/**
 * Helpers for turning loose `--<field> <value>` CLI flags into a record payload
 * for the create/update commands.
 */

/**
 * Global CLI flags that are never record fields. Any other --flag on
 * create/update is treated as a field on the record being written.
 *
 * Derived from the parser's own option table so the two cannot drift apart —
 * a hand-maintained copy previously fell behind and leaked flags such as
 * `--yes` and `--page-size` into record payloads.
 */
import { OPTION_NAMES } from './options.mjs';

const RESERVED_FLAGS = new Set([...OPTION_NAMES, 'h', 'v']);

/** Canonical decimal syntax: no leading zeros, no `+`, no exponent, no hex. */
const STRICT_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** Postgres types the CLI may safely convert to a JS number. */
const NUMERIC_TYPE = /^(smallint|integer|int|int2|int4|int8|bigint|serial|bigserial|numeric|decimal|real|double precision|money|float)/i;
const BOOLEAN_TYPE = /^bool/i;

/**
 * Coerce a raw string flag value using the column's declared type.
 *
 * Text columns keep their string value verbatim — that is what stops
 * `--customernum 00123` from being written as `123`, and `--phone +4930…`
 * from losing its `+`. Only columns the schema calls numeric are converted,
 * and only when the literal is in canonical decimal form and survives the
 * round trip without losing precision.
 *
 * @param {string|boolean} value
 * @param {{type?: string}} [def] - schema field definition, when known
 * @returns {string|number|boolean|null}
 */
function coerceFlagValue(value, def) {
  if (typeof value !== 'string') return value;      // bare `--flag` → true
  if (value === 'null') return null;                // explicit, type-independent

  const type = def?.type;

  if (type) {
    if (BOOLEAN_TYPE.test(type)) {
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    }
    if (!NUMERIC_TYPE.test(type)) {
      return value;                                 // text/date/json → verbatim
    }
    return toNumber(value) ?? value;
  }

  // Unknown field (custom column, alias, or --no-validate): fall back to a
  // conservative guess. Booleans still convert; numbers only in canonical form.
  if (value === 'true')  return true;
  if (value === 'false') return false;
  return toNumber(value) ?? value;
}

/**
 * Parse a canonical decimal literal, or return null when the value is not one
 * (or cannot be represented exactly as a JS number).
 *
 * @param {string} value
 * @returns {number|null}
 */
function toNumber(value) {
  if (!STRICT_NUMBER.test(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Reject values that lose precision — a 20-digit order number must stay text.
  if (String(n) !== value) return null;
  return n;
}

/**
 * Collect non-reserved `--<field> <value>` flags into a record-field object,
 * coercing each value against the resource's schema where the column is known.
 *
 * @param {Record<string, string|boolean>} values - parsed CLI flag values
 * @param {Record<string, {type?: string}>} [fieldDefs] - schema field map for the resource
 * @returns {Record<string, string|number|boolean|null>}
 */
export function collectFieldFlags(values, fieldDefs) {
  const data = {};
  for (const [key, value] of Object.entries(values)) {
    if (RESERVED_FLAGS.has(key)) continue;
    data[key] = coerceFlagValue(value, fieldDefs?.[key]);
  }
  return data;
}
