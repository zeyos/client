# ZeyOS CLI

The CLI is the default interface for coding agents and shell automation that work against the curated ZeyOS resource registry.

The authoritative documentation lives in the repository-level docs:

- [Coding Agents](../docs/04-agent-workflows/00-coding-agents.md)
- [Agent Quickstart](../docs/04-agent-workflows/01-agent-quickstart.md)
- [CLI Getting Started](../docs/03-cli/01-getting-started.md)
- [Commands Reference](../docs/03-cli/02-commands.md)
- [Configuration](../docs/03-cli/03-configuration.md)

## Install

From the repository root:

```bash
npm install
npm link cli/
zeyos --help
```

Or install the package directly:

```bash
npm install -g @zeyos/cli
```

## Quick Start

Authenticate:

```bash
zeyos login \
  --base-url https://cloud.zeyos.com/demo \
  --client-id myapp \
  --secret mysecret
```

Verify the current user:

```bash
zeyos whoami --json
```

Inspect the CLI-supported resource registry:

```bash
zeyos resources
```

List tickets for automation:

```bash
zeyos list tickets \
  --fields ID,ticketnum,name,status,priority,lastmodified \
  --filter '{"visibility":0}' \
  --sort -lastmodified \
  --limit 20 \
  --json
```

Create, update, and delete:

```bash
zeyos create ticket --data '{"name":"Fix login bug","status":0,"priority":3,"visibility":0}' --json
zeyos update ticket 42 --data '{"status":4}' --json
zeyos delete ticket 42
```

## Configuration

- Local credentials: `.zeyos/auth.json`
- Global credentials: `~/.config/zeyos/credentials.json`
- Project resource overrides: `.zeyos/api/<resource>.json`
- Global resource overrides: `~/.zeyos/api/<resource>.json`

## Coverage Boundary

The CLI intentionally covers a curated registry instead of the full API surface. Use `zeyos resources` to see the supported set.

When you need unsupported resources or low-level request control, switch to [`@zeyos/client`](../docs/02-javascript-client/01-getting-started.md) and follow the escalation guidance in [CLI Coverage and Escalation](../docs/04-agent-workflows/03-cli-coverage-and-escalation.md).
