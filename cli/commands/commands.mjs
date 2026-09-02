/**
 * zeyos commands
 *
 * Publish the command graph — every command, its aliases, and the flags it
 * accepts — as data.
 *
 * `zeyos describe` already exposes the *data* model to agents; this exposes the
 * *command* model, so an agent can discover which flags exist without parsing
 * prose help and without guessing. Runs offline.
 */

import { COMMAND_GRAPH } from '../lib/command-graph.mjs';
import { colors as c, outputMode, printJson, printYaml } from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos commands [options]

List every command with its aliases and accepted flags, as data.

Options:
  --json              Output as JSON (the form intended for agents)
  --yaml              Output as YAML
  -h, --help          Show this help

Examples:
  zeyos commands --json
  zeyos commands --json | jq '.commands[] | select(.name=="list") | .flags'
`;

export function run(values) {
  const mode = outputMode(values);
  if (mode === 'json') { printJson(COMMAND_GRAPH); return; }
  if (mode === 'yaml') { printYaml(COMMAND_GRAPH); return; }

  const width = Math.max(...COMMAND_GRAPH.commands.map((cmd) => cmd.name.length));
  process.stdout.write('\n');
  for (const cmd of COMMAND_GRAPH.commands) {
    const aliases = cmd.aliases.length ? c.dim(`  (${cmd.aliases.join(', ')})`) : '';
    process.stdout.write(`  ${c.cyan(cmd.name.padEnd(width))}${aliases}\n`);
    const flags = cmd.acceptsArbitraryFields
      ? '--<field> <value> plus: ' + cmd.flags.join(' ')
      : cmd.flags.join(' ');
    process.stdout.write(`  ${' '.repeat(width)}  ${c.dim(flags || '(no flags)')}\n`);
  }
  process.stdout.write(`\n  ${c.dim('Machine-readable form:')} ${c.cyan('zeyos commands --json')}\n\n`);
}
