import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createZeyosClient, suggestClosest } from '@zeyos/client';
import { buildClient, syncTokens } from './client.mjs';
import { collectFieldFlags } from './flags.mjs';
import { resolveResource, suggestResource, resourceForTransactionType } from './resources.mjs';
import { error, info, warn, printQuery } from './output.mjs';
import { EXIT } from './exit.mjs';

/**
 * Print an error and terminate.
 * @param {string} message
 * @param {number} [code] - one of EXIT.*; defaults to a generic failure
 */
export function fail(message, code = EXIT.ERROR) {
  error(message);
  process.exit(code);
}

/**
 * The bundled schema, built lazily and without credentials. Used for typing
 * `--<field>` flags before a real client (and therefore auth) is required.
 */
let _offlineSchema;
export function offlineSchema() {
  if (!_offlineSchema) _offlineSchema = createZeyosClient({ auth: { mode: 'none' } }).schema;
  return _offlineSchema;
}

/** Set of valid field names for the resource an operation belongs to, or null. */
function fieldNamesForOperation(operationId) {
  const defs = fieldDefsForOperation(operationId);
  return defs ? new Set(Object.keys(defs)) : null;
}

/** Field definitions for the resource an operation belongs to, or undefined. */
function fieldDefsForOperation(operationId) {
  if (!operationId) return undefined;
  try {
    const schema = offlineSchema();
    const resource = schema.resourceForOperation(operationId);
    return resource ? schema.describe(resource)?.fields : undefined;
  } catch {
    return undefined;
  }
}

export function requireResource(resourceName, usage, capability, unsupportedAction) {
  if (!resourceName) {
    fail(`Missing resource name.  Usage: ${usage}`, EXIT.USAGE);
  }

  const resource = resolveResource(resourceName);
  if (!resource) {
    // Offer the near miss: an agent that typos an entity should not need a
    // second turn to discover the spelling.
    const suggestion = suggestResource(resourceName);
    fail(
      `Unknown entity: "${resourceName}".` +
        (suggestion ? `  Did you mean "${suggestion}"?` : '') +
        `  Run 'zeyos list' to see every entity.`,
      EXIT.USAGE
    );
  }

  if (capability && !resource[capability]) {
    fail(`Resource "${resourceName}" does not support ${unsupportedAction}.`, EXIT.USAGE);
  }

  return resource;
}

export function requireRecordId(id, usage) {
  if (!id) {
    fail(`Missing record ID.  Usage: ${usage}`, EXIT.USAGE);
  }
}

/**
 * Reject positional arguments beyond what the command takes.
 *
 * An unquoted multi-word value — `create ticket --name Fix login bug` — parses as
 * one flag value plus surplus positionals, and previously created a ticket named
 * "Fix" and exited 0. Failing loudly turns a silent wrong write into a fixable
 * usage error.
 *
 * @param {string[]} positional
 * @param {number} max - how many positionals the command consumes
 * @param {string} usage
 */
export function requireNoExtraPositionals(positional, max, usage, opts = {}) {
  // The optional trailing JSON-body slot only counts when it actually holds
  // JSON. Otherwise `create ticket --name Fix login` quietly parks "login"
  // there and writes a record named "Fix".
  let limit = max;
  if (opts.jsonBodyAt != null) {
    const candidate = positional[opts.jsonBodyAt];
    if (candidate === undefined || !String(candidate).trimStart().startsWith('{')) {
      limit = opts.jsonBodyAt;
    }
  }

  if (positional.length <= limit) return;
  const extra = positional.slice(limit);
  fail(
    `Unexpected argument${extra.length > 1 ? 's' : ''}: ${extra.map((a) => JSON.stringify(a)).join(', ')}.\n` +
      `  A value containing spaces must be quoted, e.g. --name "Fix login bug".\n` +
      `  Usage: ${usage}`,
    EXIT.USAGE
  );
}

/**
 * Parse an integer option strictly: no trailing junk, no fractions, no negatives
 * where they make no sense. `--limit 10junk` silently meaning 10 is the kind of
 * thing an agent never notices.
 *
 * @param {string|undefined} raw
 * @param {string} flag
 * @param {{min?: number}} [opts]
 * @returns {number|undefined}
 */
