// Validates the *real* scenario catalog on disk: every file loads, normalizes and passes
// schema-v2 validation (v1 files via the compatibility path), with no duplicate ids and a
// catalog at least as large as the spec target. This is the load-time gate from §8.1,
// exercised offline so a malformed scenario fails `npm test`, not a live run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeScenario, validateScenarioSet } from './scenario-schema.mjs';
import { knownOperationIds } from './route-map.mjs';

const SCEN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scenarios');

function loadRaw(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) loadRaw(abs, base, out);
    else if (entry.name.endsWith('.json')) {
      const raw = JSON.parse(readFileSync(abs, 'utf8'));
      raw._rel = path.relative(base, abs).replace(/\\/g, '/').replace(/\.json$/, '');
      out.push(raw);
    }
  }
  return out;
}

function loadAll(dir) {
  return loadRaw(dir).map((raw) => normalizeScenario(raw));
}

test('the on-disk scenario catalog validates with zero errors', () => {
  // Validate the on-disk (raw) shape — that is what schema-v2 describes.
  const res = validateScenarioSet(loadRaw(SCEN_DIR), { knownOps: knownOperationIds() });
  assert.deepEqual(res.errors, [], `scenario validation errors:\n${res.errors.join('\n')}`);
});

test('scenario ids are unique and the catalog meets the expansion target', () => {
  const scenarios = loadAll(SCEN_DIR);
  const ids = scenarios.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate scenario ids');
  // The spec target: max(69, 2 × baseline 29 + 5) = 69.
  assert.ok(scenarios.length >= 69, `expected >= 69 scenarios, found ${scenarios.length}`);
});

test('every layer-a id starts with "a" and layer-b with "b"', () => {
  for (const s of loadAll(SCEN_DIR)) {
    if (s._rel.startsWith('layer-a/')) assert.equal(s.layer, 'a', `${s.id} in layer-a but layer=${s.layer}`);
    if (s._rel.startsWith('layer-b/')) assert.equal(s.layer, 'b', `${s.id} in layer-b but layer=${s.layer}`);
  }
});
