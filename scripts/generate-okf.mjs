#!/usr/bin/env node
// Producer: emit an Open Knowledge Format (OKF v0.1) bundle for the ZeyOS data
// model under okf/. Structural content (entity Schema/FK/Enums/Indexes/Operations)
// is generated from openapi/{api,dbref}.json into managed blocks; curated content
// (metrics, playbooks, concepts, entity notes) is seeded from scripts/data and
// then owned by humans/the refiner. Deterministic: re-running with unchanged
// specs produces no diff (log.md only grows on real schema changes).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildEntityModel, collectOperations, loadSpec, loadOptionalSpec } from './lib/spec-model.mjs';
import {
  OKF_VERSION, renderEntityGeneratedBody, spliceConcept, renderIndex, renderRootIndex,
  diffEntityModels, prependLogEntry, replaceManagedBlock
} from './lib/okf.mjs';
import { ENTITY_META, METRICS, PLAYBOOKS, CONCEPTS } from './data/okf-curation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OKF_DIR = path.join(ROOT, 'okf');
// Producer-internal state for the log.md schema diff. Lives outside okf/ (so the
// published bundle stays pure OKF content) and outside the npm `files` allowlist
// (so it is not shipped), but is committed so in-repo regenerations can diff.
const SNAPSHOT_FILE = path.join(ROOT, 'scripts/.okf-snapshot.json');

const VERB_RE = /^(list|get|create|update|delete|exists)/;
const CLUSTER_ORDER = ['crm', 'work', 'messaging', 'outreach', 'knowledge', 'collaboration', 'billing', 'collections', 'commerce', 'platform', 'reference'];
const CLUSTER_LABEL = {
  crm: 'CRM & Customer', work: 'Work & Delivery', messaging: 'Messaging', outreach: 'Outreach',
  knowledge: 'Knowledge', collaboration: 'Collaboration', billing: 'Billing & Payments',
  collections: 'Collections', commerce: 'Commerce & Inventory', platform: 'Platform & Schema', reference: 'Reference'
};

function resourceFromPath(p) {
  if (typeof p !== 'string') return null;
  for (const segment of p.split('/')) {
    if (segment && !segment.startsWith('{')) return segment;
  }
  return null;
}

// Group an entity's REST operations into list/get/create/update/delete/exists by
// the operationId verb prefix. operationIds come straight from api.json, so this
// is the canonical vocabulary (no noun→opId guessing).
function operationsByResource(apiDoc) {
  const byResource = new Map();
  for (const op of collectOperations(apiDoc)) {
    const resource = resourceFromPath(op.path);
    if (!resource) continue;
    if (!byResource.has(resource)) byResource.set(resource, {});
    const bucket = byResource.get(resource);
    const m = VERB_RE.exec(op.operationId);
    const key = m ? m[1] : op.operationId;
    if (!bucket[key]) bucket[key] = op.operationId;
  }
  return byResource;
}

// "listMailingLists" → "Mailing Lists"; "getDunningNotice" → "Dunning Notice".
function titleFromOps(ops, fallbackNoun) {
  const op = ops.list || ops.get || null;
  if (!op) return fallbackNoun.charAt(0).toUpperCase() + fallbackNoun.slice(1);
  const stripped = op.replace(VERB_RE, '');
  return stripped.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim() || fallbackNoun;
}

// Authoritative entity → operationId table, derived from api.json. Injected into
// the shared skill reference so the (previously hand-maintained, drift-prone)
// operationId table is generated and always correct. Links resolve from
// agents/shared/ back up to okf/.
function renderOperationIdTable(docEntities, opsByResource) {
  const cols = ['list', 'get', 'create', 'update', 'delete', 'exists'];
  const header = `| Entity | Concept | ${cols.join(' | ')} |\n|${'---|'.repeat(cols.length + 2)}`;
  const rows = docEntities.map((name) => {
    const ops = opsByResource.get(name) || {};
    const cells = cols.map((c) => (ops[c] ? `\`${ops[c]}\`` : '—'));
    return `| \`${name}\` | [↗](../../okf/entities/${name}.md) | ${cells.join(' | ')} |`;
  });
  return `${header}\n${rows.join('\n')}`;
}

