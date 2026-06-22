// Open Knowledge Format (OKF v0.1) support for @zeyos/client.
//
// Two halves:
//   • Pure (browser + Node): the OKF conformance constants, a tolerant concept
//     parser, a bundle validator, and buildOkf() — which synthesizes a conformant
//     OKF bundle from the client's own introspection surface (the generated
//     SCHEMA + SERVICES). No filesystem access.
//   • Node-only: loadOkfBundle() reads the shipped okf/ bundle (or any directory)
//     from disk via a lazy import, so this module stays bundler/browser-safe.
//
// The richer build-time producer (scripts/generate-okf.mjs) emits the curated,
// managed-block bundle under okf/. buildOkf() here is the lightweight runtime
// projection of what the shipped client knows — handy for emitting OKF in
// environments without the bundled files, or to diff against a live instance.

import { SCHEMA } from '../generated/schema.js';
import { SERVICES } from '../generated/operations.js';

export const OKF_VERSION = '0.1';

// Markers fencing producer-generated content inside a concept's body. Exported so
// the build-time renderer (scripts/lib/okf.mjs) shares one definition.
export const GENERATED_START = '<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->';
export const GENERATED_END = '<!-- okf:generated:end -->';
export const GENERATED_FRONTMATTER_KEYS = Object.freeze([
  'type', 'title', 'description', 'resource', 'tags', 'timestamp',
  'api_backed', 'list_operation', 'visibility_column'
]);

// Files that are not concept documents (spec §5/§6).
const RESERVED_BASENAMES = new Set(['index.md', 'log.md']);

const VERB_RE = /^(list|get|create|update|delete|exists)/;

// ── Parsing / validation (pure) ────────────────────────────────────────────────

/** Tolerant frontmatter + body split. Returns `{ frontmatter, body }` where
 *  frontmatter is a flat string→string map (lists kept as their raw text). */
export function parseConcept(content) {
  const text = String(content || '');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { frontmatter: {}, body: text };
  const frontmatter = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (kv) frontmatter[kv[1]] = kv[2].trim();
  }
  return { frontmatter, body: text.slice(match[0].length) };
}

function isReserved(relPath) {
  const base = relPath.split('/').pop();
  return RESERVED_BASENAMES.has(base);
}

/**
 * Validate an OKF bundle for v0.1 conformance (spec §9): every non-reserved `.md`
 * file must have parseable frontmatter with a non-empty `type`. Tolerant by
 * design — unknown types/keys and broken links are NOT errors.
 *
 * @param {Record<string,string>} files - relativePath → file content.
 * @returns {{ valid: boolean, errors: { path: string, message: string }[], conceptCount: number }}
 */
export function validateOkfFiles(files) {
  const errors = [];
  let conceptCount = 0;
  for (const [relPath, content] of Object.entries(files || {})) {
    if (!relPath.endsWith('.md') || isReserved(relPath)) continue;
    conceptCount += 1;
    const { frontmatter } = parseConcept(content);
    if (!Object.keys(frontmatter).length) {
      errors.push({ path: relPath, message: 'Missing YAML frontmatter.' });
      continue;
    }
    if (!frontmatter.type) {
      errors.push({ path: relPath, message: 'Frontmatter is missing the required `type` field.' });
    }
  }
  return { valid: errors.length === 0, errors, conceptCount };
}

/** The OKF concept ID for a ZeyOS resource, e.g. `tickets` → `entities/tickets`. */
export function conceptIdForResource(resource) {
  return `entities/${resource}`;
}

// ── buildOkf: synthesize a bundle from the client's introspection surface ───────

function groupOperations(services) {
  const byResource = new Map();
  for (const service of Object.values(services || {})) {
    for (const op of service.operations || []) {
      const resource = resourceFromPath(op.path);
      if (!resource) continue;
      if (!byResource.has(resource)) byResource.set(resource, {});
      const bucket = byResource.get(resource);
      const m = VERB_RE.exec(op.operationId);
      const key = m ? m[1] : op.operationId;
      if (!bucket[key]) bucket[key] = op.operationId;
    }
  }
  return byResource;
}

function resourceFromPath(p) {
  if (typeof p !== 'string') return null;
  for (const segment of p.split('/')) {
    if (segment && !segment.startsWith('{')) return segment;
  }
  return null;
}

