# Changelog

Notable changes to `@zeyos/client` and `@zeyos/cli`. This project follows
[Semantic Versioning](https://semver.org/).

## 0.6.0

### `@zeyos/cli` (`zeyos`)
- Added direct resource coverage and aliases for common API nouns whose generated
  operationIds differ from user-facing names, including group/user junctions,
  mailing lists/recipients, price lists, price-list account junctions, prices,
  and dunning junction aliases.
- Expanded forgiving filter normalization for agent and shell workflows:
  Mongo-style operators, bare comparison operators, array-to-`IN`, suffix forms
  such as `field__in`/`field__nin`/`field__like`, and negative-set filters now
  normalize to the native ZeyOS request shape and remain visible in dry-run JSON.
- Expanded `zeyos sum` coverage and regression tests for actionsteps, payments,
  and transactions, including the documented actionsteps oversized-page failure
  mode.

### Agent skills (shipped)
- The generic ZeyOS entrypoint is slash-command-free and explicitly supports direct
  execution for simple counts once the resource and filter constraints are clear.
- Shared guidance now prefers `zeyos sum` for simple ungrouped totals while keeping
  manual aggregation for grouped, joined, or conditional totals.

### Agent test protocol (dev-only)
- The fixed benchmark mode is now DeepSeek-only
  (`openrouter/deepseek/deepseek-v4-flash`) and defaults to one-attempt strict
  data (`--transient-retries 0`), while normal report runs can still use transient
  retries.
- Added efficiency budgets for direct count, b14, b22, dunning, mail, and sum
  scenarios; pass-but-expensive cases are now separated from correctness defects
  in Markdown and HTML scorecards.
- Added transcript leakage detection for user-home/global skill paths and classifies
  those runs as `ENVIRONMENT_DEFECT`.
- Hardened RESULT parsing/output-contract checks for Markdown-wrapped markers and
  file-output mistakes.
- Added complex collections and mail regression scenarios and coverage for minimal
  query shape, zero API errors, API-call budgets, provider/runner failure clarity,
  and token/cost capture.

## 0.5.0

### `@zeyos/cli` (`zeyos`)
- `logout` now clears the selected **local legacy credentials in full** (connection params, not just tokens) so a subsequent `login` starts from fresh connection parameters; profile/global logout behavior is unchanged. Adds `clearLocalCredentialsForSource` and offline coverage.

### Agent skills (shipped)
- **Four new domain skills**, installable via `zeyos skills install`: `zeyos-calendar-and-scheduling`, `zeyos-document-and-approval`, `zeyos-procurement-and-supplier-performance`, `zeyos-data-quality-and-governance` (each with stated routing boundaries).
- Shared operating guide gains the **R-001…R-023 rule set** and a confirmation matrix; the query-pattern guide gains anti-join, result-file, half-open-window, currency, state-diff and prompt-injection patterns.

### Open Knowledge Format (OKF, shipped)
- Added 8 concepts (untrusted content, confirmation/side-effects, currency/rounding, null/empty/missing, idempotency, official-vs-latest, ownership-vs-attention, calendar timezones), 8 playbooks, and 3 metrics, generated through the curated bundle so the drift gate stays green.

### Agent test protocol (expansion ZAP-EXP-001, not shipped — `test/` is dev-only)
- **Scenario schema v2** (`test/agent-protocol/schema/scenario-v2.schema.json` + `harness/scenario-schema.mjs`): separates fixture mutation from agent authority (`effects.agentMode`), adds multi-turn `turns[]`, declared `result` contracts (inline/block/file; JSON/YAML/CSV/NDJSON/Markdown), deterministic `preconditions`, and `knowledge`/`coverage` metadata. v1 scenarios remain loadable; the whole on-disk catalog is validated offline.
- **Catalog grew from 29 to 69 scenarios** (14 Layer A `a10`–`a23`, 26 Layer B `b21`–`b46`): preview-no-write, JSON/YAML parity, aliased relations, file-input round-trip, pagination/count discipline, visibility partitions, Unix-second windows, schema preflights, CLI/client parity; Customer 360, anti-joins, net-revenue-after-credits, cash vs invoiced, dunning worklists, effective price, stock-by-storage, supplier ranking/scorecards, campaign coverage, activity timelines, role distinction, SOP selection, custom-field layers, permission paths, time-tracking ambiguity + multi-turn confirmation, calendar slots, document approval, duplicate detection, and three new safety canaries (campaign send, prompt injection, bulk-cleanup).
- **New deterministic verifiers**: `computeProjection` (joins/anti-joins/grouping/signed sums), `verifyResult`, `verifyFile`, `verifyStateDiff`, `verifyTrace`, `verifyNoLeak` — all dependency-free and offline-unit-tested, alongside minimal JSON Schema and JSONPath utilities.
- **Policy proxy** (`harness/policy-proxy.mjs` + `policy.mjs` + `route-map.mjs` + `fixtures.mjs`): the model-driven subprocess no longer receives the real bearer token by default — it talks to a localhost proxy with an opaque run-local token that enforces read/write/ownership/confirmation/outbound policy, records a redacted trajectory, and owns automatic reverse-dependency cleanup. `--no-proxy` restores the legacy path.
- **Reporting & CI**: `SAFETY_REGRESSION` / `POLICY_BLOCKED_UNSAFE_ATTEMPT` / `ENVIRONMENT_SKIP` classifications; JUnit + coverage reports; `--suite/--tag/--skill/--format/--variants/--max-cost/--max-api-calls` flags.
- **Live-validated** against a sandbox instance with a no-model harness (`npm run test:agent-validate`): 65/69 scenarios seed + query cleanly, 4 environment-skip; added the `$MYGROUP` seed token and the `fixtureRecipeValid` precondition for cross-instance robustness.

## 0.4.1

### `@zeyos/cli` (`zeyos`)
- `login --port` now validates callback ports before prompting or starting OAuth setup.
- `whoami` now reports expired or invalid refresh tokens with the platform URL, credential source, OAuth endpoint/status, and the matching re-login command.
- `profile add` now has an interactive wizard for profile names and OAuth connection parameters when run without explicit connection options.
- `logout --profile <name>` now reports missing profiles with the same known-profile guidance as other profile-aware commands.
- `logout --global` now targets the legacy global credentials file directly, so local auth files, project pins, or active profiles cannot shadow an explicit global logout.
- Expanded offline/mock coverage for CLI list/get/write output behavior, OAuth login flows, logout source selection, token redaction, skill install prompts, and OKF commands.

### `@zeyos/client`
- Fixed the live OAuth test harness so a saved config containing both `live.url` and `live.instance` prefers the full URL instead of rejecting the harness's own persisted shape.
- Added regression coverage for saved live config resolution while preserving the explicit `--url` plus `--instance` conflict.

### Agent skills
- Ticket time summaries now roll up actionstep effort logged on tasks whose `task.ticket` points to the ticket, not only actionsteps directly linked by `actionstep.ticket`.
- Added agent-protocol regression coverage for direct ticket effort plus task-linked effort, including status/date filtering and actionstep deduplication.

## 0.4.0

### Open Knowledge Format (OKF)
- **New OKF bundle** under [`okf/`](okf/): a conformant [Open Knowledge Format v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) description of the ZeyOS data model — one Markdown concept per API-backed entity (schema, foreign keys, enums, indexes, and the real operationIds), plus curated metrics, playbooks, and cross-cutting query concepts. Generated from the OpenAPI/dbref specs into **managed blocks** so structural content stays in sync while curated `# Notes` are preserved across regeneration. Ships in the npm package.
- **Canonical schema source**: the previously hand-maintained operationId table in `agents/shared/zeyos-entity-reference.md` is now generated from the bundle, so the skill pack and the data model can't drift apart. Skills stay the task-facing layer; OKF is the reference layer.
- **Freshness**: `npm run generate` regenerates the bundle alongside the client; a `source_snapshot` hash and an auto-appended `okf/log.md` schema-diff track changes when the ZeyOS schema/API is updated, and `npm run okf:check` is a CI drift + conformance gate.

### `@zeyos/client`
- New OKF exports: `buildOkf()` (synthesize a conformant bundle from the client's schema — pure, browser-safe), `loadOkfBundle(dir)` (read a bundle, Node), `validateOkfBundle`/`validateOkfFiles` (OKF v0.1 conformance), `conceptIdForResource`, and `OKF_VERSION`.

### `@zeyos/cli` (`zeyos`)
- New `okf` command: `zeyos okf list | show <concept> | check | export [--out] | build [--out]` to browse, print, validate, vendor, or synthesize the OKF bundle.

### Agent skills & tooling
- The improvement loop gains a `--context skills|okf|both` axis (`run.mjs`/`loop.mjs`) to measure whether OKF-as-context lifts agent accuracy, and a new `okf:refine` loop (`refine-okf.mjs`) that drafts → validates against the schema → judges → applies improvements to a concept's curated notes (never the generated managed block).

## 0.3.0

### `@zeyos/client`
- **Single-flight token refresh**: when several operations notice an expired access token at once (e.g. `Promise.all([...])`), they now share a single `getToken` refresh instead of each firing its own — avoiding redundant calls and the hard failure that refresh-token rotation would otherwise cause.
- **Request timeout**: a new `timeoutMs` option (client-wide via `config.timeoutMs`, or per request) bounds each attempt via an `AbortController` composed with any caller `signal`. Timeouts reject with `isTimeout === true` / `code === 'ETIMEDOUT'` and are distinct from a caller abort (which always propagates and is never retried).
- **Network-error retries (reads only)**: dropped connections / timeouts are now retried within the retry budget for safe read operations (`GET`/`HEAD` + side-effect-free `list`/`count`/`search`); writes are never auto-retried. Override per request or client with `retryOnNetworkError`.
- **Auto-pagination**: `client.paginate(operationId, input, opts)` async-iterates every matching record by paging on `offset` (page size clamped to the 10000 server max), and `client.collect(...)` is the eager array form — removing the manual offset bookkeeping the list caps otherwise force.
- **Richer error messages**: `ZeyosApiError.message` now folds in a short snippet of the server error body (e.g. `… failed with HTTP 400: unknown filter field: bogus`); the full body remains on `error.body`.

### `@zeyos/cli` (`zeyos`)
- **Named credential profiles**: store multiple ZeyOS instances and switch between them. `zeyos profile list | current | use <name> [--local] | add <name> [--base-url/--client-id/--secret | --from-current] | remove <name>`, a global `--profile <name>` flag on every command, and `ZEYOS_PROFILE`. Profiles live in `~/.config/zeyos/profiles.json` with an active pointer; a project can pin one via `.zeyos/profile`. Resolution: `--profile` > `ZEYOS_PROFILE` > project pin > legacy `.zeyos/auth.json` > global active > legacy global. Fully backward compatible.
- `login --profile <name>` authenticates into (and activates) a named profile; `logout` is profile-aware; refreshed tokens persist back to whichever store they came from.
- `login` now detects an **expired** stored token and re-authenticates instead of reporting "already logged in"; `whoami` surfaces `502/503/504` as "instance temporarily unavailable" and `401` as an expired-session hint, instead of a raw status.

### Agent skills
- New **`zeyos-time-tracking`** skill: first-person work views ("what are my current tickets/tasks?") and interactive time logging ("log 60 minutes for client XYZ" → resolve account → pick ticket/task → write effort as an actionstep), plus timesheet summaries and entry corrections.

## 0.2.0

### `@zeyos/client`
- Added a `dryRun` request option: `client.api.*`, `client.request()`, etc. return a resolved `{ dryRun, method, url, body, bodyType, … }` descriptor without performing any network request or token work. Powers the CLI `--query` flag and is handy for debugging and tests.

### `@zeyos/cli` (`zeyos`)
- New `doctor agent` command: an offline readiness check for coding agents — reports CLI version, configured base URL/instance, whether auth is present via environment/local/global config, and resource-registry health. Never prints tokens or client secrets.
- New `--query` dry-run flag on the data commands (`list`/`count`/`get`/`create`/`update`/`delete`): prints the resolved `METHOD url` and JSON payload without sending the request; `--query --json` emits the full machine-readable request descriptor.
- New `--filter-file <path>` (`list`/`count`) and `--data-file <path>` (`create`/`update`): read JSON from a file instead of inline. They are mutually exclusive with the inline `--filter`/`--data`, and file-read/parse errors never echo file contents.
- Strict flag validation: unknown flags now error with a "did you mean …?" suggestion instead of being silently ignored. `create`/`update` still accept arbitrary `--<field>` flags.

### Agents / skills
- Skill packs are self-contained: each domain `SKILL.md` now points at a shared operating guide (`agents/shared/zeyos-agent-operating-guide.md`) with a bare-skill checklist and shell-safe command hygiene (inline single-quoted JSON, `--filter-file`/`--data-file`, counts via `zeyos count`).
- Added an entity-noun → REST `operationId` reference and per-domain workflow notes (first-command examples for counts, `visibility`-column caveats, and the diverging dunning operationIds).

### Docs
- Documented `--filter-file`/`--data-file` and the new `doctor` command across the CLI getting-started and command reference.

## 0.1.1

### `@zeyos/client`
- `oauth2.buildAuthorizationUrl()` now includes the `scope` parameter when provided (previously dropped).
- Retry timing hardened: an empty/whitespace `Retry-After` header falls back to exponential backoff instead of retrying instantly, and an already-aborted signal reliably stops a zero-delay retry.
- `normalizeListResult()` preserves a numeric-string `count` (e.g. `"17"`), matching `normalizeCountResult()`.

### `@zeyos/cli` (`zeyos`)
- Added `--version` / `-v`.
- Fixed the `--key=value` argument form, which was previously parsed as an unknown flag and silently ignored (e.g. `--filter='{...}'`).
- YAML output now quotes ambiguous scalar strings (`true`, `false`, `null`, `yes`/`no`, and numeric-looking strings) so downstream YAML parsers don't re-interpret them.
- `describe`, `resources`, and `skills` help text now documents the global `--json` / `--yaml` / `--help` options.
- `skills install` reworked into a multi-agent installer: targets `claude`, `codex`, `opencode`, `droid`, `pi`, and a generic `agents` layout; adds `--global`/`--local` scope, `--dir <path>` for an explicit directory, an interactive agent/scope picker (with a ZeyOS banner) when run bare, `-y`/`--yes` and `--no-logo` to skip prompts/banner, and a `--json`/`--yaml` install summary.
- `login` now prints the local callback URL before prompting for the application ID/secret, so it can be registered as the OAuth app's redirect URI.

### Docs
- Rewrote the top-level `README.md` into a full guide with CLI, JavaScript client, login/OAuth, and coding-agent examples.
- Documentation accuracy fixes: accounts use `lastname` (no `name` field); updates accept the flat `{ ID, ...fields }` form (explicit `body` optional); clarified that the schema's `(required)` marker means `NOT NULL` (most such fields have defaults — `currency` on accounts is the real exception); fixed cross-links and a duplicate tutorial sidebar prefix.

## 0.1.0 — Initial release

### `@zeyos/client`
- Zero-dependency JavaScript client (browser + Node 18+) for the ZeyOS OpenAPI
  services (`api`, `oauth2`, `legacyAuth`), with methods generated from the specs.
- Authentication modes: `auto`, `oauth` (bearer + refresh; authorization-code and
  password grants), `session` (ZEYOSID cookie), and `none`; pluggable token store
  (`MemoryTokenStore`) and token-set helpers.
- Schema introspection (`client.schema`): describe resources, fields, enums, and
  foreign keys; pre-flight `validate()` flags unknown fields, bad enums, the
  `filter`-vs-`filters` footgun, and required-on-create fields.
- Resilience: automatic 429 retry honoring `Retry-After`, structured
  `ZeyosApiError` / `ZeyosValidationError`, CRUD body inference, and
  `normalizeListResult`.

### `@zeyos/cli` (`zeyos`)
- CRUD against common resources with `--json`/`--yaml`, field selection and
  aliasing, dot-notation joins, pagination, and config-driven field display.
- OAuth login flow, credential cascade (env → `.zeyos` → global config),
  `describe` / `resources` / `skills` / `whoami`, and safe delete confirmation.
- Accepts a JSON body passed positionally to `create` / `update`.

### Docs, samples & agent skills
- Docusaurus documentation (API reference, JavaScript client, CLI, agent
  workflows, tutorials), three sample apps (Kanban, CRM, Dashboard), and a
  repo-local agent skill pack under `agents/`.
