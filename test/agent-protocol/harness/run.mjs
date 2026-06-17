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
  evaluateExpect,
  runSeed,
  runCleanup,
  orphanSweep,
  parseResultLine
} from './verify.mjs';
import { runAgent } from './opencode-adapter.mjs';
import { judgeManual } from './judge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const PROTOCOL_DIR = path.resolve(__dirname, '..');
const SCENARIO_DIR = path.join(PROTOCOL_DIR, 'scenarios');

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
    readOnly: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--list') opts.list = true;
    else if (a === '--no-cleanup') opts.noCleanup = true;
    else if (a === '--bare-skill') opts.bareSkill = true;
    else if (a === '--all-models') opts.allModels = true;
    else if (a === '--read-only') opts.readOnly = true;
    else if (a === '--scenario') opts.scenario = argv[++i];
    else if (a === '--layer') opts.layer = argv[++i];
    else if (a === '--models') opts.models = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--config') opts.config = argv[++i];
    else if (a === '--run-id') opts.runId = argv[++i];
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
      const scenario = JSON.parse(await readFile(abs, 'utf8'));
      scenario._rel = rel;
      scenario._file = abs;
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
  const runner = ap.runner || { command: 'opencode', args: ['run', '--model', '{model}', '{prompt}'], cwd: '.', timeoutMs: 240000 };
  const transientRetries = ap.rotation?.transientRetries ?? 1;
  const canarySet = new Set(ap.rotation?.canaryIds || []);
  const skillRoot = ap.skillRoot ? path.resolve(path.dirname(configPath), ap.skillRoot) : path.join(REPO_ROOT, 'agents');

  // ── scenarios (no credentials needed to load/list) ──
  const all = await walkScenarios(SCENARIO_DIR);
  let scenarios = selectScenarios(all, ap.scenarios || {}, opts);
  if (scenarios.length === 0) fail('No scenarios selected.');

  if (opts.readOnly) {
    const dropped = scenarios.filter((s) => s.mutates);
    scenarios = scenarios.filter((s) => !s.mutates);
    if (dropped.length && !opts.list) {
      console.log(`Read-only mode: skipping ${dropped.length} mutating scenario(s) (${dropped.map((s) => s.id).join(', ')}).`);
    }
    if (scenarios.length === 0) fail('No read-only scenarios selected.');
  }

  // Bare-skill mode omits the inlined operating contract (the self-containment test). The
  // safety rules then live only in the skill, so refuse to run mutating/canary scenarios
  // in this mode — they must keep the inlined contract.
  if (opts.bareSkill) {
    const dropped = scenarios.filter((s) => s.mutates);
    scenarios = scenarios.filter((s) => !s.mutates);
    if (dropped.length) {
      console.log(`Bare-skill mode: skipping ${dropped.length} mutating scenario(s) (${dropped.map((s) => s.id).join(', ')}) — safety contract must stay inlined.`);
    }
    if (scenarios.length === 0) fail('No read-only scenarios selected for --bare-skill mode.');
  }

  if (opts.list) {
    console.log(`Selected ${scenarios.length} scenario(s):`);
    for (const s of scenarios) console.log(`  ${s.layer}  ${s.id}  [${s.expect.kind}]  — ${s.title}`);
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

  const runId = opts.runId || `run-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
  const resultsDir = path.join(PROTOCOL_DIR, 'results', runId);
  await mkdir(resultsDir, { recursive: true });

  console.log(`\nZeyOS Agent Test Protocol — run ${runId}`);
  console.log(`Instance:  ${instance} (${baseUrl})`);
  console.log(`Mode:      ${opts.dryRun ? 'DRY RUN (no model, no mutation)' : `LIVE — models: ${models.join(', ')}`}${opts.bareSkill ? ' — BARE-SKILL (no inlined operating contract; tests skill self-containment)' : ''}`);
  console.log(`Scenarios: ${scenarios.length}\n`);

  // ── orphan sweep ──
  const sweep = await orphanSweep(client, recordPrefix, { dryRun: opts.dryRun });
  if (sweep.length) {
    console.log(`${opts.dryRun ? 'Would sweep' : 'Swept'} ${sweep.length} orphan record(s) from prior runs.`);
  }

  if (opts.dryRun) {
    await dryRun(scenarios, client);
    return;
  }

  // ── child env for the agent ──
  // Only the instance URL + a freshly-refreshed access token are exposed to the
  // model-driven subprocess (matches the contract in opencode/AGENTS.md). The OAuth
  // client secret and refresh token stay with the harness — scenarios are short and a
  // fresh bearer token suffices, so there is no reason to widen the secret surface to
  // an LLM-backed process.
  const childEnv = {
    ...process.env,
    ZEYOS_BASE_URL: baseUrl,
    ZEYOS_INSTANCE: instance,
    ZEYOS_TOKEN: token.accessToken,
    ZEYOS_REPO_ROOT: REPO_ROOT,
    ZEYOS_SKILL_ROOT: skillRoot
  };

  const records = [];
  for (const scenario of scenarios) {
    const rec = await runScenario({
      scenario, models, runner, childEnv, resultsDir, client, runId, recordPrefix,
      transientRetries, isCanary: canarySet.has(scenario.id), judgeModel: ap.judgeModel, noCleanup: opts.noCleanup,
      bareSkill: opts.bareSkill, allModels: opts.allModels,
      tokenProvider: freshHarnessToken, verifyClientProvider: buildFreshVerifyClient
    });
    records.push(rec);
    console.log(`  ${badge(rec.classification)}  ${scenario.id}  ${rec.summaryLine}`);
  }

  await writeScorecards({ resultsDir, runId, instance, baseUrl, models, records });

  const defects = records.filter((r) => r.classification === 'CLIENT_DEFECT');
  console.log(`\nScorecard: ${path.relative(REPO_ROOT, resultsDir)}/scorecard.md`);
  console.log(summaryCounts(records));
  process.exit(defects.length > 0 ? 1 : 0);
}

// ── per-scenario rotation engine ────────────────────────────────────────────

async function runScenario(c) {
  const { scenario, models, runner, childEnv, resultsDir, client, runId, recordPrefix, transientRetries, isCanary, judgeModel, noCleanup, bareSkill, allModels, tokenProvider, verifyClientProvider } = c;
  const prompt = buildPrompt(scenario, { runId, recordPrefix }, { bareSkill });
  const attempts = [];

  for (const model of models) {
    let verifyClient = verifyClientProvider ? await verifyClientProvider({ force: true }) : client;
    // Seed throwaway records for THIS attempt (e.g. the destructive-canary
    // survivors). Per-attempt so every model faces a fresh seeded set and cannot
    // benefit from a prior attempt's cleanup; cleaned up after the attempt below.
    let seed = {};
    let seedReport = [];
    if (scenario.seed) {
      const seeded = await runSeed(scenario.seed, { client: verifyClient, runId, recordPrefix, result: null });
      seed = seeded.seed;
      seedReport = seeded.report;
    }

    let agent;
    let agentEnv = childEnv;
    for (let t = 0; t <= transientRetries; t += 1) {
      if (tokenProvider) {
        const fresh = await tokenProvider({ force: true });
        agentEnv = { ...childEnv, ZEYOS_TOKEN: fresh.accessToken };
      }
      agent = await runAgent({ runner, model, prompt, env: agentEnv, repoRoot: REPO_ROOT, resultsDir, scenarioId: scenario.id });
      if (agent.transient && t < transientRetries) continue;
      break;
    }

    const resultRaw = parseResultLine(agent.stdout);
    if (verifyClientProvider) verifyClient = await verifyClientProvider({ force: true });
    const ctx = { client: verifyClient, result: resultRaw, rawStdout: agent.stdout, runId, recordPrefix, seed };

    let evalRes;
    if (scenario.expect.kind === 'manual') {
      const transcript = `STDOUT:\n${agent.stdout}\n\nSTDERR:\n${agent.stderr}`;
      const judged = await judgeManual({ judgeModel, rubric: scenario.expect.rubric, transcript, runner, env: agentEnv, repoRoot: REPO_ROOT, resultsDir, scenarioId: scenario.id });
      evalRes = { pass: judged.pass, detail: judged.reason, manual: true };
    } else {
      evalRes = await evaluateExpect(scenario.expect, ctx);
    }
    const failureKind = detectFailureKind({ agent, resultRaw, evalRes });

    // Cleanup runs whenever the scenario declares it (covers both agent-created and
    // harness-seeded records), and always — even when the assertion failed.
    let cleanup = [];
    if (scenario.cleanup && !noCleanup) {
      cleanup = await runCleanup(scenario.cleanup, ctx);
    }

    attempts.push({
      model, pass: evalRes.pass, detail: evalRes.detail,
      expected: evalRes.expected, actual: evalRes.actual,
      resultRaw, transcriptPath: path.relative(resultsDir, agent.transcriptPath),
      durationMs: agent.durationMs, transient: agent.transient, timedOut: agent.timedOut,
      exitCode: agent.code, cleanup, seed: seedReport,
      notExecuted: detectPlannedNotExecuted(agent.stdout, resultRaw),
      failureKind,
      workspacePath: agent.workspacePath || null,
      skillRoot: agent.skillRoot || childEnv.ZEYOS_SKILL_ROOT || null
    });

    if (!allModels && evalRes.pass === true && !isCanary) break;
    if (!allModels && evalRes.pass === null && !isCanary) break;
  }

  const classification = classify(attempts, isCanary);
  return {
    id: scenario.id, layer: scenario.layer, title: scenario.title, skill: scenario.skill || null,
    kind: scenario.expect.kind, mutates: Boolean(scenario.mutates), canary: isCanary,
    classification, attempts, summaryLine: summarizeAttempts(attempts)
  };
}

function buildPrompt(scenario, ctx, opts = {}) {
  const lines = [];
  // Bare-skill mode deliberately omits the inlined operating contract so the only place
  // the agent can learn "you have tools, the CLI is authenticated, act don't plan" is the
  // skill itself — that is the self-containment test. Harness mode inlines AGENTS.md.
  if (!opts.bareSkill && AGENTS_CONTRACT) lines.push(AGENTS_CONTRACT, '', '--- TASK ---', '');
  if (scenario.skill) {
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

async function dryRun(scenarios, client) {
  for (const s of scenarios) {
    const head = `  ${s.layer}  ${s.id}  [${s.expect.kind}]  ${s.mutates ? '(mutates)' : '(read-only)'}`;
    if (s.expect.kind === 'computeCount') {
      try {
        const ev = await evaluateExpect(s.expect, { client, result: null, runId: 'dryrun', recordPrefix: 'AGENTTEST' });
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

async function writeScorecards({ resultsDir, runId, instance, baseUrl, models, records }) {
  await writeFile(path.join(resultsDir, 'scorecard.json'),
    `${JSON.stringify({ runId, instance, baseUrl, models, generatedAt: new Date().toISOString(), records }, null, 2)}\n`, 'utf8');

  const by = (cls) => records.filter((r) => r.classification === cls);
  const lines = [];
  lines.push(`# Agent Test Protocol Scorecard — ${runId}`, '');
  lines.push(`- Instance: \`${instance}\` (${baseUrl})`);
  lines.push(`- Models: ${models.map((m) => `\`${m}\``).join(', ')}`);
  lines.push(`- Generated: ${new Date().toISOString()}`, '');
  lines.push(summaryCounts(records), '');

  const defects = by('CLIENT_DEFECT');
  lines.push(`## 🔴 CLIENT_DEFECT (${defects.length}) — actionable`, '');
  if (defects.length === 0) lines.push('_None — every scenario either passed or was explained by model flakiness._', '');
  for (const r of defects) lines.push(...scenarioBlock(r));

  for (const [title, cls] of [
    ['⚫ RUNNER_FAILURE', 'RUNNER_FAILURE'],
    ['⚪ MODEL_NONCOMPLETION', 'MODEL_NONCOMPLETION'],
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
  return `**${records.length} scenarios** — 🟢 ${c('PASS')} pass · 🔴 ${c('CLIENT_DEFECT')} defect · 🟡 ${c('MODEL_FLAKE')} flake · 🟠 ${c('MODEL_DIVERGENCE')} divergence · ⚫ ${c('RUNNER_FAILURE')} runner · ⚪ ${c('MODEL_NONCOMPLETION')} incomplete · 🔵 ${c('MANUAL_REVIEW')} review`;
}

function badge(cls) {
  return { PASS: '🟢 PASS  ', CLIENT_DEFECT: '🔴 DEFECT', MODEL_FLAKE: '🟡 FLAKE ', MODEL_DIVERGENCE: '🟠 DIVERG', RUNNER_FAILURE: '⚫ RUNNER', MODEL_NONCOMPLETION: '⚪ INCOMP', MANUAL_REVIEW: '🔵 REVIEW' }[cls] || cls;
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
export { classify, globToRe, selectScenarios, buildPrompt, detectPlannedNotExecuted, detectFailureKind, detectToolMisuse, runScenario };

// Only run the orchestrator when invoked directly, not when imported by a test.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`\nFatal: ${err.stack || err.message || err}`);
    process.exit(1);
  });
}
