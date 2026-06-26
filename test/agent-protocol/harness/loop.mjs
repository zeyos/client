#!/usr/bin/env node
/**
 * Developer improvement loop for ZeyOS agent skills.
 *
 * Runs the existing agent protocol against a baseline skill pack and a candidate
 * skill pack, across runner presets and model rotations, then writes a delta
 * report. This file intentionally reuses run.mjs for auth, safety, seeding,
 * cleanup, and independent verification.
 */

import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const PROTOCOL_DIR = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(PROTOCOL_DIR, 'results');
const RUNNER = path.join(__dirname, 'run.mjs');

const DEFAULT_MODELS = [
  'openrouter/qwen/qwen3.7-plus',
  'openrouter/x-ai/grok-build-0.1',
  'openrouter/nvidia/nemotron-3-ultra-550b-a55b',
  'openrouter/z-ai/glm-5.2'
];

const DEFAULT_AGENTS = ['opencode', 'pi'];
const MODEL_LIST_TIMEOUT_MS = 30000;

function csv(value, fallback = []) {
  if (!value) return fallback;
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const opts = {
    runId: `loop-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`,
    agents: DEFAULT_AGENTS,
    models: DEFAULT_MODELS,
    // Knowledge-context axis: which guidance the agent is pointed at. Defaults to
    // the original skills-only behaviour; add okf/both to measure the OKF bundle.
    contexts: ['skills'],
    baselineRef: 'HEAD',
    candidateSkills: path.join(REPO_ROOT, 'agents'),
    timeoutMs: 180000,
    transientRetries: 0,
    fullOnly: false,
    readOnly: false,
    dryRun: false,
    scenario: null,
    modelPreflight: true,
    config: path.join(REPO_ROOT, 'config.test.json')
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--run-id') opts.runId = argv[++i];
    else if (a === '--agents') opts.agents = csv(argv[++i]);
    else if (a === '--models') opts.models = csv(argv[++i]);
    else if (a === '--context') opts.contexts = csv(argv[++i], ['skills']);
    else if (a === '--baseline-ref') opts.baselineRef = argv[++i];
    else if (a === '--candidate-skills') opts.candidateSkills = path.resolve(argv[++i]);
    else if (a === '--timeout-ms') opts.timeoutMs = Number(argv[++i]);
    else if (a === '--transient-retries') opts.transientRetries = Number(argv[++i]);
    else if (a === '--full-only') opts.fullOnly = true;
    else if (a === '--read-only') opts.readOnly = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--scenario') opts.scenario = argv[++i];
    else if (a === '--no-model-preflight') opts.modelPreflight = false;
    else if (a === '--config') opts.config = path.resolve(argv[++i]);
  }

  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) throw new Error('--timeout-ms must be a positive number.');
  if (!Number.isInteger(opts.transientRetries) || opts.transientRetries < 0) throw new Error('--transient-retries must be a non-negative integer.');
  return opts;
}

function modelListCommands(agent, models) {
  if (agent === 'opencode') {
    const providers = [...new Set(models.map((m) => String(m).split('/')[0]).filter(Boolean))];
    return providers.length
      ? providers.map((provider) => ({ command: 'opencode', args: ['models', provider] }))
      : [{ command: 'opencode', args: ['models'] }];
  }
  if (agent === 'pi') return [{ command: 'pi', args: ['--list-models'] }];
  return [];
}

function parseAvailableModels(agent, output) {
  const models = new Set();
  for (const raw of String(output || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^provider\s+model\b/i.test(line)) continue;
    const cols = line.split(/\s+/);
    if (agent === 'pi' && cols.length >= 2 && /^[a-z][a-z0-9._-]*$/i.test(cols[0])) {
      models.add(`${cols[0]}/${cols[1]}`);
    } else if (cols[0]?.includes('/')) {
      models.add(cols[0]);
    }
  }
  return models;
}

function runNativeListCommand({ command, args }) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child;
    const settle = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      if (child) child.kill('SIGKILL');
      settle({ code: 124, stdout, stderr, timedOut: true, error: null });
    }, MODEL_LIST_TIMEOUT_MS);

    try {
      child = spawn(command, args, { cwd: REPO_ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      settle({ code: 127, stdout, stderr: String(err.message || err), timedOut: false, error: err });
      return;
    }

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => settle({ code: 127, stdout, stderr: `${stderr}\n${err.message || err}`.trim(), timedOut: false, error: err }));
    child.on('close', (code) => settle({ code: code ?? 1, stdout, stderr, timedOut: false, error: null }));
  });
}

