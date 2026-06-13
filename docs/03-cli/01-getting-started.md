---
sidebar_label: Getting Started
---

# CLI Getting Started

The ZeyOS CLI gives you fast, scriptable access to the ZeyOS REST API from your terminal. It is the default entry point for coding agents and shell automation against the CLI's curated resource registry.

## Installation

:::info Requirements
Node.js 18.3+ is required. The CLI has zero external dependencies beyond the bundled `@zeyos/client` package.
:::

### Published package (recommended)

Install the CLI globally from npm:

```bash
npm install -g @zeyos/cli
zeyos --help
```

### Running from source

If you are contributing to the CLI or need to run an unreleased version, clone the repository and run directly from the source tree:

```bash
# Clone the repository
git clone <repo-url>
cd client

# Run directly
./cli/bin/zeyos.mjs --help
```

For convenience, create a symlink so you can run `zeyos` from anywhere:

```bash
ln -s $(pwd)/cli/bin/zeyos.mjs /usr/local/bin/zeyos
```

## First Login

Authenticate with your ZeyOS instance using the `login` command:

```bash
# Interactive — prompts for URL, app ID, and secret
zeyos login

# Or provide all values upfront
zeyos login \
  --base-url https://cloud.zeyos.com/demo \
  --client-id myapp \
  --secret "$ZEYOS_CLIENT_SECRET"
```

For interactive use, omit `--secret`; the CLI prompts without echoing the secret to the terminal. Passing secrets as command-line arguments is best reserved for controlled automation.

**What happens:**

1. The CLI opens your browser to the ZeyOS authorization page
2. You log in and authorize the application
3. The CLI exchanges the authorization code for access + refresh tokens
4. Credentials are saved to `.zeyos/auth.json` in your project

:::tip Switching Instances
Use `--clean` to discard all saved credentials and start fresh:
```bash
zeyos login --clean
```
This is useful when switching between ZeyOS instances.
:::

## Your First Commands

Once logged in, you can start working with your data:

```bash
# Check who you're logged in as
zeyos whoami

# List tickets (table output by default)
zeyos list tickets

# Get a specific ticket with all details
zeyos get ticket 42 --all

# Count records
zeyos count accounts

# Create a new ticket
zeyos create ticket --name "Fix login bug" --status 0 --priority 3

# Update a ticket's status
zeyos update ticket 42 --status 4

# Delete a ticket
zeyos delete ticket 42
```

Inspect the curated CLI-supported resource set at any time:

```bash
zeyos resources
```

If the resource you need does not appear there, switch to [`@zeyos/client`](../02-javascript-client/01-getting-started.md).

## Working with Filters

Query specific records using JSON filter expressions:

```bash
# Tickets with status = 1 (In Progress)
zeyos list tickets --filter '{"status":1}'

# Combine multiple criteria (AND logic)
zeyos list tickets --filter '{"status":1,"priority":3}'

# Count matching records
zeyos count tickets --filter '{"status":1}'
```

For normal operational views, include `visibility: 0`:

```bash
zeyos list tickets --filter '{"visibility":0,"status":1}'
```

## Sorting and Pagination

```bash
# Sort by name ascending, then by last modified descending
zeyos list tickets --sort "+name,-lastmodified"

# Limit results and paginate
zeyos list tickets --limit 10
zeyos list tickets --limit 10 --offset 10   # page 2
```

When results fill the page limit, the CLI automatically shows pagination info:

```
Showing 1–10 of 47  (--offset 10 for next page)
```

## Output Formats

Choose the format that fits your workflow:

```bash
# Default: formatted table (human-readable)
zeyos list tickets

# JSON: for scripting and piping
zeyos list tickets --json

# YAML: for config-friendly output
zeyos list tickets --yaml
```

:::tip Piping
JSON output works great with tools like `jq`:
```bash
zeyos list tickets --json | jq '.[].name'
```
:::

## JSON-First Automation

For coding agents and non-interactive scripts, prefer `--json` output and JSON-first writes:

```bash
zeyos create ticket --data '{"name":"Fix login bug","status":0,"priority":3,"visibility":0}' --json
zeyos update ticket 42 --data '{"status":4}' --json
```

`zeyos whoami --json` does not print access tokens. If a local tool explicitly needs the current token, use `zeyos whoami --show-token --json` and treat the output as a secret.

## Credential Storage

Tokens are saved to `.zeyos/auth.json` in your project directory (or the nearest parent that has one). For global credentials shared across projects:

```bash
zeyos login --global
```

This saves to `~/.config/zeyos/credentials.json` instead.

:::warning
Add `.zeyos/auth.json` to your `.gitignore` — it contains access tokens.
:::

## Next Steps

- **[Coding Agents](../04-agent-workflows/00-coding-agents.md)** -- CLI-first workflows and escalation guidance
- **[Commands Reference](./02-commands.md)** — Full reference for every command
- **[Configuration](./03-configuration.md)** — Config files, environment variables, and resource field customization
