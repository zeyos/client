#!/usr/bin/env node
/**
 * Live data-layer validation for v2 scenarios — NO model, NO proxy.
 *
 * For each selected scenario this:
 *   1. evaluates preconditions (reports ENVIRONMENT_SKIP),
 *   2. runs the seed block against the live instance (catches bad create payloads —
 *      wrong field names, missing NOT-NULL columns, bad enums),
 *   3. runs every data-layer query the scenario's verifiers depend on with the seeded
 *      context — computeProjection `sources`, verifyStateDiff `snapshot`, and any
 *      op/params lists (catches unknown filter fields that 400),
 *   4. cleans up everything (manifest reverse-order + declared cleanup), always.
 *
 * It does not invoke a model or assert agent output; it proves the harness's own
 * ground-truth machinery resolves against the real schema. Usage:
 *   node test/agent-protocol/harness/validate-live.mjs [--scenario <id>] [--layer a|b] [--v2-only]
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureFreshToken, buildVerifyClient, resolveCurrentUserId, resolveCurrentUserGroup,
  runSeed, runCleanup, evaluatePreconditions
} from './verify.mjs';
import { normalizeScenario } from './scenario-schema.mjs';
import { createOwnershipManifest } from './fixtures.mjs';
import { loadSources } from './projection.mjs';
import { snapshotResources } from './statediff.mjs';
import { resolveParams, listAll } from './query-util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCEN_DIR = path.resolve(__dirname, '..', 'scenarios');

function parseArgs(argv) {
  const o = { scenario: null, layer: null, v2Only: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--scenario') o.scenario = argv[++i];
    else if (argv[i] === '--layer') o.layer = argv[++i];
    else if (argv[i] === '--v2-only') o.v2Only = true;
  }
  return o;
}

async function walk(dir, base = dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) await walk(abs, base, out);
    else if (e.name.endsWith('.json')) {
      const raw = JSON.parse(await readFile(abs, 'utf8'));
      const s = normalizeScenario(raw);
      s._rel = path.relative(base, abs);
      out.push(s);
    }
  }
  return out;
}

/** Collect the data-layer query specs a verifier tree depends on. */
function collectQueries(expect, acc = { sources: [], snapshots: [], lists: [] }) {
  if (!expect || typeof expect !== 'object') return acc;
  if (expect.kind === 'computeProjection' && expect.sources) acc.sources.push(expect.sources);
  if (expect.kind === 'verifyStateDiff' && expect.snapshot) acc.snapshots.push(expect.snapshot);
  if (['verifyNoRecords', 'computeCount', 'computeSum'].includes(expect.kind) && expect.op) {
    acc.lists.push({ op: expect.op, params: expect.params || {} });
  }
  if (expect.kind === 'computeMembership' && expect.listOp) acc.lists.push({ op: expect.listOp, params: expect.listParams || {} });
  for (const child of expect.expectations || []) collectQueries(child, acc);
  return acc;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const configPath = path.join(REPO_ROOT, 'config.test.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const live = config.live || {};
  const instance = live.instance;
  const allow = config.agentProtocol?.allowInstances || [];
  if (!allow.includes(instance)) { console.error(`Refusing: instance ${instance} not allowlisted`); process.exit(1); }

  const token = await ensureFreshToken(live, { configPath, force: true });
  const client = buildVerifyClient(live, token);
  const me = await resolveCurrentUserId(client);
  const myGroup = await resolveCurrentUserGroup(client, me);
  const runId = `VAL${Date.now().toString().slice(-8)}`;
  const recordPrefix = config.agentProtocol?.recordPrefix || 'AGENTTEST';

  let scenarios = (await walk(SCEN_DIR))
    .filter((s) => (opts.layer ? s.layer === opts.layer : true))
    .filter((s) => (opts.scenario ? s.id === opts.scenario : true))
    .filter((s) => (opts.v2Only ? s.schemaVersion === 2 : true))
    .sort((a, b) => a.id.localeCompare(b.id));

  console.log(`Live data-layer validation — instance ${instance}, $ME=${me}, runId=${runId}`);
  console.log(`Scenarios: ${scenarios.length}\n`);

  const results = [];
  for (const s of scenarios) {
    const r = { id: s.id, seedErrors: [], queryErrors: [], skip: null, ok: true };
    const ctx = { client, runId, recordPrefix, me, myGroup, result: null, seed: {} };
    const manifest = createOwnershipManifest();
    try {
      // 1. preconditions
      if (s.preconditions?.length) {
        const pc = await evaluatePreconditions(s.preconditions, { client, runId, recordPrefix, me, myGroup });
        if (!pc.ok) { r.skip = pc.skipReason; results.push(r); console.log(`  SKIP  ${s.id} — ${pc.skipReason}`); continue; }
      }
      // 2. seed
      if (s.seed?.length) {
        const seeded = await runSeed(s.seed, ctx);
        ctx.seed = seeded.seed;
        manifest.registerSeedReport(seeded.report, s.seed);
        for (const step of seeded.report) {
          if (step.error) { r.seedErrors.push(`${step.op} (${step.as}): ${step.error}`); r.ok = false; }
        }
      }
      // 3. data-layer queries the verifiers depend on
      const q = collectQueries(s.expect);
      for (const turn of s._turns) collectQueries(turn.expect, q);
      for (const sources of q.sources) {
        try { await loadSources(sources, ctx); }
        catch (err) { r.queryErrors.push(`sources: ${err.message || err}`); r.ok = false; }
      }
      for (const snap of q.snapshots) {
        try { await snapshotResources(snap, ctx); }
        catch (err) { r.queryErrors.push(`snapshot: ${err.message || err}`); r.ok = false; }
      }
      for (const l of q.lists) {
        try { await listAll(client, l.op, resolveParams(l.params, ctx)); }
        catch (err) { r.queryErrors.push(`${l.op}: ${err.message || err}`); r.ok = false; }
      }
    } catch (err) {
      r.queryErrors.push(`fatal: ${err.message || err}`); r.ok = false;
    } finally {
      // 4. cleanup — declared steps + manifest reverse order
      try { if (Array.isArray(s.cleanup)) await runCleanup(s.cleanup, ctx); } catch { /* best effort */ }
      for (const step of manifest.cleanupSteps()) {
        if (!step.op) continue;
        try { await client.api[step.op]({ ID: step.id }); } catch { /* best effort */ }
      }
    }
    results.push(r);
    const badge = r.ok ? ' OK  ' : 'FAIL ';
    const detail = [...r.seedErrors, ...r.queryErrors].join(' | ');
    console.log(`  ${badge} ${s.id}${detail ? ` — ${detail}` : ''}`);
  }

  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skip);
  console.log(`\n${results.length} scenarios — ${results.length - failed.length - skipped.length} ok · ${failed.length} fail · ${skipped.length} skip`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const r of failed) console.log(`  ${r.id}: ${[...r.seedErrors, ...r.queryErrors].join('; ')}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error(`Fatal: ${err.stack || err}`); process.exit(1); });