async function nativeModelListOutput(agent, models, runCommand = runNativeListCommand) {
  const commands = modelListCommands(agent, models);
  if (!commands.length) return { status: 'skipped', message: `No native model-list command is known for agent "${agent}".` };

  let output = '';
  for (const command of commands) {
    const res = await runCommand(command);
    const rendered = `${command.command} ${command.args.join(' ')}`;
    if (res.error) return { status: 'error', message: `${rendered} failed to start: ${res.error.message || res.error}` };
    if (res.timedOut) return { status: 'warning', message: `${rendered} timed out after ${MODEL_LIST_TIMEOUT_MS}ms; model availability was not checked.` };
    if (res.code !== 0) {
      const detail = String(res.stderr || res.stdout || '').trim();
      return { status: 'warning', message: `${rendered} exited ${res.code}; model availability was not checked.${detail ? ` ${detail}` : ''}` };
    }
    output += `\n${res.stdout}`;
  }

  return { status: 'ok', output };
}

async function checkModelAvailability(agent, models, listOutput = nativeModelListOutput) {
  if (!models.length) return { status: 'skipped', agent, message: 'No models configured.' };
  const listed = await listOutput(agent, models);
  if (listed.status !== 'ok') return { agent, ...listed };

  const available = parseAvailableModels(agent, listed.output);
  if (available.size === 0) {
    return {
      status: 'warning',
      agent,
      message: `Native model list for ${agent} returned no parseable model IDs; model availability was not checked.`
    };
  }

  const missing = models.filter((model) => !available.has(model));
  if (missing.length) return { status: 'unavailable', agent, missing, availableCount: available.size };
  return { status: 'ok', agent, availableCount: available.size };
}

async function preflightModels(opts) {
  if (opts.dryRun) {
    console.log('[agent-loop] Model preflight skipped for dry-run; no models are invoked.');
    return;
  }
  if (!opts.modelPreflight) {
    console.warn('[agent-loop] Model preflight skipped by --no-model-preflight.');
    return;
  }

  const checks = await Promise.all(opts.agents.map((agent) => checkModelAvailability(agent, opts.models)));
  const hardFailures = [];
  for (const check of checks) {
    if (check.status === 'ok') {
      console.log(`[agent-loop] Model preflight ok for ${check.agent}: ${opts.models.length} requested model(s), ${check.availableCount} listed.`);
    } else if (check.status === 'unavailable') {
      hardFailures.push(`${check.agent}: unavailable model id(s): ${check.missing.join(', ')}`);
    } else if (check.status === 'error') {
      hardFailures.push(`${check.agent}: ${check.message}`);
    } else {
      console.warn(`[agent-loop] Model preflight warning for ${check.agent}: ${check.message}`);
    }
  }

  if (hardFailures.length) {
    throw new Error(`Model availability preflight failed:\n${hardFailures.map((f) => `  - ${f}`).join('\n')}\nUse a listed model ID, adjust --agents/--models, or pass --no-model-preflight to skip this check intentionally.`);
  }
}

function runnerPreset(agent, timeoutMs, workspaceRoot) {
  if (agent === 'opencode') {
    return {
      command: 'opencode',
      args: ['run', '--pure', '--model', '{model}', '{prompt}'],
      cwd: '.',
      timeoutMs,
      workspaceRoot
    };
  }
  if (agent === 'pi') {
    return {
      command: 'pi',
      args: ['-p', '--model', '{model}', '--no-session', '--no-context-files', '--approve', '--tools', 'read,bash,grep,find,ls', '{prompt}'],
      cwd: '.',
      timeoutMs,
      workspaceRoot
    };
  }
  throw new Error(`Unknown agent preset "${agent}". Use one of: ${DEFAULT_AGENTS.join(', ')}.`);
}

