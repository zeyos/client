---
sidebar_label: Commands Reference
---

# Commands Reference

Complete reference for every CLI command, with options and examples.

## Global Options

These options work with any command:

| Option | Description |
|--------|-------------|
| `--json` | Output as formatted JSON |
| `--yaml` | Output as YAML |
| `--no-color` | Disable ANSI color output |
| `-h`, `--help` | Show help for a command |

---

## login

Authenticate with a ZeyOS instance via OAuth 2.0 authorization code flow.

```
zeyos login [options]
```

| Option | Description |
|--------|-------------|
| `--base-url <url>` | ZeyOS platform URL |
| `--client-id <id>` | OAuth application ID |
| `--secret <secret>` | OAuth application secret |
| `--scope <scope>` | OAuth scope |
| `--port <port>` | Local callback port (default: `9005`) |
| `--global` | Save credentials to global config |
| `--force` | Overwrite existing credentials |
| `--clean` | Discard saved config and re-prompt for everything |
| `--manual` | Don't open browser; paste code manually |

**Examples:**

```bash
# Interactive login (prompts for missing values)
zeyos login

# Pre-fill connection values; the OAuth browser/code step still runs
zeyos login --base-url https://cloud.zeyos.com/demo \
            --client-id myapp --secret "$ZEYOS_CLIENT_SECRET"

# Start fresh, ignore any saved credentials
zeyos login --clean

# Manual mode (useful in SSH / headless environments)
zeyos login --manual
```

:::info
When values are not provided as flags, the CLI prompts interactively for the ZeyOS URL, application ID, and application secret. The secret prompt does not echo input. For CI or fully unattended agents, provide `ZEYOS_BASE_URL`, `ZEYOS_TOKEN`, and optionally `ZEYOS_REFRESH_TOKEN`, `ZEYOS_CLIENT_ID`, and `ZEYOS_CLIENT_SECRET` through the environment instead of running `zeyos login`.
:::

---

## logout

Revoke the stored token and clear saved credentials.

```
zeyos logout [--global]
```

| Option | Description |
|--------|-------------|
| `--global` | Clear global credentials instead of local |

**Examples:**

```bash
zeyos logout          # Clear local .zeyos/auth.json tokens
zeyos logout --global # Clear ~/.config/zeyos/credentials.json tokens
```

---

## whoami

Show information about the currently authenticated user.

```
zeyos whoami [--json|--yaml]
```

**Examples:**

```bash
zeyos whoami          # Table output
zeyos whoami --json
zeyos whoami --show-token --json   # explicitly include the current access token
```

---

## list

Query and list records for a resource with filtering, sorting, and pagination.

```
zeyos list <resource> [options]
```

| Option | Description |
|--------|-------------|
| `--fields <fields>` | Field selection — comma-separated, JSON object, or JSON array (see below) |
| `--filter <json>` | Filter criteria — JSON object |
| `--filter-file <path>` | Read filter criteria from a JSON file |
| `--sort <fields>` | Sort fields, comma-separated (prefix `+` asc, `-` desc) |
| `--limit <n>` | Maximum records to return (default: `50`) |
| `--offset <n>` | Skip the first n records |
| `--expand <fields>` | Expand JSON/binary columns (e.g. binfile, items) |
| `--extdata` | Include extended data fields |
| `--json` | JSON output |
| `--yaml` | YAML output |

**Fields format:**

The `--fields` option supports three formats:

| Format | Example |
|--------|---------|
| Comma-separated | `--fields ID,name,status` |
| JSON object (with aliases) | `--fields '{"Name":"lastname","City":"contact.city"}'` |
| JSON array | `--fields '["ID","name","status"]'` |

**Examples:**

```bash
# List tickets with default configured fields
zeyos list tickets

# Custom filters
zeyos list tickets --filter '{"status":1,"priority":3}'

# Custom filters from a file
zeyos list tickets --filter-file ./filters/open-tickets.json

# Specify fields with aliases
zeyos list accounts --fields '{"Name":"lastname","City":"contact.city"}'

# Comma-separated fields
zeyos list tickets --fields ID,name,status,priority

# Sort by multiple columns
zeyos list tickets --sort "+name,-lastmodified"

# Pagination
zeyos list tickets --limit 10 --offset 20

# Include extended data
zeyos list tickets --extdata

# JSON output for scripting
zeyos list tickets --json | jq length
```

