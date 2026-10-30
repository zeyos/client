import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { createZeyosClient } from '@zeyos/client';

const ENV_KEY = 'ZEYOS_CUSTOM_FIELDS_FILE';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function normalizePlatform(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be an absolute ZeyOS instance URL.`);
  }
  let url;
  try { url = new URL(value); } catch {
    throw new Error(`${label} must be an absolute ZeyOS instance URL.`);
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must be an HTTP(S) instance URL without credentials, query, or fragment.`);
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * Explicit, instance-bound metadata. Never discover tenant definitions or read
 * credentials implicitly. Call again for each command/tool invocation so an
 * edited snapshot cannot be masked by a process-global schema cache.
 */
function loadSnapshot({ platform, file = process.env[ENV_KEY] } = {}) {
  if (file === undefined || file === '') return undefined;
  if (typeof file !== 'string' || !isAbsolute(file)) {
    throw new Error(`${ENV_KEY} must be an absolute path to a custom-field snapshot.`);
  }
  let text;
  try { text = readFileSync(file, 'utf8'); } catch {
    throw new Error(`Cannot read ${ENV_KEY}. Check the snapshot path and file permissions.`);
  }
  let snapshot;
  try { snapshot = JSON.parse(text); } catch {
    // JSON parser messages can disclose source values. Report only the action.
    throw new Error(`${ENV_KEY} must contain valid JSON; snapshot contents were not logged.`);
  }
  if (!isObject(snapshot) || !own(snapshot, 'platform') || !own(snapshot, 'customFields') ||
      !isObject(snapshot.customFields) || Object.keys(snapshot).some((key) => !['platform', 'customFields'].includes(key))) {
    throw new Error(`${ENV_KEY} must contain an object with exactly platform and customFields properties.`);
  }
  const target = normalizePlatform(snapshot.platform, 'Snapshot platform');
  if (platform !== undefined && target !== normalizePlatform(platform, 'Configured platform')) {
    throw new Error(`${ENV_KEY} belongs to a different ZeyOS instance. Select a matching snapshot before making this request.`);
  }
  return { platform: target, customFields: snapshot.customFields };
}

export function loadCustomFieldConfig(options) {
  return loadSnapshot(options)?.customFields;
}

/** Offline discovery/preflight uses the same explicit metadata as dispatch. */
export function createOfflineSchema() {
  const snapshot = loadSnapshot();
  const schema = createZeyosClient({
    auth: { mode: 'none' },
    customFields: snapshot?.customFields,
  }).schema;
  return Object.freeze({
    ...schema,
    describe(resource) {
      const definition = schema.describe(resource);
      return definition && {
        ...definition,
        customFieldSource: snapshot ? { platform: snapshot.platform, live: false } : null,
      };
    },
  });
}
