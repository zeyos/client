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
| `--profile <name>` | Use a named credential profile for this command |
| `--no-color` | Disable ANSI color output |
| `-h`, `--help` | Show help for a command |

Global options may be placed before or after the command name:

```bash
zeyos --profile dev whoami
zeyos whoami --profile dev
```

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
zeyos logout          # Clear local .zeyos/auth.json credentials
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

If the stored refresh token is invalid or expired, interactive text-mode `whoami`
prints the credential source and asks whether to re-authenticate immediately. In
`--json`, `--yaml`, or non-interactive runs, it exits with the same diagnostic and
prints the matching `zeyos login --force` command instead of prompting.

---

## profile

Manage named credential profiles and switch between ZeyOS instances. See [Configuration → Profiles](./03-configuration.md#profiles) for the full model.

```
zeyos profile <list|current|use|add|remove> [options]
```

| Command | Description |
|---------|-------------|
| `profile list` | List all profiles; the active one is marked `*`, with token status |
| `profile current` | Show which profile resolves right now, and why (flag/env/pin/active) |
| `profile use <name>` | Make `<name>` the active profile (global) |
| `profile use <name> --local` | Pin `<name>` to the current project (`.zeyos/profile`) |
| `profile add [<name>] [opts]` | Create/update a profile; prompts for missing values when run without options |
| `profile remove <name>` | Delete a profile |

**Examples:**

```bash
zeyos profile add                         # prompt for name, URL, app ID, secret
zeyos profile add dev  --base-url https://zeyos.cms-it.de/dev
zeyos profile add prod --from-current        # snapshot current credentials
zeyos login --profile prod                   # authenticate into & activate a profile
zeyos profile use dev                         # switch active profile
zeyos profile use prod --local                # pin to this project
zeyos list tickets --profile dev              # one-off override on any command
```

---

## list

Query and list records for a resource with filtering, sorting, and pagination.

```
zeyos list <entity> [options]
```

Run `zeyos list` with no entity to see everything you can query, grouped by business area:

```bash
zeyos list            # grouped overview
zeyos resources       # the same overview
zeyos resources --json  # flat array, with group / description / transactionType
```

| Option | Description |
|--------|-------------|
| `--fields <fields>` | Field selection — comma-separated, JSON object, or JSON array (see below) |
| `--filter <json>` | Filter criteria — JSON object |
| `--filter-file <path>` | Read filter criteria from a JSON file |
| `--search <text>` | Full-text search (sent as the API `query` parameter) |
| `--preset <name>` | Apply a resource business preset; an explicit `--filter` is merged on top |
| `--sort <fields>` | Sort fields, comma-separated (prefix `+` asc, `-` desc) |
| `--limit <n>` | Maximum records to return (default: `50`) |
| `--offset <n>` | Skip the first n records |
| `--expand <fields>` | Expand JSON/binary columns (e.g. binfile, items) |
| `--extdata` | Include extended data fields |
| `--json` | JSON output |
| `--yaml` | YAML output |
| `--dry-run` | Print the request without sending it |
| `--no-validate` | Skip the CLI's default schema validation |

**Fields format:**

The `--fields` option supports three formats:

| Format | Example |
|--------|---------|
| Comma-separated | `--fields ID,name,status` |
| JSON object (with aliases) | `--fields '{"Name":"lastname","City":"contact.city"}'` |
| JSON array | `--fields '["ID","name","status"]'` |

**Filter compatibility:**

The CLI normalizes common agent- and ORM-generated filter forms before sending the request:

- arrays become `IN` — `{"status":[1,3]}`
- Mongo style — `$lt $lte $gt $gte $ne $in $nin $like $ilike $regex $eq $between`
- suffix keys — `lastname__startswith`, `lastname__endswith`, `lastname__contains`, `lastname__like`, `ID__gt`, `status__in`, `status__nin`, `duedate__between`
- the single-underscore form where unambiguous — `status_neq`, `ID_gt` (a field that genuinely contains an underscore, like `sender_email`, is never split)
- **composite** — `{"$or":[…]}` and `{"$and":[…]}` become ZeyOS numbered logical groups (`{"0":["OR",…]}`)

On `accounts`, `name` in filters or `--fields` resolves to `lastname`.

`startswith` / `endswith` / `contains` take **literal** text, so `%` and `_` in your value are escaped. `like` / `ilike` take a **pattern** where `%` is a wildcard.

An operator the CLI cannot translate is rejected before the request with the supported set in the error (exit `2`), rather than being forwarded for the server to refuse opaquely. ZeyOS has no IS NULL filter, so `field__isnull` is refused with the client-side alternative.

Run `zeyos describe <entity>` for the authoritative operator list — it is printed in a `filter operators` section, and carried under `filterOperators` in `--json`.

Before sending, data commands validate filter, selected, sorted, and written fields against
the generated schema. Unknown fields fail fast with a suggestion and the valid-field list;
joins such as `contact.city` and `extdata.*` remain accepted. Use `--no-validate` only as an
escape hatch. If a filtered or searched list is empty, the CLI prints a stderr hint pointing
to `describe` and `find`, including in JSON and YAML modes.

**Transaction entities:**

`transactions` is a single table holding twelve different business documents, separated only by the `type` column. Each type is exposed as its own entity, so you never filter on `type` by hand:

| Entity | `transactions.type` | Meaning |
|--------|--------------------|---------|
| `billing_quotes` | 0 | Quotes issued to customers |
| `billing_orders` | 1 | Sales orders |
| `billing_deliveries` | 2 | Delivery notes to customers |
| `billing_invoices` | 3 | Invoices issued to customers |
| `billing_credits` | 4 | Credit notes issued to customers |
| `procurement_requests` | 5 | Purchase requisitions |
| `procurement_orders` | 6 | Purchase orders to suppliers |
| `procurement_deliveries` | 7 | Goods received from suppliers |
| `procurement_invoices` | 8 | Supplier invoices (bills) |
| `procurement_credits` | 9 | Credit notes from suppliers |
| `production_fabrications` | 10 | Production/assembly runs |
| `production_disassemblies` | 11 | Disassembly runs |

Singular, plural and hyphenated spellings all resolve (`billing_invoice`, `billing_invoices`, `billing-invoices`). Unqualified sales vocabulary maps to the billing side — `invoices`, `orders`, `quotes`, `credits`, `deliveries` — while `bills`, `po` and `purchase_orders` map to procurement. Use `transactions` to query every type at once.

The type binding is applied beneath any `--preset` and any `--filter`, and is set automatically on `create`:

```bash
zeyos list billing_invoices --preset overdue
zeyos create billing_invoices --account 42 --currency EUR   # sends type: 3
```

Invoice and credit entities accept these presets:

| Preset | Filter |
|--------|--------|
| `open` | Excludes cancelled, closed, paid, overpaid and processed status variants |
| `overdue` | Open, with `duedate` before now |
| `paid` | Status `20` or `21` |
| `draft` / `booked` / `cancelled` | Status `0` / `1` / `3` |

The older presets on the `transactions` entity itself (`quotes`, `orders`, `invoices`, `credits`, `open-invoices`, `overdue-invoices`, `paid-invoices`) still work.

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

## find

Resolve a human label to records before filtering another resource by foreign-key ID.

```bash
zeyos find accounts "Zfx Lyon"
zeyos find projects "Website" --limit 5 --json
```

`find` sends the text through the API's full-text `query` parameter and returns ID plus the
resource's display fields. No matches is a successful result reported on stderr.

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
| `--search <text>` | Full-text search |
| `--preset <name>` | Apply a resource business preset before the explicit filter |
| `--json` | Output as `{"count": N}` |
| `--yaml` | YAML output |
| `--dry-run` | Print the request without sending it |
| `--no-validate` | Skip schema validation |

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

## sum

Sum a numeric field across matching records. The CLI pages internally, so this is the
short path for simple totals that would otherwise require `list` plus a script.

```
zeyos sum <resource> <field> [options]
```

| Option | Description |
|--------|-------------|
| `--filter <json>` | Filter criteria — JSON object. Arrays normalize to `IN`, e.g. `{"status":[1,3]}` |
| `--filter-file <path>` | Read filter criteria from a JSON file |
| `--preset <name>` | Apply a resource business preset before the explicit filter |
| `--page-size <n>` | Records per API page (default: 50) |
| `--limit <n>` | Maximum records to inspect |
| `--offset <n>` | Initial offset |
| `--json` | Output as `{"sum": N, "count": N, "field": "..."}` |
| `--yaml` | YAML output |
| `--dry-run` | Print the first request without sending it |
| `--no-validate` | Skip schema validation |

**Examples:**

```bash
# Completed or booked effort minutes
zeyos sum actionsteps effort --filter '{"status":[1,3]}'

# Invoice net amount as JSON
zeyos sum transactions netamount --filter '{"type":3}' --json
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
Field values are coerced using the column's type from the schema, not from how the value looks:

- Numeric columns (`smallint`, `integer`, `numeric`, …) take numbers, so `--status 0` sends the integer `0`, not `"0"`.
- Boolean columns accept `true` / `false`.
- **Text columns keep their string value**, so `--customernum 00123` sends `"00123"` and `--phone "+4930123456"` keeps its `+`. Identifiers that merely look numeric are not damaged.
- `--<field> null` always sends JSON `null`.

For a field the schema doesn't know (a custom column, or with `--no-validate`), the value is converted only when it is a plain decimal number that round-trips exactly — a leading zero, a leading `+`, an exponent, hex, or a value beyond the safe integer range all stay text.

:::tip
To control types exactly, pass `--data` with explicit JSON: `--data '{"zip":"01067","amount":19.99}'`.
:::
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

:::warning
`--force` is a flag and takes no value — `--force=false` is a usage error, not a way to turn it off. Omit the flag to keep the confirmation.

In a script or CI, stdin is usually closed, so the confirmation cannot be answered: the delete is **aborted** and the command exits `5`. Pass `--force` for non-interactive deletes.
:::

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

Shows a table of all CLI-supported resource types and available operations. Operational
workflows can use `actionstep` / `actionsteps` / `time-entries` for follow-ups and
effort records. Read-only platform schema definitions are available as `customfield` /
`customfields` with `list`, `get`, and therefore `count` support.

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

## okf

Work with the [Open Knowledge Format](../06-okf/01-overview.md) bundle that ships with the
client — a portable Markdown description of the ZeyOS data model (one concept per
API-backed entity) plus curated metrics, playbooks, and query concepts.

```bash
zeyos okf list                  # list concepts (type, id, title); --json for automation
zeyos okf show tickets          # print a concept (bare resource name, or entities/tickets)
zeyos okf check                 # validate OKF v0.1 conformance (exit non-zero on error)
zeyos okf export --out ./okf    # copy the shipped bundle into a directory
zeyos okf build  --out ./okf    # synthesize a bundle from the client's schema
```

| Subcommand | What it does |
|-----------|--------------|
| `list` | List the concepts in the bundle (`--json`/`--yaml` supported). |
| `show <concept>` | Print one concept doc. Accepts a bare resource (`tickets`) or full id (`entities/tickets`). |
| `check` | Validate the bundle for OKF v0.1 conformance; exits non-zero on any error (CI-friendly). |
| `export` | Copy the shipped `okf/` bundle into `--out` (default `./okf`); `--force` to overwrite. |
| `build` | Synthesize a structural bundle from the client's schema into `--out` (default `./okf`). |

Options: `--dir <path>` reads from an explicit bundle directory (`list`/`show`/`check`);
`--out <path>` is the write target (`build`/`export`); `--force` overwrites an existing
target. `export` ships the rich curated bundle; `build` is the lighter runtime projection.

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

---

## Exit Codes

Every command reports its outcome through the exit code, so scripts and agents can
tell failure modes apart without parsing stderr.

| Code | Meaning | Typical cause |
|------|---------|---------------|
| `0` | Success | — |
| `1` | Runtime or API failure | The request reached the server and failed |
| `2` | Usage error | Unknown command, unknown flag, missing argument, a value passed to a boolean flag |
| `3` | Auth error | No credentials, an unknown `--profile`, HTTP 401/403 |
| `4` | Not found | The requested record does not exist |
| `5` | Aborted | A confirmation prompt was declined, or could not be answered because stdin was closed |

```bash
zeyos get ticket 999999 --json
case $? in
  0) echo "found" ;;
  4) echo "no such ticket" ;;
  3) echo "run: zeyos login" ;;
  *) echo "failed" ;;
