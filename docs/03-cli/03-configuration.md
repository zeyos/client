---
sidebar_label: Configuration
---

# Configuration

The CLI uses a layered configuration system for credentials, output preferences, and per-resource field display.

:::info Coverage Boundary
These settings apply to the CLI's curated resource registry. If you need a resource or request shape outside that registry, switch to [`@zeyos/client`](../02-javascript-client/01-getting-started.md).
:::

## Credential Cascade

The CLI first decides **which credential set** is the base, then lets environment credential variables field-override on top. The base is chosen by the first match in this order:

| Priority | Source | Location |
|----------|--------|----------|
| 1 (highest) | `--profile <name>` flag | named profile (per command) |
| 2 | `ZEYOS_PROFILE` env var | named profile |
| 3 | Project pin | `.zeyos/profile` (walks up from CWD) |
| 4 | Local config file | `.zeyos/auth.json` (walks up from CWD) |
| 5 | Global active profile | `~/.config/zeyos/profiles.json` (`active`) |
| 6 (lowest) | Global config file | `~/.config/zeyos/credentials.json` |

On top of the chosen base, the credential **environment variables** (`ZEYOS_BASE_URL`, `ZEYOS_TOKEN`, …) always override individual fields — so you can keep `baseUrl` and client credentials in a profile while overriding just the token via `ZEYOS_TOKEN` in CI.

If you have never created a profile, nothing changes: the CLI falls through to the legacy local `.zeyos/auth.json` and global `credentials.json` exactly as before.

## Profiles

Profiles let you store several ZeyOS instances (e.g. `dev`, `prod`, `client-x`) and switch between them without re-running `login`. Each profile is a full credential set (URL, OAuth app, tokens) kept in `~/.config/zeyos/profiles.json`, with one marked **active**.

```bash
# Create profiles (connection params now; tokens via login)
zeyos profile add dev  --base-url https://zeyos.cms-it.de/dev
zeyos profile add prod --base-url https://cloud.zeyos.com/acme --client-id app --secret "$SECRET"

# Authenticate into a profile (also makes it active)
zeyos login --profile prod

# See and switch profiles
zeyos profile list                 # active marked with *, shows token status
zeyos profile use dev              # switch the global active profile
zeyos profile current             # what resolves right now, and why

# Per-project: pin a profile so cd-ing into a repo selects its instance
cd ~/work/acme && zeyos profile use prod --local   # writes ./.zeyos/profile

# One-off override on any command (beats env, pin, and active)
zeyos whoami --profile dev
zeyos list tickets --profile prod
```

`zeyos profile add <name> --from-current` snapshots whatever credentials are in effect (including tokens) into a new profile — handy for adopting an existing `.zeyos/auth.json` setup. Add `.zeyos/profile` to `.gitignore` alongside `.zeyos/auth.json`.

## Environment Variables

| Variable | Maps to | Description |
|----------|---------|-------------|
| `ZEYOS_BASE_URL` | `baseUrl` | ZeyOS platform URL |
| `ZEYOS_INSTANCE` | `instance` | ZeyOS instance name |
| `ZEYOS_CLIENT_ID` | `clientId` | OAuth application ID |
| `ZEYOS_CLIENT_SECRET` | `clientSecret` | OAuth application secret |
| `ZEYOS_TOKEN` | `accessToken` | Access token |
| `ZEYOS_REFRESH_TOKEN` | `refreshToken` | Refresh token |

**Example:**

```bash
# Use environment variables for CI/CD pipelines
export ZEYOS_BASE_URL="https://cloud.zeyos.com/demo"
export ZEYOS_TOKEN="your-access-token"

zeyos list tickets
```

If you want the CLI to auto-refresh expired access tokens, also provide `ZEYOS_CLIENT_ID`, `ZEYOS_CLIENT_SECRET`, and a refresh token via config or environment variables.

## Local Config File

The CLI stores credentials in `.zeyos/auth.json`, located in your project directory. When resolving config, the CLI walks up from the current working directory (like Git does for `.gitconfig`) until it finds a `.zeyos/auth.json` file.

**File format:**

```json
{
  "baseUrl": "https://cloud.zeyos.com/demo",
  "clientId": "myapp",
  "clientSecret": "...",
  "accessToken": "...",
  "refreshToken": "...",
  "expiresAt": 1735568880,
  "refreshTokenExpiresAt": 1738160880,
  "dateFormat": "YYYY-MM-DD"
}
```

This file is created automatically when you run `zeyos login`.

`expiresAt` and `refreshTokenExpiresAt` are stored as Unix timestamps in **seconds**.

