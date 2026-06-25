/**
 * Runner adapter. Shells out to a configurable coding-agent command (opencode by
 * default) once per (scenario, model) attempt, captures the transcript, and reports
 * whether the failure looks transient (so the rotation engine can retry vs. escalate).
 *
 * Keeping the command in config (agentProtocol.runner) means swapping runners — or
 * opencode flag changes — is a config edit, not a code change.
 */

import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TRANSIENT_RE = /\b(429|rate.?limit|timed?.?out|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|503|502|temporarily)\b/i;
const ANSI_RE = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

/** Substitute {model} and {prompt} placeholders in the runner args. */
function buildArgs(argsTemplate, { model, prompt }) {
  return argsTemplate.map((a) =>
    a.replaceAll('{model}', model).replaceAll('{prompt}', prompt)
  );
}

function safeName(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function displayCommand(command, args, prompt) {
  return `${command} ${args.map((a) => (a === prompt ? '[prompt]' : a)).join(' ')}`;
}

function redactSensitive(text, env = {}) {
  let out = String(text || '');
  const token = env.ZEYOS_TOKEN;
  if (token) out = out.replaceAll(String(token), '[REDACTED_TOKEN]');
  out = out.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, '$1[REDACTED_TOKEN]');
  out = out.replace(/\b(access_token=)[^&\s"']+/gi, '$1[REDACTED_TOKEN]');
  out = out.replace(/\b("access_token"\s*:\s*")[^"]+(")/gi, '$1[REDACTED_TOKEN]$2');
  return out;
}

async function copyIfPresent(src, dest) {
  if (!existsSync(src)) return;
  await cp(src, dest, { recursive: true });
}

async function prepareAttemptWorkspace({ runner, model, repoRoot, scenarioId, skillRoot }) {
  if (!runner.workspaceRoot) return { cwd: runner.cwd ? path.resolve(repoRoot, runner.cwd) : repoRoot, workspacePath: null, attemptSkillRoot: skillRoot || path.join(repoRoot, 'agents') };

  const workspacePath = path.join(
    path.resolve(runner.workspaceRoot),
    `${safeName(scenarioId)}__${safeName(model)}__${Date.now()}_${process.pid}`
  );
  await rm(workspacePath, { recursive: true, force: true });
  await mkdir(workspacePath, { recursive: true });

  for (const name of ['README.md', 'docs', 'openapi', 'package.json']) {
    await copyIfPresent(path.join(repoRoot, name), path.join(workspacePath, name));
  }

  const sourceSkillRoot = skillRoot || path.join(repoRoot, 'agents');
  const attemptSkillRoot = path.join(workspacePath, 'agents');
  await copyIfPresent(sourceSkillRoot, attemptSkillRoot);

  const cwd = runner.cwd ? path.resolve(workspacePath, runner.cwd) : workspacePath;
  return { cwd, workspacePath, attemptSkillRoot };
}

/**
 * Run one agent attempt.
 *
 * @returns {Promise<{
 *   code:number, stdout:string, stderr:string, timedOut:boolean,
 *   transient:boolean, durationMs:number, transcriptPath:string, command:string,
 *   usage:null|{source:string, sessionId?:string, costUsd?:number, tokens?:Record<string, number>}
 * }>}
 */
export async function runAgent({ runner, model, prompt, env, repoRoot, resultsDir, scenarioId }) {
  const { cwd, workspacePath, attemptSkillRoot } = await prepareAttemptWorkspace({
    runner,
    model,
    repoRoot,
    scenarioId,
    skillRoot: env?.ZEYOS_SKILL_ROOT
  });
  const childEnv = {
    ...env,
    PWD: cwd,
    ZEYOS_SKILL_ROOT: attemptSkillRoot,
    ...(workspacePath ? { ZEYOS_ATTEMPT_WORKSPACE: workspacePath } : {})
  };
  const args = buildArgs(runner.args || [], { model, prompt });
  const timeoutMs = runner.timeoutMs ?? 240000;
  const started = Date.now();

  const result = await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const settle = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };

    let child;
    try {
      child = spawn(runner.command, args, { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ code: 127, stdout: '', stderr: String(err.message || err), timedOut: false, spawnError: err });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    // 'error' (e.g. ENOENT: runner not on PATH) may fire WITHOUT a following 'close'.
    // Resolve here too, or the harness would hang on a missing runner binary.
    child.on('error', (err) => {
      settle({ code: 127, stdout, stderr: `${stderr}\n${err.message || err}`.trim(), timedOut, spawnError: err });
    });
    child.on('close', (code) => {
      settle({ code: code ?? 1, stdout, stderr, timedOut, spawnError: null });
    });
  });

  const ended = Date.now();
  const durationMs = ended - started;
  const transient =
    result.timedOut ||
    (result.code !== 0 && TRANSIENT_RE.test(`${result.stderr}\n${result.stdout}`));
  const usage = await captureUsage({
    runner,
    args,
    cwd,
    repoRoot,
    model,
    started,
    ended,
    stdout: result.stdout,
    stderr: result.stderr
  });
  const toolSummary = summarizeToolCalls(`${result.stdout || ''}\n${result.stderr || ''}`);

  const transcriptPath = await writeTranscript({
    resultsDir,
    scenarioId,
    model,
    prompt,
    command: displayCommand(runner.command, args, prompt),
    result,
    durationMs,
    workspacePath,
    skillRoot: attemptSkillRoot,
    env: childEnv,
    usage,
    toolSummary
  });

  return {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    transient,
    durationMs,
    transcriptPath,
    command: displayCommand(runner.command, args, prompt),
    workspacePath,
    skillRoot: attemptSkillRoot,
    runnerError: Boolean(result.spawnError),
    usage,
    toolSummary
  };
}

async function writeTranscript({ resultsDir, scenarioId, model, prompt, command, result, durationMs, workspacePath, skillRoot, env, usage, toolSummary }) {
  const safeModel = safeName(model);
  const dir = path.join(resultsDir, 'transcripts');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${scenarioId}__${safeModel}.txt`);
  const stdout = redactSensitive(result.stdout, env);
  const stderr = redactSensitive(result.stderr, env);
  const body = [
    `# scenario: ${scenarioId}`,
    `# model:    ${model}`,
    `# command:  ${command}`,
    `# exitCode: ${result.code}  timedOut: ${result.timedOut}  durationMs: ${durationMs}`,
    `# workspace: ${workspacePath || '(repo root)'}`,
    `# skillRoot: ${skillRoot || '(default)'}`,
    `# usage: ${formatUsage(usage)}`,
    `# toolCalls: total=${toolSummary?.totalCalls ?? 0} zeyos=${toolSummary?.zeyosCalls ?? 0}`,
    '',
    '===== PROMPT =====',
    prompt,
    '',
    '===== STDOUT =====',
    stdout || '(empty)',
    '',
    '===== STDERR =====',
    stderr || '(empty)',
    ''
  ].join('\n');
  await writeFile(file, body, 'utf8');
  return file;
}

function summarizeToolCalls(text) {
  const clean = stripAnsi(text);
  let shellCalls = 0;
  let zeyosCalls = 0;
  let otherToolCalls = 0;
  let observed = false;
  for (const line of clean.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^>\s+\S+/.test(trimmed)) observed = true;
    const shell = trimmed.match(/^\$\s+(.+)$/);
    if (shell) {
      observed = true;
      shellCalls += 1;
      if (isZeyosShellCommand(shell[1])) zeyosCalls += 1;
      continue;
    }
    if (/^->\s+[A-Z][A-Za-z0-9_-]*\b/.test(trimmed) || /^→\s+[A-Z][A-Za-z0-9_-]*\b/.test(trimmed)) {
      observed = true;
      otherToolCalls += 1;
    }
  }
  return {
    source: 'runner-transcript',
    observed,
    totalCalls: shellCalls + otherToolCalls,
    shellCalls,
    zeyosCalls,
    otherToolCalls
  };
}