async function loadConfig(configPath) {
  try {
    return JSON.parse(await readFile(configPath, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read config at ${configPath}: ${err.message || err}`);
  }
}

async function copyBaselineSkills(ref, destRoot) {
  await rm(destRoot, { recursive: true, force: true });
  await mkdir(destRoot, { recursive: true });
  const archive = spawnSync('git', ['archive', '--format=tar', ref, 'agents'], {
    cwd: REPO_ROOT,
    encoding: null,
    maxBuffer: 1024 * 1024 * 50
  });
  if (archive.status !== 0) {
    throw new Error(`git archive ${ref}:agents failed: ${archive.stderr?.toString() || archive.error?.message || 'unknown error'}`);
  }
  const untar = spawnSync('tar', ['-x', '-C', destRoot], {
    input: archive.stdout,
    encoding: null,
    maxBuffer: 1024 * 1024 * 50
  });
  if (untar.status !== 0) {
    throw new Error(`Could not unpack baseline skill archive: ${untar.stderr?.toString() || untar.error?.message || 'unknown error'}`);
  }
  return path.join(destRoot, 'agents');
}

async function copyCandidateSkills(src, destRoot) {
  if (!existsSync(src)) throw new Error(`Candidate skill root does not exist: ${src}`);
  await rm(destRoot, { recursive: true, force: true });
  await mkdir(destRoot, { recursive: true });
  const dest = path.join(destRoot, 'agents');
  await cp(src, dest, { recursive: true });
  return dest;
}

function buildProtocolConfig(baseConfig, { models, runner, skillRoot, transientRetries }) {
  const cfg = JSON.parse(JSON.stringify(baseConfig || {}));
  cfg.agentProtocol = cfg.agentProtocol || {};
  cfg.agentProtocol.models = models;
  cfg.agentProtocol.runner = runner;
  cfg.agentProtocol.skillRoot = skillRoot;
  cfg.agentProtocol.rotation = {
    ...(cfg.agentProtocol.rotation || {}),
    transientRetries
  };
  return cfg;
}

async function writeConfig(file, config) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function protocolArgs({ configPath, runId, mode, readOnly, dryRun, scenario, context = 'skills' }) {
  const args = [RUNNER, '--config', configPath, '--run-id', runId];
  // Only emit --context for non-default contexts so default skills-only runs stay
  // byte-identical to the original invocation (run.mjs defaults to skills).
  if (context && context !== 'skills') args.push('--context', context);
  if (dryRun) args.push('--dry-run');
  if (scenario) args.push('--scenario', scenario);
  if (readOnly) args.push('--read-only');
  if (mode === 'bare-skill') {
    args.push('--bare-skill', '--read-only', '--all-models');
    if (!scenario) args.push('--layer', 'b');
  }
  return args;
}

function runProtocol(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: process.env
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(127));
  });
}

async function readScorecard(runId) {
  const file = path.join(RESULTS_DIR, runId, 'scorecard.json');
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function recordKey(record) {
  return `${record.id}`;
}

function scoreClassification(cls) {
  return {
    PASS: 0,
    MODEL_FLAKE: 1,
    MODEL_DIVERGENCE: 2,
    MODEL_NONCOMPLETION: 2,
    RUNNER_FAILURE: 2,
    MANUAL_REVIEW: 2,
    CLIENT_DEFECT: 3
  }[cls] ?? 3;
}

function hasSafetyViolation(record) {
  return record.attempts?.some((a) => a.failureKind === 'safety_violation') || false;
}

function compareRecords(baseline = [], candidate = []) {
  const base = new Map(baseline.map((r) => [recordKey(r), r]));
  const cand = new Map(candidate.map((r) => [recordKey(r), r]));
  const keys = new Set([...base.keys(), ...cand.keys()]);
  const out = { improvements: [], regressions: [], unchangedPass: [], unchangedFailure: [], missing: [] };

  for (const key of [...keys].sort()) {
    const b = base.get(key);
    const c = cand.get(key);
    if (!b || !c) {
      out.missing.push({ key, baseline: b?.classification || null, candidate: c?.classification || null });
      continue;
    }
    const row = { key, baseline: b.classification, candidate: c.classification, skill: c.skill || b.skill || null };
    const bScore = scoreClassification(b.classification);
    const cScore = scoreClassification(c.classification);
    if (cScore < bScore) out.improvements.push(row);
    else if (cScore > bScore || (!hasSafetyViolation(b) && hasSafetyViolation(c))) out.regressions.push(row);
    else if (c.classification === 'PASS') out.unchangedPass.push(row);
    else out.unchangedFailure.push(row);
  }

  return out;
}

function flattenRuns(runs) {
  return runs.flatMap((run) =>
    (run.scorecard?.records || []).map((record) => ({ ...record, variant: run.variant, agent: run.agent, mode: run.mode, context: run.context, protocolRunId: run.protocolRunId }))
  );
}

function groupAttemptRates(records) {
  const rows = new Map();
  for (const record of records) {
    for (const attempt of record.attempts || []) {
      const key = [record.variant, record.agent, record.mode, record.context, attempt.model].join('|');
      const row = rows.get(key) || { variant: record.variant, agent: record.agent, mode: record.mode, context: record.context, model: attempt.model, pass: 0, total: 0 };
      row.total += 1;
      if (attempt.pass === true) row.pass += 1;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => [a.variant, a.agent, a.mode, a.context, a.model].join('|').localeCompare([b.variant, b.agent, b.mode, b.context, b.model].join('|')));
}

function summarizeVariant(records, variant) {
  const mine = records.filter((r) => r.variant === variant);
  const pass = mine.filter((r) => r.classification === 'PASS').length;
  const clientDefects = mine.filter((r) => r.classification === 'CLIENT_DEFECT').length;
  const safety = mine.filter(hasSafetyViolation).length;
  return { variant, pass, total: mine.length, clientDefects, safety };
}

function markdownTable(headers, rows) {
  if (!rows.length) return '_None._';
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`
  ];
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  return lines.join('\n');
}

function scorecardCell(run, opts = {}) {
  if (run.scorecard) return `\`${path.relative(REPO_ROOT, path.join(RESULTS_DIR, run.protocolRunId, 'scorecard.md'))}\``;
  return opts.dryRun ? '_not expected in dry-run_' : '_none_';
}

async function writeLoopReports({ loopDir, loopId, opts, runs }) {
  const records = flattenRuns(runs);
  const comparisons = [];
  for (const agent of opts.agents) {
    for (const mode of ['full', ...(opts.fullOnly ? [] : ['bare-skill'])]) {
      for (const context of opts.contexts) {
        const match = (variant) => records.filter((r) => r.variant === variant && r.agent === agent && r.mode === mode && r.context === context);
        const baseline = match('baseline');
        const candidate = match('candidate');
        if (baseline.length || candidate.length) comparisons.push({ agent, mode, context, ...compareRecords(baseline, candidate) });
      }
    }
  }

  const baselineStats = summarizeVariant(records, 'baseline');
  const candidateStats = summarizeVariant(records, 'candidate');
  const candidateBetter =
    candidateStats.safety === 0 &&
    candidateStats.clientDefects <= baselineStats.clientDefects &&
    records.filter((r) => r.variant === 'candidate' && r.classification !== 'PASS').length <
      records.filter((r) => r.variant === 'baseline' && r.classification !== 'PASS').length;

  const json = {
    loopId,
    generatedAt: new Date().toISOString(),
    options: opts,
    candidateBetter,
    stats: { baseline: baselineStats, candidate: candidateStats },
    runs,
    comparisons,
    attemptRates: groupAttemptRates(records)
  };
  await writeFile(path.join(loopDir, 'loop-summary.json'), `${JSON.stringify(json, null, 2)}\n`, 'utf8');

  const lines = [];
  lines.push(`# ZeyOS Agent Improvement Loop - ${loopId}`, '');
  lines.push(`- Candidate better: **${candidateBetter ? 'yes' : 'no'}**`);
  lines.push(`- Models: ${opts.models.map((m) => `\`${m}\``).join(', ')}`);
  lines.push(`- Agents: ${opts.agents.map((a) => `\`${a}\``).join(', ')}`);
  lines.push(`- Modes: ${opts.fullOnly ? '`full`' : '`full`, `bare-skill`'}`);
  lines.push(`- Contexts: ${opts.contexts.map((c) => `\`${c}\``).join(', ')}`);
  if (opts.scenario) lines.push(`- Scenario: \`${opts.scenario}\``);
  if (opts.dryRun) lines.push('- Dry run: scorecards are not expected; protocol runs verify setup and selected scenario wiring without invoking models.');
  lines.push('');
  lines.push('## Variant Summary', '');
  lines.push(markdownTable(
    ['Variant', 'Pass', 'Total', 'Client defects', 'Safety violations'],
    [baselineStats, candidateStats].map((s) => [s.variant, String(s.pass), String(s.total), String(s.clientDefects), String(s.safety)])
  ));
  lines.push('', '## Deltas', '');
  for (const cmp of comparisons) {
    lines.push(`### ${cmp.agent} / ${cmp.mode} / context:${cmp.context}`, '');
    lines.push(`- Improvements: ${cmp.improvements.length}`);
    lines.push(`- Regressions: ${cmp.regressions.length}`);
    lines.push(`- Unchanged failures: ${cmp.unchangedFailure.length}`);
    if (cmp.improvements.length) {
      lines.push('', markdownTable(['Scenario', 'Skill', 'Baseline', 'Candidate'], cmp.improvements.map((r) => [r.key, r.skill || '-', r.baseline, r.candidate])));
    }
    if (cmp.regressions.length) {
      lines.push('', markdownTable(['Scenario', 'Skill', 'Baseline', 'Candidate'], cmp.regressions.map((r) => [r.key, r.skill || '-', r.baseline, r.candidate])));
    }
    lines.push('');
  }
  lines.push('## Attempt Pass Rates', '');
  lines.push(markdownTable(
    ['Variant', 'Agent', 'Mode', 'Context', 'Model', 'Pass/Total'],
    groupAttemptRates(records).map((r) => [r.variant, r.agent, r.mode, r.context, `\`${r.model}\``, `${r.pass}/${r.total}`])
  ));
  lines.push('', '## Protocol Runs', '');
  lines.push(markdownTable(
    ['Variant', 'Agent', 'Mode', 'Exit', 'Scorecard'],
    runs.map((r) => [r.variant, r.agent, r.mode, String(r.exitCode), scorecardCell(r, opts)])
  ));
  await writeFile(path.join(loopDir, 'loop-summary.md'), `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const loopDir = path.join(RESULTS_DIR, opts.runId);
  await mkdir(loopDir, { recursive: true });
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'zeyos-agent-loop-'));
  let exitCode = 0;

  try {
    const baseConfig = await loadConfig(opts.config);
    await preflightModels(opts);
    const baselineSkills = await copyBaselineSkills(opts.baselineRef, path.join(loopDir, 'skill-roots', 'baseline'));
    const candidateSkills = await copyCandidateSkills(path.resolve(opts.candidateSkills), path.join(loopDir, 'skill-roots', 'candidate'));

    const variants = [
      { key: 'baseline', skillRoot: baselineSkills },
      { key: 'candidate', skillRoot: candidateSkills }
    ];
    const modes = [
      { key: 'full', readOnly: opts.readOnly },
      ...(opts.fullOnly ? [] : [{ key: 'bare-skill', readOnly: true }])
    ];

    const runs = [];
    for (const variant of variants) {
      for (const agent of opts.agents) {
        for (const mode of modes) {
          for (const context of opts.contexts) {
            const tag = `${variant.key}-${agent}-${mode.key}-${context}`;
            const protocolRunId = `${opts.runId}-${tag}`;
            const workspaceRoot = path.join(loopDir, 'workspaces', tag);
            const runner = runnerPreset(agent, opts.timeoutMs, workspaceRoot);
            const protocolConfig = buildProtocolConfig(baseConfig, {
              models: opts.models,
              runner,
              skillRoot: variant.skillRoot,
              transientRetries: opts.transientRetries
            });
            const configPath = path.join(runtimeDir, 'configs', `${protocolRunId}.json`);
            await writeConfig(configPath, protocolConfig);

            const args = protocolArgs({
              configPath,
              runId: protocolRunId,
              mode: mode.key,
              readOnly: mode.readOnly,
              dryRun: opts.dryRun,
              scenario: opts.scenario,
              context
            });
            console.log(`\n[agent-loop] ${variant.key} / ${agent} / ${mode.key} / context:${context}`);
            const exitCode = await runProtocol(args);
            const scorecard = await readScorecard(protocolRunId);
            runs.push({ variant: variant.key, agent, mode: mode.key, context, protocolRunId, exitCode, scorecard });
          }
        }
      }
    }

    await writeLoopReports({ loopDir, loopId: opts.runId, opts, runs });
    if (opts.dryRun) console.log('[agent-loop] Dry-run summary written; scorecards are not expected in dry-run.');
    console.log(`\nLoop summary: ${path.relative(REPO_ROOT, path.join(loopDir, 'loop-summary.md'))}`);

    const hardFailure = runs.some((r) => r.exitCode !== 0 && r.scorecard?.records?.some((rec) => rec.classification === 'CLIENT_DEFECT'));
    exitCode = hardFailure ? 1 : 0;
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

export {
  DEFAULT_AGENTS,
  DEFAULT_MODELS,
  parseArgs,
  runnerPreset,
  compareRecords,
  buildProtocolConfig,
  protocolArgs,
  modelListCommands,
  parseAvailableModels,
  checkModelAvailability,
  scorecardCell
};

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`\nFatal: ${err.stack || err.message || err}`);
    process.exit(1);
  });
}
