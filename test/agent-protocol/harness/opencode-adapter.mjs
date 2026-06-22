/**
 * Runner adapter. Shells out to a configurable coding-agent command (opencode by
 * default) once per (scenario, model) attempt, captures the transcript, and reports
 * whether the failure looks transient (so the rotation engine can retry vs. escalate).
 *
 * Keeping the command in config (agentProtocol.runner) means swapping runners — or
 * opencode flag changes — is a config edit, not a code change.
 */

import { spawn } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const TRANSIENT_RE = /\b(429|rate.?limit|timed?.?out|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|503|502|temporarily)\b/i;

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
 *   transient:boolean, durationMs:number, transcriptPath:string, command:string
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

  const durationMs = Date.now() - started;
  const transient =
    result.timedOut ||
    (result.code !== 0 && TRANSIENT_RE.test(`${result.stderr}\n${result.stdout}`));

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
    env: childEnv
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
    runnerError: Boolean(result.spawnError)
  };
}

async function writeTranscript({ resultsDir, scenarioId, model, prompt, command, result, durationMs, workspacePath, skillRoot, env }) {
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
