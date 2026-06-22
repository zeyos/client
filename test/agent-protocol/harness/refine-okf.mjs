#!/usr/bin/env node
/**
 * OKF refinement loop — the enrichment-agent analog (Google's OKF "enrichment
 * agent", adapted): generate → validate → judge → (optionally) apply.
 *
 * For each target concept (chosen explicitly, or derived from a run scorecard's
 * weak scenarios), a proposer model drafts improved CURATED guidance for the
 * concept's notes. The proposal is then:
 *   1. validated against the generated schema — any field it claims must exist on
 *      the entity, so the model cannot invent columns/enums (client.schema is the
 *      source of truth);
 *   2. judged by a held-out model (judge.mjs) for accuracy + usefulness;
 *   3. applied ONLY to the curated region (never the generated managed block), and
 *      only when --apply is set and the judge passes.
 *
 * The generated structural content is never touched, so refinement is safe to run
 * repeatedly. Pair it with the loop's --context okf measurement: the scorecard
 * tells you which concept is weak; this loop improves that concept's curated notes.
 *
 * Usage:
 *   node test/agent-protocol/harness/refine-okf.mjs --concept entities/tickets [--apply]
 *   node test/agent-protocol/harness/refine-okf.mjs --scorecard results/<run>/scorecard.json
 *
 * Offline-safe helpers (targetConceptsFromScorecard, parseProposal, validateFields,
 * replaceCuratedTail) are exported and unit-tested in test/okf.test.js.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { SCHEMA } from '../../../src/generated/schema.js';
import { GENERATED_END, parseConcept, loadOkfBundle } from '../../../src/runtime/okf.js';
import { runAgent } from './opencode-adapter.mjs';
import { judgeOkfRevision } from './judge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

// ── Pure helpers (exported for offline tests) ──────────────────────────────────

/** Derive candidate concept ids from a scorecard: for every non-PASS record, scan
 *  its skill/title/prompt for entity nouns that exist in the bundle. */
export function targetConceptsFromScorecard(scorecard, conceptIds) {
  const entitySet = new Set(conceptIds.filter((id) => id.startsWith('entities/')).map((id) => id.slice('entities/'.length)));
  const targets = new Set();
  for (const record of scorecard?.records || []) {
    if (record.classification === 'PASS') continue;
    const haystack = `${record.skill || ''} ${record.title || ''} ${record.id || ''}`.toLowerCase();
    for (const entity of entitySet) {
      if (haystack.includes(entity)) targets.add(`entities/${entity}`);
    }
  }
  return [...targets].sort();
}

/** Parse a proposer reply of the form:
 *    FIELDS: a, b, c
 *    NOTES:
 *    <markdown>
 *  Missing FIELDS → []. Missing NOTES marker → notes is the whole reply. */
export function parseProposal(stdout) {
  const text = String(stdout || '');
  const fieldsMatch = /^\s*FIELDS:\s*(.*)$/im.exec(text);
  const fields = fieldsMatch
    ? fieldsMatch[1].split(',').map((s) => s.trim().replace(/^`|`$/g, '')).filter(Boolean)
    : [];
  const notesIdx = text.search(/^\s*NOTES:\s*$/im);
  const notes = notesIdx === -1
    ? text.trim()
    : text.slice(text.indexOf('\n', notesIdx) + 1).trim();
  return { fields, notes };
}

/** Return the proposed field names that do NOT exist on the entity (hallucinations).
 *  Dot-notation joins (`account.lastname`) are validated on their base column
 *  (`account`) — matching the client's baseFieldName semantics — since the trailing
 *  segment lives on the joined entity, not this one. */
export function validateFields(fields, entityFieldNames) {
  const known = new Set(entityFieldNames || []);
  return fields.filter((f) => !known.has(f.split('.')[0]));
}

/** Replace the curated body (everything after the generated managed block) while
 *  preserving frontmatter + the generated region. For a curated-only doc (no
 *  managed block) the whole body after frontmatter is replaced. */
export function replaceCuratedTail(content, newTail) {
  const text = String(content || '');
  const endIdx = text.indexOf(GENERATED_END);
  const tail = `${String(newTail || '').replace(/\s+$/, '')}\n`;
  if (endIdx !== -1) {
    const head = text.slice(0, endIdx + GENERATED_END.length);
    return `${head}\n\n${tail}`;
  }
  const fm = /^---\n[\s\S]*?\n---\n?/.exec(text);
  return fm ? `${fm[0]}\n${tail}` : tail;
}

// ── Model-driven loop (Node + runner) ───────────────────────────────────────────

function entityFieldsFor(conceptId, schema = SCHEMA) {
  if (!conceptId.startsWith('entities/')) return null;
  const name = conceptId.slice('entities/'.length);
  return schema[name] ? Object.keys(schema[name].fields || {}) : null;
}

