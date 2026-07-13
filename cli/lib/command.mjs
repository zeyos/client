import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { suggestClosest } from '@zeyos/client';
import { buildClient, syncTokens } from './client.mjs';
import { collectFieldFlags } from './flags.mjs';
import { resolveResource } from './resources.mjs';
import { error, info, warn, printQuery } from './output.mjs';

export function fail(message) {
  error(message);
  process.exit(1);
}

export function requireResource(resourceName, usage, capability, unsupportedAction) {
  if (!resourceName) {
    fail(`Missing resource name.  Usage: ${usage}`);
  }

  const resource = resolveResource(resourceName);
  if (!resource) {
    fail(`Unknown resource: "${resourceName}".  Run 'zeyos resources' to see available types.`);
  }

  if (capability && !resource[capability]) {
    fail(`Resource "${resourceName}" does not support ${unsupportedAction}.`);
  }

  return resource;
}

export function requireRecordId(id, usage) {
  if (!id) {
    fail(`Missing record ID.  Usage: ${usage}`);
  }
}

export function buildCliClient(values = {}) {
  try {
    return buildClient({ validate: values['no-validate'] !== true }, { profile: values.profile });
  } catch (err) {
    fail(err.message);
  }
}

export function parseJsonOption(value, flagName) {
  if (!value) return undefined;

  try {
    return JSON.parse(value);
  } catch {
    fail(`--${flagName} must be valid JSON.  Got: ${value}`);
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

const FILTER_OPERATOR_ALIASES = {
  $lt: '<',
  $lte: '<=',
  $gt: '>',
  $gte: '>=',
  $ne: '!=',
  $in: 'IN',
  $nin: '!IN',
  $notIn: '!IN',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
  ne: '!=',
  in: 'IN',
  nin: '!IN',
  notIn: '!IN',
  notin: '!IN'
};

const FILTER_SUFFIX_OPERATOR_ALIASES = {
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
  ne: '!=',
  in: 'IN',
  nin: '!IN',
  notin: '!IN'
};

const FILTER_PATTERN_SUFFIXES = new Set([
  'startswith',
  'istartswith',
  'like',
  'ilike',
  'contains',
  'icontains',
  'regex',
  'iregex'
]);

export function normalizeFilterOperators(value, options = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFilterOperators(item, options));
  }
  if (!value || typeof value !== 'object') return value;

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    const suffixFilter = parseFilterSuffix(key, child, options);
    if (suffixFilter) {
      mergeFieldFilter(out, suffixFilter.field, suffixFilter.operator, suffixFilter.value);
      continue;
    }

    const normalizedKey = FILTER_OPERATOR_ALIASES[key] || key;
    const outputKey = isFilterOperatorKey(normalizedKey)
      ? normalizedKey
      : normalizeFieldAlias(normalizedKey, options);
    const normalizedChild = normalizeFilterOperators(child, options);
    out[outputKey] = Array.isArray(normalizedChild) && !isFilterOperatorKey(outputKey)
      ? { IN: normalizedChild }
      : normalizedChild;
  }
  return out;
}

function isFilterOperatorKey(key) {
  return ['<', '<=', '>', '>=', '!=', 'IN', '!IN', '~~*'].includes(key);
}

function normalizeFieldAlias(field, options = {}) {
  return options.fieldAliases?.[field] || field;
}

function parseFilterSuffix(key, child, options) {
  const separator = key.lastIndexOf('__');
  if (separator <= 0) return null;

  const rawField = key.slice(0, separator);
  const suffix = key.slice(separator + 2).toLowerCase();
  const field = normalizeFieldAlias(rawField, options);

  if (Object.prototype.hasOwnProperty.call(FILTER_SUFFIX_OPERATOR_ALIASES, suffix)) {
    return {
      field,
      operator: FILTER_SUFFIX_OPERATOR_ALIASES[suffix],
      value: normalizeFilterOperators(child, options)
    };
  }

  if (FILTER_PATTERN_SUFFIXES.has(suffix)) {
    return {
      field,
      operator: '~~*',
      value: patternValueForSuffix(suffix, child)
    };
  }

  return null;
}

function patternValueForSuffix(suffix, child) {
  const value = String(child ?? '');
  if (suffix === 'startswith' || suffix === 'istartswith') return `${value}%`;
  if (suffix === 'contains' || suffix === 'icontains') return `%${value}%`;
  if (suffix === 'regex' || suffix === 'iregex') return regexLikeToSqlLike(value);
  return value;
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
 * @returns {Record<string, unknown>}
 */
export function buildRecordPayload(values, positionalData) {
  const parsed = parseJsonOptionOrFile(values, 'data', 'data-file');
  const data = parsed === undefined ? {} : parsed;

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail(`--data must be a JSON object.  Got: ${values.data}`);
  }

  Object.assign(data, collectFieldFlags(values));

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
    if (err.status === 404 && options.notFoundMessage) {
      fail(options.notFoundMessage);
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
    fail(err.message);
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

/** Apply the CLI's complete filter preparation pipeline. */
export function prepareResourceFilters(res, resourceName, presetName, userFilters) {
  const options = { fieldAliases: res.filterAliases };
  const normalizedUser = userFilters === undefined
    ? undefined
    : normalizeFilterOperators(userFilters, options);
  const presetOnly = mergePresetFilters(res, resourceName, presetName, undefined);
  const normalizedPreset = presetOnly === undefined
    ? undefined
    : normalizeFilterOperators(presetOnly, options);
  if (normalizedPreset === undefined) return normalizedUser;
  return deepMerge(normalizedPreset, normalizedUser || {});
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
