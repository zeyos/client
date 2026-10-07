// Validate scenario references against the actual shipped knowledge and API surface.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { SCHEMA } from '../../../src/generated/schema.js';
import { knownOperationIds } from './route-map.mjs';
import { RESULT_FORMATS } from './result.mjs';

function isContainedFile(root, file) {
  try {
    const realFile = realpathSync(file);
    const relative = path.relative(realpathSync(root), realFile);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
    return statSync(realFile).isFile();
  } catch { return false; }
}

export function validateCatalogReferences(scenarios, { skillRoot, okfRoot }) {
  const errors = [];
  const operations = new Set(knownOperationIds());
  const rulesFile = path.join(skillRoot, 'shared', 'zeyos-agent-operating-guide.md');
  let rules = new Set();
  try {
    if (!isContainedFile(skillRoot, rulesFile)) throw new Error('Operating guide is outside the skill root or missing.');
    rules = new Set([...readFileSync(rulesFile, 'utf8').matchAll(/\*\*(R-\d{3})\b/g)].map((m) => m[1]));
  } catch { errors.push('Missing shared operating guide for coverage rule references.'); }

  for (const scenario of scenarios) {
    const label = scenario.id || scenario._rel || 'unknown scenario';
    const skills = new Set([scenario.skill, scenario.knowledge?.primarySkill, ...(scenario.knowledge?.allowedSkills || [])].filter(Boolean));
    for (const skill of skills) {
      if (!/^[a-z0-9-]+$/.test(skill) || !isContainedFile(skillRoot, path.join(skillRoot, skill, 'SKILL.md'))) errors.push(`${label}: missing skill ${skill}`);
    }
    for (const concept of scenario.knowledge?.okfConcepts || []) {
      if (!/^(entities|concepts|playbooks|metrics)\/[a-z0-9-]+(?:\.md)?$/.test(concept)
          || !isContainedFile(okfRoot, path.join(okfRoot, concept.endsWith('.md') ? concept : `${concept}.md`))) errors.push(`${label}: missing OKF reference ${concept}`);
    }
    for (const entity of scenario.coverage?.entities || []) {
      if (!Object.prototype.hasOwnProperty.call(SCHEMA, entity)) errors.push(`${label}: unknown coverage entity ${entity}`);
    }
    for (const operation of scenario.coverage?.operations || []) {
      if (!operations.has(operation)) errors.push(`${label}: unknown coverage operation ${operation}`);
    }
    for (const format of scenario.coverage?.formats || []) {
      if (!RESULT_FORMATS.includes(format)) errors.push(`${label}: unknown coverage format ${format}`);
    }
    for (const rule of scenario.coverage?.rules || []) {
      if (!rules.has(rule)) errors.push(`${label}: unknown coverage rule ${rule}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
