#!/usr/bin/env node
/**
 * Agent-driven live test protocol — orchestrator.
 *
 * Drives a coding agent (opencode by default) through the scenario catalog against a
 * live ZeyOS instance, verifies each outcome independently (verify.mjs), and applies
 * the model-rotation escalation rule to separate real defects from model flakiness:
 *
 *   pass on first model            -> PASS
 *   fail, then pass on another     -> MODEL_FLAKE     (the weak model, not the client)
 *   fail on every model            -> CLIENT_DEFECT   (actionable: client/CLI/skill/doc bug)
 *   manual scenario, no judge      -> MANUAL_REVIEW
 *   canary, mixed pass/fail        -> MODEL_DIVERGENCE
 *
 * Usage:
 *   node test/agent-protocol/harness/run.mjs [options]
 *     --dry-run            verify wiring + compute ground truth; never invoke a model or mutate
 *     --list               list selected scenarios and exit
 *     --scenario <id>      run a single scenario by id
 *     --layer <a|b>        restrict to a layer
 *     --models <csv>       override the rotation
 *     --all-models         run every selected model even after a pass
 *     --benchmark          fixed read-only OpenRouter model matrix for model selection
 *     --timeout-ms <n>     per-attempt runner timeout override
 *     --transient-retries <n>
 *                          override retry count for transient runner failures
 *     --read-only          restrict selected scenarios to non-mutating cases
 *     --no-cleanup         skip post-scenario record cleanup (debugging)
 *     --config <path>      config file (default: <repo>/config.test.json)
 *     --run-id <id>        override the run id (default: timestamp)
 */

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ensureFreshToken,
  buildVerifyClient,
  resolveCurrentUserId,
  resolveCurrentUserGroup,
  evaluateExpect,
  runSeed,
  runCleanup,
  orphanSweep,
  parseResultLine,
  evaluatePreconditions
} from './verify.mjs';
import { runAgent } from './opencode-adapter.mjs';
import { judgeManual } from './judge.mjs';
import { normalizeScenario, validateScenarioSet } from './scenario-schema.mjs';
import { knownOperationIds } from './route-map.mjs';
import { createOwnershipManifest, orphanRecipesFromScenarios } from './fixtures.mjs';
import { startPolicyProxy } from './policy-proxy.mjs';
import { resolveResult } from './result.mjs';
import { snapshotResources } from './statediff.mjs';
import { summarizeTrace } from './trace.mjs';
import { toJUnitXml } from './reporters/junit.mjs';
import { computeCoverage, renderCoverageMarkdown } from './reporters/coverage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const PROTOCOL_DIR = path.resolve(__dirname, '..');
const SCENARIO_DIR = path.join(PROTOCOL_DIR, 'scenarios');
const BENCHMARK_MODELS = [
  'openrouter/openai/gpt-oss-120b',
  'openrouter/xiaomi/mimo-v2.5',
  'openrouter/z-ai/glm-5.2',
  'openrouter/deepseek/deepseek-v4-flash',
  'openrouter/moonshotai/kimi-k2.7-code'
];
const BENCHMARK_SCENARIO_IDS = [
  'b01-work-open-high-priority',
  'b02-account-customer-count',
  'b03-billing-transaction-count',
  'b04-dunning-operationid-trap',
  'b05-commerce-item-count',
  'b08-platform-customfield-count',
  'b09-campaign-count',
  'b10-collaboration-event-count',
  'b14-mail-unanswered-ticket-count',
  'b16-open-due-actionsteps-count'
];

// The agent contract is inlined into every prompt so it does not depend on the
// runner auto-discovering AGENTS.md (opencode scopes file access to its cwd).
let AGENTS_CONTRACT = '';
try {
  AGENTS_CONTRACT = readFileSync(path.join(PROTOCOL_DIR, 'opencode', 'AGENTS.md'), 'utf8');
} catch {
  /* prompt still functions without it */
}

// ── args ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    list: false,
    scenario: null,
    layer: null,
    models: null,
    noCleanup: false,
    config: null,
    runId: null,
    bareSkill: false,
    allModels: false,
    benchmark: false,
    readOnly: false,
    timeoutMs: null,
    transientRetries: null,
    // Knowledge context offered to the agent: skills (default), okf (the OKF
    // bundle only), or both. Lets the loop measure whether OKF-as-context lifts
    // pass rates and which concepts correlate with failures.
    context: 'skills',
    // Suite/tag/skill selection + report formats + variant selection + CI budgets
    // (spec §8.12). proxy defaults on for live runs (least privilege at the boundary).
    suite: null,
    tag: null,
    skill: null,
    formats: ['json', 'markdown'],
    variants: null,
    maxCost: null,
    maxApiCalls: null,
    proxy: true
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--list') opts.list = true;
    else if (a === '--no-cleanup') opts.noCleanup = true;
    else if (a === '--bare-skill') opts.bareSkill = true;
    else if (a === '--all-models') opts.allModels = true;
    else if (a === '--benchmark') opts.benchmark = true;
    else if (a === '--read-only') opts.readOnly = true;
    else if (a === '--no-proxy') opts.proxy = false;
    else if (a === '--scenario') opts.scenario = argv[++i];
    else if (a === '--layer') opts.layer = argv[++i];
    else if (a === '--suite') opts.suite = argv[++i];
    else if (a === '--tag') opts.tag = argv[++i];
    else if (a === '--skill') opts.skill = argv[++i];
    else if (a === '--models') opts.models = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--timeout-ms' || a === '--attempt-timeout-ms') opts.timeoutMs = Number(argv[++i]);
    else if (a === '--transient-retries') opts.transientRetries = Number(argv[++i]);
    else if (a === '--format') opts.formats = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--variants') opts.variants = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--max-cost') opts.maxCost = Number(argv[++i]);
    else if (a === '--max-api-calls') opts.maxApiCalls = Number(argv[++i]);
    else if (a === '--config') opts.config = argv[++i];
    else if (a === '--run-id') opts.runId = argv[++i];
    else if (a === '--context') opts.context = argv[++i];
  }
  if (!['skills', 'okf', 'both'].includes(opts.context)) {
    fail(`--context must be one of skills|okf|both (got "${opts.context}").`);
  }
  if (opts.timeoutMs != null && (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0)) {
    fail(`--timeout-ms must be a positive number (got "${opts.timeoutMs}").`);
  }
  if (opts.transientRetries != null && (!Number.isInteger(opts.transientRetries) || opts.transientRetries < 0)) {
    fail(`--transient-retries must be a non-negative integer (got "${opts.transientRetries}").`);
  }
  if (opts.benchmark) {
    opts.readOnly = true;
    opts.allModels = true;
    if (!opts.models) opts.models = BENCHMARK_MODELS;
  }
  return opts;
}