export function parseIntegerOption(raw, flag, opts = {}) {
  if (raw == null) return undefined;
  const text = String(raw).trim();
  if (!/^-?\d+$/.test(text)) {
    fail(`${flag} must be a whole number.  Got: ${JSON.stringify(String(raw))}`, EXIT.USAGE);
  }
  const n = Number(text);
  const min = opts.min ?? 0;
  if (n < min) {
    fail(`${flag} must be ${min} or greater.  Got: ${n}`, EXIT.USAGE);
  }
  return n;
}

export function buildCliClient(values = {}) {
  let timeoutMs;
  if (values.timeout != null) {
    const seconds = Number(values.timeout);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      fail('--timeout must be a positive number of seconds.', EXIT.USAGE);
    }
    timeoutMs = Math.round(seconds * 1000);
  }
  try {
    return buildClient(
      { validate: values['no-validate'] !== true, ...(timeoutMs ? { timeoutMs } : {}) },
      { profile: values.profile }
    );
  } catch (err) {
    fail(err.message, EXIT.AUTH);
  }
}

export function parseJsonOption(value, flagName) {
  if (!value) return undefined;

  try {
    return JSON.parse(value);
  } catch (err) {
    // Report the parse error, not the payload: a malformed --data can contain a
    // password or other private text that would otherwise land in CI logs.
    fail(`--${flagName} must be valid JSON (${err.message}).`);
  }
}

export function parseJsonFileOption(value, flagName) {
  if (value == null || value === '') {
    fail(`--${flagName} requires a file path.`);
  }

  const filePath = String(value);
  const absolutePath = resolve(process.cwd(), filePath);
  let text;

  try {
    text = readFileSync(absolutePath, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') {
      fail(`--${flagName} file not found: ${filePath}`);
    }
    if (err?.code === 'EISDIR') {
      fail(`--${flagName} points to a directory, not a JSON file: ${filePath}`);
    }
    fail(`Could not read --${flagName} file ${filePath}: ${err.message || err}`);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    fail(`--${flagName} file must contain valid JSON: ${filePath} (${err.message || err})`);
  }
}

export function parseJsonOptionOrFile(values, flagName, fileFlagName = `${flagName}-file`) {
  const hasInline = Object.prototype.hasOwnProperty.call(values, flagName);
  const hasFile = Object.prototype.hasOwnProperty.call(values, fileFlagName);

  if (hasInline && hasFile) {
    fail(`Use either --${flagName} or --${fileFlagName}, not both.`);
  }
  if (hasInline) {
    if (values[flagName] === '') {
      fail(`--${flagName} requires a JSON value. Use --${fileFlagName} <path> for file input.`);
    }
    return parseJsonOption(values[flagName], flagName);
  }
  if (hasFile) {
    return parseJsonFileOption(values[fileFlagName], fileFlagName);
  }

  return undefined;
}

// ── Filter normalization ──────────────────────────────────────────────────────
//
// The benchmark harness (test/agent-protocol) repeatedly showed that models emit
// filter syntax from whatever ORM they saw most in training — Mongo, Django,
// Sequelize, raw SQL — and then burn turns on 400 loops discovering ZeyOS's
// actual shape. RECOMMENDATIONS.md records the conclusion: absorb the drift at
// the CLI boundary, because prompt guidance alone is high-variance.
//
// So: translate everything that has an unambiguous ZeyOS equivalent, and for
// everything else fail with a message that names the supported operators
// instead of letting the API answer with an opaque 400.

/** Operators the ZeyOS filter API accepts (docs/01-api-reference/01-data-retrieval.md). */
const NATIVE_OPERATORS = new Set([
  '=', '!=', '<>', '<', '<=', '>', '>=', 'IN', '!IN',
  '~', '~*', '!~', '!~*', '~~', '~~*', '!~~', '!~~*'
]);