function renderCuratedDoc({ type, title, description, tags, body }) {
  const fm = [`type: ${type}`, `title: ${title}`];
  if (description) fm.push(`description: ${JSON.stringify(description)}`);
  if (tags?.length) fm.push(`tags: [${tags.join(', ')}]`);
  return `---\n${fm.join('\n')}\n---\n\n${body.replace(/\s+$/, '')}\n`;
}

async function readIfExists(file) {
  return existsSync(file) ? readFile(file, 'utf8') : null;
}

async function writeFileEnsured(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
}

async function seedIfAbsent(file, content) {
  if (existsSync(file)) return false;
  await writeFileEnsured(file, content);
  return true;
}

function sourceSnapshot(docEntities, model, opsByResource) {
  const payload = docEntities.map((name) => ({
    name,
    fields: model[name].fields.map((f) => `${f.name}:${f.type}:${f.notnull ? 1 : 0}:${f.fk ? f.fk.table : ''}:${f.enum ? Object.keys(f.enum).join('|') : ''}`),
    ops: Object.values(opsByResource.get(name) || {}).sort()
  }));
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 12);
}

async function main() {
  const apiDoc = await loadSpec(path.join(ROOT, 'openapi/api.json'));
  const dbref = await loadOptionalSpec(path.join(ROOT, 'openapi/dbref.json'));
  const model = buildEntityModel(dbref);
  const opsByResource = operationsByResource(apiDoc);

  // API-backed entities that also have a dbref schema get an entity concept doc.
  const docEntities = [...opsByResource.keys()].filter((name) => model[name]).sort();
  const hasDoc = new Set(docEntities);
  const linkForEntity = (name) => (hasDoc.has(name) ? `/entities/${name}.md` : null);

  // ── Entity concept docs (managed-block splice) ──
  for (const name of docEntities) {
    const entity = model[name];
    const ops = opsByResource.get(name) || {};
    const meta = ENTITY_META[name] || {};
    const generatedBody = renderEntityGeneratedBody({ entity, ops, linkForEntity });
    const visibilityColumn = entity.fields.some((f) => f.name === 'visibility');

    const frontmatter = {
      type: 'ZeyOS Entity',
      title: titleFromOps(ops, name),
      description: meta.description || `ZeyOS \`${name}\` records.`,
      resource: `zeyos://api/${name}`,
      tags: [...(meta.tags || []), 'generated'],
      api_backed: true,
      list_operation: ops.list || undefined,
      visibility_column: visibilityColumn
    };

    const seedBody = meta.note ? `# Notes\n\n${meta.note}` : '';
    const file = path.join(OKF_DIR, 'entities', `${name}.md`);
    const existing = await readIfExists(file);
    await writeFileEnsured(file, spliceConcept({ existing, frontmatter, generatedBody, seedBody }));
  }

  // ── Curated narrative docs (seed-if-absent) ──
  const curatedGroups = [
    { dir: 'metrics', type: 'Metric', docs: METRICS },
    { dir: 'playbooks', type: 'Playbook', docs: PLAYBOOKS },
    { dir: 'concepts', type: 'Reference', docs: CONCEPTS }
  ];
  for (const group of curatedGroups) {
    for (const doc of group.docs) {
      const file = path.join(OKF_DIR, group.dir, `${doc.id}.md`);
      await seedIfAbsent(file, renderCuratedDoc({ type: group.type, ...doc }));
    }
  }

  // ── Index files (derived; always regenerated) ──
  const byCluster = new Map();
  for (const name of docEntities) {
    const cluster = (ENTITY_META[name]?.tags || ['platform'])[0];
    if (!byCluster.has(cluster)) byCluster.set(cluster, []);
    byCluster.get(cluster).push(name);
  }
  const entitySections = CLUSTER_ORDER.filter((c) => byCluster.has(c)).map((cluster) => ({
    heading: CLUSTER_LABEL[cluster] || cluster,
    items: byCluster.get(cluster).sort().map((name) => ({
      title: titleFromOps(opsByResource.get(name) || {}, name),
      url: `${name}.md`,
      description: ENTITY_META[name]?.description || ''
    }))
  }));
  await writeFileEnsured(path.join(OKF_DIR, 'entities', 'index.md'), renderIndex(entitySections));

  for (const group of curatedGroups) {
    const items = [...group.docs]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((doc) => ({ title: doc.title, url: `${doc.id}.md`, description: doc.description }));
    await writeFileEnsured(path.join(OKF_DIR, group.dir, 'index.md'), renderIndex([{ heading: group.dir.charAt(0).toUpperCase() + group.dir.slice(1), items }]));
  }

  // ── Root index (only index allowed frontmatter: okf_version + source_snapshot) ──
  const snapshot = sourceSnapshot(docEntities, model, opsByResource);
  const rootSections = [{
    heading: 'ZeyOS Knowledge Bundle',
    items: [
      { title: 'Entities', url: 'entities/', description: `${docEntities.length} API-backed entity concepts (schema, foreign keys, enums, indexes, operations).` },
      { title: 'Metrics', url: 'metrics/', description: 'Business metric definitions.' },
      { title: 'Playbooks', url: 'playbooks/', description: 'Step-by-step query workflows.' },
      { title: 'Concepts', url: 'concepts/', description: 'Cross-cutting query rules and footguns.' }
    ]
  }];
  await writeFileEnsured(path.join(OKF_DIR, 'index.md'), renderRootIndex({ sourceSnapshot: snapshot, sections: rootSections }));

  // ── Freshness: diff against the last snapshot → append log.md on change ──
  const prevSnapshot = existsSync(SNAPSHOT_FILE) ? JSON.parse(await readFile(SNAPSHOT_FILE, 'utf8')) : null;
  // Compact model: only the fields diffEntityModels reads (name/type/enum/fk), so the
  // committed snapshot stays small (drops descriptions, indexes, nullability, defaults).
  const currentModel = Object.fromEntries(docEntities.map((name) => [name, {
    fields: model[name].fields.map((f) => ({ name: f.name, type: f.type, enum: f.enum, fk: f.fk ? { table: f.fk.table } : null }))
  }]));
  const logFile = path.join(OKF_DIR, 'log.md');
  if (!prevSnapshot) {
    const existingLog = await readIfExists(logFile);
    if (!existingLog) {
      const date = new Date().toISOString().slice(0, 10);
      await writeFileEnsured(logFile, prependLogEntry({ existing: null, date, changes: [{ kind: 'Initialization', text: `OKF bundle initialized with ${docEntities.length} entity concepts.` }] }));
    }
  } else {
    const changes = diffEntityModels(prevSnapshot.model, currentModel);
    if (changes.length) {
      const date = new Date().toISOString().slice(0, 10);
      const existingLog = await readIfExists(logFile);
      await writeFileEnsured(logFile, prependLogEntry({ existing: existingLog, date, changes }));
    }
  }
  await writeFileEnsured(SNAPSHOT_FILE, `${JSON.stringify({ snapshot, model: currentModel }, null, 2)}\n`);

  // ── Derive the shared skill reference's operationId table from OKF (canonical) ──
  const refFile = path.join(ROOT, 'agents/shared/zeyos-entity-reference.md');
  const refExisting = await readIfExists(refFile);
  if (refExisting) {
    const filled = replaceManagedBlock(refExisting, renderOperationIdTable(docEntities, opsByResource));
    if (filled) await writeFile(refFile, filled, 'utf8');
    else process.stderr.write(`[okf] note: ${path.relative(ROOT, refFile)} has no okf:generated markers; operationId table not injected.\n`);
  }

  process.stdout.write(`Generated OKF bundle (v${OKF_VERSION}) → okf/  (${docEntities.length} entities, snapshot ${snapshot})\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