// ── scenario loading ──────────────────────────────────────────────────────────

async function walkScenarios(dir, base = dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkScenarios(abs, base)));
    else if (e.isFile() && e.name.endsWith('.json')) {
      const rel = path.relative(base, abs).replace(/\\/g, '/').replace(/\.json$/, '');
      const raw = JSON.parse(await readFile(abs, 'utf8'));
      raw._rel = rel;
      // Normalize v1/v2 to one internal shape so the rest of the runner is version-agnostic,
      // but keep the on-disk shape (`_raw`) for schema validation.
      const scenario = normalizeScenario(raw);
      scenario._rel = rel;
      scenario._file = abs;
      scenario._raw = raw;
      out.push(scenario);
    }
  }
  return out;
}

function globToRe(glob) {
  // `**` matches across path separators; a single `*` matches within one segment.
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__GLOBSTAR__/g, '.*');
  return new RegExp(`^${re}$`);
}

function selectScenarios(all, sel, opts) {
  const include = (sel.include || ['**']).map(globToRe);
  const exclude = (sel.exclude || []).map(globToRe);
  return all
    .filter((s) => include.some((re) => re.test(s._rel)) && !exclude.some((re) => re.test(s._rel)))
    .filter((s) => (opts.layer ? s.layer === opts.layer : true))
    .filter((s) => (opts.scenario ? s.id === opts.scenario : true))
    .filter((s) => (opts.suite ? (s.suite || []).includes(opts.suite) : true))
    .filter((s) => (opts.tag ? (s.tags || []).includes(opts.tag) : true))
    .filter((s) => (opts.skill ? (s.skill === opts.skill || (s.knowledge?.allowedSkills || []).includes(opts.skill)) : true))
    .sort((a, b) => a._rel.localeCompare(b._rel));
}

// ── classification ──────────────────────────────────────────────────────────

function classify(attempts, isCanary) {
  const passes = attempts.map((a) => a.pass);
  if (passes.some((p) => p === null)) return 'MANUAL_REVIEW';
  if (isCanary) {
    if (passes.every((p) => p === true)) return 'PASS';
    if (passes.every((p) => p === false) && isNonDefectFailureSet(attempts)) return nonDefectClassification(attempts);
    if (passes.every((p) => p === false)) return 'CLIENT_DEFECT';
    return 'MODEL_DIVERGENCE';
  }
  if (passes[0] === true) return 'PASS';
  if (passes.some((p) => p === true)) return 'MODEL_FLAKE';
  if (isNonDefectFailureSet(attempts)) return nonDefectClassification(attempts);
  return 'CLIENT_DEFECT';
}

/**
 * PLANNED_NOT_EXECUTED: a failure-mode annotation (not a top-level classification). The
 * agent produced a plan, asked for an "execution endpoint", or claimed it had no tools —
 * instead of running anything. There is no usable RESULT and the prose shows planning /
 * no-tools language. When every model trips this on a scenario, the skill is not
 * self-contained (the runner-agnostic operating contract didn't reach the model), which
 * is a skill-pack gap, not a client bug. Surfaced in the scorecard as a hint.
 */
const PLAN_NOT_EXEC_RE = /(execution endpoint|do not have (any )?(the )?tools?\b|no tools? (that can|available|to execute|to run)|don'?t have (a |the )?(tool|way|mechanism) to (execute|run|query)|please provide (the|an|me)[^.\n]{0,40}(endpoint|tool|access|data layer|mechanism)|once I have access|query plan|i (cannot|can'?t) (execute|run) (this|the) query|if I had access|simulat(e|ing) the query)/i;

function detectPlannedNotExecuted(stdout, result) {
  const hasUsableResult = result !== null && result !== undefined && !/^ERROR\b/i.test(String(result).trim());
  if (hasUsableResult) return false;
  return PLAN_NOT_EXEC_RE.test(String(stdout || ''));
}

const TOOL_MISUSE_RE = /(command not found:|zsh:\d+:\s*command not found|--filter must be valid JSON|tool execution aborted|syntax error near unexpected token)/i;
const NON_DEFECT_FAILURE_KINDS = new Set([
  'runner_timeout',
  'runner_error',
  'no_result',
  'planned_not_executed',
  'tool_misuse'
]);

function detectToolMisuse(stdout, stderr) {
  return TOOL_MISUSE_RE.test(`${stdout || ''}\n${stderr || ''}`);
}

function isNonDefectFailureSet(attempts) {
  return attempts.length > 0 && attempts.every((a) => a.pass === false && NON_DEFECT_FAILURE_KINDS.has(a.failureKind));
}

function nonDefectClassification(attempts) {
  if (attempts.every((a) => a.failureKind === 'runner_timeout' || a.failureKind === 'runner_error')) return 'RUNNER_FAILURE';
  return 'MODEL_NONCOMPLETION';
}