/** Operator aliases in value position: `{field: {<alias>: value}}`. */
const FILTER_OPERATOR_ALIASES = {
  $lt: '<',    lt: '<',
  $lte: '<=',  lte: '<=',
  $gt: '>',    gt: '>',
  $gte: '>=',  gte: '>=',
  $ne: '!=',   ne: '!=',   $neq: '!=',  neq: '!=',
  $in: 'IN',   in: 'IN',
  $nin: '!IN', nin: '!IN', $notIn: '!IN', notIn: '!IN', notin: '!IN',
  $like: '~~', like: '~~',
  $ilike: '~~*', ilike: '~~*',
  $regex: '~*', regex: '~*',
  $iregex: '~*', iregex: '~*'
};

/** Operator aliases in key position: `field__<alias>` / `field_<alias>`. */
const FILTER_SUFFIX_OPERATOR_ALIASES = {
  lt:  '<',
  lte: '<=',
  gt:  '>',
  gte: '>=',
  ne:  '!=',
  neq: '!=',
  in:  'IN',
  nin: '!IN',
  notin: '!IN'
};

/** Key-position suffixes that produce a LIKE pattern. */
const FILTER_PATTERN_SUFFIXES = new Set([
  'startswith', 'istartswith', 'starts', 'startingwith',
  'endswith', 'iendswith', 'ends',
  'like', 'ilike',
  'contains', 'icontains',
  'regex', 'iregex'
]);

/** Key-position suffixes meaning plain equality. */
const FILTER_EQUALITY_SUFFIXES = new Set(['eq', 'exact', 'iexact', 'is']);

/** Key-position suffixes expanding to an inclusive range. */
const FILTER_RANGE_SUFFIXES = new Set(['between', 'range']);

/**
 * Suffixes that look like an operator but have no ZeyOS equivalent. Rejected with
 * an explanation rather than passed through to produce an opaque server error.
 */
const FILTER_UNSUPPORTED_SUFFIXES = {
  isnull: 'ZeyOS has no IS NULL filter. Fetch the candidate rows and compare client-side (see the data-quality skill), or filter on a sentinel value.',
  isnotnull: 'ZeyOS has no IS NOT NULL filter. Fetch the candidate rows and compare client-side.',
  exists: 'ZeyOS has no EXISTS filter. Fetch the candidate rows and compare client-side.'
};

/** Composite keys models borrow from Mongo, mapped to ZeyOS logical groups. */
const COMPOSITE_ALIASES = { $or: 'OR', or: 'OR', $and: 'AND', and: 'AND' };

class FilterSyntaxError extends Error {}

/**
 * The filter vocabulary, as data, so `zeyos describe` can show an agent exactly
 * what it may write without the agent having to discover it by trial and 400.
 */
export const FILTER_VOCABULARY = Object.freeze({
  native: [...NATIVE_OPERATORS],
  translated: {
    'value-position': ['$lt', '$lte', '$gt', '$gte', '$ne', '$in', '$nin', '$like', '$ilike', '$regex', '$eq', '$between'],
    'key-position': [
      'field__lt', 'field__lte', 'field__gt', 'field__gte', 'field__ne', 'field__in', 'field__nin',
      'field__startswith', 'field__endswith', 'field__contains', 'field__like', 'field__between', 'field__exact'
    ],
    composite: ['$or', '$and'],
    shorthand: ['field: [a, b]  (means IN)']
  },
  unsupported: Object.keys(FILTER_UNSUPPORTED_SUFFIXES).map((s) => `field__${s}`),
  notes: [
    'Single underscore also works when unambiguous: status_neq, ID_gt.',
    '$or / $and become ZeyOS numbered logical groups: {"0": ["OR", …]}.',
    'startswith/endswith/contains take literal text; like/ilike take a pattern with % wildcards.'
  ]
});

/**
 * Normalize a user/model-supplied filter object into native ZeyOS filter shape.
 *
 * @param {unknown} value
 * @param {{fieldAliases?: Record<string,string>, fields?: Set<string>|string[]}} [options]
 *   `fields` enables single-underscore suffix parsing (`status_neq`): a suffix is
 *   only stripped when the whole key is not itself a field and the prefix is.
 * @throws {FilterSyntaxError} on syntax with no ZeyOS equivalent
 */
