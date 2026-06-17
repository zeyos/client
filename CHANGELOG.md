# Changelog

Notable changes to `@zeyos/client` and `@zeyos/cli`. This project follows
[Semantic Versioning](https://semver.org/).

## 0.2.0

### `@zeyos/client`
- Added a `dryRun` request option: `client.api.*`, `client.request()`, etc. return a resolved `{ dryRun, method, url, body, bodyType, … }` descriptor without performing any network request or token work. Powers the CLI `--query` flag and is handy for debugging and tests.
- Packaging: the published tarball now lists sample paths explicitly, so the generated `samples/missioncontrol/data.js` / `data.json` (which can contain real instance data) are never shipped to npm.

### `@zeyos/cli` (`zeyos`)
- New `doctor agent` command: an offline readiness check for coding agents — reports CLI version, configured base URL/instance, whether auth is present via environment/local/global config, and resource-registry health. Never prints tokens or client secrets.
- New `--query` dry-run flag on the data commands (`list`/`count`/`get`/`create`/`update`/`delete`): prints the resolved `METHOD url` and JSON payload without sending the request; `--query --json` emits the full machine-readable request descriptor.
- New `--filter-file <path>` (`list`/`count`) and `--data-file <path>` (`create`/`update`): read JSON from a file instead of inline. They are mutually exclusive with the inline `--filter`/`--data`, and file-read/parse errors never echo file contents.
- Strict flag validation: unknown flags now error with a "did you mean …?" suggestion instead of being silently ignored. `create`/`update` still accept arbitrary `--<field>` flags.

### Agents / skills
- Skill packs are self-contained: each domain `SKILL.md` now points at a shared operating guide (`agents/shared/zeyos-agent-operating-guide.md`) with a bare-skill checklist and shell-safe command hygiene (inline single-quoted JSON, `--filter-file`/`--data-file`, counts via `zeyos count`).
- Added an entity-noun → REST `operationId` reference and per-domain workflow notes (first-command examples for counts, `visibility`-column caveats, and the diverging dunning operationIds).

### Samples
- New `samples/missioncontrol` team-performance dashboard: a read-only Node fetcher (`fetch-data.mjs`) plus a static, dependency-free `index.html`. The generated data files are git-ignored and excluded from the npm package.

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
