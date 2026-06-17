/**
 * zeyos skills <list|show|install>
 *
 * Discover and install the ZeyOS agent skill packs bundled with @zeyos/client
 * into a coding agent's skills directory, so the agent (Claude, Codex, opencode,
 * Factory Droid, pi, …) can operate against ZeyOS with the right conventions
 * out of the box.
 */

import { readdirSync, readFileSync, existsSync, cpSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { outputMode, printJson, printYaml, printTable, colors, success, error, info, warn } from '../lib/output.mjs';

const require = createRequire(import.meta.url);

// ── Supported coding agents ────────────────────────────────────────────────────
// Each agent advertises where it looks for SKILL.md folders. `local` installs
// into the current project; `global` installs into the user's home so every
// project can see the skills. `detect` is the marker directory used to
// auto-pick an agent when none is specified and we can't prompt.
const AGENTS = [
  { key: 'claude',   label: 'Claude Code',   local: '.claude/skills',   global: '~/.claude/skills',          detect: '.claude' },
  { key: 'codex',    label: 'OpenAI Codex',  local: '.codex/skills',    global: '~/.codex/skills',           detect: '.codex' },
  { key: 'opencode', label: 'opencode',      local: '.opencode/skills', global: '~/.config/opencode/skills', detect: '.opencode' },
  { key: 'droid',    label: 'Factory Droid', local: '.factory/skills',  global: '~/.factory/skills',         detect: '.factory' },
  { key: 'pi',       label: 'pi',            local: '.pi/skills',       global: '~/.pi/agent/skills',        detect: '.pi' },
  { key: 'agents',   label: 'Generic (AGENTS.md / .agents)', local: '.agents/skills', global: '~/.agents/skills', detect: '.agents' },
];

const AGENT_KEYS = AGENTS.map((a) => a.key);

export const USAGE = `\
Usage: zeyos skills <command> [skill…]

Commands:
  list                       List the bundled ZeyOS agent skills
  show <skill>               Print a skill's instructions (SKILL.md)
  install [skill…]           Copy skills into a coding agent (all if none given)

Install options:
  --target <agent>           Coding agent: ${AGENT_KEYS.join(', ')}
                             (prompted when omitted; falls back to auto-detect)
  --global                   Install for all projects (agent's home directory)
  --local                    Install into the current project (default)
  --dir <path>               Install into an explicit directory (overrides --target)
  --force                    Overwrite existing skill folders
  -y, --yes                  Skip prompts and use flags / sensible defaults
  --no-logo                  Don't print the ⚡️ ZeyOS title

Global options:
  --json                     Output as JSON (also silences the title)
  --yaml                     Output as YAML
  -h, --help                 Show this help

Examples:
  zeyos skills list
  zeyos skills install                              # interactive: pick agent + scope
  zeyos skills install --target claude --global     # all projects, no prompts
  zeyos skills install --target opencode --local    # this project only
  zeyos skills install zeyos-billing-insights -y    # one skill, defaults, no prompts
  zeyos skills install --dir ./vendor/skills        # any directory you like
`;

// ── Title ────────────────────────────────────────────────────────────────────────

function _bannerColorEnabled() {
  return process.stderr.isTTY && !process.argv.includes('--no-color') && !process.env.NO_COLOR;
}

/** Print the ZeyOS title to stderr, unless output is machine-readable or muted. */
function printLogo(values) {
  if (values['no-logo'] || values.json || values.yaml) return;
  if (!process.stderr.isTTY) return; // keep piped / CI output clean
  // ZeyOS brand amber (#F7BC60), bold, when the terminal supports color.
  const amber = (s) => (_bannerColorEnabled() ? `\x1b[1;38;2;247;188;96m${s}\x1b[0m` : s);
  process.stderr.write(`\n⚡️ ${amber('ZeyOS')}\n\n`);
}

// ── Skill discovery ────────────────────────────────────────────────────────────

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

// ── Target resolution ──────────────────────────────────────────────────────────

function expandHome(p) {
  if (p === '~') return homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(homedir(), p.slice(2));
  return p;
}

/** Render an install path relative to CWD when possible, else with ~ for home. */
function displayPath(abs) {
  const rel = path.relative(process.cwd(), abs);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel;
  const home = homedir();
  if (abs === home || abs.startsWith(home + path.sep)) return '~' + abs.slice(home.length);
  return abs;
}

/** First agent whose marker directory already exists in the project. */
function detectAgent() {
  return AGENTS.find((a) => existsSync(path.join(process.cwd(), a.detect))) || null;
}

function canPrompt(values) {
  return process.stdin.isTTY && process.stderr.isTTY && !values.yes;
}

/** Resolve where to install, prompting interactively when nothing pins it down. */
async function resolveTarget(values) {
  // An explicit directory overrides everything else.
  if (values.dir) {
    return { key: 'custom', label: 'custom path', scope: 'custom', root: path.resolve(expandHome(values.dir)) };
  }

  const interactive = canPrompt(values);

  // (a) Which agent?
  let agent;
  if (values.target) {
    agent = AGENTS.find((a) => a.key === values.target);
    if (!agent) {
      error(`Unknown --target "${values.target}". Use one of: ${AGENT_KEYS.join(', ')}.`);
      process.exit(1);
    }
  } else if (interactive) {
    agent = await promptAgent();
  } else {
    agent = detectAgent() || AGENTS.find((a) => a.key === 'agents');
  }

  // (b) Install globally or just for this project?
  let scope;
  if (values.global && values.local) {
    error('Pass only one of --global or --local.');
    process.exit(1);
  } else if (values.global) {
    scope = 'global';
  } else if (values.local) {
    scope = 'local';
  } else if (interactive) {
    scope = await promptScope(agent);
  } else {
    scope = 'local';
  }

  const rel = scope === 'global' ? agent.global : agent.local;
  const root = scope === 'global' ? expandHome(rel) : path.resolve(process.cwd(), rel);
  return { key: agent.key, label: agent.label, scope, root };
}

// ── Interactive prompts ────────────────────────────────────────────────────────

/** Numbered menu on stderr. Resolves to the chosen item's index. */
function promptMenu(question, items, defaultIndex = 0) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    process.stderr.write('\n' + colors.bold(question) + '\n');
    items.forEach((it, i) => {
      const num = colors.cyan(String(i + 1).padStart(2));
      const dflt = i === defaultIndex ? colors.dim(' (default)') : '';
      const hint = it.hint ? '  ' + colors.dim(it.hint) : '';
      process.stderr.write(`  ${num}. ${it.label}${dflt}${hint}\n`);
    });
    rl.question(colors.dim(`Select [1-${items.length}, Enter=${defaultIndex + 1}]: `), (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (trimmed === '') return resolve(defaultIndex);
      const n = Number(trimmed);
      resolve(Number.isInteger(n) && n >= 1 && n <= items.length ? n - 1 : defaultIndex);
    });
  });
}