export function normalizeFilterOperators(value, options = {}) {
  const fields = options.fields instanceof Set
    ? options.fields
    : Array.isArray(options.fields) ? new Set(options.fields) : null;
  return normalizeFilterValue(value, { ...options, fields }, { seq: 0 });
}

function normalizeFilterValue(value, options, ctx) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFilterValue(item, options, ctx));
  }
  if (!value || typeof value !== 'object') return value;

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    // Composite groups: {$or: [a, b]} -> {"0": ["OR", a, b]}. ZeyOS expresses
    // OR/AND with numbered keys, a shape no model guesses, so translate rather
    // than reject — the semantics are exactly what the caller asked for.
    const composite = COMPOSITE_ALIASES[key];
    if (composite) {
      if (!Array.isArray(child)) {
        throw new FilterSyntaxError(`Filter "${key}" needs an array of conditions, e.g. {"${key}": [{"status": 1}, {"status": 3}]}.`);
      }
      out[String(ctx.seq++)] = [composite, ...child.map((item) => normalizeFilterValue(item, options, ctx))];
      continue;
    }

    // An already-numbered logical group passes through with its members normalized.
    if (/^\d+$/.test(key) && Array.isArray(child)) {
      out[key] = [child[0], ...child.slice(1).map((item) => normalizeFilterValue(item, options, ctx))];
      continue;
    }

    const suffixFilter = parseFilterSuffix(key, child, options);
    if (suffixFilter) {
      if (suffixFilter.equality) {
        out[suffixFilter.field] = suffixFilter.value;
      } else if (suffixFilter.range) {
        mergeFieldFilter(out, suffixFilter.field, '>=', suffixFilter.range[0]);
        mergeFieldFilter(out, suffixFilter.field, '<=', suffixFilter.range[1]);
      } else {
        mergeFieldFilter(out, suffixFilter.field, suffixFilter.operator, suffixFilter.value);
      }
      continue;
    }

    const outputKey = normalizeFieldAlias(key, options);
    const normalizedChild = normalizeFilterOperand(outputKey, child, options, ctx);
    out[outputKey] = normalizedChild;
  }
  return out;
}

/**
 * Normalize the value side of `{field: <operand>}`.
 *
 * A bare array means IN. An object is a set of operator keys, each of which must
 * resolve to a native operator — an unrecognized one is an error here rather than
 * a silent pass-through that the server rejects without naming the culprit.
 */
function normalizeFilterOperand(field, operand, options, ctx) {
  if (Array.isArray(operand)) {
    return { IN: operand };
  }
  if (!operand || typeof operand !== 'object') {
    return operand;
  }

  const out = {};
  for (const [rawOp, rawValue] of Object.entries(operand)) {
    const alias = FILTER_OPERATOR_ALIASES[rawOp];
    const op = alias ?? rawOp;

    // {field: {$eq: v}} is just {field: v}.
    if (rawOp === '$eq' || rawOp === 'eq' || rawOp === '=' || rawOp === 'is') {
      return normalizeFilterValue(rawValue, options, ctx);
    }
    if (rawOp === '$between' || rawOp === 'between' || rawOp === '$range' || rawOp === 'range') {
      const pair = asRangePair(field, rawOp, rawValue);
      out['>='] = pair[0];
      out['<='] = pair[1];
      continue;
    }
    if (!NATIVE_OPERATORS.has(op)) {
      throw new FilterSyntaxError(
        `Unsupported filter operator "${rawOp}" on "${field}".\n` +
        `  Supported: ${[...NATIVE_OPERATORS].join(' ')}\n` +
        `  Also accepted and translated: $lt $lte $gt $gte $ne $in $nin $like $ilike $regex, ` +
        `field__gt / field__startswith / field__contains / field__between, and $or / $and.`
      );
    }
    // A LIKE/regex operator given an array is a caller mistake; everything else
    // may legitimately carry an array (IN) or a scalar.
    out[op] = (op === 'IN' || op === '!IN') && !Array.isArray(rawValue) ? [rawValue] : rawValue;
  }
  return out;
}

function asRangePair(field, op, value) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new FilterSyntaxError(`Filter "${op}" on "${field}" needs a two-element array, e.g. {"${field}": {"${op}": [from, to]}}.`);
  }
  return value;
}

