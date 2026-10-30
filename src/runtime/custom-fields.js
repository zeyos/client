import { suggestClosest } from './suggest.js';

const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array']);
const DEFINITION_KEYS = new Set(['type', 'enum', 'description']);
const EQUALITY = new Set(['=', '!=', '<>']);
const ORDERING = new Set(['<', '<=', '>', '>=']);
const MEMBERSHIP = new Set(['IN', '!IN']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isRecord = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isEnumValue = (value) => value === null || typeof value === 'string'
  || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));

function isJsonValue(value, ancestors = new Set()) {
  if (isEnumValue(value)) return true;
  if ((!Array.isArray(value) && !isRecord(value)) || ancestors.has(value) || ancestors.size >= 64) return false;
  ancestors.add(value);
  // Array.from also visits holes; silently converting them to null would change
  // the value being validated. Undefined object properties are likewise invalid.
  const children = Array.isArray(value) ? Array.from(value) : Object.values(value);
  const valid = children.every((child) => isJsonValue(child, ancestors));
  ancestors.delete(value);
  return valid;
}

function matchesType(value, type) {
  switch (type) {
    case 'integer': return Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'array': return Array.isArray(value);
    case 'object': return isRecord(value);
    default: return typeof value === type;
  }
}

/**
 * Compile an explicitly supplied tenant contract. This is not an interpretation
 * of customfields.type: those values describe presentation, not JSON wire types.
 * A resource map is a complete allowlist for that resource. An absent map means
 * metadata is unavailable; an empty map means no custom keys are authorized.
 */
export function createCustomFieldValidator(customFields) {
  if (customFields !== undefined && !isRecord(customFields)) {
    throw new TypeError('customFields must be an object mapping resources to custom-field definitions.');
  }
  const resources = Object.create(null);
  for (const [resource, definitions] of Object.entries(customFields ?? {})) {
    if (!resource || !isRecord(definitions)) {
      throw new TypeError('Each customFields resource must map to an object of field definitions.');
    }
    const fields = Object.create(null);
    for (const [name, definition] of Object.entries(definitions)) {
      if (!name || !isRecord(definition)) {
        throw new TypeError(`Each custom field in "${resource}" must have a nonempty key and an object definition.`);
      }
      if (Object.keys(definition).some((key) => !DEFINITION_KEYS.has(key))) {
        throw new TypeError(`Unsupported custom-field constraint in "${resource}.${name}"; use type, enum, or description.`);
      }
      if (own(definition, 'type') && !TYPES.has(definition.type)) {
        throw new TypeError(`Unsupported JSON type for custom field "${resource}.${name}".`);
      }
      if (own(definition, 'description') && typeof definition.description !== 'string') {
        throw new TypeError(`Description for custom field "${resource}.${name}" must be a string.`);
      }
      if (own(definition, 'enum') && (!Array.isArray(definition.enum) || !Array.from(definition.enum).every(isEnumValue))) {
        throw new TypeError(`Enum for custom field "${resource}.${name}" must be an array of finite JSON scalar values.`);
      }
      if (definition.type && definition.enum?.some((value) => value !== null && !matchesType(value, definition.type))) {
        throw new TypeError(`Enum values for custom field "${resource}.${name}" must match its JSON type.`);
      }
      fields[name] = Object.freeze({
        ...definition,
        ...(definition.enum ? { enum: Object.freeze([...definition.enum]) } : {}),
      });
    }
    resources[resource] = Object.freeze(fields);
  }
  Object.freeze(resources);

  function checkValue(definition, value, field, errors, checkEnum = true) {
    // The API documents null as deletion on PUT/PATCH. In filters it is also a
    // useful missing-value test, even for a field normally holding a typed value.
    if (value === null) return;
    if (!isJsonValue(value)) {
      errors.push({
        code: 'invalid_custom_field_value',
        field,
        message: `Invalid JSON value for "${field}"; use finite scalar values, arrays, or plain objects without cycles and fewer than 64 nested containers.`,
      });
      return;
    }
    if (definition.type && !matchesType(value, definition.type)) {
      errors.push({
        code: 'invalid_custom_field_type',
        field,
        message: `Invalid value for "${field}": expected ${definition.type}.`,
      });
      return;
    }
    if (checkEnum && definition.enum && !definition.enum.some((allowed) => Object.is(allowed, value))) {
      errors.push({
        code: 'invalid_custom_field_enum',
        field,
        message: `Invalid value for "${field}": not a member of its configured enum.`,
      });
    }
  }

  function checkFilterValue(definition, value, field, errors) {
    if (Array.isArray(value)) {
      for (const candidate of value) checkValue(definition, candidate, field, errors);
    } else if (isRecord(value)) {
      // Only operand forms whose semantics are known here are type checked.
      // Pattern operands are not members of a field's enum. Operator grammar is
      // a separate API contract; this checker does not claim to validate it.
      for (const [operator, operand] of Object.entries(value)) {
        if (EQUALITY.has(operator)) checkValue(definition, operand, field, errors);
        else if (ORDERING.has(operator)) checkValue(definition, operand, field, errors, false);
        else if (MEMBERSHIP.has(operator)) {
          if (!Array.isArray(operand)) {
            errors.push({
              code: 'invalid_custom_field_filter',
              field,
              message: `The ${operator} operand for "${field}" must be an array.`,
            });
          } else {
            for (const candidate of operand) checkValue(definition, candidate, field, errors);
          }
        }
      }
    } else {
      checkValue(definition, value, field, errors);
    }
  }

  function resolve(resource, suffix, fullRef, errors, value, { write = false } = {}) {
    if (!own(resources, resource)) {
      errors.push({
        code: 'custom_fields_unavailable',
        field: fullRef,
        message: `Cannot validate "${fullRef}": custom-field metadata for "${resource}" is unavailable. Supply customFields.${resource} from the target instance's reviewed field contract.`,
      });
      return null;
    }
    const fields = resources[resource];
    if (!own(fields, suffix)) {
      const suggestion = suggestClosest(suffix, Object.keys(fields));
      errors.push({
        code: 'unknown_custom_field',
        field: fullRef,
        message: `Unknown custom field "${fullRef}" on "${resource}".` + (suggestion ? ` Did you mean "${suggestion}"?` : ''),
        ...(suggestion ? { suggestion } : {}),
      });
      return null;
    }
    const definition = fields[suffix];
    if (value !== undefined) {
      if (write) checkValue(definition, value, fullRef, errors);
      else checkFilterValue(definition, value, fullRef, errors);
    }
    return definition;
  }

  function validatePayload(resource, value, errors) {
    if (!isRecord(value)) {
      errors.push({
        code: 'invalid_custom_fields_payload',
        field: 'extdata',
        message: 'extdata must be an object of custom-field values; set an individual field to null to remove it.',
      });
      return;
    }
    for (const [name, fieldValue] of Object.entries(value)) {
      if (fieldValue === undefined) {
        errors.push({
          code: 'invalid_custom_field_value',
          field: `extdata.${name}`,
          message: `Undefined is not a JSON value for "extdata.${name}"; omit the key or use null to remove it.`,
        });
        continue;
      }
      resolve(resource, name, `extdata.${name}`, errors, fieldValue, { write: true });
    }
  }

  function describe(resource) {
    if (!own(resources, resource)) return null;
    return Object.fromEntries(Object.entries(resources[resource]).map(([name, definition]) => [
      name,
      { ...definition, ...(definition.enum ? { enum: [...definition.enum] } : {}) },
    ]));
  }

  return Object.freeze({ resolve, validatePayload, describe });
}