async function promptAgent() {
  const detected = detectAgent();
  const agentsIdx = AGENTS.findIndex((a) => a.key === 'agents');
  const defaultIndex = detected ? AGENTS.indexOf(detected) : agentsIdx;
  const items = AGENTS.map((a) => ({
    label: a.label,
    hint: a === detected ? `${a.local}  (detected here)` : a.local,
  }));
  const idx = await promptMenu('Which coding agent should these skills target?', items, defaultIndex);
  return AGENTS[idx];
}

async function promptScope(agent) {
  const items = [
    { label: 'This project only', hint: path.join(process.cwd().split(path.sep).pop() || '.', agent.local) },
    { label: 'All my projects (global)', hint: agent.global },
  ];
  const idx = await promptMenu('Install for this project or globally?', items, 0);
  return idx === 0 ? 'local' : 'global';
}

// ── Commands ────────────────────────────────────────────────────────────────────

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
}

async function runInstall(agentsDir, skills, names, values) {
  const mode = outputMode(values);
  if (mode === 'table') printLogo(values);

  const target = await resolveTarget(values);
  const selected = names.length > 0
    ? names.map((n) => skills.find((s) => s.name === n || s.dirName === n) || { missing: n })
    : skills;

  const missing = selected.filter((s) => s.missing).map((s) => s.missing);
  if (missing.length > 0) {
    error(`Unknown skill(s): ${missing.join(', ')}. Run "zeyos skills list".`);
    process.exit(1);
  }

  mkdirSync(target.root, { recursive: true });

  const installed = [];
  const skipped = [];
  for (const skill of selected) {
    const dest = path.join(target.root, skill.dirName);
    if (existsSync(dest) && !values.force) {
      skipped.push(skill.name);
      if (mode === 'table') warn(`Skipped ${skill.name} (already exists — use --force to overwrite)`);
      continue;
    }
    cpSync(skill.dir, dest, { recursive: true });
    installed.push(skill.name);
    if (mode === 'table') success(`Installed ${skill.name} → ${displayPath(dest)}`);
  }

  // Skills reference ../shared/* — install it alongside so those links resolve.
  let sharedInstalled = false;
  const sharedSrc = path.join(agentsDir, 'shared');
  if (installed.length > 0 && existsSync(sharedSrc)) {
    const sharedDest = path.join(target.root, 'shared');
    cpSync(sharedSrc, sharedDest, { recursive: true });
    sharedInstalled = true;
    if (mode === 'table') info(`Installed shared references → ${displayPath(sharedDest)}`);
  }

  const summary = {
    target: { agent: target.key, label: target.label, scope: target.scope, path: target.root },
    installed,
    skipped,
    shared: sharedInstalled,
  };

  if (mode === 'json') { printJson(summary); return; }
  if (mode === 'yaml') { printYaml(summary); return; }

  if (installed.length > 0) {
    const scopeLabel = target.scope === 'global' ? 'global' : target.scope === 'custom' ? 'custom' : 'this project';
    info(`Target: ${target.label} (${scopeLabel}). Point your agent at ${displayPath(target.root)}/`);
  } else if (skipped.length > 0) {
    info('Nothing installed — all selected skills already exist. Use --force to overwrite.');
  }
}

export async function run(values, positional = []) {
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
      await runInstall(agentsDir, skills, rest, values);
      return;
    default:
      error(`Unknown skills command "${sub}".\n\n${USAGE}`);
      process.exit(1);
  }
}
