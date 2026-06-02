---
sidebar_position: 2
sidebar_label: Agent Quickstart
---

# Agent Quickstart

This guide gets a coding agent from zero to authenticated CRUD access with the ZeyOS CLI.

## Install or Run the CLI

From this repository:

```bash
npm install
node cli/bin/zeyos.mjs --help
```

For a global `zeyos` command during development:

```bash
npm link cli/
zeyos --help
```

## Authenticate

Interactive login:

```bash
zeyos login
```

Fully non-interactive login:

```bash
zeyos login \
  --base-url https://cloud.zeyos.com/demo \
  --client-id myapp \
  --secret mysecret
```

The CLI stores credentials in `.zeyos/auth.json` in the current project tree, or in `~/.config/zeyos/credentials.json` when `--global` is used.

## Verify the Session

Check the current user and token-backed context:

```bash
zeyos whoami --json
```

Discover which curated resources the CLI can operate on directly:

```bash
zeyos resources
```

## Read Data

List tickets in machine-readable form:

```bash
zeyos list tickets --json
```

List only the fields an agent needs:

```bash
zeyos list tickets \
  --fields ID,ticketnum,name,status,priority,lastmodified \
  --filter '{"visibility":0}' \
  --sort -lastmodified \
  --limit 20 \
  --json
```

Fetch one record:

```bash
zeyos get ticket 42 --all --json
```

Count matching records:

```bash
zeyos count tickets --filter '{"visibility":0,"status":4}' --json
```

## Write Data

Create with JSON-first input:

```bash
zeyos create ticket \
  --data '{"name":"Follow up with customer","status":0,"priority":2,"visibility":0}' \
  --json
```

Update with JSON-first input:

```bash
zeyos update ticket 42 \
  --data '{"status":4,"priority":3}' \
  --json
```

Delete interactively:

```bash
zeyos delete ticket 42
```

Delete non-interactively only when the automation has already decided the record must be removed:

```bash
zeyos delete ticket 42 --force
```

## Safe Defaults for Agents

- Use `--json` unless a human is actively reading the output.
- Include `visibility: 0` in filters for normal business views.
- Prefer `--data '<json>'` over many separate flags in automation.
- Run `zeyos resources` before assuming a resource is CLI-supported.
- Escalate to [`@zeyos/client`](./03-cli-coverage-and-escalation.md) when the CLI resource registry is not enough.
