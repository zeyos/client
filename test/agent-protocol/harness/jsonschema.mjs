/**
 * Minimal, zero-dependency JSON Schema validator (a pragmatic Draft-07 subset).
 *
 * `@zeyos/client` ships with no runtime dependencies and the test harness inherits
 * that constraint, so rather than pull in ajv we hand-roll just enough of JSON Schema
 * to (a) validate scenario files against `schema/scenario-v2.schema.json` and (b) back
 * the `verifyResult` structured-output checks where a scenario declares the JSON Schema
 * its answer must satisfy.
 *
 * Supported keywords: type, enum, const, properties, required, additionalProperties
 * (boolean or schema), patternProperties, items (schema or tuple), additionalItems,
 * minItems/maxItems, uniqueItems, minimum/maximum/exclusiveMinimum/exclusiveMaximum,
 * multipleOf, minLength/maxLength, pattern, format (date/date-time/email/uri — advisory),
 * allOf/anyOf/oneOf/not, and local `$ref` (`#/...` JSON pointers). Anything unrecognized
 * is treated permissively, which is the correct bias for a test helper: it never blocks a
 * legitimate answer over an unimplemented keyword, only over a rule we actually checked.
 */

const TYPE_CHECKS = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => typeof v === 'number' && Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  null: (v) => v === null
};

