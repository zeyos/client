// Open Knowledge Format (OKF v0.1) rendering + managed-block splicing.
//
// Pure functions only (no fs): given specs/curation in, markdown out. The
// orchestrator (scripts/generate-okf.mjs) and the runtime consumer
// (src/runtime/okf.js) reuse the same conformance-relevant constants.

// The OKF conformance constants live in the shipped client so there is a single
// definition; the build-time renderer below imports them. (Generated content is
// fenced by the markers; the producer rewrites only between them, preserving
// curated `# Notes`/`# Metrics` prose added by humans or the refiner.)
import {
  OKF_VERSION,
  GENERATED_START,
  GENERATED_END,
  GENERATED_FRONTMATTER_KEYS as GENERATED_FRONTMATTER_KEY_LIST
} from '../../src/runtime/okf.js';

export { OKF_VERSION, GENERATED_START, GENERATED_END };

const GENERATED_FRONTMATTER_KEYS = new Set(GENERATED_FRONTMATTER_KEY_LIST);

// ── YAML (minimal; only the scalar/list shapes OKF frontmatter uses) ──────────

function needsQuote(s) {
  return /^[\s>|*&!%@`#?,\[\]{}-]/.test(s) || /[:#]\s|: |\s$|^$/.test(s) || /["']/.test(s);
}

function toYamlScalar(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  const s = String(value);
  if (needsQuote(s)) return JSON.stringify(s); // JSON string is valid YAML double-quoted
  return s;
}

function toYamlValue(value) {
  if (Array.isArray(value)) return `[${value.map((v) => toYamlScalar(v)).join(', ')}]`;
  return toYamlScalar(value);
}

/** Parse a `---`-delimited frontmatter block into ordered raw lines + a key set.
 *  Tolerant by design: we only need to know which keys exist so we can preserve
 *  human-added ones; we never re-serialize parsed values. */
export function parseFrontmatter(content) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(content || '');
  if (!match) return { keys: new Set(), rawLines: [], body: content || '' };
  const rawLines = match[1].split('\n');
  const keys = new Set();
  for (const line of rawLines) {
    const kv = /^([A-Za-z0-9_]+):/.exec(line);
    if (kv) keys.add(kv[1]);
  }
  return { keys, rawLines, body: (content || '').slice(match[0].length) };
}

function emitFrontmatter(generated, preservedRawLines = []) {
  const lines = [];
  for (const [key, value] of Object.entries(generated)) {
    if (value === undefined || value === null) continue;
    lines.push(`${key}: ${toYamlValue(value)}`);
  }
  for (const raw of preservedRawLines) lines.push(raw);
  return lines.join('\n');
}

// ── Managed-block splice ──────────────────────────────────────────────────────

/** Extract the curated body that follows the generated block in an existing
 *  file, so it can be carried forward unchanged. */
function curatedTail(existingBody) {
  const end = existingBody.indexOf(GENERATED_END);
  if (end === -1) return null;
  return existingBody.slice(end + GENERATED_END.length).replace(/^\n+/, '');
}

/**
 * Produce a concept file, rewriting only generated frontmatter + the generated
 * body region. Curated frontmatter keys and the curated body tail are preserved.
 *
 * @param {object}  args
 * @param {string?} args.existing      Existing file content, or null/'' for new.
 * @param {object}  args.frontmatter   Generated frontmatter (ordered object).
 * @param {string}  args.generatedBody Markdown to place between the markers.
 * @param {string}  args.seedBody      Curated body to use only when the file is new.
 */
export function spliceConcept({ existing, frontmatter, generatedBody, seedBody = '' }) {
  const parsed = parseFrontmatter(existing || '');
  const preserved = parsed.rawLines.filter((line) => {
    const kv = /^([A-Za-z0-9_]+):/.exec(line);
    return kv && !GENERATED_FRONTMATTER_KEYS.has(kv[1]);
  });
  const tail = existing ? curatedTail(parsed.body) : null;
  const curated = (tail != null ? tail : seedBody).replace(/\s+$/, '');

  const fm = emitFrontmatter(frontmatter, preserved);
  const block = `${GENERATED_START}\n${generatedBody.replace(/\s+$/, '')}\n${GENERATED_END}`;
  const parts = [`---\n${fm}\n---`, block];
  if (curated) parts.push(curated);
  return `${parts.join('\n\n')}\n`;
}

/**
 * Replace only the content between the generated markers in an existing file,
 * preserving everything before and after. Unlike spliceConcept this does not own
 * frontmatter — it is for injecting a generated digest into an otherwise curated
 * file (e.g. the shared skill references). Returns null if the markers are absent
 * so the caller can warn rather than silently no-op.
 */
export function replaceManagedBlock(existing, generatedBody) {
  if (!existing || !existing.includes(GENERATED_START) || !existing.includes(GENERATED_END)) {
    return null;
  }
  const start = existing.indexOf(GENERATED_START);
  const end = existing.indexOf(GENERATED_END);
  const before = existing.slice(0, start);
  const after = existing.slice(end + GENERATED_END.length);
  return `${before}${GENERATED_START}\n${generatedBody.replace(/\s+$/, '')}\n${GENERATED_END}${after}`;
}

// ── Entity rendering ───────────────────────────────────────────────────────────

const DASH = '—';

function fkCell(field, linkForEntity) {
  if (!field.fk) return DASH;
  const link = linkForEntity(field.fk.table);
  const label = `${field.fk.table}.${field.fk.field}`;
  return link ? `[${field.fk.table}](${link})` : label;
}

function renderSchemaTable(entity, linkForEntity) {
  const header = '| Column | Type | Nullable | Default | Indexed | FK |\n|---|---|---|---|---|---|';
  const rows = entity.fields.map((f) => {
    const def = f.default == null ? DASH : `\`${String(f.default).replace(/\|/g, '\\|')}\``;
    return `| \`${f.name}\` | ${f.type} | ${f.notnull ? 'no' : 'yes'} | ${def} | ${f.indexed ? 'yes' : DASH} | ${fkCell(f, linkForEntity)} |`;
  });
  return `# Schema\n\n${header}\n${rows.join('\n')}`;
}

