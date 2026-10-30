import { suggestClosest } from './suggest.js';
import { VALIDATION_CONTROL_KEYS } from './request-shape.js';
import { createCustomFieldValidator } from './custom-fields.js';

// Top-level body keys on list/count queries are query directives, not resource
// fields. Resource field names appear *inside* `filters`/`filter`/`fields`.
const QUERY_DIRECTIVES = new Set([
  'fields', 'filter', 'filters', 'sort', 'limit', 'offset', 'count',
  'query', 'distinct', 'expand', 'extdata', 'tags', 'group', 'having', 'visibility'
]);

// Request-level control keys consumed by the client, never resource fields.
const CONTROL_KEYS = new Set(VALIDATION_CONTROL_KEYS);

// The ZeyOS OpenAPI spec carries NO required-field metadata — every schema's
// `required` array is empty — yet some columns are NOT NULL with no DB default, so
// a create that omits them fails server-side with an opaque HTTP 500 (a raw pg
// constraint error). This curated map supplements the spec with confirmed-required
// create fields so validate() can surface a clean, self-correcting hint instead.
// Keyed by schema resource name; extend as other NOT-NULL-without-default columns
// are confirmed.
const REQUIRED_CREATE_FIELDS = {
  accounts: ['currency']
};

function resourceFromPath(path) {
  if (typeof path !== 'string') return null;
  for (const segment of path.split('/')) {
    if (segment && !segment.startsWith('{')) return segment;
  }
  return null;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function sortFieldName(ref) {
  if (typeof ref !== 'string') return null;
  return ref.trim().replace(/^[+-]/, '').replace(/:(?:asc|desc)$/i, '');
}

/**
 * Build the read-only `client.schema` surface: runtime introspection of
 * resources, fields, enums and operations, plus best-effort input validation
 * that produces agent-friendly, self-correcting hints.
 */
export function createSchema({ services, schema, customFields }) {
  const schemaMap = schema && typeof schema === 'object' ? schema : {};
  const resourceNames = Object.keys(schemaMap);
  const customFieldValidator = createCustomFieldValidator(customFields);
  const resourceEntry = (resource) => Object.prototype.hasOwnProperty.call(schemaMap, resource)
    ? schemaMap[resource]
    : null;

  const opIndex = new Map();
  const allOperationIds = [];
  for (const [serviceKey, service] of Object.entries(services || {})) {
    for (const operation of service.operations || []) {
      allOperationIds.push(operation.operationId);
      opIndex.set(operation.operationId, {
        service: serviceKey,
        operation,
        resource: resourceFromPath(operation.path)
      });
    }
  }

  function resources() {
    return resourceNames.slice();
  }

  function describe(resource) {
    const entry = resourceEntry(resource);
    if (!entry) return null;
    const fieldDefinitions = Object.fromEntries(Object.entries(entry.fields).map(([name, definition]) => [
      name, { ...definition, ...(definition.enum ? { enum: { ...definition.enum } } : {}) },
    ]));
    return { name: resource, type: entry.type, fields: fieldDefinitions, customFields: customFieldValidator.describe(resource) };
  }

  function fields(resource) {
    const entry = resourceEntry(resource);
    return entry ? Object.keys(entry.fields) : [];
  }

  function operationIds() {
    return allOperationIds.slice();
  }

  function operations(resource) {
    if (resource == null) return allOperationIds.slice();
    return allOperationIds.filter((id) => opIndex.get(id)?.resource === resource);
  }

  function resourceForOperation(operationId) {
    return opIndex.get(operationId)?.resource ?? null;
  }

  function suggestOperation(name) {
    return suggestClosest(name, allOperationIds);
  }

  function checkField(resource, ref, value, errors, { write = false } = {}) {
    if (typeof ref !== 'string' || !ref) {
      errors.push({ field: typeof ref === 'string' ? ref : 'fields', code: 'invalid_field_reference',
        message: 'Field references must be nonempty strings.' });
      return;
    }
    const parts = ref.split('.');
    if (write && parts.length > 1) {
      errors.push({ field: ref, code: 'invalid_write_field',
        message: `Joined field "${ref}" is a query reference, not a writable field. Update the related resource explicitly; put custom values inside extdata.` });
      return;
    }

    let currentResource = resource;
    let def;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (!part || part !== part.trim()) {
        errors.push({ field: ref, code: 'invalid_field_reference', message: `Invalid field path "${ref}".` });
        return;
      }
      const currentFields = resourceEntry(currentResource)?.fields;
      if (!currentFields) {
        errors.push({ field: ref, code: 'schema_unavailable',
          message: `Cannot validate "${ref}": schema metadata for "${currentResource}" is unavailable.` });
        return;
      }
      if (part === 'extdata') {
        customFieldValidator.resolve(currentResource, parts.slice(index + 1).join('.'), ref, errors, value, { write });
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(currentFields, part)) {
        const closest = suggestClosest(part, Object.keys(currentFields));
        const suggestion = closest ? [...parts.slice(0, index), closest, ...parts.slice(index + 1)].join('.') : null;
        errors.push({ field: ref, code: 'unknown_field', resource: currentResource,
          message: `Unknown field "${ref}" on "${currentResource}".` + (suggestion ? ` Did you mean "${suggestion}"?` : ''),
          ...(suggestion ? { suggestion } : {}) });
        return;
      }
      def = currentFields[part];
      if (index < parts.length - 1) {
        if (typeof def.fk !== 'string' || !def.fk) {
          errors.push({ field: ref, code: 'invalid_relationship', resource: currentResource,
            message: `Cannot traverse "${parts.slice(0, index + 1).join('.')}": "${currentResource}.${part}" has no documented relationship.` });
          return;
        }
        currentResource = def.fk;
      }
    }
    if (def && def.enum) {
      if (write && value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
        errors.push({ field: ref, code: 'invalid_enum', message: `"${ref}" requires a single enum value when writing; filter operators and arrays are query-only.` });
        return;
      }
      // Check the operands too, not just a bare scalar: `{"status": [999]}` and
      // `{"status": {"IN": [999]}}` are the shapes the CLI actively encourages,
      // and letting them through means the caller gets an opaque server error or
      // a misleading empty result instead of the valid-value list.
      for (const candidate of write && value !== null ? [value] : enumCandidates(value, ref, errors)) {
        if (!Object.prototype.hasOwnProperty.call(def.enum, String(candidate))) {
          const valid = Object.entries(def.enum).map(([k, v]) => `${k}=${v}`).join(', ');
          errors.push({
            field: ref,
            code: 'invalid_enum',
            message: `Invalid value ${JSON.stringify(candidate)} for "${ref}". Valid: ${valid}.`
          });
        }
      }
    }
  }

  /** Enum-checkable operands inside a filter value (scalar, array, or operator object). */
  function enumCandidates(value, field, errors, ancestors = new Set()) {
    if (['string', 'number', 'boolean'].includes(typeof value)) return [value];
    if (Array.isArray(value)) return value.filter((v) => ['string', 'number', 'boolean'].includes(typeof v));
    if (value && typeof value === 'object') {
      if (ancestors.has(value) || ancestors.size >= 64) {
        errors.push({ field, code: 'invalid_filters', message: `Invalid enum filter for "${field}": operands must not be circular or exceed 64 nested objects.` });
        return [];
      }
      ancestors.add(value);
      // Only equality-shaped operators constrain to an exact enum member;
      // ranges like `{">": 2}` legitimately reference non-members.
      const out = [];
      for (const [op, operand] of Object.entries(value)) {
        if (op !== '=' && op !== '!=' && op !== '<>' && op !== 'IN' && op !== '!IN') continue;
        out.push(...enumCandidates(operand, field, errors, ancestors));
      }
      ancestors.delete(value);
      return out;
    }
    return [];
  }

  /**
   * Validate every field reference in a filter object.
   *
   * Composite filters use numbered keys holding a logical group —
   * `{"0": ["OR", {...}, {...}]}` — so a numeric key is a group to recurse into,
   * not a column name. Without this, a translated `$or` fails validation with
   * `Unknown field "0"`.
   */
  function checkFilterObject(resource, filterObj, errors, ancestors = new Set()) {
    if (!isObject(filterObj) || ancestors.has(filterObj) || ancestors.size >= 64) {
      errors.push({ field: 'filters', code: 'invalid_filters', message: 'Filters must be a non-circular object of field conditions with fewer than 64 nested groups.' });
      return;
    }
    ancestors.add(filterObj);
    for (const [field, value] of Object.entries(filterObj)) {
      if (value === undefined) {
        errors.push({ field, code: 'invalid_filters', message: `Filter "${field}" has an undefined value and would disappear during JSON serialization. Omit the condition explicitly or provide a JSON value.` });
        continue;
      }
      if (/^\d+$/.test(field) && Array.isArray(value)) {
        if (!['AND', 'OR', 'NOT'].includes(value[0]) || value.length < 2) {
          errors.push({ field: 'filters', code: 'invalid_filters', message: `Invalid logical filter group "${field}".` });
          continue;
        }
        for (const member of value.slice(1)) {
          checkFilterObject(resource, member, errors, ancestors);
        }
        continue;
      }
      checkField(resource, field, value, errors);
    }
    ancestors.delete(filterObj);
  }

  function checkQuery(resource, data, errors) {
    if (Object.prototype.hasOwnProperty.call(data, 'filter')) {
      errors.push({ field: 'filter',
        message: 'Use "filters" (plural) rather than "filter" — it also matches GIN-indexed foreign-key fields (project, account, ticket).',
        suggestion: 'filters' });
    }
    for (const key of ['filters', 'filter']) {
      if (data[key] !== undefined) checkFilterObject(resource, data[key], errors);
    }
    if (data.fields !== undefined) {
      if (!Array.isArray(data.fields) && !isObject(data.fields)) {
        errors.push({ field: 'fields', code: 'invalid_fields', message: 'fields must be an array of references or an object mapping aliases to references.' });
      } else {
        const selections = Array.isArray(data.fields) ? data.fields : Object.values(data.fields);
        for (const ref of selections) checkField(resource, ref, undefined, errors);
      }
    }
    if (data.sort !== undefined) {
      const sortValues = Array.isArray(data.sort) ? data.sort : (typeof data.sort === 'string' ? data.sort.split(',') : null);
      if (sortValues === null) {
        errors.push({ field: 'sort', code: 'invalid_sort', message: 'sort must be a string or array of field references.' });
      } else {
        for (const ref of sortValues) checkField(resource, sortFieldName(ref), undefined, errors);
      }
    }
    // These are not documented query directives in the bundled API contract.
    // Do not silently claim to have validated expressions or aliases in them.
    for (const key of ['group', 'having']) {
      if (data[key] !== undefined) errors.push({ field: key, code: 'unsupported_validation',
        message: `Validation of "${key}" is not supported by the bundled API contract.` });
    }
  }

  /**
   * Validate an operation call without sending it. Never throws.
   * @returns {{ valid: boolean, errors: { field?: string, message: string, suggestion?: string }[] }}
   */
  function validate(operationId, input) {
    const errors = [];
    const entry = opIndex.get(operationId);
    if (!entry) {
      const suggestion = suggestOperation(operationId);
      errors.push({
        message: `Unknown operation "${operationId}".` + (suggestion ? ` Did you mean "${suggestion}"?` : ''),
        ...(suggestion ? { suggestion } : {})
      });
      return { valid: false, errors };
    }

    const data = isObject(input) ? input : {};
    const fieldsForResource = resourceEntry(entry.resource)?.fields;
    const isListLike = /^(list|count)/.test(operationId);
    if (!fieldsForResource) {
      return { valid: errors.length === 0, errors };
    }
    const hasBody = Object.prototype.hasOwnProperty.call(data, 'body');
    const hasData = Object.prototype.hasOwnProperty.call(data, 'data');
    const payload = hasBody ? data.body : hasData ? data.data : data;
    if (!isObject(payload)) {
      errors.push({ field: hasBody ? 'body' : 'data', code: 'invalid_payload',
        message: 'Schema validation requires an object payload.' });
      return { valid: false, errors };
    }
    if (isListLike) {
      checkQuery(entry.resource, payload, errors);
    } else {
      const readOnly = ['GET', 'HEAD'].includes(entry.operation.method);
      if (readOnly) {
        checkQuery(entry.resource, payload, errors);
        if (isObject(data.query)) checkQuery(entry.resource, data.query, errors);
      }
      for (const [key, value] of Object.entries(payload)) {
        if (key === 'extdata' && !readOnly) {
          customFieldValidator.validatePayload(entry.resource, value, errors);
          continue;
        }
        if (CONTROL_KEYS.has(key) || QUERY_DIRECTIVES.has(key)) continue;
        if (entry.operation.parameterNames?.path?.includes(key)) continue;
        if (entry.operation.parameterNames?.query?.includes(key)) continue;
        if (entry.operation.parameterNames?.header?.includes(key)) continue;
        checkField(entry.resource, key, value, errors, { write: !readOnly });
      }
      // Create-only required-field check. The spec marks nothing required, so this
      // uses the curated REQUIRED_CREATE_FIELDS supplement. Updates are partial by
      // nature, so the check applies to `create*` operations only.
      if (/^create/i.test(operationId)) {
        for (const field of REQUIRED_CREATE_FIELDS[entry.resource] || []) {
          if (!Object.prototype.hasOwnProperty.call(payload, field) || payload[field] == null) {
            errors.push({
              field,
              message: `Missing required field "${field}" for ${entry.resource} — it is NOT NULL with no default, so the API rejects a create without it.`,
              suggestion: field
            });
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  return Object.freeze({
    resources,
    describe,
    fields,
    operations,
    operationIds,
    resourceForOperation,
    suggestOperation,
    validate
  });
}
