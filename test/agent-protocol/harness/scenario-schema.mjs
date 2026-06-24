/**
 * Scenario schema v2 — loader, validator and v1→v2 compatibility normalizer.
 *
 * The protocol grew up on a flat v1 scenario shape (`mutates`, `prompt`, `expect`,
 * `seed`, `cleanup`). v2 (spec ZAP-EXP-001 §7) keeps every v1 file loadable but adds:
 *
 *   - `effects`  — separates *fixture mutation* (the harness seeds disposable state)
 *                  from *agent authority* (`agentMode`: how much the model may write).
 *                  This is what lets `--read-only` and `--bare-skill` run a seeded but
 *                  read-only scenario safely, which the old single `mutates` flag could
 *                  not express.
 *   - `turns`    — multi-turn sessions, each with its own prompt/result/expect/trace/state.
 *   - `result`   — a declared output contract (inline | block | file; json/yaml/csv/…).
 *   - richer verifier kinds (verifyResult, computeProjection, verifyStateDiff, verifyTrace).
 *
 * `normalizeScenario()` projects any scenario (v1 or v2) onto a single internal shape the
 * runner consumes, so the orchestrator never has to branch on schema version for the
 * common single-turn path. `validateScenario()` enforces the load-time rejections in §8.1.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSchema } from './jsonschema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '..', 'schema', 'scenario-v2.schema.json');

let V2_SCHEMA = null;
function v2Schema() {
  if (!V2_SCHEMA) V2_SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  return V2_SCHEMA;
}

/**
 * Every verifier kind the harness can evaluate. The loader rejects an unknown kind at
 * load time so a typo fails fast and offline instead of mid-run on the live instance.
 * Keep in sync with verify.mjs `evaluateExpect`.
 */
export const KNOWN_VERIFIER_KINDS = new Set([
  'all',
  'verifyRecord',
  'verifyNoRecords',
  'verifySurvival',
  'computeCount',
  'computeSum',
  'computeTicketEffortSum',
  'computeUnansweredTicketMail',
  'computeMembership',
  'computeProjection',
  'verifyResult',
  'verifyFile',
  'verifyStateDiff',
  'verifyTrace',
  'verifyNoLeak',
  'expectText',
  'manual'
]);

const WRITE_MODES = new Set(['conditional-write', 'write']);

/** create<Entity> → delete<Entity>; used to derive `cleanup: "auto"` from a seed block. */
export function deleteOpForCreate(op) {
  if (typeof op !== 'string') return null;
  const m = op.match(/^create([A-Z][A-Za-z0-9]*)$/);
  return m ? `delete${m[1]}` : null;
}

/** Reverse-dependency-order cleanup steps for a seed block (last seeded, first deleted). */
export function deriveAutoCleanup(seed = []) {
  const steps = [];
  for (const step of seed) {
    const del = deleteOpForCreate(step.op);
    if (del && step.as) steps.push({ op: del, idFrom: `$SEED.${step.as}.ID` });
  }
  return steps.reverse();
}

function isV2(scenario) {
  return Number(scenario?.schemaVersion) === 2;
}

/** Walk an `expect` tree (including nested `all.expectations`) collecting kinds. */
function collectExpectKinds(expect, out = []) {
  if (!expect || typeof expect !== 'object') return out;
  if (expect.kind) out.push(expect.kind);
  for (const child of expect.expectations || []) collectExpectKinds(child, out);
  return out;
}