function normalizeFieldAlias(field, options = {}) {
  return options.fieldAliases?.[field] || field;
}

/**
 * Split `field__op` / `field_op` into a field and an operator.
 *
 * Double underscore is unambiguous. Single underscore is only attempted when the
 * caller supplied the resource's field list, the whole key is not itself a field,
 * and the prefix is — otherwise `sender_email` would be read as `sender` with an
 * `email` operator.
 */
function parseFilterSuffix(key, child, options) {
  let rawField = null;
  let suffix = null;

  const double = key.lastIndexOf('__');
  if (double > 0) {
    rawField = key.slice(0, double);
    suffix = key.slice(double + 2).toLowerCase();
  } else if (options.fields && !options.fields.has(key)) {
    const single = key.lastIndexOf('_');
    if (single > 0) {
      const candidateField = key.slice(0, single);
      const candidateSuffix = key.slice(single + 1).toLowerCase();
      const known = FILTER_SUFFIX_OPERATOR_ALIASES[candidateSuffix]
        || FILTER_PATTERN_SUFFIXES.has(candidateSuffix)
        || FILTER_EQUALITY_SUFFIXES.has(candidateSuffix)
        || FILTER_RANGE_SUFFIXES.has(candidateSuffix)
        || FILTER_UNSUPPORTED_SUFFIXES[candidateSuffix];
      const resolved = normalizeFieldAlias(candidateField, options);
      if (known && (options.fields.has(candidateField) || options.fields.has(resolved))) {
        rawField = candidateField;
        suffix = candidateSuffix;
      }
    }
  }

  if (rawField === null) return null;

  const unsupported = FILTER_UNSUPPORTED_SUFFIXES[suffix];
  if (unsupported) {
    throw new FilterSyntaxError(`Unsupported filter "${key}". ${unsupported}`);
  }

  const field = normalizeFieldAlias(rawField, options);

  if (FILTER_EQUALITY_SUFFIXES.has(suffix)) {
    return { field, equality: true, value: child };
  }
  if (FILTER_RANGE_SUFFIXES.has(suffix)) {
    return { field, range: asRangePair(field, suffix, child) };
  }
  if (Object.prototype.hasOwnProperty.call(FILTER_SUFFIX_OPERATOR_ALIASES, suffix)) {
    const operator = FILTER_SUFFIX_OPERATOR_ALIASES[suffix];
    const value = (operator === 'IN' || operator === '!IN') && !Array.isArray(child) ? [child] : child;
    return { field, operator, value };
  }
  if (FILTER_PATTERN_SUFFIXES.has(suffix)) {
    return { field, operator: '~~*', value: patternValueForSuffix(suffix, child) };
  }

  return null;
}

/**
 * Build the LIKE pattern for a pattern suffix.
 *
 * `startswith` / `endswith` / `contains` take *literal* text, so `%` and `_` in
 * the caller's value are escaped — searching for "50%" must match a percent
 * sign, not "50 followed by anything". `like` / `ilike` are the opposite: the
 * caller is authoring the pattern themselves, so their wildcards are preserved.
 */
function patternValueForSuffix(suffix, child) {
  const raw = String(child ?? '');
  if (suffix === 'regex' || suffix === 'iregex') return regexLikeToSqlLike(raw);
  if (suffix === 'like' || suffix === 'ilike') return raw;

  const value = escapeLikeWildcards(raw);
  if (suffix === 'startswith' || suffix === 'istartswith' || suffix === 'starts' || suffix === 'startingwith') {
    return `${value}%`;
  }
  if (suffix === 'endswith' || suffix === 'iendswith' || suffix === 'ends') {
    return `%${value}`;
  }
  if (suffix === 'contains' || suffix === 'icontains') return `%${value}%`;
  return value;
}

/** Escape LIKE metacharacters so caller text is matched literally. */
function escapeLikeWildcards(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function regexLikeToSqlLike(value) {
  return String(value)
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replace(/\\.\\*/g, '%')
    .replace(/\.\*/g, '%');
}

function mergeFieldFilter(out, field, operator, value) {
  const existing = out[field];
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    out[field] = { ...existing, [operator]: value };
    return;
  }
  out[field] = { [operator]: value };
}