function stripAnsi(text) {
  return String(text || '').replace(ANSI_RE, '');
}

function isZeyosShellCommand(commandLine) {
  const command = String(commandLine || '').trim();
  if (!command) return false;
  return /(^|[;&|()]\s*)(?:env\s+(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*)?(?:\.\/)?zeyos(\s|$|[;&|])/.test(command) ||
    /(^|[;&|()]\s*)(?:node\s+)?(?:\.\/)?cli\/bin\/zeyos\.mjs(\s|$|[;&|])/.test(command);
}

async function captureUsage({ runner, args, cwd, repoRoot, model, started, ended, stdout, stderr }) {
  const fromText = extractUsageFromText(`${stdout || ''}\n${stderr || ''}`);
  if (fromText) return fromText;
  const command = path.basename(String(runner.command || ''));
  if (command !== 'opencode' || !args.includes('run')) return null;
  return readOpenCodeUsage({ directories: [cwd, repoRoot], preferredDirectory: cwd, model, started, ended });
}

function extractUsageFromText(text) {
  for (const line of String(text || '').split(/\r?\n/).reverse()) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) continue;
    let event;
    try { event = JSON.parse(trimmed); } catch { continue; }
    const usage = normalizeUsage(event.usage || event.tokens || event);
    if (usage) return { source: 'runner-json', ...usage };
  }
  return null;
}

function normalizeUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const costUsd = firstFinite(raw.costUsd, raw.cost_usd, raw.cost, raw.totalCost, raw.total_cost);
  const tokens = {
    input: firstFinite(raw.input, raw.inputTokens, raw.promptTokens, raw.prompt_tokens, raw.tokens_input),
    output: firstFinite(raw.output, raw.outputTokens, raw.completionTokens, raw.completion_tokens, raw.tokens_output),
    reasoning: firstFinite(raw.reasoning, raw.reasoningTokens, raw.reasoning_tokens, raw.tokens_reasoning),
    cacheRead: firstFinite(raw.cacheRead, raw.cache_read, raw.cachedInputTokens, raw.cache_read_tokens, raw.tokens_cache_read),
    cacheWrite: firstFinite(raw.cacheWrite, raw.cache_write, raw.cache_write_tokens, raw.tokens_cache_write),
  };
  const knownTokens = Object.fromEntries(Object.entries(tokens).filter(([, value]) => value != null));
  if (costUsd == null && Object.keys(knownTokens).length === 0) return null;
  const total = firstFinite(raw.total, raw.totalTokens, raw.total_tokens);
  return {
    ...(costUsd != null ? { costUsd } : {}),
    tokens: {
      ...knownTokens,
      ...(total != null ? { total } : totalTokens(knownTokens) > 0 ? { total: totalTokens(knownTokens) } : {})
    }
  };
}

async function readOpenCodeUsage({ directories, preferredDirectory, model, started, ended }) {
  const dbPath = process.env.OPENCODE_DB || path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
  if (!existsSync(dbPath)) return null;

  const searchDirectories = [...new Set((directories || []).filter(Boolean).map((dir) => path.resolve(dir)))];
  if (!searchDirectories.length) return null;

  const since = Math.max(0, Number(started) - 10_000);
  const until = Number(ended) + 60_000;
  const sql = [
    'select id,title,model,cost,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write,time_created,time_updated,directory',
    'from session',
    `where directory in (${searchDirectories.map(sqlString).join(',')})`,
    `and time_updated >= ${Math.floor(since)}`,
    `and time_created <= ${Math.floor(until)}`,
    `order by case when directory = ${sqlString(preferredDirectory || searchDirectories[0])} then 0 else 1 end, time_updated desc`,
    'limit 16;'
  ].join(' ');

  let rows;
  try {
    rows = await sqliteJson(dbPath, sql);
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const expected = parseOpenCodeModel(model);
  const row = expected
    ? rows.find((candidate) => openCodeModelMatches(candidate.model, expected))
    : rows[0];
  if (!row) return null;
  return openCodeUsageFromRow(row);
}

function openCodeUsageFromRow(row) {
  if (!row) return null;
  const tokens = {
    input: toNumber(row.tokens_input),
    output: toNumber(row.tokens_output),
    reasoning: toNumber(row.tokens_reasoning),
    cacheRead: toNumber(row.tokens_cache_read),
    cacheWrite: toNumber(row.tokens_cache_write),
  };
  const knownTokens = Object.fromEntries(Object.entries(tokens).filter(([, value]) => value != null));
  const usage = normalizeUsage({ costUsd: row.cost, ...knownTokens });
  if (!usage) return null;
  return {
    source: 'opencode-db',
    sessionId: row.id,
    model: safeJsonParse(row.model) || row.model || null,
    ...usage
  };
}

async function sqliteJson(dbPath, sql) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await sqliteJsonOnce(dbPath, sql);
    if (result.ok) return result.rows;
    if (!/locked|busy/i.test(result.error || '') || attempt === 2) return null;
    await delay(100 * (attempt + 1));
  }
  return null;
}

function sqliteJsonOnce(dbPath, sql) {
  return new Promise((resolve) => {
    execFile('sqlite3', ['-readonly', '-json', dbPath, sql], { timeout: 3000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve({ ok: false, error: err.message || String(err) });
      try {
        return resolve({ ok: true, rows: JSON.parse(stdout || '[]') });
      } catch (parseErr) {
        return resolve({ ok: false, error: parseErr.message || String(parseErr) });
      }
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseOpenCodeModel(model) {
  const parts = String(model || '').split('/');
  if (parts.length < 2) return null;
  return {
    providerID: parts[0],
    id: parts.slice(1).join('/')
  };
}

function openCodeModelMatches(rawModel, expected) {
  const model = typeof rawModel === 'string' ? safeJsonParse(rawModel) : rawModel;
  return model?.providerID === expected.providerID && model?.id === expected.id;
}

function safeJsonParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function sqlString(value) {
  return `'${String(value || '').replaceAll("'", "''")}'`;
}

function firstFinite(...values) {
  for (const value of values) {
    const n = toNumber(value);
    if (n != null) return n;
  }
  return null;
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function totalTokens(tokens) {
  return Object.values(tokens || {}).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

function formatUsage(usage) {
  if (!usage) return 'unknown';
  const parts = [usage.source];
  if (usage.sessionId) parts.push(`session=${usage.sessionId}`);
  if (Number.isFinite(usage.costUsd)) parts.push(`costUsd=${usage.costUsd}`);
  const tokens = usage.tokens || {};
  for (const [key, value] of Object.entries(tokens)) {
    if (Number.isFinite(value)) parts.push(`${key}Tokens=${value}`);
  }
  return parts.join(' ');
}

export { extractUsageFromText, normalizeUsage, openCodeUsageFromRow, summarizeToolCalls, stripAnsi };