:::tip Pagination Info
When results fill the page limit, the CLI makes a second API call to get the total count and displays:
```
Showing 1–10 of 47  (--offset 10 for next page)
```
:::

---

## count

Count records for a resource, with optional filtering. Returns a plain number by default.

```
zeyos count <resource> [options]
```

| Option | Description |
|--------|-------------|
| `--filter <json>` | Filter criteria — JSON object |
| `--filter-file <path>` | Read filter criteria from a JSON file |
| `--json` | Output as `{"count": N}` |
| `--yaml` | YAML output |

**Examples:**

```bash
# Total tickets
zeyos count tickets
# → 47

# Filtered count
zeyos count tickets --filter '{"status":1}'
# → 12

# Filtered count using a JSON file
zeyos count tickets --filter-file ./filters/open-tickets.json

# JSON output for scripting
zeyos count accounts --json
# → {"count": 156}
```

---

## get

Fetch a single record by ID.

```
zeyos get <resource> <id> [options]
```

| Option | Description |
|--------|-------------|
| `--fields <fields>` | Field selection — comma-separated, JSON object, or JSON array |
| `--extdata` | Include extended data fields |
| `--tags` | Include tags |
| `--all` | Fetch all data (extdata + tags + all fields) |
| `--json` | JSON output |
| `--yaml` | YAML output |

**Aliases:** `show`

**Examples:**

```bash
# Get a ticket with configured fields
zeyos get ticket 42

# Include extended data
zeyos get ticket 42 --extdata

# Include tags
zeyos get ticket 42 --tags

# Include both extdata and tags
zeyos get ticket 42 --extdata --tags

# Get everything — all fields, extdata, and tags
zeyos get ticket 42 --all

# JSON output
zeyos get account 15 --json

# Using the alias
zeyos show ticket 42
```

:::info Date Formatting
Date fields like `duedate`, `lastmodified`, and `creationdate` are automatically formatted as `YYYY-MM-DD` in table/record output. Raw Unix timestamps are preserved in JSON and YAML output. The format is configurable via `dateFormat` in your auth config file.
:::

---

## create

Create a new record. Fields can be provided as a JSON blob or as individual flags.

```
zeyos create <resource> [--data <json>] [--field value ...]
```

| Option | Description |
|--------|-------------|
| `--data <json>` | Complete record as a JSON string |
| `--data-file <path>` | Read the complete record from a JSON file |
| `--<field> <value>` | Set individual field (any unknown flag becomes a field) |

**Examples:**

```bash
# Using --data JSON
zeyos create ticket --data '{"name":"Fix login bug","status":0,"priority":3}'

# Using a JSON file
zeyos create ticket --data-file ./ticket.json

# Using individual field flags
zeyos create ticket --name "Fix login bug" --status 0 --priority 3

# Create an account (accounts use --lastname, not --name)
zeyos create account --lastname "ACME Corp" --currency EUR --visibility 0

# JSON output (returns the created record)
zeyos create ticket --name "New feature" --json
```

:::info Type Coercion
Field values are automatically coerced: `"true"` → `true`, `"false"` → `false`, `"null"` → `null`, and numeric strings become numbers. This means `--status 0` sends the integer `0`, not the string `"0"`.
:::

---

## update

Update an existing record by ID. Same input modes as `create`.

```
zeyos update <resource> <id> [--data <json>] [--field value ...]
```

**Aliases:** `edit`

**Examples:**

```bash
# Using --data JSON
zeyos update ticket 42 --data '{"status":4}'

# Using a JSON file
zeyos update ticket 42 --data-file ./ticket-update.json

# Using field flags
zeyos update ticket 42 --status 4 --priority 2

# Update account name (accounts use --lastname, not --name)
zeyos update account 15 --lastname "ACME Corporation"
```

---

## delete

Delete a record by ID. Prompts for confirmation by default.