/** Cheap structural check: does this string look like an intended JSON object? */
function looksLikeJsonObject(value) {
  return typeof value === 'string' && value.trim().startsWith('{');
}

/**
 * Parse a string as a JSON object.
 *
 * @param {string} [value]
 * @returns {Record<string, unknown> | undefined} the object, or `undefined` if
 *   the value is absent, malformed, or not a plain (non-array) object.
 */
function tryParseJsonObject(value) {
  if (!looksLikeJsonObject(value)) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // not valid JSON — fall through
  }
  return undefined;
}

/**
 * Build a record payload for `create`/`update` from `--data`, individual
 * `--<field>` flags, or — as a fallback — a JSON object passed positionally.
 *
 * Coding agents frequently run `zeyos create tickets '{"name":"x"}'`, passing
 * the body positionally (often alongside the `--json` output flag). When no
 * `--data`/`--<field>` values were given and that positional argument parses as
 * a JSON object, adopt it as the payload instead of failing. If it only *looks*
 * like JSON (e.g. malformed), point the caller at `--data` explicitly rather
 * than emitting the generic "No fields provided" error.
 *
 * @param {Record<string, string|boolean>} values - parsed CLI flag values
 * @param {string} [positionalData] - candidate positional JSON body
 * @param {string} [operationId] - write operation, used to type `--<field>` flags
 * @returns {Record<string, unknown>}
 */
export function buildRecordPayload(values, positionalData, operationId) {
  const parsed = parseJsonOptionOrFile(values, 'data', 'data-file');
  const data = parsed === undefined ? {} : parsed;

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail('--data must be a JSON object.');
  }

  Object.assign(data, collectFieldFlags(values, fieldDefsForOperation(operationId)));

  if (Object.keys(data).length > 0) {
    // Explicit --data / --<field> values win; surface an ignored positional
    // JSON body so it isn't silently dropped.
    if (looksLikeJsonObject(positionalData)) {
      warn('Ignoring positional JSON argument; using --data / --<field> values instead.');
    }
    return data;
  }

  // No --data and no --<field> flags. A JSON object passed positionally is a
  // common agent mistake — adopt it rather than rejecting the command.
  if (looksLikeJsonObject(positionalData)) {
    const positionalObject = tryParseJsonObject(positionalData);
    if (positionalObject && Object.keys(positionalObject).length > 0) {
      info("Treating positional JSON argument as --data.  Tip: pass it as --data '<json>'.");
      return positionalObject;
    }
    if (!positionalObject) {
      fail("It looks like you passed a malformed JSON object positionally; use --data '<json>' with valid JSON.");
    }
    // Parsed to an empty object — genuinely no fields.
  }

  fail('No fields provided.  Use --data or individual --<field> flags.');
}

/**
 * Handle the global `--query` flag: instead of sending the request, ask the
 * client to resolve the route + payload (dry run) and print them. Returns
 * `true` when it handled a dry run, so the caller can `return` early.
 *
 * @param {ReturnType<typeof buildCliClient>} clientState
 * @param {string} operationId
 * @param {unknown} input - the same input the real call would receive
 * @param {Record<string, unknown>} values - parsed CLI flags
 * @returns {Promise<boolean>}
 */
export async function maybeDryRun(clientState, operationId, input, values) {
  if (!values.query && !values['dry-run']) return false;

  const fn = requireApiMethod(clientState, operationId);
  let descriptor;
  try {
    descriptor = await fn(input, { dryRun: true });
  } catch (err) {
    fail(formatApiError(clientState, operationId, err, 'Could not build request'));
  }
  printQuery(descriptor, values);
  return true;
}

export function requireApiMethod(clientState, operationId) {
  const fn = clientState.client.api[operationId];
  if (typeof fn !== 'function') {
    fail(`Operation "${operationId}" is not available on this client.`);
  }
  return fn;
}

