/**
 * zeyos skills <list|show|install>
 *
 * Discover and install the ZeyOS agent skill packs bundled with @zeyos/client
 * into the local project, so a coding agent (Claude, Codex, …) can operate
 * against ZeyOS with the right conventions out of the box.
 */

import { readdirSync, readFileSync, existsSync, cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { colors as c, outputMode, printJson, printYaml, printTable, success, error, info, warn } from '../lib/output.mjs';

const require = createRequire(import.meta.url);

export const USAGE = `\
Usage: zeyos skills <command> [skill…]

Commands:
  list                       List the bundled ZeyOS agent skills
  show <skill>               Print a skill's instructions (SKILL.md)
  install [skill…]           Copy skills into the local project (all if none given)

Install options:
  --target claude|codex      Where to install (default: auto-detect, fallback .claude/skills)
  --force                    Overwrite existing skill folders

Examples:
  zeyos skills list
  zeyos skills show zeyos-work-management
  zeyos skills install                       # install every skill
  zeyos skills install zeyos-billing-insights --target claude
`;

// Locate the agents/ directory shipped inside the @zeyos/client package.
function findAgentsDir() {
  let entry;
  try {
    entry = require.resolve('@zeyos/client');
  } catch {
    return null;
  }
  let dir = path.dirname(entry);
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'agents');
    if (existsSync(path.join(candidate, 'README.md')) || existsSync(path.join(candidate, 'shared'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function parseFrontmatter(content) {
  const out = {};
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (match) {
    for (const line of match[1].split('\n')) {
      const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (kv) out[kv[1]] = kv[2].trim();
    }
  }
  return out;
}

function listSkills(agentsDir) {
  const skills = [];
  for (const entry of readdirSync(agentsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'shared') continue;
    const skillFile = path.join(agentsDir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const fm = parseFrontmatter(readFileSync(skillFile, 'utf8'));
    skills.push({
      name: fm.name || entry.name,
      dirName: entry.name,
      description: fm.description || '',
      dir: path.join(agentsDir, entry.name)
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function resolveTarget(values) {
  const cwd = process.cwd();
  const choose = (kind) => ({ kind, root: path.join(cwd, kind === 'codex' ? '.codex' : '.claude', 'skills') });

  if (values.target === 'claude' || values.target === 'codex') return choose(values.target);
  if (values.target) {
    error(`Unknown --target "${values.target}". Use "claude" or "codex".`);
    process.exit(1);
  }
  if (existsSync(path.join(cwd, '.claude'))) return choose('claude');
  if (existsSync(path.join(cwd, '.codex'))) return choose('codex');
  return choose('claude');
}

function runList(skills, values) {
  const mode = outputMode(values);
  if (mode === 'json') {
    printJson(skills.map(({ name, description }) => ({ name, description })));
    return;
  }
  if (mode === 'yaml') {
    printYaml(skills.map(({ name, description }) => ({ name, description })));
    return;
  }
  const rows = skills.map((s) => ({
    skill: s.name,
    description: s.description.length > 88 ? s.description.slice(0, 87) + '…' : s.description
  }));
  printTable(rows, ['skill', 'description']);
  info(`Install with: zeyos skills install <skill>   (or "install" for all)`);
}

function runShow(skills, name) {
  const skill = skills.find((s) => s.name === name || s.dirName === name);
  if (!skill) {
    error(`Unknown skill "${name}". Run "zeyos skills list".`);
    process.exit(1);
  }
  process.stdout.write(readFileSync(path.join(skill.dir, 'SKILL.md'), 'utf8'));
  if (!process.stdout.write('')) { /* noop */ }
}

function runInstall(agentsDir, skills, names, values) {
  const target = resolveTarget(values);
  const selected = names.length > 0
    ? names.map((n) => skills.find((s) => s.name === n || s.dirName === n) || { missing: n })
    : skills;

  const missing = selected.filter((s) => s.missing).map((s) => s.missing);
  if (missing.length > 0) {
    error(`Unknown skill(s): ${missing.join(', ')}. Run "zeyos skills list".`);
    process.exit(1);
  }

  mkdirSync(target.root, { recursive: true });

  let installed = 0;
  for (const skill of selected) {
    const dest = path.join(target.root, skill.dirName);
    if (existsSync(dest) && !values.force) {
      warn(`Skipped ${skill.name} (already exists — use --force to overwrite)`);
      continue;
    }
    cpSync(skill.dir, dest, { recursive: true });
    success(`Installed ${skill.name} → ${path.relative(process.cwd(), dest)}`);
    installed += 1;
  }

  // Skills reference ../shared/* — install it alongside so those links resolve.
  const sharedSrc = path.join(agentsDir, 'shared');
  if (installed > 0 && existsSync(sharedSrc)) {
    const sharedDest = path.join(target.root, 'shared');
    cpSync(sharedSrc, sharedDest, { recursive: true });
    info(`Installed shared references → ${path.relative(process.cwd(), sharedDest)}`);
  }

  if (installed > 0) {
    info(`Target: ${target.kind}. Point your agent at ${path.relative(process.cwd(), target.root)}/`);
  }
}

export function run(values, positional = []) {
  const agentsDir = findAgentsDir();
  if (!agentsDir) {
    error('Could not locate the bundled ZeyOS skills (the @zeyos/client agents/ directory).');
    process.exit(1);
  }

  const skills = listSkills(agentsDir);
  const sub = positional[0] || 'list';
  const rest = positional.slice(1);

  switch (sub) {
    case 'list':
      runList(skills, values);
      return;
    case 'show':
      if (!rest[0]) {
        error('Usage: zeyos skills show <skill>');
        process.exit(1);
      }
      runShow(skills, rest[0]);
      return;
    case 'install':
      runInstall(agentsDir, skills, rest, values);
      return;
    default:
      error(`Unknown skills command "${sub}".\n\n${USAGE}`);
      process.exit(1);
  }
}