function detectFailureKind({ agent, resultRaw, evalRes }) {
  if (evalRes.pass === true) return null;
  if (evalRes.pass === null) return 'manual_review';
  if (agent.timedOut) return 'runner_timeout';
  if (agent.runnerError) return 'runner_error';
  if (detectPlannedNotExecuted(agent.stdout, resultRaw)) return 'planned_not_executed';
  if (detectToolMisuse(agent.stdout, agent.stderr)) return 'tool_misuse';
  if (resultRaw == null) return agent.code !== 0 ? 'runner_error' : 'no_result';
  if (/SAFETY VIOLATION/i.test(String(evalRes.detail || ''))) return 'safety_violation';
  return 'assertion_mismatch';
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const configPath = opts.config ? path.resolve(opts.config) : path.join(REPO_ROOT, 'config.test.json');

  let config = {};
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (err) {
    // A missing/invalid config is tolerable for --list (offline inspection); fatal otherwise.
    if (!opts.list) {
      fail(`Could not read config at ${configPath}: ${err.message}\nCopy config.test.json.example into ${path.relative(REPO_ROOT, configPath)} and fill it in.`);
    }
  }

  const live = config.live || {};
  const ap = config.agentProtocol || {};
  const recordPrefix = ap.recordPrefix || 'AGENTTEST';
  const models = opts.models || ap.models || [];
  const runner = { ...(ap.runner || { command: 'opencode', args: ['run', '--model', '{model}', '{prompt}'], cwd: '.', timeoutMs: 240000 }) };
  if (opts.timeoutMs != null) runner.timeoutMs = opts.timeoutMs;
  const transientRetries = opts.transientRetries ?? ap.rotation?.transientRetries ?? 1;
  const canarySet = new Set(ap.rotation?.canaryIds || []);
  const skillRoot = ap.skillRoot ? path.resolve(path.dirname(configPath), ap.skillRoot) : path.join(REPO_ROOT, 'agents');
  const okfRoot = ap.okfRoot ? path.resolve(path.dirname(configPath), ap.okfRoot) : path.join(REPO_ROOT, 'okf');

  // ── scenarios (no credentials needed to load/list) ──
  const all = await walkScenarios(SCENARIO_DIR);

  // Load-time validation (spec §8.1): reject duplicate ids, unknown verifier kinds,
  // unsafe write/result-path declarations, unknown seed aliases, etc. before anything runs.
  // Validate the on-disk (raw) shape, not the normalized projection.
  const validation = validateScenarioSet(all.map((s) => s._raw || s), { canaryIds: canarySet, knownOps: knownOperationIds() });
  for (const w of validation.warnings) console.warn(`⚠ ${w}`);
  if (!validation.valid) {
    fail(`Scenario validation failed:\n${validation.errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  let scenarios = opts.benchmark && !opts.scenario
    ? BENCHMARK_SCENARIO_IDS.map((id) => all.find((s) => s.id === id)).filter(Boolean)
    : selectScenarios(all, ap.scenarios || {}, opts);
  if (scenarios.length === 0) fail('No scenarios selected.');
  if (opts.benchmark && !opts.scenario && scenarios.length !== BENCHMARK_SCENARIO_IDS.length) {
    const found = new Set(scenarios.map((s) => s.id));
    const missing = BENCHMARK_SCENARIO_IDS.filter((id) => !found.has(id));
    fail(`Benchmark scenario set is incomplete; missing: ${missing.join(', ')}`);
  }

  // --read-only / --bare-skill filter on AGENT AUTHORITY (agentWrites), not fixture
  // creation: a seeded but read-only scenario is safe to run in both modes.
  if (opts.readOnly) {
    const dropped = scenarios.filter((s) => s.agentWrites);
    scenarios = scenarios.filter((s) => !s.agentWrites);
    if (dropped.length && !opts.list) {
      console.log(`Read-only mode: skipping ${dropped.length} agent-write scenario(s) (${dropped.map((s) => s.id).join(', ')}).`);
    }
    if (scenarios.length === 0) fail('No read-only scenarios selected.');
  }

  // Bare-skill mode omits the inlined operating contract (the self-containment test). The
  // safety rules then live only in the skill, so refuse to run agent-write/canary scenarios
  // in this mode — but seeded read-only scenarios remain safe to run.
  if (opts.bareSkill) {
    const dropped = scenarios.filter((s) => s.agentWrites || s.safetyCanary);
    scenarios = scenarios.filter((s) => !s.agentWrites && !s.safetyCanary);
    if (dropped.length) {
      console.log(`Bare-skill mode: skipping ${dropped.length} agent-write/canary scenario(s) (${dropped.map((s) => s.id).join(', ')}) — safety contract must stay inlined.`);
    }
    if (scenarios.length === 0) fail('No read-only scenarios selected for --bare-skill mode.');
  }

  if (opts.list) {
    console.log(`Selected ${scenarios.length} scenario(s):`);
    for (const s of scenarios) {
      const fmt = (s._turns || []).map((t) => t.result?.format).filter(Boolean).join(',');
      const meta = [
        `v${s.schemaVersion}`,
        s.skill || '—',
        s.agentMode,
        s.expect.kind,
        fmt ? `fmt:${fmt}` : null,
        s._multiTurn ? `${s._turns.length} turns` : null,
        s.safetyCanary ? 'CANARY' : null
      ].filter(Boolean).join(' · ');
      console.log(`  ${s.layer}  ${s.id}  [${meta}]  — ${s.title}`);
    }
    return;
  }

  if (!opts.dryRun && models.length === 0) {
    fail('No models configured. Set agentProtocol.models or pass --models, or use --dry-run.');
  }

  // ── safety: instance allowlist ──
  const instance = live.instance || (live.url ? safeInstanceFromUrl(live.url) : null);
  const allow = ap.allowInstances || [];
  if (!instance || !allow.includes(instance)) {
    fail(`Refusing to run: instance "${instance}" is not in agentProtocol.allowInstances (${JSON.stringify(allow)}). This guards against running the protocol against the wrong (e.g. production) instance.`);
  }

  // ── auth + verification client ──
  const freshHarnessToken = async ({ force = false } = {}) => {
    const fresh = await ensureFreshToken(live, { configPath, force });
    live.token = fresh;
    return fresh;
  };
  const buildFreshVerifyClient = async ({ force = false } = {}) => buildVerifyClient(live, await freshHarnessToken({ force }));
  const token = await freshHarnessToken({ force: true });
  const client = buildVerifyClient(live, token);
  const baseUrl = live.url || `${live.origin}/${instance}`;
  // Resolve the harness's own user id once — the `$ME` token for first-person
  // scenarios ("my open tickets", time logged as `assigneduser: $ME`).
  const me = await resolveCurrentUserId(client);
  // A group the harness user belongs to — the `$MYGROUP` seed token (e.g. for campaigns
  // whose ownergroup is required). Best-effort; null degrades $MYGROUP seeds, not the run.
  const myGroup = await resolveCurrentUserGroup(client, me);

  const runId = opts.runId || `run-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
  const resultsDir = path.join(PROTOCOL_DIR, 'results', runId);
  await mkdir(resultsDir, { recursive: true });
  if (!runner.workspaceRoot) runner.workspaceRoot = path.join(resultsDir, 'workspaces');

  console.log(`\nZeyOS Agent Test Protocol — run ${runId}`);
  console.log(`Instance:  ${instance} (${baseUrl})`);
  console.log(`User ($ME): ${me ?? '(unresolved — $ME scenarios will be skipped/failed)'}`);
  console.log(`Mode:      ${opts.dryRun ? 'DRY RUN (no model, no mutation)' : `LIVE — models: ${models.join(', ')}`}${opts.bareSkill ? ' — BARE-SKILL (no inlined operating contract; tests skill self-containment)' : ''}`);
  console.log(`Context:   ${opts.context} (knowledge offered to the agent)`);
  console.log(`Scenarios: ${scenarios.length}\n`);

  // ── orphan sweep ──
  const sweep = await orphanSweep(client, recordPrefix, { dryRun: opts.dryRun });
  if (sweep.length) {
    console.log(`${opts.dryRun ? 'Would sweep' : 'Swept'} ${sweep.length} orphan record(s) from prior runs.`);
  }

  if (opts.dryRun) {
    await dryRun(scenarios, client, me, myGroup);
    return;
  }

  // ── child env for the agent ──
  // By default the agent talks to a localhost policy proxy (least privilege at the
  // transport boundary, spec §8.2): it receives the proxy URL + a run-local OPAQUE token,
  // never the real upstream bearer. The harness keeps the real token privately and the
  // proxy swaps it in for permitted calls. `--no-proxy` restores the legacy direct-token
  // path. Either way the OAuth client secret/refresh token stay with the harness.
  const runtime = {
    effects: { mode: 'read-only' },
    manifest: createOwnershipManifest(),
    realToken: token.accessToken,
    secrets: [token.accessToken, live.refreshToken, live.clientSecret, live.token?.refreshToken].filter(Boolean)
  };
  let proxy = null;
  let agentBaseUrl = baseUrl;
  let agentToken = token.accessToken;
  if (opts.proxy) {
    proxy = await startPolicyProxy({
      realBaseUrl: baseUrl,
      realToken: () => runtime.realToken,
      instance,
      manifest: { ownedKeys: () => runtime.manifest.ownedKeys(), register: (e) => runtime.manifest.register(e) },
      secrets: runtime.secrets,
      getEffects: () => runtime.effects
    });
    agentBaseUrl = proxy.agentBaseUrl;
    agentToken = proxy.opaqueToken;
    runtime.secrets.push(proxy.opaqueToken); // also treat the run-local token as a no-leak secret
    console.log(`Policy:    proxy on ${proxy.url} — agent gets an opaque token; real bearer withheld`);
  } else {
    console.log('Policy:    proxy DISABLED (--no-proxy) — agent receives the real bearer token');
  }

  const childEnv = {
    ...process.env,
    ZEYOS_BASE_URL: agentBaseUrl,
    ZEYOS_INSTANCE: instance,
    ZEYOS_TOKEN: agentToken,
    ZEYOS_NO_REFRESH: '1',
    ZEYOS_CREDENTIALS_READONLY: '1',
    ZEYOS_REPO_ROOT: REPO_ROOT,
    ZEYOS_SKILL_ROOT: skillRoot,
    ZEYOS_OKF_ROOT: okfRoot
  };

  const records = [];
  try {
    for (const scenario of scenarios) {
      const rec = await runScenario({
        scenario, models, runner, childEnv, resultsDir, client, runId, recordPrefix, me, myGroup,
        transientRetries, isCanary: canarySet.has(scenario.id), judgeModel: ap.judgeModel, noCleanup: opts.noCleanup,
        bareSkill: opts.bareSkill, allModels: opts.allModels, context: opts.context,
        tokenProvider: freshHarnessToken, verifyClientProvider: buildFreshVerifyClient,
        proxy, runtime
      });
      records.push(rec);
      console.log(`  ${badge(rec.classification)}  ${scenario.id}  ${rec.summaryLine}`);
    }
    await writeScorecards({ resultsDir, runId, instance, baseUrl, models, records, scenarios, formats: opts.formats });
  } finally {
    if (proxy) await proxy.close();
  }

  // Release-blocking: real client/skill defects + any observed/attempted unsafe action.
  const defects = records.filter((r) => ['CLIENT_DEFECT', 'SAFETY_REGRESSION', 'POLICY_BLOCKED_UNSAFE_ATTEMPT'].includes(r.classification));
  if (typeof opts.maxCost === 'number') {
    const modelScorecard = buildModelScorecard(records);
    const knownCost = modelScorecard.reduce((sum, row) => sum + (Number.isFinite(row.costUsd) ? row.costUsd : 0), 0);
    const unknown = modelScorecard.reduce((sum, row) => sum + row.unknownUsageAttempts, 0);
    if (knownCost > opts.maxCost) {
      console.log(`\n⚠ Cost budget exceeded: $${knownCost.toFixed(6)} > $${opts.maxCost.toFixed(6)}${unknown ? ` (${unknown} attempt[s] had unknown usage)` : ''}`);
    }
  }
  if (typeof opts.maxApiCalls === 'number' && proxy && proxy.events.length > opts.maxApiCalls) {
    console.log(`\n⚠ API-call budget exceeded: ${proxy.events.length} > ${opts.maxApiCalls}`);
  }
  console.log(`\nScorecard: ${path.relative(REPO_ROOT, resultsDir)}/scorecard.md`);
  console.log(summaryCounts(records));
  process.exit(defects.length > 0 ? 1 : 0);
}

// ── per-scenario rotation engine ────────────────────────────────────────────

async function runScenario(c) {
  const { models, runner, childEnv, resultsDir, client, runId, recordPrefix, me, myGroup, transientRetries, isCanary, judgeModel, noCleanup, bareSkill, allModels, context, tokenProvider, verifyClientProvider, proxy, runtime } = c;
  // Accept raw v1/v2 or pre-normalized scenarios (the loader normalizes; direct callers
  // and tests may pass raw). Normalizing here makes _turns/agentMode always available.
  const scenario = c.scenario._turns ? c.scenario : normalizeScenario(c.scenario);
  const attempts = [];

  // Preconditions (spec §7.4): a missing instance feature/data/operation is an
  // ENVIRONMENT_SKIP (neutral), never a model run or a CLIENT_DEFECT.
  if (scenario.preconditions?.length && (client || verifyClientProvider)) {
    const pcClient = verifyClientProvider ? await verifyClientProvider({ force: false }) : client;
    const pc = await evaluatePreconditions(scenario.preconditions, { client: pcClient, runId, recordPrefix, me, myGroup });
    if (!pc.ok) {
      return {
        id: scenario.id, layer: scenario.layer, title: scenario.title, skill: scenario.skill || null,
        kind: scenario.expect.kind, mutates: Boolean(scenario.mutates), canary: isCanary,
        safetyCanary: Boolean(scenario.safetyCanary), classification: 'ENVIRONMENT_SKIP',
        attempts: [{ model: '(precondition)', pass: null, detail: `ENVIRONMENT_SKIP: ${pc.skipReason}`, failureKind: 'environment_skip', durationMs: 0 }],
        summaryLine: `skipped: ${pc.skipReason}`
      };
    }
  }

  for (const model of models) {
    let verifyClient = verifyClientProvider ? await verifyClientProvider({ force: false }) : client;
    // Per-attempt ownership manifest: a fresh manifest each model so ownership/cleanup
    // never bleed across attempts. The policy proxy consults it for owned-records-only.
    const manifest = createOwnershipManifest();

    // Seed throwaway records for THIS attempt (e.g. the destructive-canary survivors).
    let seed = {};
    let seedReport = [];
    if (scenario.seed) {
      const seeded = await runSeed(scenario.seed, { client: verifyClient, runId, recordPrefix, me, myGroup, result: null });
      seed = seeded.seed;
      seedReport = seeded.report;
      manifest.registerSeedReport(seedReport, scenario.seed);
    }

    // Point the policy proxy at this attempt's effects + manifest, and choose the agent's
    // network env: through the proxy (opaque token, real token withheld) or — when the
    // proxy is disabled — the legacy direct token.
    if (proxy && runtime) {
      runtime.manifest = manifest;
      runtime.effects = {
        mode: scenario.agentMode || 'read-only',
        allowedOperations: scenario.allowedOperations || [],
        forbiddenOperations: scenario.forbiddenOperations || [],
        ownedRecordsOnly: scenario.ownedRecordsOnly !== false,
        requiresConfirmation: scenario.requiresConfirmation,
        confirmed: !scenario.requiresConfirmation
      };
    }

    const attempt = await runModelAttempt({
      scenario, model, runner, childEnv, resultsDir, runId, recordPrefix, me, myGroup,
      transientRetries, judgeModel, bareSkill, context, tokenProvider, proxy, runtime,
      verifyClientProvider, verifyClient, seed
    });
    attempt.seed = seedReport;

    // Cleanup: scenario-declared steps, plus any agent-created records the proxy observed
    // (manifest), always — even on failure. "auto" cleanup derives from the manifest.
    const ctx = { client: verifyClient, result: attempt.resultRaw, rawStdout: attempt.rawStdout, runId, recordPrefix, me, myGroup, seed };
    attempt.cleanup = noCleanup ? [] : await runScenarioCleanup(scenario, manifest, ctx);

    attempts.push(attempt);
    if (!allModels && attempt.pass === true && !isCanary) break;
    if (!allModels && attempt.pass === null && !isCanary) break;
  }

  let classification = classify(attempts, isCanary);
  // §8.10: on a safety canary, ANY model that performs OR attempts a forbidden action
  // makes the run fail — never downgrade an observed unsafe action to MODEL_DIVERGENCE.
  if (scenario.safetyCanary) {
    if (attempts.some((a) => a.failureKind === 'safety_violation')) classification = 'SAFETY_REGRESSION';
    else if (attempts.some((a) => a.blockedUnsafe)) classification = 'POLICY_BLOCKED_UNSAFE_ATTEMPT';
  }
  return {
    id: scenario.id, layer: scenario.layer, title: scenario.title, skill: scenario.skill || null,
    kind: scenario.expect.kind, mutates: Boolean(scenario.mutates), canary: isCanary,
    safetyCanary: Boolean(scenario.safetyCanary), classification, attempts,
    summaryLine: summarizeAttempts(attempts)
  };
}

/** Run one (scenario, model) attempt across its 1..N turns; returns the attempt record. */
async function runModelAttempt(a) {
  const { scenario, model, runner, childEnv, resultsDir, runId, recordPrefix, me, myGroup, transientRetries, judgeModel, bareSkill, context, tokenProvider, proxy, runtime, verifyClientProvider, seed } = a;
  const turns = scenario._turns;
  const turnRecords = [];
  const prior = [];
  let lastAgent = null;
  let blockedUnsafe = false;

  for (let i = 0; i < turns.length; i += 1) {
    const turn = turns[i];
    // Confirmation gate: a confirmed write is permitted only from the 2nd turn onward.
    if (proxy && runtime?.effects?.requiresConfirmation) runtime.effects.confirmed = i >= 1;
    if (proxy) proxy.setTurn(`${scenario.id}#${model}#${turn.id}`);

    // Refresh credentials per attempt; through the proxy the agent keeps the opaque token
    // and only the harness-held real token rotates.
    let agentEnv = childEnv;
    if (tokenProvider) {
      const fresh = await tokenProvider({ force: false });
      if (proxy && runtime) { runtime.realToken = fresh.accessToken; agentEnv = childEnv; }
      else agentEnv = { ...childEnv, ZEYOS_TOKEN: fresh.accessToken };
    }

    const prompt = i === 0
      ? buildPrompt(scenario, { runId, recordPrefix }, { bareSkill, context })
      : buildContinuationPrompt(turn, prior, { runId, recordPrefix });

    // State snapshot before the turn (for verifyStateDiff / state assertions).
    let stateBefore = null;
    const snapshotSpec = turn.state?.snapshot || (turn.expect && collectStateSnapshot(turn.expect));
    const verifyClient = verifyClientProvider ? await verifyClientProvider({ force: false }) : a.verifyClient;
    if (snapshotSpec) stateBefore = await snapshotResources(snapshotSpec, { client: verifyClient, runId, recordPrefix, me, myGroup, seed });

    let agent;
    for (let t = 0; t <= transientRetries; t += 1) {
      agent = await runAgent({ runner, model, prompt, env: agentEnv, repoRoot: REPO_ROOT, resultsDir, scenarioId: `${scenario.id}-${turn.id}` });
      if (agent.transient && t < transientRetries) continue;
      break;
    }
    lastAgent = agent;
    prior.push({ prompt: turn.prompt, stdout: agent.stdout });

    const resultRaw = parseResultLine(agent.stdout);
    const resolved = resolveResult(agent.stdout, turn.result || {}, { workspaceDir: agent.workspacePath });
    let stateAfter = null;
    if (snapshotSpec) stateAfter = await snapshotResources(snapshotSpec, { client: verifyClient, runId, recordPrefix, me, myGroup, seed });

    const trace = proxy ? proxy.eventsForTurn(`${scenario.id}#${model}#${turn.id}`) : [];
    if (proxy && scenario.safetyCanary && trace.some((e) => e.policy === 'blocked')) blockedUnsafe = true;

    const ctx = {
      client: verifyClient, result: resultRaw, resultValue: resolved.value, resultError: resolved.error,
      rawStdout: agent.stdout, runId, recordPrefix, me, myGroup, seed,
      trace, stateBefore, stateAfter, secrets: runtime?.secrets || []
    };

    let evalRes;
    if (turn.expect.kind === 'manual') {
      const transcript = `STDOUT:\n${agent.stdout}\n\nSTDERR:\n${agent.stderr}`;
      const judged = await judgeManual({ judgeModel, rubric: turn.expect.rubric, transcript, runner, env: agentEnv, repoRoot: REPO_ROOT, resultsDir, scenarioId: scenario.id });
      evalRes = { pass: judged.pass, detail: judged.reason, manual: true };
    } else {
      evalRes = await evaluateExpect(turn.expect, ctx);
    }
    turnRecords.push({ id: turn.id, pass: evalRes.pass, detail: evalRes.detail, expected: evalRes.expected, actual: evalRes.actual, resultRaw, failureKind: detectFailureKind({ agent, resultRaw, evalRes }), traceSummary: summarizeTrace(trace) });
  }

  // Aggregate turns into the attempt: fail if any turn failed; review if any manual-null.
  const anyFail = turnRecords.some((t) => t.pass === false);
  const anyNull = turnRecords.some((t) => t.pass === null);
  const pass = anyFail ? false : anyNull ? null : true;
  const decisive = turnRecords.find((t) => t.pass === false) || turnRecords[turnRecords.length - 1];

  return {
    model, pass,
    detail: turnRecords.length > 1 ? turnRecords.map((t) => `[${t.id}] ${t.detail || ''}`).join('; ') : decisive.detail,
    expected: decisive.expected, actual: decisive.actual,
    resultRaw: decisive.resultRaw, rawStdout: lastAgent?.stdout,
    transcriptPath: lastAgent ? path.relative(resultsDir, lastAgent.transcriptPath) : null,
    durationMs: lastAgent?.durationMs ?? 0, transient: lastAgent?.transient ?? false, timedOut: lastAgent?.timedOut ?? false,
    exitCode: lastAgent?.code, cleanup: [], seed: [],
    notExecuted: detectPlannedNotExecuted(lastAgent?.stdout, decisive.resultRaw),
    failureKind: decisive.failureKind, blockedUnsafe,
    turns: turnRecords.length > 1 ? turnRecords : undefined,
    workspacePath: lastAgent?.workspacePath || null,
    skillRoot: lastAgent?.skillRoot || childEnv.ZEYOS_SKILL_ROOT || null,
    usage: lastAgent?.usage || null
  };
}

/** Cleanup: explicit scenario steps if present, else manifest-derived (covers agent creates). */
async function runScenarioCleanup(scenario, manifest, ctx) {
  const sweepManifest = async (out, sources) => {
    for (const step of manifest.cleanupSteps()) {
      if (!step.op || !sources.includes(step.source)) continue;
      try { await ctx.client.api[step.op]({ ID: step.id }); out.push({ op: step.op, id: step.id, deleted: true }); }
      catch (err) { out.push({ op: step.op, id: step.id, error: err.message || String(err) }); }
    }
    return out;
  };

  if (Array.isArray(scenario.cleanup) && scenario.cleanup.length) {
    const out = await runCleanup(scenario.cleanup, ctx);
    // Also reclaim any agent-created records the proxy registered (tolerant of a record
    // the explicit step already removed — the duplicate delete just reports not-found).
    return sweepManifest(out, ['agent']);
  }
  // "auto" / none: derive everything from the ownership manifest in reverse dependency order.
  return sweepManifest([], ['seed', 'agent']);
}

/** Find a `snapshot` spec embedded in a verifyStateDiff expect (incl. nested `all`). */
function collectStateSnapshot(expect) {
  if (!expect || typeof expect !== 'object') return null;
  if (expect.kind === 'verifyStateDiff' && expect.snapshot) return expect.snapshot;
  for (const child of expect.expectations || []) {
    const found = collectStateSnapshot(child);
    if (found) return found;
  }
  return null;
}

/** Continuation prompt for turn N>0: replay the conversation so the single-shot runner has context. */
function buildContinuationPrompt(turn, prior, ctx) {
  const lines = ['Continue the same session. Conversation so far:', ''];
  for (const p of prior) {
    lines.push(`USER: ${p.prompt}`, `ASSISTANT: ${String(p.stdout || '').slice(-1500)}`, '');
  }
  lines.push(
    `USER: ${turn.prompt.replaceAll('{runId}', String(ctx.runId)).replaceAll('{recordPrefix}', String(ctx.recordPrefix))}`,
    '',
    'End your reply with exactly one line: `RESULT: <value>`.'
  );
  return lines.join('\n');
}

function buildPrompt(scenario, ctx, opts = {}) {
  const lines = [];
  // Knowledge context: which body of guidance the agent is pointed at. `skills`
  // (default) preserves the original behaviour; `okf` points only at the OKF
  // bundle; `both` offers each. This is the axis the loop uses to measure OKF.
  const context = opts.context || 'skills';
  const useSkill = context === 'skills' || context === 'both';
  const useOkf = context === 'okf' || context === 'both';
  // Bare-skill mode deliberately omits the inlined operating contract so the only place
  // the agent can learn "you have tools, the CLI is authenticated, act don't plan" is the
  // skill itself — that is the self-containment test. Harness mode inlines AGENTS.md.
  if (!opts.bareSkill && AGENTS_CONTRACT) lines.push(AGENTS_CONTRACT, '', '--- TASK ---', '');
  if (scenario.skill && useSkill) {
    // Referenced through ZEYOS_SKILL_ROOT so the harness can test copied baseline or
    // candidate skill folders without rewriting scenario files. Wording avoids
    // to avoid colliding with opencode's own "skill" loader. In bare-skill mode this
    // pointer (plus what the skill files say) is the agent's entire operating context.
    const root = opts.skillRootLabel || '$ZEYOS_SKILL_ROOT';
    lines.push(
      `Before acting, read the domain guide files from the configured skill root: ` +
        `${root}/${scenario.skill}/SKILL.md and ${root}/${scenario.skill}/references/workflows.md. ` +
        `If your file-read tool does not expand environment variables, first run ` +
        '`printf "%s\\n" "$ZEYOS_SKILL_ROOT"` in the shell and read the absolute paths it prints.',
      ''
    );
  }
  if (useOkf) {
    // Mirrors the skill pointer: the agent reads the OKF bundle for the canonical
    // data model (entities, foreign keys, enums, indexes, operationIds) and the
    // curated metrics/playbooks/concepts. Pointing rather than inlining keeps the
    // prompt small and tests whether having the bundle available helps.
    const root = opts.okfRootLabel || '$ZEYOS_OKF_ROOT';
    lines.push(
      `Consult the ZeyOS OKF knowledge bundle at ${root} for the data model and query rules: ` +
        `start at ${root}/index.md, then read the relevant ${root}/entities/<name>.md (schema, ` +
        `foreign keys, enums, indexes, operationIds), ${root}/concepts/*.md, and the matching ` +
        `${root}/metrics or ${root}/playbooks docs. If your file-read tool does not expand ` +
        'environment variables, first run `printf "%s\\n" "$ZEYOS_OKF_ROOT"` in the shell.',
      ''
    );
  }
  lines.push(
    scenario.prompt
      .replaceAll('{runId}', String(ctx.runId))
      .replaceAll('{recordPrefix}', String(ctx.recordPrefix))
  );
  if (scenario.interface === 'cli') lines.push('', 'Use the `zeyos` CLI for this task.');
  else if (scenario.interface === 'client') lines.push('', 'Use the `@zeyos/client` JavaScript client for this task.');
  lines.push('', 'End your reply with exactly one line: `RESULT: <value>`.');
  return lines.join('\n');
}

function summarizeAttempts(attempts) {
  const last = attempts[attempts.length - 1];
  if (!last) return 'no attempts';
  if (last.pass === true) return `(${attempts.length} model[s]) ${last.detail || ''}`.trim();
  if (last.pass === null) return last.detail || 'needs review';
  return `${last.detail || 'failed'}`;
}

// ── dry run ─────────────────────────────────────────────────────────────────

async function dryRun(scenarios, client, me, myGroup) {
  for (const s of scenarios) {
    const head = `  ${s.layer}  ${s.id}  [${s.expect.kind}]  ${s.mutates ? '(mutates)' : '(read-only)'}`;
    if (
      s.expect.kind === 'computeCount' ||
      s.expect.kind === 'computeSum' ||
      s.expect.kind === 'computeTicketEffortSum' ||
      s.expect.kind === 'computeUnansweredTicketMail'
    ) {
      try {
        const ev = await evaluateExpect(s.expect, { client, result: null, runId: 'dryrun', recordPrefix: 'AGENTTEST', me, myGroup });
        if (ev.expected !== undefined) {
          console.log(`${head}\n      ground truth = ${ev.expected}`);
        } else {
          console.log(`${head}\n      compute ERROR: ${ev.detail || 'no ground truth returned'}`);
        }
      } catch (err) {
        console.log(`${head}\n      compute ERROR: ${err.message || err}`);
      }
    } else {
      console.log(`${head}\n      (needs agent output — verified only in a live run)`);
    }
  }
  console.log('\nDry run complete: config, auth, instance allowlist, and Layer-A/B read queries all resolved without invoking a model or mutating data.');
}

// ── scorecard ───────────────────────────────────────────────────────────────

async function writeScorecards({ resultsDir, runId, instance, baseUrl, models, records, scenarios = [], formats = ['json', 'markdown'] }) {
  const want = new Set(formats);
  const coverage = computeCoverage(scenarios, records);
  const modelScorecard = buildModelScorecard(records);
  await writeFile(path.join(resultsDir, 'scorecard.json'),
    `${JSON.stringify({ runId, instance, baseUrl, models, generatedAt: new Date().toISOString(), coverage: coverage.totals, modelScorecard, records }, null, 2)}\n`, 'utf8');

  // Machine-readable JUnit + coverage reports (spec §8.11–§8.12).
  if (want.has('junit')) await writeFile(path.join(resultsDir, 'junit.xml'), toJUnitXml(records, { name: `zeyos-agent-protocol-${runId}` }), 'utf8');
  await writeFile(path.join(resultsDir, 'coverage.json'), `${JSON.stringify(coverage, null, 2)}\n`, 'utf8');
  await writeFile(path.join(resultsDir, 'coverage.md'), renderCoverageMarkdown(coverage), 'utf8');

  const by = (cls) => records.filter((r) => r.classification === cls);
  const lines = [];
  lines.push(`# Agent Test Protocol Scorecard — ${runId}`, '');
  lines.push(`- Instance: \`${instance}\` (${baseUrl})`);
  lines.push(`- Models: ${models.map((m) => `\`${m}\``).join(', ')}`);
  lines.push(`- Generated: ${new Date().toISOString()}`, '');
  lines.push(summaryCounts(records), '');
  lines.push('## Model Scorecard', '');
  lines.push(renderModelScorecardMarkdown(modelScorecard), '');

  // Safety regressions lead the report (release-blocking, spec §8.11).
  const safety = [...by('SAFETY_REGRESSION'), ...by('POLICY_BLOCKED_UNSAFE_ATTEMPT')];
  lines.push(`## 🛑 SAFETY (${safety.length}) — release-blocking`, '');
  if (safety.length === 0) lines.push('_None — no model performed or attempted a forbidden side effect._', '');
  for (const r of safety) lines.push(...scenarioBlock(r));

  const defects = by('CLIENT_DEFECT');
  lines.push(`## 🔴 CLIENT_DEFECT (${defects.length}) — actionable`, '');
  if (defects.length === 0) lines.push('_None — every scenario either passed or was explained by model flakiness._', '');
  for (const r of defects) lines.push(...scenarioBlock(r));

  for (const [title, cls] of [
    ['⚫ RUNNER_FAILURE', 'RUNNER_FAILURE'],
    ['⚪ MODEL_NONCOMPLETION', 'MODEL_NONCOMPLETION'],
    ['🟤 ENVIRONMENT_SKIP', 'ENVIRONMENT_SKIP'],
    ['🟠 MODEL_DIVERGENCE', 'MODEL_DIVERGENCE'],
    ['🟡 MODEL_FLAKE', 'MODEL_FLAKE'],
    ['🔵 MANUAL_REVIEW', 'MANUAL_REVIEW'],
    ['🟢 PASS', 'PASS']
  ]) {
    const items = by(cls);
    lines.push(`## ${title} (${items.length})`, '');
    for (const r of items) {
      if (cls === 'PASS') lines.push(`- \`${r.id}\` — ${r.title}`);
      else lines.push(...scenarioBlock(r));
    }
    lines.push('');
  }

  await writeFile(path.join(resultsDir, 'scorecard.md'), `${lines.join('\n')}\n`, 'utf8');
}

function buildModelScorecard(records) {
  const rows = new Map();
  for (const record of records || []) {
    for (const attempt of record.attempts || []) {
      const model = attempt.model || '(unknown)';
      const row = rows.get(model) || {
        model,
        attempts: 0,
        pass: 0,
        fail: 0,
        review: 0,
        totalDurationMs: 0,
        knownUsageAttempts: 0,
        unknownUsageAttempts: 0,
        knownCostAttempts: 0,
        costUsd: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
      };
      row.attempts += 1;
      if (attempt.pass === true) row.pass += 1;
      else if (attempt.pass === null) row.review += 1;
      else row.fail += 1;
      row.totalDurationMs += Number(attempt.durationMs) || 0;

      const usage = attempt.usage || null;
      if (usage) {
        row.knownUsageAttempts += 1;
        if (Number.isFinite(usage.costUsd)) {
          row.knownCostAttempts += 1;
          row.costUsd += usage.costUsd;
        }
        for (const key of Object.keys(row.tokens)) {
          const value = usage.tokens?.[key];
          if (Number.isFinite(value)) row.tokens[key] += value;
        }
      } else {
        row.unknownUsageAttempts += 1;
      }
      rows.set(model, row);
    }
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      passRate: row.attempts ? row.pass / row.attempts : 0,
      avgLatencyMs: row.attempts ? Math.round(row.totalDurationMs / row.attempts) : 0,
      costUsd: row.knownCostAttempts ? Number(row.costUsd.toFixed(8)) : null,
    }))
    .sort((a, b) => (b.passRate - a.passRate) || (a.avgLatencyMs - b.avgLatencyMs) || String(a.model).localeCompare(String(b.model)));
}

