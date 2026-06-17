import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

export function buildCliClient() {
  try {
    return buildClient();
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
  if (!values.query) return false;

  const fn = requireApiMethod(clientState, operationId);
  let descriptor;
  try {
    descriptor = await fn(input, { dryRun: true });
  } catch (err) {
    fail(`Could not build request: ${err.message}`);
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
    fail(`${options.errorPrefix ?? 'API error'}: ${err.message}`);
  }
}