```
zeyos delete <resource> <id> [--force]
```

| Option | Description |
|--------|-------------|
| `--force` | Skip confirmation prompt |

**Aliases:** `rm`, `remove`

**Examples:**

```bash
# Interactive confirmation
zeyos delete ticket 42

# Skip confirmation
zeyos delete ticket 42 --force

# Using aliases
zeyos rm ticket 42
zeyos remove ticket 42
```

---

## resources

List all curated CLI resources and their operations. This is the authoritative boundary for what the CLI supports directly.

```
zeyos resources
```

Shows a table of all CLI-supported resource types and available operations.

---

## describe

Show a resource's schema — fields, types, foreign keys and enum values — from the generated schema. Runs **offline** (no login required), so an agent can discover the data model before making any call.

```
# Field/type/enum/foreign-key listing for a resource
zeyos describe tickets

# Machine-readable schema
zeyos describe accounts --json
```

Foreign keys are shown as `→ <table>`, and enum fields list their valid values (e.g. `status` → `0=NOTSTARTED 1=AWAITINGACCEPTANCE …`). The operations available for the resource are listed at the bottom.

---

## doctor

Check local CLI readiness for coding agents. This runs offline and never prints tokens or client secrets.

```bash
zeyos doctor agent
zeyos doctor agent --json
```

The report includes the CLI version, configured base URL and instance, whether auth values are present through environment/local/global config, and whether the curated resource registry can be loaded.

---

## skills

Discover and install the bundled ZeyOS agent skill packs into any coding agent, so the agent (Claude Code, Codex, opencode, Factory Droid, pi, …) operates against ZeyOS with the right conventions out of the box.

```
# List the bundled skills
zeyos skills list

# Print a skill's instructions
zeyos skills show zeyos-work-management

# Install — interactive: pick a coding agent, then local vs. global
zeyos skills install

# Install non-interactively with flags
zeyos skills install --target claude --global       # all projects
zeyos skills install --target opencode --local      # this project only
zeyos skills install zeyos-billing-insights -y      # one skill, defaults
zeyos skills install --dir ./vendor/skills          # any directory
```

Run bare, `install` prints the ZeyOS banner and prompts for **(a)** which coding agent to target and **(b)** whether to install for this project or globally for every project. Pass `--target` and/or `--global`/`--local` to skip the matching prompt; pass `-y`/`--yes` (or pipe non-interactively) to skip all prompts and use flags plus sensible defaults.

Options for `install`:

| Option | Description |
|--------|-------------|
| `--target <agent>` | Coding agent: `claude`, `codex`, `opencode`, `droid`, `pi`, `agents` (prompted when omitted; otherwise auto-detected) |
| `--global` | Install into the agent's home directory (all projects) |
| `--local` | Install into the current project (default) |
| `--dir <path>` | Install into an explicit directory (overrides `--target`) |
| `--force` | Overwrite existing skill folders |
| `-y`, `--yes` | Skip prompts and use flags / sensible defaults |
| `--no-logo` | Don't print the ZeyOS banner |
| `--json` / `--yaml` | Print a machine-readable install summary (also silences the banner) |

Per-agent skill directories:

| Agent | `--local` | `--global` |
|-------|-----------|------------|
| `claude` | `.claude/skills/` | `~/.claude/skills/` |
| `codex` | `.codex/skills/` | `~/.codex/skills/` |
| `opencode` | `.opencode/skills/` | `~/.config/opencode/skills/` |
| `droid` | `.factory/skills/` | `~/.factory/skills/` |
| `pi` | `.pi/skills/` | `~/.pi/agent/skills/` |
| `agents` | `.agents/skills/` | `~/.agents/skills/` |

Skills are copied into `<dir>/<name>/`, with the shared reference files installed alongside (`<dir>/shared/`) so the skills' `../shared/…` links resolve.

---

## Command Aliases

| Alias | Equivalent |
|-------|-----------|
| `show` | `get` |
| `edit` | `update` |
| `rm` | `delete` |
| `remove` | `delete` |
| `resource` | `resources` |
| `skill` | `skills` |
