import { suggestClosest } from './suggest.js';
import { VALIDATION_CONTROL_KEYS } from './request-shape.js';

// Top-level body keys on list/count queries are query directives, not resource
// fields. Resource field names appear *inside* `filters`/`filter`/`fields`.
const QUERY_DIRECTIVES = new Set([
  'fields', 'filter', 'filters', 'sort', 'limit', 'offset', 'count',
  'query', 'distinct', 'expand', 'extdata', 'tags', 'group', 'having', 'visibility'
]);

// Request-level control keys consumed by the client, never resource fields.
const CONTROL_KEYS = new Set(VALIDATION_CONTROL_KEYS);

function resourceFromPath(path) {
  if (typeof path !== 'string') return null;
  for (const segment of path.split('/')) {
    if (segment && !segment.startsWith('{')) return segment;
  }
  return null;
}

// A field reference may be a dot-notation join (`contact.city`), an extended
// field (`extdata.region`) or an alias map value. Reduce it to the base column
// name on the primary resource so it can be checked against the schema.
function baseFieldName(ref) {
  if (typeof ref !== 'string') return null;
  const head = ref.split('.')[0].trim();
  return head || null;
}

/**
 * Build the read-only `client.schema` surface: runtime introspection of
 * resources, fields, enums and operations, plus best-effort input validation
 * that produces agent-friendly, self-correcting hints.
 */
export function createSchema({ services, schema }) {
  const schemaMap = schema && typeof schema === 'object' ? schema : {};
  const resourceNames = Object.keys(schemaMap);

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
    const entry = schemaMap[resource];
    if (!entry) return null;
    return { name: resource, type: entry.type, fields: entry.fields };
  }

  function fields(resource) {
    const entry = schemaMap[resource];
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

  function checkField(resourceFields, fieldDefs, ref, value, errors) {
    const base = baseFieldName(ref);
    if (!base) return;
    // Dot-notation joins and extended/custom fields can't be validated against
    // the base table — accept them rather than emit false positives.
    if (base === 'extdata' || base !== ref) return;
    if (!resourceFields.includes(base)) {
      const suggestion = suggestClosest(base, resourceFields);
      errors.push({
        field: base,
        message: `Unknown field "${base}".` + (suggestion ? ` Did you mean "${suggestion}"?` : ''),
        ...(suggestion ? { suggestion } : {})
      });
      return;
    }
    const def = fieldDefs[base];
    if (def && def.enum && (typeof value === 'string' || typeof value === 'number')) {
      if (!Object.prototype.hasOwnProperty.call(def.enum, String(value))) {
        const valid = Object.entries(def.enum).map(([k, v]) => `${k}=${v}`).join(', ');
        errors.push({
          field: base,
          message: `Invalid value ${JSON.stringify(value)} for "${base}". Valid: ${valid}.`
        });
      }
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

    const data = input && typeof input === 'object' ? input : {};
    const resourceEntry = schemaMap[entry.resource];
    const resourceFields = resourceEntry ? Object.keys(resourceEntry.fields) : null;
    const fieldDefs = resourceEntry ? resourceEntry.fields : {};
    const isListLike = /^(list|count)/.test(operationId);

    if (isListLike && Object.prototype.hasOwnProperty.call(data, 'filter')) {
      errors.push({
        field: 'filter',
        message: 'Use "filters" (plural) rather than "filter" — it also matches GIN-indexed foreign-key fields (project, account, ticket).',
        suggestion: 'filters'
      });
    }

    if (!resourceFields) {
      return { valid: errors.length === 0, errors };
    }

    if (isListLike) {
      for (const key of ['filters', 'filter']) {
        const filterObj = data[key];
        if (filterObj && typeof filterObj === 'object' && !Array.isArray(filterObj)) {
          for (const [field, value] of Object.entries(filterObj)) {
            checkField(resourceFields, fieldDefs, field, value, errors);
          }
        }
      }
      const sel = data.fields;
      const selValues = Array.isArray(sel) ? sel : (sel && typeof sel === 'object' ? Object.values(sel) : []);
      for (const ref of selValues) checkField(resourceFields, fieldDefs, ref, undefined, errors);
    } else {
      for (const [key, value] of Object.entries(data)) {
        if (CONTROL_KEYS.has(key) || QUERY_DIRECTIVES.has(key)) continue;
        if (entry.operation.parameterNames?.path?.includes(key)) continue;
        if (entry.operation.parameterNames?.query?.includes(key)) continue;
        if (entry.operation.parameterNames?.header?.includes(key)) continue;
        checkField(resourceFields, fieldDefs, key, value, errors);
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