function proposerPrompt(conceptId, content, fieldNames) {
  return [
    `You are improving the curated guidance for the OKF concept \`${conceptId}\` in a ZeyOS knowledge bundle.`,
    'The document below has a GENERATED block (the schema — do NOT reproduce or change it) followed by curated notes.',
    'Propose better curated guidance for an agent querying ZeyOS: concrete gotchas, correct field/enum usage, and query tips.',
    fieldNames ? `You may ONLY reference these real columns: ${fieldNames.join(', ')}.` : '',
    'Respond in exactly this format:',
    'FIELDS: <comma-separated column names you referenced, or empty>',
    'NOTES:',
    '<the improved curated markdown, starting with a `# Notes` heading>',
    '',
    '===== CURRENT DOCUMENT =====',
    content
  ].filter(Boolean).join('\n');
}

function parseArgs(argv) {
  const opts = { config: path.join(REPO_ROOT, 'config.test.json'), bundle: path.join(REPO_ROOT, 'okf'), concepts: [], scorecard: null, apply: false, model: null, judgeModel: null, runId: `okf-refine-${Date.now()}` };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--config') opts.config = path.resolve(argv[++i]);
    else if (a === '--bundle') opts.bundle = path.resolve(argv[++i]);
    else if (a === '--concept') opts.concepts.push(...argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--scorecard') opts.scorecard = path.resolve(argv[++i]);
    else if (a === '--apply') opts.apply = true;
    else if (a === '--model') opts.model = argv[++i];
    else if (a === '--judge-model') opts.judgeModel = argv[++i];
    else if (a === '--run-id') opts.runId = argv[++i];
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = JSON.parse(await readFile(opts.config, 'utf8').catch(() => '{}'));
  const ap = config.agentProtocol || {};
  const runner = ap.runner || { command: 'opencode', args: ['run', '--model', '{model}', '{prompt}'], cwd: '.', timeoutMs: 240000 };
  const model = opts.model || (ap.models || [])[0];
  const judgeModel = opts.judgeModel || ap.judgeModel || null;
  if (!model) fail('No proposer model. Pass --model or set agentProtocol.models in the config.');

  const bundle = await loadOkfBundle(opts.bundle);
  const conceptIds = Object.keys(bundle.concepts);

  let targets = opts.concepts;
  if (!targets.length && opts.scorecard) {
    const scorecard = JSON.parse(await readFile(opts.scorecard, 'utf8'));
    targets = targetConceptsFromScorecard(scorecard, conceptIds);
  }
  if (!targets.length) fail('No target concepts. Pass --concept <id[,id]> or --scorecard <path>.');

  const resultsDir = path.join(REPO_ROOT, 'test/agent-protocol/results', opts.runId);
  await mkdir(resultsDir, { recursive: true });
  const env = { ...process.env };
  const outcomes = [];

  for (const raw of targets) {
    const conceptId = raw.replace(/\.md$/, '').includes('/') ? raw.replace(/\.md$/, '') : `entities/${raw}`;
    const file = path.join(opts.bundle, `${conceptId}.md`);
    if (!existsSync(file)) { outcomes.push({ conceptId, status: 'skipped', reason: 'concept not found' }); continue; }

    const content = await readFile(file, 'utf8');
    const fieldNames = entityFieldsFor(conceptId);
    const agent = await runAgent({ runner, model, prompt: proposerPrompt(conceptId, content, fieldNames), env, repoRoot: REPO_ROOT, resultsDir, scenarioId: `propose__${conceptId.replace(/\W+/g, '_')}` });
    const { fields, notes } = parseProposal(agent.stdout);

    if (!notes) { outcomes.push({ conceptId, status: 'rejected', reason: 'no NOTES in proposal' }); continue; }
    const unknown = fieldNames ? validateFields(fields, fieldNames) : [];
    if (unknown.length) { outcomes.push({ conceptId, status: 'rejected', reason: `references unknown fields: ${unknown.join(', ')}` }); continue; }

    const before = parseConcept(content).body.split(GENERATED_END).pop().trim();
    const verdict = await judgeOkfRevision({ judgeModel, conceptId, before, after: notes, runner, env, repoRoot: REPO_ROOT, resultsDir });
    if (verdict.pass !== true) { outcomes.push({ conceptId, status: verdict.pass === null ? 'needs-review' : 'rejected', reason: verdict.reason }); continue; }

    if (opts.apply) {
      await writeFile(file, replaceCuratedTail(content, notes), 'utf8');
      outcomes.push({ conceptId, status: 'applied', reason: verdict.reason });
    } else {
      await writeFile(path.join(resultsDir, `${conceptId.replace(/\W+/g, '_')}.proposal.md`), notes, 'utf8');
      outcomes.push({ conceptId, status: 'proposed', reason: verdict.reason });
    }
  }

  await writeFile(path.join(resultsDir, 'refine-summary.json'), `${JSON.stringify({ runId: opts.runId, model, judgeModel, apply: opts.apply, outcomes }, null, 2)}\n`, 'utf8');
  for (const o of outcomes) console.log(`  ${o.status.toUpperCase().padEnd(12)} ${o.conceptId} — ${o.reason}`);
  console.log(`\nRefine summary: ${path.relative(REPO_ROOT, path.join(resultsDir, 'refine-summary.json'))}`);
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`\nFatal: ${err.stack || err.message || err}`);
    process.exit(1);
  });
}