function renderEnums(entity) {
  const withEnum = entity.fields.filter((f) => f.enum);
  if (!withEnum.length) return '';
  const blocks = withEnum.map((f) => {
    const pairs = Object.entries(f.enum).map(([k, v]) => `\`${k}\` = ${v}`).join(' · ');
    return `### \`${f.name}\`\n\n${pairs}`;
  });
  return `# Enums\n\n${blocks.join('\n\n')}`;
}

function renderForeignKeys(entity, linkForEntity) {
  const fks = entity.fields.filter((f) => f.fk);
  if (!fks.length) return '';
  const items = fks.map((f) => {
    const link = linkForEntity(f.fk.table);
    const target = link ? `[${f.fk.table}](${link})` : f.fk.table;
    return `- \`${f.name}\` → ${target} (\`${f.fk.table}.${f.fk.field}\`)`;
  });
  return `# Foreign Keys\n\n${items.join('\n')}`;
}

function renderIndexes(entity) {
  const idx = entity.indexes.filter((i) => !i.primary);
  if (!idx.length) return '';
  const items = idx.map((i) => {
    const attrs = [i.method, i.unique ? 'unique' : null, i.partial ? 'partial' : null].filter(Boolean).join(', ');
    const keys = i.keys.length ? ` on \`${i.keys.join(', ')}\`` : '';
    return `- \`${i.name}\` — ${attrs}${keys}`;
  });
  const gin = idx.some((i) => i.method === 'gin') || idx.some((i) => i.partial);
  const note = gin
    ? '\n\n> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).'
    : '';
  return `# Indexes\n\n${items.join('\n')}${note}`;
}

function renderOperations(ops) {
  const order = ['list', 'get', 'create', 'update', 'delete', 'exists'];
  const present = order.filter((k) => ops[k]).map((k) => `- ${k}: \`${ops[k]}\``);
  const extra = Object.entries(ops)
    .filter(([k]) => !order.includes(k))
    .map(([k, v]) => `- ${k}: \`${v}\``);
  const lines = [...present, ...extra];
  if (!lines.length) return '';
  return `# Operations\n\n${lines.join('\n')}`;
}

