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

## Load the ZeyOS Skills

Before doing real work, install the bundled skill packs so the agent picks up ZeyOS's query conventions (entity model, `filters` usage, safe writes):

```bash
zeyos skills list                 # see what's available
zeyos skills install              # interactive: pick an agent (claude, codex, opencode, droid, pi…), then local/global
zeyos skills install --target claude --global -y   # or non-interactively with flags
```

This is the recommended entry point for an agent: the skills encode how to resolve names to IDs, which resource to query first, and how to escalate from the CLI to `@zeyos/client`.

## Authenticate

Interactive login:

```bash
zeyos login
```

Pre-fill login parameters:

```bash
zeyos login \
  --base-url https://cloud.zeyos.com/demo \
  --client-id myapp \
  --secret "$ZEYOS_CLIENT_SECRET"
```

This still starts the OAuth authorization-code flow and requires a browser redirect or pasted code. For fully unattended agents, inject `ZEYOS_BASE_URL`, `ZEYOS_TOKEN`, and optionally `ZEYOS_REFRESH_TOKEN`, `ZEYOS_CLIENT_ID`, and `ZEYOS_CLIENT_SECRET` through the environment.

The CLI stores credentials in `.zeyos/auth.json` in the current project tree, or in `~/.config/zeyos/credentials.json` when `--global` is used.

## Verify the Session

Check the current user:

```bash
zeyos whoami --json
```

`whoami` hides access tokens by default. Use `zeyos whoami --show-token --json` only when the token must be handed to another local tool.

Discover which curated resources the CLI can operate on directly:

```bash
zeyos resources
```

Inspect a resource's fields, types and enum values before querying (works offline, no login needed):

```bash
zeyos describe tickets
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