:::warning
Always add `.zeyos/auth.json` to your `.gitignore` — it contains access tokens and secrets:
```gitignore
.zeyos/auth.json
```
:::

## Global Config File

For credentials shared across all projects, use the global config:

```bash
zeyos login --global
```

This saves to `~/.config/zeyos/credentials.json` (same format as the local file). Local config values override global values field-by-field, so a project can override only the fields it needs.

## Resource Field Configuration

Customize which fields are displayed for each resource type. The CLI supports per-resource configs that control the `list` and `get` output.

### Config Cascade

Resource configs are also resolved in priority order:

| Priority | Location | Purpose |
|----------|----------|---------|
| 1 (highest) | `.zeyos/api/<resource>.json` | Project-specific overrides |
| 2 | `~/.zeyos/api/<resource>.json` | User-wide preferences |
| 3 (lowest) | `cli/config/<resource>.json` | Shipped defaults |

### Config Format

```json
{
  "list": {
    "fields": {
      "ID": "ID",
      "Name": "lastname",
      "City": "contact.city",
      "Country": "contact.country",
      "Agent": "assigneduser.name",
      "Modified": "lastmodified"
    }
  },
  "get": {
    "fields": [
      "ID", "name", "status", "priority",
      "description", "duedate", "lastmodified"
    ],
    "params": {
      "extdata": 1,
      "tags": 1
    }
  }
}
```

**`list.fields`** — An object mapping display aliases to API field paths. Keys become column headers; values are the actual API fields (supports dot-notation for joins).

**`get.fields`** — An array of field names to display in the detail view. Use `--all` to override and show everything.

**`get.params`** — An object of query parameters to include by default. These are sent as URL query parameters (e.g. `?extdata=1&tags=1`) and control which additional data sections are returned. Common params: `extdata` (extended data fields), `tags` (record tags).

:::note
The `--extdata` and `--tags` CLI flags override the corresponding values in `get.params`. For example, running `zeyos get ticket 42` with `"params": {"extdata": 1}` in the config is equivalent to running `zeyos get ticket 42 --extdata`.
:::

### Shipped Defaults

The CLI ships with configs for commonly used resources:

| File | Resource |
|------|----------|
| `cli/config/ticket.json` | Tickets |
| `cli/config/account.json` | Accounts |
| `cli/config/task.json` | Tasks |
| `cli/config/project.json` | Projects |
| `cli/config/item.json` | Items |

Resources without a config file return all fields from the API.

:::tip Customizing for Your Project
Create `.zeyos/api/ticket.json` in your project to override the default field display:
```bash
mkdir -p .zeyos/api
```
```json title=".zeyos/api/ticket.json"
{
  "list": {
    "fields": {
      "ID": "ID",
      "Title": "name",
      "Client": "account.lastname",
      "Sprint": "extdata.sprint",
      "Due": "duedate"
    }
  }
}
```
:::

## Date Formatting

Unix timestamps in table and record output are automatically formatted as human-readable dates. Configure the format in your auth config file:

```json title=".zeyos/auth.json"
{
  "baseUrl": "https://cloud.zeyos.com/demo",
  "dateFormat": "YYYY-MM-DD HH:mm"
}
```

**Available tokens:**

| Token | Output | Example |
|-------|--------|---------|
| `YYYY` | 4-digit year | `2026` |
| `MM` | 2-digit month | `03` |
| `DD` | 2-digit day | `02` |
| `HH` | 2-digit hour (24h) | `14` |
| `mm` | 2-digit minute | `30` |
| `ss` | 2-digit second | `00` |

**Default format:** `YYYY-MM-DD`

Date formatting only affects table and record output. JSON and YAML output always preserves raw Unix timestamps for programmatic use.

**Auto-detected date fields:** `duedate`, `lastmodified`, `creationdate`, `created`, `date`, `startdate`, `enddate`, and any field name ending in `date` or `modified`.

## Output Formats

| Flag | Format | Best For |
|------|--------|----------|
| *(none)* | Formatted table | Human reading in the terminal |
| `--json` | Pretty-printed JSON | Scripting, piping to `jq`, APIs |
| `--yaml` | YAML | Config files, readability |

**Table output** is the default — it shows aligned columns with optional date formatting and pagination info.

**JSON output** preserves all raw data exactly as returned by the API, including numeric timestamps and null values.

**YAML output** is similar to JSON but more readable for nested structures.

```bash
# Compare the outputs
zeyos get ticket 42           # Table with formatted dates
zeyos get ticket 42 --json    # Raw JSON with Unix timestamps
zeyos get ticket 42 --yaml    # YAML with readable structure
```
