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
export ZEYOS_CLIENT_SECRET="..."
zeyos login \
  --base-url https://cloud.zeyos.com/demo \
  --client-id myapp \
  --secret "$ZEYOS_CLIENT_SECRET"
```

For interactive use, omit `--secret`; the CLI prompts without echoing the secret to the terminal.

Verify the current user:

```bash
zeyos whoami --json
```

`whoami` does not print access tokens by default. Use `zeyos whoami --show-token --json` only when you intentionally need to pass a token to another local tool.

Inspect the CLI-supported resource registry:

```bash
zeyos resources
zeyos doctor agent --json
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

For larger or reusable filters, put the JSON in a file:

```bash
zeyos list tickets --filter-file ./filters/open-tickets.json --json
```

Inspect dynamic schema definitions:

```bash
zeyos count customfields --json
zeyos list customfields --fields ID,name,identifier,context,type --json
```

Inspect actionsteps/time-entry evidence and ticket mail:

```bash
zeyos list actionsteps --fields ID,name,status,date,duedate,effort,ticket,account --json
zeyos list messages --fields ID,date,mailbox,subject,sender_email,to_email,ticket,reference --filter '{"ticket":42}' --json
```

Create, update, and delete:

```bash
zeyos create ticket --data '{"name":"Fix login bug","status":0,"priority":3,"visibility":0}' --json
zeyos create ticket --data-file ./ticket.json --json
zeyos update ticket 42 --data '{"status":4}' --json
zeyos update ticket 42 --data-file ./ticket-update.json --json
zeyos delete ticket 42
```

## Configuration

- Local credentials: `.zeyos/auth.json`
- Global credentials: `~/.config/zeyos/credentials.json`
- Project resource overrides: `.zeyos/api/<resource>.json`
- Global resource overrides: `~/.zeyos/api/<resource>.json`

## Coverage Boundary

The CLI intentionally covers a curated registry instead of the full API surface. It includes operational resources such as tickets, tasks, messages, and actionsteps; use `zeyos resources` to see the supported set.

When you need unsupported resources or low-level request control, switch to [`@zeyos/client`](../docs/02-javascript-client/01-getting-started.md) and follow the escalation guidance in [CLI Coverage and Escalation](../docs/04-agent-workflows/03-cli-coverage-and-escalation.md).
