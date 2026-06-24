/**
 * Coverage reporter (spec §8.11). Answers "what does the catalog actually exercise?"
 * across the dimensions that matter for an agent eval: skill, OKF concept, entity,
 * operationId, interface, read/write mode, result format, verifier kind, safety rule,
 * single/multi-turn, suite, layer — plus the live pass rate per dimension when records
 * are supplied. Pure functions, so the accounting is unit-testable offline.
 */

const PASSING = new Set(['PASS']);

/** Pull the coverage-relevant facets out of one normalized scenario. */
export function scenarioDimensions(s) {
  const verifierKinds = new Set();
  for (const t of s._turns || []) collectKinds(t.expect, verifierKinds);
  return {
    layer: [s.layer],
    suite: s.suite || [],
    skill: s.skill ? [s.skill] : [],
    okfConcept: s.knowledge?.okfConcepts || [],
    entity: s.coverage?.entities || [],
    operation: s.coverage?.operations || [],
    interface: interfaceFacets(s),
    mode: [s.agentMode || (s.mutates ? 'write' : 'read-only')],
    format: s.coverage?.formats || resultFormats(s),
    verifierKind: [...verifierKinds],
    rule: s.coverage?.rules || [],
    turns: [s._multiTurn ? 'multi-turn' : 'single-turn'],
    tag: s.tags || [],
    safetyCanary: s.safetyCanary ? ['safety-canary'] : []
  };
}

function collectKinds(expect, out) {
  if (!expect || typeof expect !== 'object') return;
  if (expect.kind) out.add(expect.kind);
  for (const c of expect.expectations || []) collectKinds(c, out);
}

function interfaceFacets(s) {
  const i = s.interface;
  if (typeof i === 'string') return [i];
  if (i && typeof i === 'object') return [i.preferred || 'either', ...(i.required || [])];
  return ['either'];
}

function resultFormats(s) {
  const set = new Set();
  for (const t of s._turns || []) if (t.result?.format) set.add(t.result.format);
  return [...set];
}

const DIMENSIONS = ['layer', 'suite', 'skill', 'okfConcept', 'entity', 'operation', 'interface', 'mode', 'format', 'verifierKind', 'rule', 'turns', 'tag', 'safetyCanary'];

/**
 * Compute coverage. `records` (optional) is the run scorecard records, keyed by id, used
 * to attach pass counts per dimension value.
 * @returns {{ dimensions: Record<string, Record<string, {total:number, pass:number}>>, totals: object }}
 */
export function computeCoverage(scenarios, records = []) {
  const passById = new Map(records.map((r) => [r.id, PASSING.has(r.classification)]));
  const dimensions = {};
  for (const d of DIMENSIONS) dimensions[d] = {};

  for (const s of scenarios) {
    const passed = passById.get(s.id);
    const facets = scenarioDimensions(s);
    for (const d of DIMENSIONS) {
      for (const value of facets[d]) {
        const bucket = (dimensions[d][value] ||= { total: 0, pass: 0 });
        bucket.total += 1;
        if (passed) bucket.pass += 1;
      }
    }
  }

  return {
    dimensions,
    totals: {
      scenarios: scenarios.length,
      skills: Object.keys(dimensions.skill).length,
      entities: Object.keys(dimensions.entity).length,
      operations: Object.keys(dimensions.operation).length,
      verifierKinds: Object.keys(dimensions.verifierKind).length,
      formats: Object.keys(dimensions.format).length,
      rules: Object.keys(dimensions.rule).length,
      safetyCanaries: dimensions.safetyCanary['safety-canary']?.total || 0,
      multiTurn: dimensions.turns['multi-turn']?.total || 0
    }
  };
}

/** Render coverage as Markdown tables for scorecard.md / coverage.md. */
export function renderCoverageMarkdown(coverage) {
  const lines = ['# Coverage', ''];
  const t = coverage.totals;
  lines.push(`- **${t.scenarios}** scenarios · **${t.skills}** skills · **${t.entities}** entities · **${t.operations}** operations`);
  lines.push(`- **${t.verifierKinds}** verifier kinds · **${t.formats}** result formats · **${t.rules}** rules · **${t.safetyCanaries}** safety canaries · **${t.multiTurn}** multi-turn`, '');
  for (const [dim, values] of Object.entries(coverage.dimensions)) {
    const entries = Object.entries(values).sort((a, b) => b[1].total - a[1].total);
    if (entries.length === 0) continue;
    lines.push(`## ${dim}`, '', '| value | scenarios | passing |', '|---|---|---|');
    for (const [value, { total, pass }] of entries) lines.push(`| ${value} | ${total} | ${pass} |`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export { DIMENSIONS };
