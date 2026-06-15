import { buildClient, syncTokens } from './client.mjs';
import { collectFieldFlags } from './flags.mjs';
import { resolveResource } from './resources.mjs';
import { error } from './output.mjs';

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

export function buildRecordPayload(values) {
  const parsed = parseJsonOption(values.data, 'data');
  const data = parsed === undefined ? {} : parsed;

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail(`--data must be a JSON object.  Got: ${values.data}`);
  }

  Object.assign(data, collectFieldFlags(values));

  if (Object.keys(data).length === 0) {
    fail('No fields provided.  Use --data or individual --<field> flags.');
  }

  return data;
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