export async function callApi(clientState, operationId, input, options = {}) {
  const fn = requireApiMethod(clientState, operationId);
  try {
    const result = await fn(input);
    await syncTokens(clientState.tokenStore, clientState.configSource);
    return result;
  } catch (err) {
    // Persist before failing, not in a `finally`: fail() calls process.exit(),
    // which skips finally blocks. A call that refreshed the token and then got a
    // 404/400/503 would otherwise throw the new tokens away — and under
    // refresh-token rotation the stored one is now spent, silently logging the
    // user out.
    await syncTokens(clientState.tokenStore, clientState.configSource);

    if (err.status === 404 && options.notFoundMessage) {
      fail(options.notFoundMessage, EXIT.NOT_FOUND);
    }
    if (err.status === 401 || err.status === 403) {
      fail(`${err.message}  Run 'zeyos login' to re-authenticate.`, EXIT.AUTH);
    }
    fail(formatApiError(clientState, operationId, err, options.errorPrefix ?? 'API error'));
  }
}

export function validateCliInput(clientState, operationId, input) {
  const result = clientState.client.schema.validate(operationId, input);
  if (!result.valid) {
    fail(formatValidationErrors(clientState, operationId, result.errors));
  }
}

function formatApiError(clientState, operationId, err, prefix) {
  if (err?.name === 'ZeyosValidationError') {
    return formatValidationErrors(clientState, operationId, err.errors);
  }
  return `${prefix}: ${err.message}`;
}

export function formatValidationErrors(clientState, operationId, errors) {
  const schema = clientState.client?.schema ?? clientState.schema;
  const resource = schema.resourceForOperation(operationId);
  const validFields = resource ? schema.fields(resource) : [];
  return errors.map((entry) => {
    if (entry?.message?.startsWith('Unknown field "') && resource) {
      const field = entry.field;
      const aliases = resolveResource(resource)?.filterAliases || {};
      const closestAlias = suggestClosest(field, Object.keys(aliases));
      const suggestion = entry.suggestion || (closestAlias ? aliases[closestAlias] : null);
      return `Unknown field "${field}" on ${resource}.` +
        (suggestion ? ` Did you mean "${suggestion}"?` : '') +
        ` Valid fields: ${validFields.join(', ')}`;
    }
    return entry.message;
  }).join(' ');
}

export function buildPresetFilters(res, resourceName, presetName, userFilters) {
  try {
    return prepareResourceFilters(res, resourceName, presetName, userFilters);
  } catch (err) {
    // Filter syntax is a usage error: the caller can fix it from the message.
    fail(err.message, err instanceof FilterSyntaxError ? EXIT.USAGE : EXIT.ERROR);
  }
}

/**
 * Merge a named business preset with caller-provided filters without terminating
 * the process. This is the shared form used by long-lived transports such as MCP.
 * Caller filters take precedence, including nested operator objects.
 */
export function mergePresetFilters(res, resourceName, presetName, userFilters) {
  if (!presetName) return userFilters;
  const presets = res.presets || {};
  const names = Object.keys(presets);
  if (!Object.prototype.hasOwnProperty.call(presets, presetName)) {
    const suggestion = suggestClosest(presetName, names);
    const available = names.length ? names.join(', ') : 'none';
    throw new Error(`Unknown preset "${presetName}" for ${resourceName}.` +
      (suggestion ? ` Did you mean "${suggestion}"?` : '') +
      ` Available presets: ${available}`);
  }
  const preset = typeof presets[presetName] === 'function' ? presets[presetName]() : presets[presetName];
  return deepMerge(preset, userFilters || {});
}

/**
 * Apply the CLI's complete filter preparation pipeline.
 *
 * Precedence, lowest first: the resource's own bound filters (what makes
 * `billing_invoices` mean `transactions where type = 3`), then a named
 * `--preset`, then the caller's `--filter`.
 */