/** Collect every `$SEED.<alias>` referenced anywhere in a value tree. */
function collectSeedRefs(value, out = new Set()) {
  if (typeof value === 'string') {
    const m = value.match(/^\$SEED\.([A-Za-z0-9_]+)/);
    if (m) out.add(m[1]);
  } else if (Array.isArray(value)) {
    for (const v of value) collectSeedRefs(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectSeedRefs(v, out);
  }
  return out;
}

/** A result-file path must be workspace-relative — reject absolute or `..`-escaping paths. */
export function isUnsafeResultPath(p) {
  if (typeof p !== 'string' || p === '') return true;
  if (path.isAbsolute(p)) return true;
  if (p.startsWith('~')) return true;
  const norm = p.replace(/\\/g, '/');
  return norm.split('/').some((seg) => seg === '..');
}

/**
 * Project a scenario (v1 or v2) onto the internal runner shape. Always returns a *new*
 * object; never mutates the input. The internal shape keeps the v2 fields AND the legacy
 * fields (`mutates`, `prompt`, `expect`, `skill`, `interface`, `seed`, `cleanup`) so the
 * single-turn path in run.mjs works unchanged.
 */
export function normalizeScenario(scenario) {
  if (!isV2(scenario)) return normalizeV1(scenario);

  const effects = scenario.effects || {};
  const agentMode = effects.agentMode || 'read-only';
  const fixtureMutates = Boolean(effects.fixtureMutates);
  const agentWrites = WRITE_MODES.has(agentMode);
  const turns = (scenario.turns || []).map((t, i) => ({
    id: t.id || `turn-${i + 1}`,
    prompt: t.prompt,
    result: t.result || null,
    expect: t.expect || { kind: 'manual', rubric: 'no expect declared' },
    trace: t.trace || null,
    state: t.state || null
  }));
  const first = turns[0] || { prompt: scenario.prompt, expect: scenario.expect };

  const cleanup = scenario.cleanup === 'auto'
    ? deriveAutoCleanup(scenario.seed)
    : (scenario.cleanup || null);

  const interfacePref = scenario.interface?.preferred || 'either';

  return {
    ...scenario,
    schemaVersion: 2,
    // legacy/compat fields the runner reads
    skill: scenario.knowledge?.primarySkill || scenario.skill || null,
    interface: interfacePref,
    prompt: first.prompt,
    expect: first.expect,
    seed: scenario.seed || null,
    cleanup,
    // `mutates` (legacy) must trigger cleanup whenever EITHER the harness seeds or the
    // agent may write — otherwise a seeded read-only scenario would leak its fixtures.
    mutates: fixtureMutates || agentWrites,
    // richer flags the new run.mjs filters use (authority vs fixture creation)
    agentMode,
    fixtureMutates,
    agentWrites,
    requiresConfirmation: Boolean(effects.requiresConfirmation),
    safetyCanary: Boolean(effects.safetyCanary),
    allowedOperations: effects.allowedOperations || [],
    forbiddenOperations: effects.forbiddenOperations || [],
    ownedRecordsOnly: effects.ownedRecordsOnly !== false,
    _turns: turns,
    _multiTurn: turns.length > 1
  };
}

function normalizeV1(scenario) {
  const mutates = Boolean(scenario.mutates);
  const expect = scenario.expect || { kind: 'manual', rubric: 'v1 scenario without expect' };
  const turns = [{
    id: 'answer',
    prompt: scenario.prompt,
    result: null,
    expect,
    trace: null,
    state: null
  }];
  return {
    ...scenario,
    schemaVersion: 1,
    skill: scenario.skill || null,
    interface: scenario.interface || 'either',
    prompt: scenario.prompt,
    expect,
    seed: scenario.seed || null,
    cleanup: scenario.cleanup || null,
    mutates,
    // v1 cannot distinguish fixture creation from agent authority, so map conservatively:
    // a mutating v1 scenario is treated as agent-write (its safety rules assume it).
    agentMode: mutates ? 'write' : 'read-only',
    fixtureMutates: mutates,
    agentWrites: mutates,
    requiresConfirmation: false,
    safetyCanary: false,
    allowedOperations: [],
    forbiddenOperations: [],
    ownedRecordsOnly: true,
    _turns: turns,
    _multiTurn: false
  };
}

/**
 * Validate a single scenario. Returns `{ valid, errors, warnings }`.
 * `opts.knownOps` (a Set of operationIds) enables static op-existence checks;
 * `opts.canaryIds` (a Set) enables the safety-canary-in-rotation check.
 */
export function validateScenario(scenario, opts = {}) {
  const errors = [];
  const warnings = [];
  const id = scenario?.id || '(no id)';

  if (isV2(scenario)) {
    const res = validateSchema(scenario, v2Schema());
    for (const e of res.errors) errors.push(`${id}: schema: ${e}`);
  } else {
    // v1 minimal shape check (the runner has always assumed these)
    if (!scenario?.id) errors.push('(v1): missing id');
    if (!scenario?.layer) errors.push(`${id}: v1 missing layer`);
    if (!scenario?.prompt) errors.push(`${id}: v1 missing prompt`);
    if (!scenario?.expect?.kind) errors.push(`${id}: v1 missing expect.kind`);
  }

  const norm = normalizeScenario(scenario);

  // unknown verifier kinds (across all turns + nested all.expectations)
  for (const turn of norm._turns) {
    for (const kind of collectExpectKinds(turn.expect)) {
      if (!KNOWN_VERIFIER_KINDS.has(kind)) errors.push(`${id}: unknown verifier kind "${kind}"`);
    }
  }

  // mutating fixtures must declare cleanup coverage (a hard rule for v2; for legacy v1
  // files the orphan sweep is the backstop, so it is only a warning there)
  if (norm.seed?.length) {
    const hasCleanup = norm.cleanup === 'auto' || (Array.isArray(norm.cleanup) && norm.cleanup.length > 0);
    if (!hasCleanup) {
      const msg = `${id}: seeds ${norm.seed.length} record(s) but declares no cleanup (use "cleanup":"auto" or explicit steps)`;
      if (isV2(scenario)) errors.push(msg); else warnings.push(msg);
    }
  }

  // write-enabled scenarios need an explicit allow-list (least privilege)
  if (WRITE_MODES.has(norm.agentMode) && norm.allowedOperations.length === 0 && isV2(scenario)) {
    errors.push(`${id}: agentMode "${norm.agentMode}" requires effects.allowedOperations (least-privilege write allowlist)`);
  }

  // result-file path traversal
  for (const turn of norm._turns) {
    if (turn.result?.mode === 'file' && isUnsafeResultPath(turn.result.path)) {
      errors.push(`${id}: result file path "${turn.result?.path}" must be a workspace-relative path (no absolute paths or "..")`);
    }
  }
  for (const v of scenario.variants || []) {
    if (v.result?.mode === 'file' && isUnsafeResultPath(v.result.path)) {
      errors.push(`${id}: variant "${v.id}" result file path is unsafe`);
    }
  }

  // unknown seed aliases referenced in expect/trace/state/cleanup
  const seedAliases = new Set((norm.seed || []).map((s) => s.as));
  const refs = new Set();
  for (const turn of norm._turns) {
    collectSeedRefs(turn.expect, refs);
    collectSeedRefs(turn.trace, refs);
    collectSeedRefs(turn.state, refs);
  }
  if (Array.isArray(norm.cleanup)) collectSeedRefs(norm.cleanup, refs);
  for (const ref of refs) {
    if (!seedAliases.has(ref)) errors.push(`${id}: references unknown seed alias "$SEED.${ref}" (declared: ${[...seedAliases].join(', ') || 'none'})`);
  }

  // requiresConfirmation multi-turn scenarios must assert state somewhere
  if (norm.requiresConfirmation && norm._multiTurn) {
    const hasState = norm._turns.some((t) => t.state || collectExpectKinds(t.expect).includes('verifyStateDiff'));
    if (!hasState) errors.push(`${id}: requiresConfirmation multi-turn scenario must include a state/verifyStateDiff assertion`);
  }

  // safety canary must be in the configured full rotation
  if (norm.safetyCanary && opts.canaryIds && !opts.canaryIds.has(norm.id)) {
    warnings.push(`${id}: safetyCanary scenario is not in rotation.canaryIds — add it so every model's behaviour is recorded`);
  }

  // optional static operationId checks
  if (opts.knownOps) {
    for (const step of norm.seed || []) {
      if (step.op && !opts.knownOps.has(step.op)) warnings.push(`${id}: seed op "${step.op}" not found on the client surface`);
    }
    if (Array.isArray(norm.cleanup)) {
      for (const step of norm.cleanup) {
        if (step.op && !opts.knownOps.has(step.op)) warnings.push(`${id}: cleanup op "${step.op}" not found on the client surface`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a whole catalog: per-scenario validity plus cross-cutting checks (duplicate
 * IDs, duplicate files). Returns `{ valid, errors, warnings }`.
 */
export function validateScenarioSet(scenarios, opts = {}) {
  const errors = [];
  const warnings = [];
  const seen = new Map();
  for (const s of scenarios) {
    if (seen.has(s.id)) errors.push(`duplicate scenario id "${s.id}" (${seen.get(s.id)} and ${s._rel || '?'})`);
    else seen.set(s.id, s._rel || '?');
    const res = validateScenario(s, opts);
    errors.push(...res.errors);
    warnings.push(...res.warnings);
  }
  return { valid: errors.length === 0, errors, warnings };
}
