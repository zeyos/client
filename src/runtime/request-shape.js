/**
 * Request-level keys accepted by generated methods and `client.request()`.
 * These are control fields consumed by the client, not resource payload fields.
 */
export const REQUEST_CONTROL_KEYS = Object.freeze([
  'path',
  'query',
  'headers',
  'body',
  'data',
  'auth',
  'bodyType',
  'signal',
  'raw',
  'baseUrl'
]);

/**
 * Validation accepts request options as a second argument, so `validate` is only
 * a field-validation control key, not a request payload control key.
 */
export const VALIDATION_CONTROL_KEYS = Object.freeze([
  ...REQUEST_CONTROL_KEYS,
  'validate'
]);

/**
 * Control keys that act as containers only when object-valued. A scalar `query`
 * can be a legitimate ZeyOS payload field for full-text search.
 */
export const OBJECT_CONTROL_KEYS = Object.freeze([
  'path',
  'query',
  'headers'
]);
