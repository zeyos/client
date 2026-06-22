/**
 * zeyos okf <list|show|check|build|export>
 *
 * Work with the Open Knowledge Format (OKF v0.1) bundle that ships with
 * @zeyos/client (under okf/): a directory of Markdown concept docs describing the
 * ZeyOS data model (entities, schema, foreign keys, enums, indexes, operations)
 * plus curated metrics, playbooks, and query concepts. Consumers — coding agents,
 * viewers, search — read it; this command lists/shows/validates the shipped bundle
 * and can synthesize or export one.
 */

import { readFileSync, existsSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadOkfBundle, validateOkfFiles, buildOkf, OKF_VERSION } from '@zeyos/client';
import { outputMode, printJson, printYaml, printTable, colors, success, error, info, warn } from '../lib/output.mjs';

const require = createRequire(import.meta.url);

export const USAGE = `\
Usage: zeyos okf <command> [options]

Commands:
  list                       List concepts in the OKF bundle (type, id, title)
  show <concept>             Print a concept doc (e.g. "tickets" or "entities/tickets")
  check                      Validate the bundle for OKF v0.1 conformance
  build [--out <dir>]        Synthesize an OKF bundle from the client's schema
  export [--out <dir>]       Copy the shipped okf/ bundle into a directory

Options:
  --dir <path>               Read from an explicit bundle directory (list/show/check)
  --out <path>               Write to this directory (build/export; default ./okf)
  --force                    Overwrite an existing target (export)
  --json                     Output as JSON
  --yaml                     Output as YAML
  -h, --help                 Show this help

Examples:
  zeyos okf list
  zeyos okf show tickets
  zeyos okf check
  zeyos okf export --out ./vendor/okf
  zeyos okf build --out ./okf-live`;

// Locate the okf/ bundle shipped inside the @zeyos/client package (mirrors the
// skills command's findAgentsDir).
function findOkfDir() {
  let entry;
  try {
    entry = require.resolve('@zeyos/client');
  } catch {
    return null;
  }
  let dir = path.dirname(entry);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'okf');
    if (existsSync(path.join(candidate, 'index.md'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function expandHome(p) {
  if (p === '~') return homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(homedir(), p.slice(2));
  return p;
}

function displayPath(abs) {
  const rel = path.relative(process.cwd(), abs);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel;
  const home = homedir();
  if (abs === home || abs.startsWith(home + path.sep)) return '~' + abs.slice(home.length);
  return abs;
}

function resolveInputDir(values) {
  if (values.dir) return path.resolve(expandHome(values.dir));
  const found = findOkfDir();
  if (!found) {
    error('Could not locate the bundled OKF bundle (the @zeyos/client okf/ directory). Pass --dir <path>.');
    process.exit(1);
  }
  return found;
}

function conceptsToRows(concepts) {
  return Object.entries(concepts)
    .map(([id, { frontmatter }]) => ({ type: frontmatter.type || '(none)', concept: id, title: frontmatter.title || '' }))
    .sort((a, b) => a.concept.localeCompare(b.concept));
}

async function runList(values) {
  const dir = resolveInputDir(values);
  const { version, concepts } = await loadOkfBundle(dir);
  const rows = conceptsToRows(concepts);
  const mode = outputMode(values);
  if (mode === 'json') return printJson({ version, concepts: rows });
  if (mode === 'yaml') return printYaml({ version, concepts: rows });
  printTable(rows, ['type', 'concept', 'title']);
  info(`OKF v${version || OKF_VERSION} — ${rows.length} concepts in ${displayPath(dir)}. Show one with: zeyos okf show <concept>`);
}

function runShow(values, name) {
  const dir = resolveInputDir(values);
  const candidates = [name, `${name}.md`, `entities/${name}.md`, path.join(dir, name), path.join(dir, `${name}.md`), path.join(dir, 'entities', `${name}.md`)];
  for (const candidate of candidates) {
    const abs = path.isAbsolute(candidate) ? candidate : path.join(dir, candidate);
    if (existsSync(abs)) {
      process.stdout.write(readFileSync(abs, 'utf8'));
      return;
    }
  }
  error(`Unknown concept "${name}". Run "zeyos okf list".`);
  process.exit(1);
}

async function runCheck(values) {
  const dir = resolveInputDir(values);
  const { files } = await loadOkfBundle(dir);
  const result = validateOkfFiles(files);
  const mode = outputMode(values);
  if (mode === 'json') { printJson(result); process.exit(result.valid ? 0 : 1); }
  if (mode === 'yaml') { printYaml(result); process.exit(result.valid ? 0 : 1); }
  if (result.valid) {
    success(`OKF bundle is conformant: ${result.conceptCount} concepts, 0 errors (${displayPath(dir)}).`);
    return;
  }
  for (const err of result.errors) error(`${err.path}: ${err.message}`);
  error(`OKF bundle is NOT conformant: ${result.errors.length} error(s).`);
  process.exit(1);
}

function writeBundle(outDir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(outDir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
}

function runBuild(values) {
  const outDir = path.resolve(expandHome(values.out || 'okf'));
  const files = buildOkf();
  writeBundle(outDir, files);
  const mode = outputMode(values);
  const summary = { out: outDir, files: Object.keys(files).length };
  if (mode === 'json') return printJson(summary);
  if (mode === 'yaml') return printYaml(summary);
  success(`Synthesized ${summary.files} OKF files → ${displayPath(outDir)}`);
  info('This is the runtime projection from the client schema (structural only). The shipped okf/ bundle adds curated metrics, playbooks, and notes.');
}

function runExport(values) {
  const dir = resolveInputDir(values);
  const outDir = path.resolve(expandHome(values.out || 'okf'));
  if (existsSync(outDir) && !values.force) {
    if (path.resolve(dir) === outDir) {
      warn(`Source and target are the same (${displayPath(outDir)}); nothing to do.`);
      return;
    }
    error(`Target ${displayPath(outDir)} already exists. Use --force to overwrite.`);
    process.exit(1);
  }
  cpSync(dir, outDir, { recursive: true });
  const mode = outputMode(values);
  const summary = { from: dir, out: outDir };
  if (mode === 'json') return printJson(summary);
  if (mode === 'yaml') return printYaml(summary);
  success(`Exported OKF bundle → ${displayPath(outDir)}`);
}

export async function run(values, positional = []) {
  const sub = positional[0] || 'list';
  const rest = positional.slice(1);
  switch (sub) {
    case 'list': return runList(values);
    case 'show':
      if (!rest[0]) { error('Usage: zeyos okf show <concept>'); process.exit(1); }
      return runShow(values, rest[0]);
    case 'check': return runCheck(values);
    case 'build': return runBuild(values);
    case 'export': return runExport(values);
    default:
      error(`Unknown okf command "${sub}".\n\n${USAGE}`);
      process.exit(1);
  }
}