const FORMAT_CHECKS = {
  // Advisory only — a failed format is a soft signal, surfaced but not fatal unless the
  // scenario opts into strict formats. Kept simple and dependency-free.
  'date': (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
  'date-time': (v) => /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(v),
  'email': (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  'uri': (v) => /^[a-z][a-z0-9+.-]*:/i.test(v)
};

function resolveRef(ref, root) {
  if (typeof ref !== 'string' || !ref.startsWith('#')) return undefined;
  const pointer = ref.slice(1).replace(/^\//, '');
  if (pointer === '') return root;
  let cur = root;
  for (const rawSeg of pointer.split('/')) {
    const seg = rawSeg.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (a && b && typeof a === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

function validateNode(value, schema, root, pathStr, errors, opts) {
  if (schema === true || schema == null) return;
  if (schema === false) {
    errors.push(`${pathStr}: schema is false (no value allowed)`);
    return;
  }
  if (schema.$ref) {
    const target = resolveRef(schema.$ref, root);
    if (target === undefined) {
      errors.push(`${pathStr}: unresolved $ref ${schema.$ref}`);
      return;
    }
    validateNode(value, target, root, pathStr, errors, opts);
    return;
  }

  // type
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = types.some((t) => TYPE_CHECKS[t]?.(value));
    if (!ok) {
      errors.push(`${pathStr}: expected type ${types.join('|')}, got ${describe(value)}`);
      return; // a wrong type makes the remaining keyword checks noise
    }
  }

  if (schema.enum !== undefined && !schema.enum.some((e) => deepEqual(e, value))) {
    errors.push(`${pathStr}: ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
  }
  if ('const' in schema && !deepEqual(schema.const, value)) {
    errors.push(`${pathStr}: ${JSON.stringify(value)} !== const ${JSON.stringify(schema.const)}`);
  }

  if (typeof value === 'number') validateNumber(value, schema, pathStr, errors);
  if (typeof value === 'string') validateString(value, schema, pathStr, errors, opts);
  if (Array.isArray(value)) validateArray(value, schema, root, pathStr, errors, opts);
  if (TYPE_CHECKS.object(value)) validateObject(value, schema, root, pathStr, errors, opts);

  // combinators
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) validateNode(value, sub, root, pathStr, errors, opts);
  }
  if (Array.isArray(schema.anyOf)) {
    const ok = schema.anyOf.some((sub) => validateNode(value, sub, root, pathStr, [], opts) || collect(value, sub, root, opts).length === 0);
    if (!ok) errors.push(`${pathStr}: matched none of anyOf`);
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((sub) => collect(value, sub, root, opts).length === 0).length;
    if (matches !== 1) errors.push(`${pathStr}: matched ${matches} of oneOf (expected exactly 1)`);
  }
  if (schema.not !== undefined && collect(value, schema.not, root, opts).length === 0) {
    errors.push(`${pathStr}: matched "not" schema`);
  }
}

function validateNumber(value, schema, pathStr, errors) {
  if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${pathStr}: ${value} < minimum ${schema.minimum}`);
  if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${pathStr}: ${value} > maximum ${schema.maximum}`);
  if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) errors.push(`${pathStr}: ${value} <= exclusiveMinimum ${schema.exclusiveMinimum}`);
  if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) errors.push(`${pathStr}: ${value} >= exclusiveMaximum ${schema.exclusiveMaximum}`);
  if (typeof schema.multipleOf === 'number' && schema.multipleOf > 0) {
    const ratio = value / schema.multipleOf;
    if (Math.abs(ratio - Math.round(ratio)) > 1e-9) errors.push(`${pathStr}: ${value} not a multiple of ${schema.multipleOf}`);
  }
}

function validateString(value, schema, pathStr, errors, opts) {
  if (typeof schema.minLength === 'number' && value.length < schema.minLength) errors.push(`${pathStr}: string shorter than minLength ${schema.minLength}`);
  if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) errors.push(`${pathStr}: string longer than maxLength ${schema.maxLength}`);
  if (typeof schema.pattern === 'string') {
    let re;
    try { re = new RegExp(schema.pattern); } catch { re = null; }
    if (re && !re.test(value)) errors.push(`${pathStr}: string does not match pattern ${schema.pattern}`);
  }
  if (typeof schema.format === 'string' && FORMAT_CHECKS[schema.format] && !FORMAT_CHECKS[schema.format](value)) {
    if (opts?.strictFormat) errors.push(`${pathStr}: string is not a valid ${schema.format}`);
  }
}

function validateArray(value, schema, root, pathStr, errors, opts) {
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push(`${pathStr}: ${value.length} items < minItems ${schema.minItems}`);
  if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${pathStr}: ${value.length} items > maxItems ${schema.maxItems}`);
  if (schema.uniqueItems === true) {
    for (let i = 0; i < value.length; i += 1) {
      for (let j = i + 1; j < value.length; j += 1) {
        if (deepEqual(value[i], value[j])) { errors.push(`${pathStr}: duplicate items at [${i}] and [${j}]`); break; }
      }
    }
  }
  if (Array.isArray(schema.items)) {
    // tuple validation
    value.forEach((item, i) => {
      const sub = schema.items[i] ?? schema.additionalItems;
      if (sub !== undefined) validateNode(item, sub, root, `${pathStr}[${i}]`, errors, opts);
    });
  } else if (schema.items !== undefined) {
    value.forEach((item, i) => validateNode(item, schema.items, root, `${pathStr}[${i}]`, errors, opts));
  }
}

function validateObject(value, schema, root, pathStr, errors, opts) {
  for (const req of schema.required || []) {
    if (!(req in value)) errors.push(`${pathStr}: missing required property "${req}"`);
  }
  const props = schema.properties || {};
  const patternProps = schema.patternProperties || {};
  const patternEntries = Object.entries(patternProps).map(([p, s]) => [safeRegExp(p), s]).filter(([re]) => re);
  for (const [key, val] of Object.entries(value)) {
    // A property explicitly set to `undefined` is not representable in JSON and is treated
    // as absent (required-ness is checked via `in` above, so this only skips value checks).
    if (val === undefined) continue;
    const childPath = `${pathStr}.${key}`;
    let matched = false;
    if (key in props) { validateNode(val, props[key], root, childPath, errors, opts); matched = true; }
    for (const [re, sub] of patternEntries) {
      if (re.test(key)) { validateNode(val, sub, root, childPath, errors, opts); matched = true; }
    }
    if (!matched && schema.additionalProperties === false) {
      errors.push(`${childPath}: additional property not allowed`);
    } else if (!matched && schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      validateNode(val, schema.additionalProperties, root, childPath, errors, opts);
    }
  }
}

function safeRegExp(pattern) {
  try { return new RegExp(pattern); } catch { return null; }
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Collect errors without throwing — used by combinators to test sub-schemas. */
function collect(value, schema, root, opts) {
  const errors = [];
  validateNode(value, schema, root, '$', errors, opts || {});
  return errors;
}

/**
 * Validate `value` against `schema`.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSchema(value, schema, opts = {}) {
  const errors = [];
  validateNode(value, schema, schema, '$', errors, opts);
  return { valid: errors.length === 0, errors };
}

export { deepEqual };
