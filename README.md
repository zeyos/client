# ZeyOS Client & CLI

A dependency-light JavaScript client, a command-line tool, and agent guidance for integrating external tools with [ZeyOS](https://www.zeyos.com) — the ERP/CRM platform. Read and write business data (tickets, accounts, tasks, projects, billing, and 50+ more resources) over the ZeyOS OpenAPI surface.

This repository ships two npm packages plus the docs, OpenAPI specs, sample apps, and coding-agent skills:

| Package | What it is | Install |
|---------|-----------|---------|
| [`@zeyos/client`](#javascript-client) | Zero-runtime-dependency JS client (browser + Node 18+). Auto-generated methods for the full API. | `npm install @zeyos/client` |
| [`@zeyos/cli`](#cli) | The `zeyos` command — login, CRUD, schema introspection, agent-skill installer. | `npm install -g @zeyos/cli` |

The authoritative, in-depth documentation lives in [`docs/`](./docs/). This README is the quick tour.

---

## Table of contents

- [Quick start](#quick-start)
- [Authentication & login](#authentication--login)
- [CLI](#cli)
- [JavaScript client](#javascript-client)
- [Using ZeyOS with a coding agent](#using-zeyos-with-a-coding-agent)
- [Sample apps](#sample-apps)
- [Repository layout](#repository-layout)
- [Documentation](#documentation)
- [Testing](#testing)
- [Conventions & gotchas](#conventions--gotchas)
- [License](#license)

---

## Quick start

### From the command line

```bash
npm install -g @zeyos/cli

# Authenticate once (opens a browser for the OAuth flow)
zeyos login --base-url https://cloud.zeyos.com/demo --client-id myapp --secret "$ZEYOS_CLIENT_SECRET"

# Read and write
zeyos list tickets --filter '{"status":4}' --sort -lastmodified --limit 10
zeyos count tickets --filter '{"status":4}'
zeyos get ticket 42 --all
zeyos create ticket --name "Fix login bug" --status 0 --priority 3
zeyos update ticket 42 --status 9
```

### From JavaScript

```js
import { createZeyosClient, MemoryTokenStore } from '@zeyos/client';

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'oauth',
    oauth: {
      tokenStore: new MemoryTokenStore({ accessToken: process.env.ZEYOS_TOKEN }),
    },
  },
});

const tickets = await client.api.listTickets({
  fields: ['ID', 'name', 'status', 'priority'],
  filters: { visibility: 0 },
  limit: 10,
});
```

> **`platform`** is your instance URL: `https://<host>/<instance>/`. For `https://cloud.zeyos.com/demo/`, the instance is `demo`. The string `'live'` is a shorthand preset for `https://cloud.zeyos.com`.

---

## Authentication & login

ZeyOS uses OAuth 2.0. You register an application in your ZeyOS instance to get a **client ID** and **client secret**, then obtain tokens via one of the flows below. The client also supports legacy session-cookie auth.

The client supports four auth **modes**:

| Mode | Behavior |
|------|----------|
| `auto` (default) | Bearer token → auto-refresh on expiry/401 → session-cookie fallback |
| `oauth` | Bearer token only |
| `session` | Session cookies only |
| `none` | No authentication (public endpoints) |

### Option 1 — Log in with the CLI

The easiest path. `zeyos login` runs the OAuth authorization-code flow: it prints the URLs, opens your browser, starts a local callback server to capture the redirect, and stores the resulting tokens.

```bash
zeyos login \
  --base-url https://cloud.zeyos.com/demo \
  --client-id myapp \
  --secret "$ZEYOS_CLIENT_SECRET"

zeyos whoami        # confirm you're authenticated
```

- Omit any of `--base-url` / `--client-id` / `--secret` to be prompted interactively (the secret prompt is masked).
- `--global` stores credentials in `~/.config/zeyos/credentials.json` instead of a local `.zeyos/auth.json`.
- `--manual` skips the browser and prompts you to paste the authorization code (useful over SSH).
- `--force` re-authenticates even if a token is already stored; `--clean` discards the saved config and re-prompts for everything.

Tokens auto-refresh on use, and the refreshed token is written back to whichever config file you logged into. **Add `.zeyos/auth.json` to your `.gitignore`** — it holds credentials and tokens.
If a stored refresh token is invalid or expired, interactive `zeyos whoami` shows
where the stale credential came from and asks whether to re-authenticate.
Non-interactive and machine-readable runs print the corresponding `zeyos login --force`
command instead of prompting.

### Option 2 — Programmatic OAuth (authorization-code flow)

For server-side apps that run their own OAuth flow:

```js
import { createZeyosClient } from '@zeyos/client';

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: { mode: 'oauth', oauth: { clientId: 'myapp', clientSecret: process.env.ZEYOS_CLIENT_SECRET } },
});

// 1. Send the user to the authorization URL
const authUrl = client.oauth2.buildAuthorizationUrl({
  redirectUri: 'https://myapp.example.com/callback',
  scope: 'all',
  state: 'csrf-token-here',
});

// 2. On your callback route, exchange the code for tokens (stored in the token store)
const { code } = client.oauth2.parseAuthorizationCallback(req.url);
await client.oauth2.exchangeAuthorizationCode({
  code,
  redirectUri: 'https://myapp.example.com/callback',
});

// 3. Make authenticated calls — tokens refresh automatically when they expire
const me = await client.oauth2.getUserInfo();
```

PKCE is supported by passing `codeChallenge` / `codeChallengeMethod` to `buildAuthorizationUrl` and `codeVerifier` to `exchangeAuthorizationCode`.

### Option 3 — Use an access token directly

If you already have an access token (and optionally a refresh token), seed a `MemoryTokenStore`:

```js
import { createZeyosClient, MemoryTokenStore } from '@zeyos/client';

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'oauth',
    oauth: {
      clientId: 'myapp',
      clientSecret: process.env.ZEYOS_CLIENT_SECRET, // required for auto-refresh
      tokenStore: new MemoryTokenStore({
        accessToken: process.env.ZEYOS_TOKEN,
        refreshToken: process.env.ZEYOS_REFRESH_TOKEN,
      }),
    },
  },
});
```

Implement your own persistent token store by providing an object with `async get()` and `async set(tokenSet)` — see [server-side integrations](./docs/05-tutorials/03-server-side-integrations.md).

### CLI credential resolution

The CLI resolves credentials in this order (first match wins, field by field):

1. **Environment variables** — `ZEYOS_BASE_URL`, `ZEYOS_INSTANCE`, `ZEYOS_CLIENT_ID`, `ZEYOS_CLIENT_SECRET`, `ZEYOS_TOKEN`, `ZEYOS_REFRESH_TOKEN`
2. **Local** `.zeyos/auth.json` (found by walking up from the current directory, like `.git`)
3. **Global** `~/.config/zeyos/credentials.json`

Environment variables make CI and ephemeral agent environments easy:

```bash
export ZEYOS_BASE_URL=https://cloud.zeyos.com/demo
export ZEYOS_TOKEN=your-access-token
zeyos list accounts --limit 5
```

---

## CLI

Install globally (`npm install -g @zeyos/cli`) or run from this repo with `node cli/bin/zeyos.mjs <command>`.

```
zeyos <command> [options] [args…]
```

| Command | What it does | Example |
|---------|--------------|---------|
| `login` | OAuth login, stores tokens | `zeyos login --base-url https://cloud.zeyos.com/demo --client-id myapp --secret $S` |
| `logout` | Revoke session and clear stored credentials | `zeyos logout` |
| `whoami` | Show the authenticated user | `zeyos whoami --json` |
| `list <resource>` | List / query records | `zeyos list tickets --filter '{"status":4}' --sort -lastmodified` |
| `count <resource>` | Count records (true total) | `zeyos count tickets --filter '{"status":4}'` |
| `get <resource> <id>` | Fetch one record (`show` is an alias) | `zeyos get ticket 42 --all` |
| `create <resource>` | Create a record | `zeyos create ticket --name "Bug" --status 0 --priority 3` |
| `update <resource> <id>` | Update a record (`edit` is an alias) | `zeyos update ticket 42 --status 9` |
| `delete <resource> <id>` | Delete a record (`rm`/`remove` aliases) | `zeyos delete ticket 42 --force` |
| `resources` | List resource types the CLI exposes | `zeyos resources --json` |
| `describe <resource>` | Show a resource's fields, types and enums | `zeyos describe ticket` |
| `skills <list\|show\|install>` | Manage bundled coding-agent skills | `zeyos skills install --target claude --global` |
| `okf <list\|show\|check\|export\|build>` | Work with the OKF knowledge bundle | `zeyos okf show tickets` |

**Global options** (work on every command): `--json`, `--yaml`, `--no-color`, `-h/--help`, `-v/--version`.

### Querying

```bash
# Field selection: comma list, JSON array, or JSON object (with aliasing + dot-notation joins)
zeyos list tickets --fields ID,name,status --limit 10
zeyos list accounts --fields '{"Name": "lastname", "City": "contact.city"}'

# Filtering (JSON object) and sorting (prefix - for descending)
zeyos list tickets --filter '{"status":4,"priority":4}' --sort -lastmodified

# Pagination
zeyos list tickets --limit 100 --offset 100
```

> `zeyos list` defaults to `--limit 50` and prints a `Showing X–Y of TOTAL` hint to **stderr** when the result is truncated. To count records, use `zeyos count <resource>` — counting the rows of a `list` only counts the current page.

### Creating & updating

Pass fields as individual flags or as a JSON blob:

```bash
zeyos create ticket --name "Fix login bug" --status 0 --priority 3
zeyos create account --lastname "Acme Corp" --currency EUR --type 1
zeyos update ticket 42 --status 9 --data '{"priority":4}'
```

`--json` / `--yaml` switch any command to machine-readable output, which is what you want for scripting and agents:

```bash
zeyos list tickets --filter '{"status":4}' --json | jq '.[].name'
```

Full CLI reference: [docs/03-cli](./docs/03-cli/01-getting-started.md).

---

## JavaScript client

`createZeyosClient(config)` returns a frozen client. Every API operation is available as a method under `client.api.*` (and `client.oauth2.*`, `client.legacyAuth.*`).

```js
import {
  createZeyosClient,
  MemoryTokenStore,
  ZeyosApiError,
  normalizeListResult,
  normalizeCountResult,
} from '@zeyos/client';

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: { mode: 'oauth', oauth: { tokenStore: new MemoryTokenStore({ accessToken: TOKEN }) } },
});
```

### CRUD

```js
// List with field selection, filters, and sorting
const tickets = await client.api.listTickets({
  fields: ['ID', 'name', 'status', 'priority', 'lastmodified'],
  filters: { visibility: 0, status: 4 },
  sort: ['-lastmodified'],
  limit: 25,
});

// Count (count is a boolean flag)
const open = await client.api.listTickets({ filters: { visibility: 0, status: 4 }, count: true });
const total = normalizeCountResult(open);

// Fetch one
const ticket = await client.api.getTicket({ ID: 42 });

// Create (returns the new record)
const created = await client.api.createTicket({ name: 'Fix login bug', status: 0, priority: 3 });

// Update — flat spread or an explicit body both work
await client.api.updateTicket({ ID: 42, status: 9 });

// Delete
await client.api.deleteTicket({ ID: 42 });
```

### Normalizing responses

List endpoints return either a plain array or a `{ data, count }` wrapper depending on the call. `normalizeListResult` smooths that over:

```js
const raw = await client.api.listAccounts({ filters: { visibility: 0 } });
const { data, count } = normalizeListResult(raw); // data is always an array
```

### Schema introspection

`client.schema` is a read-only view of resources, fields, enums, and operations — handy for building UIs and for agents that need to self-correct:

```js
client.schema.resources();                 // ['accounts', 'tickets', ...]
client.schema.fields('tickets');           // ['ID', 'name', 'status', ...]
client.schema.describe('accounts');        // { name, type, fields }
client.schema.operationIds();              // every callable operationId

// Opt-in pre-flight validation: catches unknown fields, filter/filters
// spelling, bad enum values, and required-create fields before the request.
const result = client.schema.validate('createAccount', { lastname: 'Acme' });
// → { valid: false, errors: [{ field: 'currency', message: 'Missing required field "currency" …' }] }
```

Enable validation on every call with `createZeyosClient({ validate: true })`, or per call with `client.api.createAccount(input, { validate: true })` (throws `ZeyosValidationError`).

### Error handling

Non-2xx responses throw a `ZeyosApiError` carrying the full response context:

```js
try {
  await client.api.getTicket({ ID: 999999 });
} catch (err) {
  if (err instanceof ZeyosApiError) {
    console.error(err.status, err.statusText); // 404 'Not Found'
    console.error(err.body);                   // parsed server response
    console.error(err.operationId, err.url);   // 'getTicket', full URL
  }
}
```

Calling an operation that doesn't exist throws a helpful `ZeyosApiError` with a "did you mean …?" suggestion instead of an opaque `TypeError`.

### Retries & low-level access

- **Retries**: 429/503 are retried automatically with exponential backoff that honors `Retry-After`. Configure with `retry: { maxRetries, retryOn, baseDelayMs, maxDelayMs }`, or disable with `retry: false`.
- **Escape hatch**: `client.request({ service, operationId, ... })` or `client.request({ service, method, path, ... })` for anything the generated methods don't cover. Pass `{ raw: true }` to get the full `{ status, headers, data }` response.

Full client reference: [docs/02-javascript-client](./docs/02-javascript-client/01-getting-started.md). For battle-tested patterns and gotchas, see the [Practical Guide](./docs/02-javascript-client/04-practical-guide.md).

---

## Using ZeyOS with a coding agent

ZeyOS ships **agent skills** — curated instructions and query playbooks that teach a coding agent (Claude Code, Codex, etc.) how to operate against ZeyOS with the right conventions out of the box. This is the fastest way to let an agent read and write your business data correctly.

### 1. Install the skills into your project

```bash
zeyos skills list                              # see what's available
zeyos skills install                           # interactive: pick an agent, then local vs. global
zeyos skills install --target claude --global  # or skip the prompts with flags
zeyos skills install zeyos-work-management      # install just one skill
```

Run bare, `install` shows the ZeyOS banner and asks **(a)** which coding agent to target and **(b)** whether to install for this project or globally. Flags skip the prompts:

- `--target <agent>` — `claude`, `codex`, `opencode`, `droid`, `pi`, or `agents` (auto-detected when omitted)
- `--global` / `--local` — install into the agent's home directory or just this project (default `--local`)
- `--dir <path>` — install into any directory you choose (overrides `--target`)
- `-y`/`--yes` — skip all prompts and use flags + defaults (also implied when piped non-interactively)

| Agent | local | global |
|-------|-------|--------|
| `claude` | `.claude/skills/` | `~/.claude/skills/` |
| `codex` | `.codex/skills/` | `~/.codex/skills/` |
| `opencode` | `.opencode/skills/` | `~/.config/opencode/skills/` |
| `droid` | `.factory/skills/` | `~/.factory/skills/` |
| `pi` | `.pi/skills/` | `~/.pi/agent/skills/` |
| `agents` | `.agents/skills/` | `~/.agents/skills/` |

Shared reference docs are installed alongside so the skills' cross-links resolve. Point your agent at the install directory.

Bundled skills:

| Skill | Focus |
|-------|-------|
| `zeyos-work-management` | Tickets, tasks, projects, action steps, assignees, workload |
| `zeyos-time-tracking` | First-person work views and interactive time logging (effort as action steps) |
| `zeyos-account-intelligence` | Accounts, contacts, addresses, opportunities |
| `zeyos-billing-insights` | Transactions, invoices, credits, payments, revenue |
| `zeyos-collections-and-dunning` | Overdue receivables, dunning notices, collection workflows |
| `zeyos-commerce-and-inventory` | Items, pricing, price lists, stock, suppliers |
| `zeyos-procurement-and-supplier-performance` | Supplier comparison, procurement orders/deliveries/invoices, lead times |
| `zeyos-campaign-and-outreach` | Campaigns, mailing lists, outbound mailings |
| `zeyos-collaboration-and-activity` | Timelines, comments, followers, channels, files, events |
| `zeyos-mail-operations` | Querying, summarizing, and drafting email/message records |
| `zeyos-notes-and-sops` | Notes, SOPs, documents, file-backed knowledge |
| `zeyos-document-and-approval` | Formal document status, approval/finalization gates, note-vs-SOP |
| `zeyos-calendar-and-scheduling` | Appointments, availability/conflicts, scheduling, invitations |
| `zeyos-data-quality-and-governance` | Duplicate detection, completeness gaps, safe remediation previews |
| `zeyos-platform-and-schema` | Platform/admin entities, schema, custom fields |

### 2. Give the agent the CLI as its tool

For most agent workflows, the CLI with `--json` is the right interface: stable machine-readable output, built-in auth, and a safe delete confirmation. The agent runs `zeyos` commands and pipes JSON through `jq` or parses it directly.

```bash
zeyos describe ticket --json          # discover fields & enums
zeyos list tickets --filter '{"status":4}' --json
zeyos count accounts --filter '{"type":1}'
```

When a task needs a resource or request shape the CLI doesn't expose, the agent escalates to `@zeyos/client`, which covers the full generated API surface.

See [Agent Workflows](./docs/04-agent-workflows/00-coding-agents.md): [quickstart](./docs/04-agent-workflows/01-agent-quickstart.md), [recipes](./docs/04-agent-workflows/02-agent-recipes.md), and [CLI coverage & escalation](./docs/04-agent-workflows/03-cli-coverage-and-escalation.md).

---

## Open Knowledge Format (OKF)

The client ships a conformant [**Open Knowledge Format**](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
bundle under [`okf/`](./okf/) — a portable, Git-native Markdown description of the ZeyOS data
model (one concept per API-backed entity: schema, foreign keys, enums, indexes, operationIds)
plus curated metrics, playbooks, and query concepts. Agents and tools read it as a shared
knowledge layer, independent of this client.

```bash
zeyos okf list                 # browse concepts
zeyos okf show tickets         # print a concept (schema + curated notes)
zeyos okf check                # validate OKF v0.1 conformance
zeyos okf export --out ./okf   # vendor the bundle into your project
```

```js
import { buildOkf, loadOkfBundle, validateOkfBundle } from '@zeyos/client';
const files = buildOkf();                                  // synthesize from the client schema
const bundle = await loadOkfBundle('node_modules/@zeyos/client/okf');
```

The bundle is **generated** from the OpenAPI/dbref specs into managed blocks, with curated
prose preserved across regeneration, and it is **canonical** for structural facts (the shared
skill references derive from it). It is regenerated by `npm run generate` and gated by
`npm run okf:check`. See the [OKF docs](./docs/06-okf/01-overview.md) for the bundle layout,
the spec-refresh runbook, and how it ties into the [skill-improvement loops](./docs/06-okf/04-loops.md).

## Sample apps

Three runnable, dependency-free browser demos live in [`samples/`](./samples/):

- [**Kanban**](./docs/04-sample-apps/01-kanban.md) — drag-and-drop ticket board (status updates, detail view).
- [**CRM**](./docs/04-sample-apps/02-crm.md) — contact list with dot-notation joins, full-text search, sortable columns, pagination, inline editing.
- [**Dashboard**](./docs/04-sample-apps/03-dashboard.md) — KPI cards and charts built from parallel `count` queries.

Each can be served as static files from the repository root; see the linked docs for run and configuration instructions.

---

## Repository layout

- [`src/`](./src/) — the `@zeyos/client` JavaScript client (`src/runtime/` is hand-written; `src/generated/` is generated from the OpenAPI specs).
- [`cli/`](./cli/) — the `@zeyos/cli` command-line tool.
- [`docs/`](./docs/) — the authoritative documentation (Docusaurus).
- [`agents/`](./agents/) — repo-local ZeyOS agent skills and query playbooks.
- [`okf/`](./okf/) — the [Open Knowledge Format](./docs/06-okf/01-overview.md) bundle: a portable, Git-native Markdown description of the ZeyOS data model (canonical for structural facts).
- [`openapi/`](./openapi/) — the OpenAPI specifications and DB schema reference.
- [`samples/`](./samples/) — the sample browser applications.
- [`scripts/`](./scripts/) — client + OKF generation (`generate-client.mjs`, `generate-okf.mjs`) and the test runner.

---

## Documentation

| Section | Covers | Entry point |
|---------|--------|-------------|
| **API Reference** | Query language, OAuth2, every resource endpoint, field schema | [docs/01-api-reference](./docs/01-api-reference/01-data-retrieval.md) |
| **JavaScript Client** | Install, auth modes, CRUD, filtering, schema, retries, errors, patterns | [docs/02-javascript-client](./docs/02-javascript-client/01-getting-started.md) |
| **CLI** | Install, login, all commands, config & field display | [docs/03-cli](./docs/03-cli/01-getting-started.md) |
| **Agent Workflows** | CLI-first agent orientation, JSON recipes, escalation | [docs/04-agent-workflows](./docs/04-agent-workflows/00-coding-agents.md) |
| **Sample Apps** | Kanban, CRM, Dashboard walkthroughs | [docs/04-sample-apps](./docs/04-sample-apps/01-kanban.md) |
| **Tutorials** | Architecture guide, build-your-own frontend, server-side integration | [docs/05-tutorials](./docs/05-tutorials/00-application-developers.md) |
| **Open Knowledge Format** | The OKF knowledge bundle: overview, producing/consuming, keeping it fresh, refinement loops | [docs/06-okf](./docs/06-okf/01-overview.md) |
| **Agent Skills** | What the bundled skills do and how they're organized | [agents/README.md](./agents/README.md) |

---

## Testing

```bash
npm test                       # offline unit + schema tests (mocked fetch)
npm test -- --live             # adds a live OAuth smoke test (needs config.test.json)
npm run test:cli-integration   # live CLI CRUD lifecycle (requires `zeyos login`)
npm run test:agent-protocol    # agent-driven live protocol; --dry-run to verify wiring first
```

The CLI has its own offline suite: `node --test cli/test/offline.mjs`.

The **agent test protocol** drives a coding agent against a live instance and uses a model-rotation rule to separate real client defects from model flakiness. See [`test/agent-protocol/PROTOCOL.md`](./test/agent-protocol/PROTOCOL.md).

---

## Conventions & gotchas

A few platform facts that save debugging time (full list in the [Practical Guide](./docs/02-javascript-client/04-practical-guide.md)):

- **Use `filters` (plural)**, not `filter`, in client/CLI code. `filters` also matches GIN-indexed foreign-key fields (`account`, `project`, `ticket`); `filter` silently ignores them.
- **Always include `visibility: 0`** in filters unless you want archived (`1`) or deleted (`2`) records.
- **Dates are Unix timestamps in seconds**, not milliseconds (`new Date(value * 1000)`).
- **`createAccount` requires `currency`** (e.g. `"EUR"`) — it's `NOT NULL` with no default and otherwise fails with an opaque HTTP 500. Accounts use `lastname`/`firstname` (there is no `name` field) and `type` (not `accounttype`).
- **`operationId`s are CamelCase compounds** that don't always match DB table names (e.g. `dunning` → `listDunningNotices`). Use `client.schema.operationIds()` or `zeyos resources` to discover them.

---

## License

MIT — see [LICENSE](./LICENSE).
