/**
 * Per-resource field configuration loader.
 *
 * Resolves field configs via a cascade (first match wins):
 *   1. .zeyos/api/<resource>.json   (project-local, walks up from CWD)
 *   2. ~/.zeyos/api/<resource>.json  (global user overrides)
 *   3. cli/config/<resource>.json    (shipped defaults)
 *
 * A user override file replaces the shipped config for that resource
 * entirely (no field-by-field merge).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { error } from './output.mjs';

/** @typedef {import('./types.mjs').ResourceDef} ResourceDef */
/** @typedef {import('./types.mjs').ResourceFieldConfig} ResourceFieldConfig */
/** @typedef {import('./types.mjs').ListFieldSelection} ListFieldSelection */
/** @typedef {import('./types.mjs').GetFieldSelection} GetFieldSelection */
/** @typedef {import('./types.mjs').JsonValue} JsonValue */

// ── Paths ────────────────────────────────────────────────────────────────────

const __dir       = dirname(fileURLToPath(import.meta.url));
const SHIPPED_DIR = join(__dir, '..', 'config');
const GLOBAL_DIR  = join(homedir(), '.zeyos', 'api');
const LOCAL_NAME  = '.zeyos';
const LOCAL_SUB   = 'api';

// ── Cache ────────────────────────────────────────────────────────────────────

const _cache = new Map();

// ── Load ─────────────────────────────────────────────────────────────────────

/**
 * Load the field config for a resource by canonical name.
 * Returns the parsed JSON object, or null if no config exists.
 *
 * @param {string} name - canonical resource name (e.g. "ticket")
 * @returns {ResourceFieldConfig|null}
 */
export function loadResourceConfig(name) {
  if (_cache.has(name)) return _cache.get(name);

  const config = _resolveConfig(name);
  _cache.set(name, config);
  return config;
}

// ── List fields ──────────────────────────────────────────────────────────────

/**
 * Get the effective list fields for a resource.
 *
 * Priority:
 *   1. --fields CLI override
 *   2. Config file list.fields object
 *   3. Registry res.fields array (display-only default, no API field selection)
 *
 * The --fields flag supports three formats:
 *   - Comma-separated:  "ID,name,status"          → self-aliased object
 *   - JSON object:      '{"Id":"ID","Name":"name"}'  → aliased object
 *   - JSON array:       '["ID","name","status"]'     → self-aliased object
 *
 * @param {ResourceDef} res - ResourceDef from registry
 * @param {string}   name      - canonical resource name
 * @param {string}   [override] - raw --fields flag value
 * @returns {ListFieldSelection}
 */
export function getListFields(res, name, override) {
  // 1. CLI override
  if (override) {
    return _parseFieldsOverride(override, res?.fieldAliases);
  }

  // 2. Config file
  const config = loadResourceConfig(name);
  if (config?.list?.fields && typeof config.list.fields === 'object') {
    const apiFields = _toFieldAliasMap(config.list.fields);
    const displayColumns = Object.keys(apiFields);
    return { apiFields, displayColumns };
  }

  // 3. Registry fallback — display-only (don't send fields to APIs that may not support it)
  if (res?.fields) {
    return { apiFields: undefined, displayColumns: [...res.fields] };
  }

  return { apiFields: undefined, displayColumns: [] };
}

// ── Get fields ───────────────────────────────────────────────────────────────

/**
 * Get the effective get/show display fields for a resource.
 *
 * Priority:
 *   1. --fields CLI override
 *   2. Config file get.fields array
 *   3. undefined (show all keys — current behavior)
 *
 * Returns an object { keys, labels } where:
 *   - keys: array of API field names to display from the record
 *   - labels: mapping from API field name → display alias
 *
 * When --fields is a JSON object like {"Id": "ID", "Name": "name"},
 * keys are the values (API paths) and labels map those back to the aliases.
 *
 * @param {string}   name       - canonical resource name
 * @param {string}   [override] - raw --fields flag value
 * @returns {GetFieldSelection | undefined}
 */
