// OKF bundle tests (offline, deterministic). Covers the producer's drift gate,
// v0.1 conformance, entity coverage, cross-link integrity, managed-block
// preservation, refs-in-sync, the runtime buildOkf projection, and the
// refinement-loop pure helpers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCHEMA } from '../src/generated/schema.js';
import { SERVICES } from '../src/generated/operations.js';
import { buildOkf, validateOkfFiles, parseConcept, OKF_VERSION } from '../src/runtime/okf.js';
import { spliceConcept, diffEntityModels, prependLogEntry, replaceManagedBlock, GENERATED_END } from '../scripts/lib/okf.mjs';
import { buildEntityModel } from '../scripts/lib/spec-model.mjs';
import { parseProposal, validateFields, replaceCuratedTail, targetConceptsFromScorecard } from '../test/agent-protocol/harness/refine-okf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OKF_DIR = path.join(ROOT, 'okf');
const REF_FILE = path.join(ROOT, 'agents/shared/zeyos-entity-reference.md');

function readMarkdownTree(dir) {
  const out = {};
  function walk(cur, prefix) {
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name.endsWith('.md')) out[rel] = readFileSync(abs, 'utf8');
    }
  }
  walk(dir, '');
  return out;
}

function apiBackedResources() {
  const resources = new Set();
  for (const service of Object.values(SERVICES)) {
    for (const op of service.operations || []) {
      const seg = op.path.split('/').find((s) => s && !s.startsWith('{'));
      if (seg && SCHEMA[seg]) resources.add(seg);
    }
  }
  return [...resources];
}

// ── Producer drift gate ─────────────────────────────────────────────────────

test('okf/ bundle equals a fresh regeneration (drift gate)', () => {
  assert.ok(existsSync(path.join(OKF_DIR, 'index.md')), 'okf/ bundle is missing — run npm run okf:build');
  const before = { ...readMarkdownTree(OKF_DIR), '__ref__': readFileSync(REF_FILE, 'utf8') };
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts/generate-okf.mjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0, `generate-okf.mjs failed: ${res.stderr || res.stdout}`);
  const after = { ...readMarkdownTree(OKF_DIR), '__ref__': readFileSync(REF_FILE, 'utf8') };
  assert.deepEqual(after, before, 'Committed OKF content differs from a fresh regen — run `npm run okf:build` and commit, and never hand-edit generated regions.');
});

// ── Conformance (spec §9) ───────────────────────────────────────────────────

test('okf/ bundle is OKF v0.1 conformant', () => {
  const files = readMarkdownTree(OKF_DIR);
  const result = validateOkfFiles(files);
  assert.equal(result.valid, true, JSON.stringify(result.errors.slice(0, 5)));
  assert.ok(result.conceptCount >= 64, `expected >= 64 concepts, got ${result.conceptCount}`);
});

test('root index.md declares okf_version and a source_snapshot', () => {
  const { frontmatter } = parseConcept(readFileSync(path.join(OKF_DIR, 'index.md'), 'utf8'));
  assert.equal(frontmatter.okf_version, OKF_VERSION);
  assert.match(frontmatter.source_snapshot || '', /^[0-9a-f]{12}$/);
});

// ── Coverage + cross-link integrity ─────────────────────────────────────────

test('every API-backed resource has an entity concept', () => {
  const missing = apiBackedResources().filter((r) => !existsSync(path.join(OKF_DIR, 'entities', `${r}.md`)));
  assert.deepEqual(missing, [], `entities missing OKF docs: ${missing.join(', ')}`);
});

test('no broken bundle-relative cross-links (any subdirectory)', () => {
  const files = readMarkdownTree(OKF_DIR);
  const broken = [];
  let checked = 0;
  for (const [rel, content] of Object.entries(files)) {
    // Any bundle-relative link: ](/<dir>/<file>.md)
    for (const m of content.matchAll(/\]\((\/[a-z0-9_]+\/[a-z0-9_-]+\.md)\)/gi)) {
      checked += 1;
      if (!existsSync(path.join(OKF_DIR, m[1]))) broken.push(`${rel} → ${m[1]}`);
    }
  }
  assert.ok(checked > 0, 'expected to find bundle-relative cross-links');
  assert.deepEqual(broken, [], `broken cross-links: ${broken.join(', ')}`);
});

// ── Managed blocks ──────────────────────────────────────────────────────────

test('spliceConcept rewrites the generated region and preserves the curated tail', () => {
  const existing = spliceConcept({
    existing: null,
    frontmatter: { type: 'ZeyOS Entity', title: 'Tickets' },
    generatedBody: '# Schema\n\nOLD',
    seedBody: '# Notes\n\nCurated guidance the refiner added.'
  });
  const updated = spliceConcept({
    existing,
    frontmatter: { type: 'ZeyOS Entity', title: 'Tickets' },
    generatedBody: '# Schema\n\nNEW'
  });
  assert.ok(updated.includes('# Schema\n\nNEW'), 'generated region not refreshed');
  assert.ok(!updated.includes('OLD'), 'stale generated content survived');
  assert.ok(updated.includes('Curated guidance the refiner added.'), 'curated tail was clobbered');
});

test('spliceConcept preserves human-added frontmatter keys', () => {
  const existing = '---\ntype: ZeyOS Entity\ntitle: Tickets\nowner: alice\n---\n\n' +
    spliceConcept({ existing: null, frontmatter: { type: 'ZeyOS Entity', title: 'Tickets' }, generatedBody: 'X' }).split('---\n\n')[1];
  const updated = spliceConcept({ existing, frontmatter: { type: 'ZeyOS Entity', title: 'Tickets' }, generatedBody: 'Y' });
  assert.ok(updated.includes('owner: alice'), 'human frontmatter key dropped');
});

