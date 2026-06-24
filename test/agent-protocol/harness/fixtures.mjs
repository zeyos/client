/**
 * Fixture ownership and cleanup (spec §8.9).
 *
 * Every record the harness seeds — and every record the agent creates that the harness
 * can observe (via a returned id or a trace response) — is registered in an ownership
 * manifest as `{operationId, resource, id, alias, source}`. The manifest powers three
 * things: (1) automatic cleanup in reverse dependency order, (2) the policy proxy's
 * "owned records only" gate (an agent may delete/update only what the run owns), and
 * (3) a dynamic orphan sweep whose targets are derived from the scenarios' seed recipes
 * rather than a hardcoded list, so adding a scenario that seeds a new resource type does
 * not silently leave orphans behind.
 */

import { resourceForOperationId, deleteOpForResource, listOpForResource } from './route-map.mjs';

/** Human-readable label field per resource, used for prefix-based orphan sweeping. */
const LABEL_FIELD = {
  accounts: 'lastname',
  messages: 'subject',
  default: 'name'
};

export function labelFieldFor(resource) {
  return LABEL_FIELD[resource] || LABEL_FIELD.default;
}

/**
 * Ownership manifest. Order of registration is preserved so cleanup can run last-in-
 * first-out (reverse dependency order: child rows seeded after their parent are deleted
 * before it).
 */
export function createOwnershipManifest() {
  const entries = [];

  function register({ operationId = null, resource = null, id, alias = null, source = 'seed' }) {
    if (id == null) return null;
    const res = resource || (operationId ? resourceForOperationId(operationId) : null);
    const entry = { operationId, resource: res, id: String(id), alias, source, createdAt: Date.now() };
    entries.push(entry);
    return entry;
  }

  /** Register every successfully-seeded record from a runSeed() report + its spec. */
  function registerSeedReport(report = [], seedSpec = []) {
    const opByAlias = new Map(seedSpec.map((s) => [s.as, s.op]));
    for (const r of report) {
      if (r.id == null) continue;
      register({ operationId: r.op || opByAlias.get(r.as) || null, id: r.id, alias: r.as, source: 'seed' });
    }
  }

  /** Set of ownership keys the policy proxy checks (`resource:id` and bare `id`). */
  function ownedKeys() {
    const keys = new Set();
    for (const e of entries) {
      keys.add(String(e.id));
      if (e.resource) keys.add(`${e.resource}:${e.id}`);
    }
    return keys;
  }

  function ids(resource) {
    return entries.filter((e) => !resource || e.resource === resource).map((e) => e.id);
  }

  /**
   * Cleanup steps in reverse registration order. Each maps to the resource's delete op.
   * Records whose resource has no delete operation are reported but skipped.
   */
  function cleanupSteps() {
    const steps = [];
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const e = entries[i];
      const deleteOp = e.resource ? deleteOpForResource(e.resource) : null;
      if (deleteOp) steps.push({ op: deleteOp, id: e.id, resource: e.resource, alias: e.alias });
      else steps.push({ op: null, id: e.id, resource: e.resource, alias: e.alias, skip: 'no delete operation' });
    }
    return steps;
  }

  return { register, registerSeedReport, ownedKeys, ids, cleanupSteps, entries };
}

/**
 * Derive orphan-sweep recipes from the seed recipes of a scenario catalog. Returns a
 * de-duplicated list of `{ resource, listOp, deleteOp, field }` for every resource any
 * scenario seeds, so the pre-run sweep reclaims leftover `{prefix}-*` records of exactly
 * the types in play — no hardcoded entity list to forget to extend.
 */
export function orphanRecipesFromScenarios(scenarios = []) {
  const resources = new Set();
  for (const s of scenarios) {
    for (const step of s.seed || []) {
      const res = resourceForOperationId(step.op);
      if (res) resources.add(res);
    }
  }
  const recipes = [];
  for (const resource of resources) {
    const listOp = listOpForResource(resource);
    const deleteOp = deleteOpForResource(resource);
    if (listOp && deleteOp) {
      recipes.push({ resource, listOp, deleteOp, field: labelFieldFor(resource) });
    }
  }
  return recipes.sort((a, b) => a.resource.localeCompare(b.resource));
}

/**
 * Fail-closed guard: a write/conditional-write scenario must prove it can scope its
 * writes — either ownedRecordsOnly (delete/update only owned ids) or a create allow-list
 * with the run record-prefix convention. Returns an error string or null.
 */
export function ownershipGap(scenario) {
  const mode = scenario.agentMode || (scenario.mutates ? 'write' : 'read-only');
  if (mode !== 'write' && mode !== 'conditional-write') return null;
  const allow = scenario.allowedOperations || [];
  if (allow.length === 0) return `${scenario.id}: write scenario has no allowedOperations (cannot scope writes)`;
  return null;
}
