# Changelog

Notable changes to `@zeyos/client` and `@zeyos/cli`. This project follows
[Semantic Versioning](https://semver.org/).

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
