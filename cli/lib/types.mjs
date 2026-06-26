/**
 * Shared JSDoc-only shapes for the CLI resource registry and field config.
 * This file intentionally has no runtime exports beyond being an ESM module.
 */

/**
 * @typedef {null|boolean|number|string|JsonValue[]|Record<string, JsonValue>} JsonValue
 * @typedef {Record<string, JsonValue>} JsonObject
 * @typedef {JsonObject} CliConfig
 * @typedef {(value: JsonValue, row: JsonObject) => string|number|boolean|null|undefined} ValueFormatter
 */

/**
 * @typedef {{
 *   list: string,
 *   get: string,
 *   create?: string,
 *   update?: string,
 *   delete?: string,
 *   fields: string[],
 *   idField?: string,
 *   fieldAliases?: Record<string,string>,
 *   filterAliases?: Record<string,string>
 * }} ResourceDef
 */

/**
 * @typedef {{
 *   apiFields: Record<string,string>|undefined,
 *   displayColumns: string[]
 * }} ListFieldSelection
 */

/**
 * @typedef {{
 *   keys: string[],
 *   labels: Record<string,string>
 * }} GetFieldSelection
 */

/**
 * @typedef {{
 *   list?: { fields?: Record<string,string> },
 *   get?: { fields?: string[], params?: Record<string, number|string|boolean> }
 * }} ResourceFieldConfig
 */

export {};