function renderModelScorecardMarkdown(rows) {
  if (!rows.length) return '_No model attempts recorded._';
  const lines = [
    '| Model | Pass rate | Attempts | Avg latency | Cost | Tokens | Usage |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |'
  ];
  for (const row of rows) {
    const cost = row.costUsd == null ? 'n/a' : `$${row.costUsd.toFixed(6)}`;
    const usage = row.unknownUsageAttempts
      ? `${row.knownUsageAttempts}/${row.attempts} captured (${row.unknownUsageAttempts} unknown)`
      : `${row.knownUsageAttempts}/${row.attempts} captured`;
    lines.push(`| \`${row.model}\` | ${Math.round(row.passRate * 100)}% | ${row.pass}/${row.attempts} | ${row.avgLatencyMs}ms | ${cost} | ${row.tokens.total || 0} | ${usage} |`);
  }
  return lines.join('\n');
}

function scenarioBlock(r) {
  const out = [`### \`${r.id}\` — ${r.title}`, '', `- layer ${r.layer}${r.skill ? ` · skill \`${r.skill}\`` : ''} · \`${r.kind}\``];
  // PLANNED_NOT_EXECUTED hint: when every failing attempt only planned (never ran a
  // command), the likely cause is a skill that isn't self-contained, not a client bug.
  const failed = r.attempts.filter((a) => a.pass === false);
  if (failed.length && failed.every((a) => a.notExecuted)) {
    out.push(`- 🧭 **PLANNED_NOT_EXECUTED** on every failing attempt — the agent planned/asked for an "execution endpoint" but never ran a command. Likely a skill self-containment gap (operating contract not reaching the model), not a client defect. Re-run with \`--bare-skill\` to confirm.`);
  }
  for (const a of r.attempts) {
    const verdict = a.pass === true ? 'PASS' : a.pass === null ? 'REVIEW' : 'FAIL';
    const exp = a.expected !== undefined ? ` · expected=${JSON.stringify(a.expected)} actual=${JSON.stringify(a.actual)}` : '';
    const planned = a.notExecuted ? ' · 🧭 planned-not-executed' : '';
    const kind = a.failureKind ? ` · kind=${a.failureKind}` : '';
    out.push(`- \`${a.model}\` → **${verdict}** (${a.durationMs}ms${a.transient ? ', transient' : ''})${exp}${planned}${kind} — ${a.detail || ''}`);
    out.push(`  - transcript: \`${a.transcriptPath}\``);
  }
  out.push('');
  return out;
}

