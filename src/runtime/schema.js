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

// A field reference may be a dot-notation join (`contact.city`), an extended
// field (`extdata.region`) or an alias map value. Reduce it to the base column
// name on the primary resource so it can be checked against the schema.
function baseFieldName(ref) {
  if (typeof ref !== 'string') return null;
  const head = ref.split('.')[0].trim();
  return head || null;
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
    // Extended/custom fields cannot be validated against the base table.
    // Dot-notation joins are validated against their head field only.
    if (base === 'extdata') return;
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
    if (def && def.enum) {
      // Check the operands too, not just a bare scalar: `{"status": [999]}` and
      // `{"status": {"IN": [999]}}` are the shapes the CLI actively encourages,
      // and letting them through means the caller gets an opaque server error or
      // a misleading empty result instead of the valid-value list.
      for (const candidate of enumCandidates(value)) {
        if (!Object.prototype.hasOwnProperty.call(def.enum, String(candidate))) {
          const valid = Object.entries(def.enum).map(([k, v]) => `${k}=${v}`).join(', ');
          errors.push({
            field: base,
            message: `Invalid value ${JSON.stringify(candidate)} for "${base}". Valid: ${valid}.`
          });
        }
      }
    }
  }

  /** Enum-checkable operands inside a filter value (scalar, array, or operator object). */
  function enumCandidates(value) {
    if (typeof value === 'string' || typeof value === 'number') return [value];
    if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' || typeof v === 'number');
    if (value && typeof value === 'object') {
      // Only equality-shaped operators constrain to an exact enum member;
      // ranges like `{">": 2}` legitimately reference non-members.
      const out = [];
      for (const [op, operand] of Object.entries(value)) {
        if (op !== '=' && op !== '!=' && op !== '<>' && op !== 'IN' && op !== '!IN') continue;
        out.push(...enumCandidates(operand));
      }
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
  function checkFilterObject(resourceFields, fieldDefs, filterObj, errors) {
    for (const [field, value] of Object.entries(filterObj)) {
      if (/^\d+$/.test(field) && Array.isArray(value)) {
        for (const member of value.slice(1)) {
          if (member && typeof member === 'object' && !Array.isArray(member)) {
            checkFilterObject(resourceFields, fieldDefs, member, errors);
          }
        }
        continue;
      }
      checkField(resourceFields, fieldDefs, field, value, errors);
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
          checkFilterObject(resourceFields, fieldDefs, filterObj, errors);
        }
      }
      const sel = data.fields;
      const selValues = Array.isArray(sel) ? sel : (sel && typeof sel === 'object' ? Object.values(sel) : []);
      for (const ref of selValues) checkField(resourceFields, fieldDefs, ref, undefined, errors);
      const sort = data.sort;
      const sortValues = Array.isArray(sort) ? sort : (typeof sort === 'string' ? sort.split(',') : []);
      for (const ref of sortValues) checkField(resourceFields, fieldDefs, sortFieldName(ref), undefined, errors);
    } else {
      const payload = data.body && typeof data.body === 'object' && !Array.isArray(data.body)
        ? data.body
        : (data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data : data);
      for (const [key, value] of Object.entries(payload)) {
        if (CONTROL_KEYS.has(key) || QUERY_DIRECTIVES.has(key)) continue;
        if (entry.operation.parameterNames?.path?.includes(key)) continue;
        if (entry.operation.parameterNames?.query?.includes(key)) continue;
        if (entry.operation.parameterNames?.header?.includes(key)) continue;
        checkField(resourceFields, fieldDefs, key, value, errors);
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