function titleFromOps(ops, fallback) {
  const op = ops.list || ops.get;
  if (!op) return fallback.charAt(0).toUpperCase() + fallback.slice(1);
  return op.replace(VERB_RE, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim() || fallback;
}

// Deterministic, dependency-free 32-bit hash for the bundle source snapshot.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function renderEntityDoc(name, entry, ops, hasDoc) {
  const link = (target) => (hasDoc.has(target) ? `/entities/${target}.md` : null);
  const fields = Object.entries(entry.fields || {});

  const schemaRows = fields.map(([fname, def]) => {
    const fkCell = def.fk ? (link(def.fk) ? `[${def.fk}](${link(def.fk)})` : def.fk) : '—';
    const enumCell = def.enum ? Object.entries(def.enum).map(([k, v]) => `${k}=${v}`).join(', ') : '—';
    return `| \`${fname}\` | ${def.type || 'unknown'} | ${def.indexed ? 'yes' : '—'} | ${fkCell} | ${enumCell} |`;
  });
  const schema = `# Schema\n\n| Column | Type | Indexed | FK | Enum |\n|---|---|---|---|---|\n${schemaRows.join('\n')}`;

  const fks = fields.filter(([, d]) => d.fk);
  const fkSection = fks.length
    ? `\n\n# Foreign Keys\n\n${fks.map(([f, d]) => `- \`${f}\` → ${link(d.fk) ? `[${d.fk}](${link(d.fk)})` : d.fk}`).join('\n')}`
    : '';

  const order = ['list', 'get', 'create', 'update', 'delete', 'exists'];
  const opLines = order.filter((k) => ops[k]).map((k) => `- ${k}: \`${ops[k]}\``);
  const opSection = opLines.length ? `\n\n# Operations\n\n${opLines.join('\n')}` : '';

  const title = titleFromOps(ops, name);
  const fm = [
    'type: ZeyOS Entity',
    `title: ${title}`,
    `resource: zeyos://api/${name}`,
    'tags: [generated]',
    'api_backed: true'
  ];
  if (ops.list) fm.push(`list_operation: ${ops.list}`);
  fm.push(`visibility_column: ${Object.prototype.hasOwnProperty.call(entry.fields || {}, 'visibility')}`);

  return `---\n${fm.join('\n')}\n---\n\n${schema}${fkSection}${opSection}\n`;
}

/**
 * Synthesize a conformant OKF v0.1 bundle from a client schema + services. Pure:
 * returns a `{ relativePath: content }` map; the caller decides whether to write
 * it to disk. Defaults to the generated SCHEMA/SERVICES baked into the client.
 *
 * @param {{ schema?: object, services?: object }} [input]
 * @returns {Record<string,string>}
 */
export function buildOkf({ schema = SCHEMA, services = SERVICES } = {}) {
  const ops = groupOperations(services);
  const resources = Object.keys(schema).filter((r) => ops.has(r)).sort();
  const hasDoc = new Set(resources);
  const files = {};

  for (const name of resources) {
    files[`entities/${name}.md`] = renderEntityDoc(name, schema[name], ops.get(name) || {}, hasDoc);
  }

  const indexItems = resources
    .map((name) => `* [${titleFromOps(ops.get(name) || {}, name)}](${name}.md)`)
    .join('\n');
  files['entities/index.md'] = `# Entities\n\n${indexItems}\n`;

  const signature = resources.map((r) => `${r}:${Object.keys(schema[r].fields || {}).join(',')}`).join('|');
  files['index.md'] = `---\nokf_version: ${OKF_VERSION}\nsource_snapshot: ${fnv1a(signature)}\n---\n\n# ZeyOS Knowledge Bundle\n\n* [Entities](entities/) - ${resources.length} API-backed entity concepts.\n`;

  return files;
}

// ── Node-only loaders (lazy fs so the module stays browser-safe) ────────────────

/**
 * Read an OKF bundle directory from disk. Node only.
 * @param {string} dir - Path to a bundle root (e.g. the shipped okf/).
 * @returns {Promise<{ version: string|null, files: Record<string,string>, concepts: Record<string,{frontmatter:object,body:string}> }>}
 */
export async function loadOkfBundle(dir) {
  const { readFile, readdir } = await import('node:fs/promises');
  const path = await import('node:path');

  const files = {};
  async function walk(current, prefix) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(abs, rel);
      else if (entry.name.endsWith('.md')) files[rel] = await readFile(abs, 'utf8');
    }
  }
  await walk(dir, '');

  const concepts = {};
  for (const [rel, content] of Object.entries(files)) {
    if (isReserved(rel)) continue;
    concepts[rel.replace(/\.md$/, '')] = parseConcept(content);
  }

  let version = null;
  if (files['index.md']) version = parseConcept(files['index.md']).frontmatter.okf_version || null;

  return { version, files, concepts };
}

/**
 * Validate an OKF bundle. Accepts a directory path (Node) or an in-memory
 * `{ path: content }` map (universal). Returns the validateOkfFiles() result.
 */
export async function validateOkfBundle(dirOrFiles) {
  if (typeof dirOrFiles === 'string') {
    const { files } = await loadOkfBundle(dirOrFiles);
    return validateOkfFiles(files);
  }
  return validateOkfFiles(dirOrFiles);
}
