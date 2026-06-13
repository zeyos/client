/**
 * Runner adapter. Shells out to a configurable coding-agent command (opencode by
 * default) once per (scenario, model) attempt, captures the transcript, and reports
 * whether the failure looks transient (so the rotation engine can retry vs. escalate).
 *
 * Keeping the command in config (agentProtocol.runner) means swapping runners — or
 * opencode flag changes — is a config edit, not a code change.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TRANSIENT_RE = /\b(429|rate.?limit|timed?.?out|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|503|502|temporarily)\b/i;

/** Substitute {model} and {prompt} placeholders in the runner args. */
function buildArgs(argsTemplate, { model, prompt }) {
  return argsTemplate.map((a) =>
    a.replaceAll('{model}', model).replaceAll('{prompt}', prompt)
  );
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
  const cwd = runner.cwd ? path.resolve(repoRoot, runner.cwd) : repoRoot;
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
      child = spawn(runner.command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
    resultsDir, scenarioId, model, prompt, command: `${runner.command} ${args.join(' ')}`, result, durationMs
  });

  return {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    transient,
    durationMs,
    transcriptPath,
    command: `${runner.command} ${args.join(' ')}`
  };
}

async function writeTranscript({ resultsDir, scenarioId, model, prompt, command, result, durationMs }) {
  const safeModel = model.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const dir = path.join(resultsDir, 'transcripts');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${scenarioId}__${safeModel}.txt`);
  const body = [
    `# scenario: ${scenarioId}`,
    `# model:    ${model}`,
    `# command:  ${command}`,
    `# exitCode: ${result.code}  timedOut: ${result.timedOut}  durationMs: ${durationMs}`,
    '',
    '===== PROMPT =====',
    prompt,
    '',
    '===== STDOUT =====',
    result.stdout || '(empty)',
    '',
    '===== STDERR =====',
    result.stderr || '(empty)',
    ''
  ].join('\n');
  await writeFile(file, body, 'utf8');
  return file;
}