export function getGetFields(name, override) {
  if (override) {
    const trimmed = override.trim();

    // JSON object: {"Alias": "api.field", ...}
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          // Keys = alias names, Values = API field paths
          const keys = Object.values(parsed).map(String);
          const labels = {};
          for (const [alias, field] of Object.entries(parsed)) {
            labels[String(field)] = alias;
          }
          return { keys, labels };
        }
      } catch {
        // Fall through
      }
    }

    // JSON array: ["field1", "field2"]
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return { keys: parsed.map(String), labels: {} };
      } catch {
        // Fall through
      }
    }

    // Comma-separated: "field1,field2"
    return { keys: trimmed.split(',').map(s => s.trim()).filter(Boolean), labels: {} };
  }

  const config = loadResourceConfig(name);
  if (config?.get?.fields && Array.isArray(config.get.fields)) {
    return { keys: config.get.fields, labels: {} };
  }

  return undefined;
}

// ── Get params ───────────────────────────────────────────────────────────────

/**
 * Get the default query parameters for GET operations from a resource's
 * `get.params` config (e.g. `{ extdata: 1, tags: 1 }`). These are sent as URL
 * query parameters; explicit CLI flags override them on the caller's side.
 *
 * @param {string} name - canonical resource name
 * @returns {Record<string, number|string|boolean>} query parameters for the GET request
 */
export function getGetParams(name) {
  const config = loadResourceConfig(name);
  if (config?.get?.params && typeof config.get.params === 'object') {
    return { ...config.get.params };
  }
  return {};
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a --fields override string.
 * Supports: comma-separated, JSON object, JSON array.
 */
function _parseFieldsOverride(raw, fieldAliases = {}) {
  const trimmed = raw.trim();

  // JSON object: {"Alias": "path", ...}
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
        const apiFields = _toFieldAliasMap(obj, fieldAliases);
        return { apiFields, displayColumns: Object.keys(apiFields) };
      }
    } catch (e) {
      error(`--fields JSON is invalid: ${e.message}\n  Got: ${trimmed}\n  Expected format: '{"Alias": "field.path", ...}'`);
      process.exit(1);
    }
  }

  // JSON array: ["field1", "field2", ...]
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        const paths = arr.map(String);
        const apiFields = {};
        for (const p of paths) apiFields[p] = normalizeFieldAlias(p, fieldAliases);
        return { apiFields, displayColumns: paths };
      }
    } catch (e) {
      error(`--fields JSON is invalid: ${e.message}\n  Got: ${trimmed}\n  Expected format: '["field1", "field2", ...]'`);
      process.exit(1);
    }
  }

  // Comma-separated: "ID,name,status"
  const paths = trimmed.split(',').map(s => s.trim()).filter(Boolean);
  const apiFields = {};
  for (const p of paths) apiFields[p] = normalizeFieldAlias(p, fieldAliases);
  return { apiFields, displayColumns: paths };
}

/**
 * Normalize an alias-to-field-path object into the documented string map shape.
 *
 * @param {Record<string, JsonValue>} value
 * @returns {Record<string,string>}
 */
function _toFieldAliasMap(value, fieldAliases = {}) {
  const fields = {};
  for (const [alias, field] of Object.entries(value)) {
    fields[String(alias)] = normalizeFieldAlias(String(field), fieldAliases);
  }
  return fields;
}

function normalizeFieldAlias(field, fieldAliases = {}) {
  return fieldAliases[field] || field;
}

// ── Internals ────────────────────────────────────────────────────────────────

/**
 * Walk the config cascade for a resource name.
 * Returns the first matching config object, or null.
 *
 * @returns {ResourceFieldConfig|null}
 */
function _resolveConfig(name) {
  const filename = `${name}.json`;

  // 1. Project-local: walk up from CWD looking for .zeyos/api/<name>.json
  const localPath = _findLocalConfig(filename);
  if (localPath) return _readJson(localPath);

  // 2. Global user: ~/.zeyos/api/<name>.json
  const globalPath = join(GLOBAL_DIR, filename);
  if (existsSync(globalPath)) return _readJson(globalPath);

  // 3. Shipped defaults: cli/config/<name>.json
  const shippedPath = join(SHIPPED_DIR, filename);
  if (existsSync(shippedPath)) return _readJson(shippedPath);

  return null;
}

/**
 * Walk up from CWD looking for .zeyos/api/<filename>.
 * Returns the full path if found, null otherwise.
 */
function _findLocalConfig(filename) {
  let dir = process.cwd();
  for (let i = 0; i < 20; i++) {
    const candidate = join(dir, LOCAL_NAME, LOCAL_SUB, filename);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function _readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return null;
    }
    throw new Error(`Failed to read resource config ${path}: ${err.message || err}`);
  }
}