test('replaceManagedBlock fills markers and leaves surrounding prose intact', () => {
  const file = `# Heading\n\ncurated above\n\n<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->\nOLD\n${GENERATED_END}\n\ncurated below\n`;
  const out = replaceManagedBlock(file, 'NEW TABLE');
  assert.ok(out.includes('NEW TABLE') && !out.includes('OLD'));
  assert.ok(out.includes('curated above') && out.includes('curated below'));
  assert.equal(replaceManagedBlock('no markers here', 'X'), null);
});

// ── refs derive from OKF ────────────────────────────────────────────────────

test('shared entity reference has an injected operationId table covering all entities', () => {
  const ref = readFileSync(REF_FILE, 'utf8');
  const block = ref.slice(ref.indexOf('okf:generated:start'), ref.indexOf('okf:generated:end'));
  for (const op of ['listAccounts', 'listTickets', 'listDunningNotices', 'listPriceListsToAccounts']) {
    assert.ok(block.includes(`\`${op}\``), `operationId table missing ${op}`);
  }
  const rows = (block.match(/\[↗\]/g) || []).length;
  assert.equal(rows, apiBackedResources().length, 'operationId table row count != API-backed entity count');
});

// ── Runtime buildOkf projection ─────────────────────────────────────────────

test('buildOkf() synthesizes a conformant bundle from the client schema', () => {
  const files = buildOkf();
  const result = validateOkfFiles(files);
  assert.equal(result.valid, true, JSON.stringify(result.errors.slice(0, 5)));
  assert.ok(files['entities/tickets.md'].includes('type: ZeyOS Entity'));
  assert.ok(files['index.md'].includes(`okf_version: ${OKF_VERSION}`));
});

// ── Freshness: schema diff → log entries ────────────────────────────────────

test('diffEntityModels reports added/removed fields, type and enum changes', () => {
  const prev = { a: { fields: [{ name: 'x', type: 'int', enum: { 0: 'A' }, fk: null }] } };
  const next = {
    a: { fields: [{ name: 'x', type: 'bigint', enum: { 0: 'A', 1: 'B' }, fk: null }, { name: 'y', type: 'text', enum: null, fk: null }] },
    b: { fields: [] }
  };
  const kinds = diffEntityModels(prev, next).map((c) => `${c.kind}:${c.text}`);
  assert.ok(kinds.some((k) => k.startsWith('Creation') && k.includes('`b`')));
  assert.ok(kinds.some((k) => k.includes('field `y` added')));
  assert.ok(kinds.some((k) => k.includes('type int → bigint')));
  assert.ok(kinds.some((k) => k.includes('enum values changed')));
});

test('prependLogEntry keeps newest entries first under one heading', () => {
  const first = prependLogEntry({ existing: null, date: '2026-01-01', changes: [{ kind: 'Initialization', text: 'init' }] });
  const second = prependLogEntry({ existing: first, date: '2026-02-01', changes: [{ kind: 'Update', text: 'changed' }] });
  assert.equal((second.match(/# OKF Update Log/g) || []).length, 1);
  assert.ok(second.indexOf('2026-02-01') < second.indexOf('2026-01-01'));
});

// ── Refinement-loop pure helpers ────────────────────────────────────────────

test('parseProposal extracts FIELDS and NOTES', () => {
  const { fields, notes } = parseProposal('FIELDS: status, netamount\nNOTES:\n# Notes\nUse status 9.');
  assert.deepEqual(fields, ['status', 'netamount']);
  assert.ok(notes.startsWith('# Notes'));
});

test('validateFields flags hallucinated columns only', () => {
  assert.deepEqual(validateFields(['status', 'account.lastname'], ['status', 'account']), []);
  assert.deepEqual(validateFields(['status', 'boguscol'], ['status']), ['boguscol']);
});

test('replaceCuratedTail keeps the generated block and swaps curated notes', () => {
  const doc = `---\ntype: ZeyOS Entity\n---\n\n<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->\nSCHEMA\n${GENERATED_END}\n\n# Notes\nold`;
  const out = replaceCuratedTail(doc, '# Notes\nnew');
  assert.ok(out.includes('SCHEMA') && out.includes('# Notes\nnew') && !out.includes('\nold'));
});

test('targetConceptsFromScorecard maps weak scenarios to entity concepts', () => {
  const scorecard = { records: [
    { classification: 'CLIENT_DEFECT', skill: 'zeyos-billing', title: 'count active tickets', id: 'b03' },
    { classification: 'PASS', title: 'transactions sum' }
  ] };
  assert.deepEqual(targetConceptsFromScorecard(scorecard, ['entities/tickets', 'entities/transactions']), ['entities/tickets']);
});

// Sanity: buildEntityModel surfaces the rich detail OKF needs.
test('buildEntityModel preserves notnull/default/indexes the compact schema drops', () => {
  const model = buildEntityModel([{ name: 't', type: 'table', fields: [{ name: 'id', type: 'integer', notnull: true, indexed: true }], indexes: [{ name: 'i', method: 'gin', keys: ['id'], partial: true }] }]);
  assert.equal(model.t.fields[0].notnull, true);
  assert.equal(model.t.indexes[0].method, 'gin');
});
