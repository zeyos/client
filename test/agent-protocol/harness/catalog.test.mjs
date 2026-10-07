// Validates the *real* scenario catalog on disk: every file loads, normalizes and passes
// schema-v2 validation (v1 files via the compatibility path), with no duplicate ids and a
// catalog at least as large as the spec target. This is the load-time gate from §8.1,
// exercised offline so a malformed scenario fails `npm test`, not a live run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeScenario, validateScenarioSet } from './scenario-schema.mjs';
import { knownOperationIds } from './route-map.mjs';
import { validateCatalogReferences } from './catalog-references.mjs';

const SCEN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scenarios');
const ROOT = path.resolve(SCEN_DIR, '../../..');
const REFERENCE_ROOTS = { skillRoot: path.join(ROOT, 'agents'), okfRoot: path.join(ROOT, 'okf') };

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

test('every scenario knowledge and coverage reference resolves', () => {
  const result = validateCatalogReferences(loadRaw(SCEN_DIR), REFERENCE_ROOTS);
  assert.deepEqual(result.errors, [], result.errors.join('\n'));
});

test('dangling or escaping catalog references fail validation', () => {
  const broken = {
    id: 'broken-references',
    knowledge: { primarySkill: 'missing-skill', allowedSkills: ['../README'], okfConcepts: ['concepts/missing', '../README'] },
    coverage: { entities: ['missing_entity'], operations: ['listMissing'], formats: ['invalid-format'], rules: ['R-999'] }
  };
  const result = validateCatalogReferences([broken], REFERENCE_ROOTS);
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 8);
});

test('catalog references may link inside their root but cannot escape through symlinks', (t) => {
  const temp = mkdtempSync(path.join(tmpdir(), 'zeyos-catalog-references-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const skillRoot = path.join(temp, 'skills');
  const okfRoot = path.join(temp, 'okf');
  const outside = path.join(temp, 'outside');
  mkdirSync(path.join(skillRoot, 'shared'), { recursive: true });
  mkdirSync(path.join(skillRoot, 'real-skill'), { recursive: true });
  mkdirSync(path.join(okfRoot, 'concepts'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(path.join(skillRoot, 'shared', 'zeyos-agent-operating-guide.md'), '**R-022 Output contract.**\n');
  writeFileSync(path.join(skillRoot, 'real-skill', 'SKILL.md'), '# Skill\n');
  writeFileSync(path.join(okfRoot, 'concepts', 'real.md'), '# Concept\n');
  writeFileSync(path.join(outside, 'SKILL.md'), '# Outside skill\n');
  writeFileSync(path.join(outside, 'concept.md'), '# Outside concept\n');
  symlinkSync('real-skill', path.join(skillRoot, 'linked-skill'), 'dir');
  symlinkSync('real.md', path.join(okfRoot, 'concepts', 'linked.md'));
  symlinkSync(outside, path.join(skillRoot, 'outside-skill'), 'dir');
  symlinkSync(path.join(outside, 'concept.md'), path.join(okfRoot, 'concepts', 'outside.md'));
  const roots = { skillRoot, okfRoot };
  const inside = { id: 'inside', knowledge: { primarySkill: 'linked-skill', okfConcepts: ['concepts/linked'] }, coverage: { rules: ['R-022'] } };
  assert.deepEqual(validateCatalogReferences([inside], roots).errors, []);
  const escape = { id: 'escape', knowledge: { primarySkill: 'outside-skill', okfConcepts: ['concepts/outside'] } };
  assert.deepEqual(validateCatalogReferences([escape], roots).errors, ['escape: missing skill outside-skill', 'escape: missing OKF reference concepts/outside']);
  const externalGuideRoot = path.join(temp, 'skills-external-guide');
  mkdirSync(externalGuideRoot);
  writeFileSync(path.join(outside, 'zeyos-agent-operating-guide.md'), '**R-022 Output contract.**\n');
  symlinkSync(outside, path.join(externalGuideRoot, 'shared'), 'dir');
  assert.deepEqual(validateCatalogReferences([], { skillRoot: externalGuideRoot, okfRoot }).errors, ['Missing shared operating guide for coverage rule references.']);
});