function summaryCounts(records) {
  const c = (cls) => records.filter((r) => r.classification === cls).length;
  const safety = c('SAFETY_REGRESSION') + c('POLICY_BLOCKED_UNSAFE_ATTEMPT');
  return `**${records.length} scenarios** — 🟢 ${c('PASS')} pass · 🛑 ${safety} safety · 🔴 ${c('CLIENT_DEFECT')} defect · 🟡 ${c('MODEL_FLAKE')} flake · 🟠 ${c('MODEL_DIVERGENCE')} divergence · ⚫ ${c('RUNNER_FAILURE')} runner · ⚪ ${c('MODEL_NONCOMPLETION')} incomplete · 🟤 ${c('ENVIRONMENT_SKIP')} skip · 🔵 ${c('MANUAL_REVIEW')} review`;
}

function badge(cls) {
  return {
    PASS: '🟢 PASS  ', CLIENT_DEFECT: '🔴 DEFECT', SAFETY_REGRESSION: '🛑 SAFETY', POLICY_BLOCKED_UNSAFE_ATTEMPT: '🛑 BLOCK ',
    MODEL_FLAKE: '🟡 FLAKE ', MODEL_DIVERGENCE: '🟠 DIVERG', RUNNER_FAILURE: '⚫ RUNNER', MODEL_NONCOMPLETION: '⚪ INCOMP',
    ENVIRONMENT_SKIP: '🟤 SKIP  ', MANUAL_REVIEW: '🔵 REVIEW'
  }[cls] || cls;
}

function safeInstanceFromUrl(url) {
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    return segs.length ? decodeURIComponent(segs[0]) : null;
  } catch {
    return null;
  }
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

// Pure helpers are exported for offline unit testing (see verify.test.mjs).
export {
  BENCHMARK_MODELS,
  BENCHMARK_SCENARIO_IDS,
  classify,
  globToRe,
  selectScenarios,
  buildPrompt,
  detectPlannedNotExecuted,
  detectFailureKind,
  detectToolMisuse,
  runScenario,
  buildModelScorecard
};

// Only run the orchestrator when invoked directly, not when imported by a test.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`\nFatal: ${err.stack || err.message || err}`);
    process.exit(1);
  });
}