esac
```

:::note
`zeyos doctor agent` exits `3` when the environment is not ready, which makes it
usable directly as a CI readiness check.
:::

---

## Timeouts

Requests time out after **30 seconds** by default. Override per command with
`--timeout <seconds>`, or globally with the `ZEYOS_TIMEOUT_MS` environment variable.

```bash
zeyos list transactions --preset open-invoices --timeout 120
```

Read operations (`list`, `count`, `get`, `find`, `sum`) are retried automatically on
timeouts and transient network errors. Writes are never retried on a timeout or a
`503`, so a create cannot be duplicated by a retry.

---

## Number Formatting

Columns the schema types as floating point (`double precision`, `numeric`, `decimal`, `real`, `money`) are rendered with grouped thousands and two decimal places in table and record views, and right-aligned:

```
     ID  TRANSACTIONNUM        DATE  STATUS  ACCOUNT     NETAMOUNT
  ─────  ──────────────  ──────────  ──────  ───────  ────────────
  10932  N.2210.0654-01  2022-11-06       8     8840     17.009,00
  99999  R.2401.0001-01  2024-01-01       1     1234  1.234.567,89
```

Integer columns are deliberately left untouched — IDs, foreign keys, enum codes and Unix timestamps are all integers, and grouping them would be misleading.

The separators follow a locale, resolved in this order:

1. `ZEYOS_LOCALE` environment variable
2. `locale` in the resource config file
3. the host's default locale

```bash
ZEYOS_LOCALE=de-DE zeyos list billing_invoices   # 17.009,00
ZEYOS_LOCALE=en-US zeyos list billing_invoices   # 17,009.00
```

:::info
Formatting applies to human-readable output only. `--json` and `--yaml` always emit the raw
number, so scripts and agents are unaffected by the terminal's locale.
:::