/** Render the generated (managed) body for a ZeyOS entity concept. */
export function renderEntityGeneratedBody({ entity, ops, linkForEntity }) {
  return [
    renderSchemaTable(entity, linkForEntity),
    renderForeignKeys(entity, linkForEntity),
    renderEnums(entity),
    renderIndexes(entity),
    renderOperations(ops)
  ].filter(Boolean).join('\n\n');
}

// ── Index + log rendering ──────────────────────────────────────────────────────

/** A sub-directory index.md: sections of `* [Title](url) - description` bullets.
 *  No frontmatter (spec §5). */
export function renderIndex(sections) {
  const out = [];
  for (const section of sections) {
    out.push(`# ${section.heading}`, '');
    for (const item of section.items) {
      const desc = item.description ? ` - ${item.description}` : '';
      out.push(`* [${item.title}](${item.url})${desc}`);
    }
    out.push('');
  }
  return `${out.join('\n').replace(/\s+$/, '')}\n`;
}

/** The bundle-root index.md — the only index that may carry frontmatter (§9). */
export function renderRootIndex({ sourceSnapshot, sections }) {
  const fm = emitFrontmatter({ okf_version: OKF_VERSION, source_snapshot: sourceSnapshot });
  return `---\n${fm}\n---\n\n${renderIndex(sections)}`;
}

// ── Schema diff → log.md (the freshness changelog) ──────────────────────────────

function enumString(enumObj) {
  return enumObj ? Object.entries(enumObj).map(([k, v]) => `${k}=${v}`).join(',') : '';
}

/** Compare two buildEntityModel() outputs and describe what changed, for log.md. */
export function diffEntityModels(prev, next) {
  const changes = [];
  const prevNames = new Set(Object.keys(prev || {}));
  const nextNames = new Set(Object.keys(next || {}));

  for (const name of [...nextNames].sort()) {
    if (!prevNames.has(name)) { changes.push({ kind: 'Creation', text: `Entity \`${name}\` added.` }); continue; }
    const a = prev[name];
    const b = next[name];
    const aFields = new Map(a.fields.map((f) => [f.name, f]));
    const bFields = new Map(b.fields.map((f) => [f.name, f]));
    for (const fname of bFields.keys()) {
      if (!aFields.has(fname)) changes.push({ kind: 'Update', text: `\`${name}\`: field \`${fname}\` added.` });
    }
    for (const fname of aFields.keys()) {
      if (!bFields.has(fname)) changes.push({ kind: 'Update', text: `\`${name}\`: field \`${fname}\` removed.` });
    }
    for (const [fname, bf] of bFields) {
      const af = aFields.get(fname);
      if (!af) continue;
      if (af.type !== bf.type) changes.push({ kind: 'Update', text: `\`${name}.${fname}\`: type ${af.type} → ${bf.type}.` });
      if (enumString(af.enum) !== enumString(bf.enum)) changes.push({ kind: 'Update', text: `\`${name}.${fname}\`: enum values changed.` });
      const afk = af.fk ? af.fk.table : '';
      const bfk = bf.fk ? bf.fk.table : '';
      if (afk !== bfk) changes.push({ kind: 'Update', text: `\`${name}.${fname}\`: foreign key ${afk || 'none'} → ${bfk || 'none'}.` });
    }
  }
  for (const name of [...prevNames].sort()) {
    if (!nextNames.has(name)) changes.push({ kind: 'Deprecation', text: `Entity \`${name}\` removed.` });
  }
  return changes;
}

/** Prepend a dated section to log.md (newest first). Idempotent across same-day
 *  re-runs only when `changes` is empty (caller skips). */
export function prependLogEntry({ existing, date, changes, title = 'OKF Update Log' }) {
  const header = `# ${title}`;
  const entryLines = [`## ${date}`, ...changes.map((c) => `* **${c.kind}**: ${c.text}`)];
  const entry = entryLines.join('\n');
  if (!existing || !existing.includes(header)) {
    return `${header}\n\n${entry}\n`;
  }
  const body = existing.slice(existing.indexOf(header) + header.length).replace(/^\n+/, '');
  return `${header}\n\n${entry}\n\n${body.replace(/\s+$/, '')}\n`;
}