export function prepareResourceFilters(res, resourceName, presetName, userFilters) {
  // The field list enables single-underscore suffix parsing (`status_neq`),
  // which is only safe when we can tell a suffix from a field that legitimately
  // contains an underscore (`sender_email`).
  const options = {
    fieldAliases: res.filterAliases,
    fields: fieldNamesForOperation(res.list || res.get)
  };
  const normalizedUser = userFilters === undefined
    ? undefined
    : normalizeFilterOperators(userFilters, options);
  const presetOnly = mergePresetFilters(res, resourceName, presetName, undefined);
  const normalizedPreset = presetOnly === undefined
    ? undefined
    : normalizeFilterOperators(presetOnly, options);

  let merged = normalizedPreset === undefined
    ? normalizedUser
    : deepMerge(normalizedPreset, normalizedUser || {});

  if (res.boundFilters) {
    // The bound type is an invariant, not a default: `billing_invoices` must
    // never return anything but type 3. A caller that supplies a conflicting
    // value has a bug, so say so and name the entity they actually want rather
    // than silently honouring either side.
    assertNoBoundConflict(res.boundFilters, merged, resourceName, '--filter');
    merged = { ...(merged || {}), ...res.boundFilters };
  }
  return merged;
}

/**
 * Verify that a record reached by ID actually belongs to the entity that named it.
 *
 * `zeyos delete billing_invoices 42` addresses the transactions table directly, so
 * without this a mistyped ID silently reads, alters or deletes a document of a
 * different type under a name that promised otherwise.
 *
 * @param {import('./types.mjs').ResourceDef} res
 * @param {string} resourceName
 * @param {Record<string, unknown>|null|undefined} record
 * @param {string} action - for the message, e.g. "update"
 */
export function assertRecordMatchesBinding(res, resourceName, record, action) {
  const bound = res.boundFilters;
  if (!bound || !record) return;

  for (const [key, expected] of Object.entries(bound)) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    /* eslint-disable-next-line eqeqeq -- the API may return "3" for a smallint */
    if (record[key] == expected) continue;

    const actual = record[key];
    const owner = key === 'type' ? resourceForTransactionType(Number(actual)) : null;
    fail(
      `Record ${JSON.stringify(record.ID ?? '?')} is not a ${resourceName}: its ${key} is ${JSON.stringify(actual)}, not ${JSON.stringify(expected)}.` +
        (owner ? `  Use "${owner}" to ${action} it.` : `  Use "transactions" to ${action} across types.`),
      EXIT.NOT_FOUND
    );
  }
}

/**
 * Fetch a record purely to confirm it matches the entity's binding, before a
 * write. Only costs a request for entities that actually bind something.
 */
export async function verifyBoundTypeBeforeWrite(clientState, res, resourceName, id, action) {
  if (!res.boundFilters || !res.get) return;
  let record;
  try {
    record = await clientState.client.api[res.get]({ ID: id });
  } catch (err) {
    if (err?.status === 404) {
      fail(`${resourceName} #${id} not found.`, EXIT.NOT_FOUND);
    }
    // A pre-check that cannot run must not block the operation the user asked
    // for; the write itself will surface any real problem.
    return;
  }
  assertRecordMatchesBinding(res, resourceName, record, action);
}

/**
 * Reject a caller value that contradicts a resource's bound fields.
 *
 * @param {Record<string, unknown>} bound
 * @param {Record<string, unknown>|undefined} supplied
 * @param {string} resourceName
 * @param {string} origin - how the value arrived, for the message
 */
export function assertNoBoundConflict(bound, supplied, resourceName, origin) {
  if (!supplied) return;
  for (const [key, boundValue] of Object.entries(bound)) {
    if (!Object.prototype.hasOwnProperty.call(supplied, key)) continue;
    if (JSON.stringify(supplied[key]) === JSON.stringify(boundValue)) continue;

    const wanted = key === 'type' && typeof supplied[key] === 'number'
      ? resourceForTransactionType(supplied[key])
      : null;
    throw new FilterSyntaxError(
      `"${resourceName}" is fixed to ${key} ${JSON.stringify(boundValue)}; ${origin} set ${key} to ${JSON.stringify(supplied[key])}.` +
        (wanted ? `  Use "${wanted}" instead.` : `  Use "transactions" to query across types.`)
    );
  }
}

/** Validate input and return the same teaching error text used by the CLI. */
export function validateInput(schema, operationId, input) {
  const result = schema.validate(operationId, input);
  if (result.valid) return;
  throw new Error(formatValidationErrors({ schema }, operationId, result.errors));
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value)
      ? deepMerge(current, value)
      : value;
  }
  return out;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
