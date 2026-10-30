---
title: Agent Setup
description: Configure coding agents for iXML, Zymba, and schema-checked ZeyOS automation.
sidebar_label: Agent Setup
sidebar_position: 5
slug: /agent-workflows/agent-setup
---

# Agent Setup

Kilo Code, Pi, OpenCode, and other coding agents need the same ZeyOS project context: authoritative references, project instructions, validation tools, and explicit permission to execute or change anything remotely. Configure these once for the project, then adapt how your chosen harness loads them. A capable model can still invent an iXML attribute or database column if it works from memory.

This setup covers both native iXML/Zymba development and external integrations. The tools serve different purposes:

| Work | Tool | Contract to check |
| --- | --- | --- |
| Native iXML/Zymba compilation checks | ZeyOS SDK `zeysdk compile` / `zeysdk lint` | Linked instance compiler; supplied source is not executed |
| Native runtime behavior | ZeyOS SDK and the platform runtime, when execution is requested | Application entry point, inputs, outputs, and side effects |
| Business data queries and bounded updates | `zeyos` CLI or its MCP server | CLI resource registry, database metadata, and API contract |
| Connected JavaScript applications | `@zeyos/client` | Generated operations and runtime schema |

The client validator and MCP server do not compile iXML or Zymba. Use the SDK's `compile` or `lint` for native compilation checks without executing the supplied source. These are remote checks, not offline linters. `zeysdk run` executes code and is not a substitute for validation.

## Set up the project first

1. Open the application repository as the agent's working directory. Identify the native application root or external integration entry point.
2. Download the [ZeyOS project instructions as Markdown](https://www.zeyos.com/ai/agent-instructions.md). Merge them into an existing `AGENTS.md`, or keep the file as `instructions/zeyos.md` and load it using your harness's supported mechanism. Do not overwrite existing project rules.
3. Add a short project map: reference directory, application root, relevant examples, installed tool versions, validation commands, and target profile. Leave unknown values explicitly unset; keep credentials out of the map.
4. Configure a provider and model in the harness. Keep personal authentication in its private credential store and project instructions in version control.
5. Enable the file access and local validation tools needed for the task. Treat remote execution, database writes, synchronization, and deployment as separate capabilities. A request to validate code does not authorize running it.
6. Start a fresh session and ask the agent to identify the loaded instructions, exact reference files, and available non-executing checks before editing.

Prefer a reviewed local copy of the instructions over fetching a mutable remote URL at every session start. Update that copy deliberately when the ZeyOS guidance changes. Keep shared rules in one place and project paths in the project; avoid duplicate or contradictory instruction sources.

### Connect your coding harness

These are adapters for the same project setup, not separate ZeyOS workflows. Configuration details were checked against the official documentation on **30 October 2026**; check the documentation for your installed version before copying a configuration.

| Harness | Project instructions | Harness configuration |
| --- | --- | --- |
| Kilo Code | Root `AGENTS.md`, or `instructions` paths in `kilo.jsonc` | Configure provider/model and tool permissions in Kilo's settings or the existing project config. Start a new task after changing instructions. |
| Pi | Root `AGENTS.md`; Pi also loads applicable parent-directory context files | Project settings live in `.pi/settings.json`. Choose the model with `/model`; use `/reload` after changing instructions or configuration. |
| OpenCode | Root `AGENTS.md`, or `instructions` paths in `opencode.json` / `opencode.jsonc` | Configure provider/model and permissions in the existing project config. Start from the application directory. |

Sources: [Kilo project instructions](https://kilo.ai/docs/customize/agents-md), [Kilo settings](https://kilo.ai/docs/getting-started/settings), [Pi configuration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/configuration.md), [Pi usage](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/usage.md), [OpenCode rules](https://opencode.ai/docs/rules/), and [OpenCode configuration](https://opencode.ai/docs/config/).

For **Kilo or OpenCode**, merge this into the appropriate config if you keep the downloaded instructions separate:

```json
{
  "instructions": ["instructions/zeyos.md"]
}
```

For **Pi**, merge the instructions into the project's `AGENTS.md` and confirm that the startup header lists it. Do not replace Pi's `SYSTEM.md` merely to add ZeyOS project rules: that file replaces the default system prompt. Pi does not ask before every tool call; use the available tool controls and a sandbox appropriate to the task. Prompt instructions are not access controls. See [Pi configuration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/configuration.md) and [Pi usage](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/usage.md).

The CLI is enough to begin. Add MCP only if it improves your harness's tool discovery; no retrieval framework or vector database is required for the initial setup.

## Check the ZeyOS tools and versions

The join and custom-field validation below requires client/CLI **1.0.0 or later**. Check `zeyos --version` and the package version used by your application; upgrade client and CLI together. The [1.0.0 release](https://github.com/zeyos/client/releases/tag/v1.0.0) contains these checks. Native iXML/Zymba tooling comes from the separate `zeysdk` installation. Inspect `zeysdk compile --help` and `zeysdk lint --help`; use the [SDK debugging reference](https://www.zeyos.com/sdk/debugging/) for the supported commands and their effects.

## Retrieve authoritative Zymba entries

Start with the [symbol index](https://www.zeyos.com/ai/zymba/symbols.json) and [namespace index](https://www.zeyos.com/ai/zymba/namespaces.json). For example, find `Array.joinValues` with `kind: "method"`, then inspect its exact `definition` and source JSON pointer. Keep static and instance methods distinct. Fetch a single [Array namespace](https://www.zeyos.com/ai/zymba/namespace.Array.json), or use the [full reference working set](https://www.zeyos.com/zymba/llms-full.txt) when needed.

Each entry retains the source URL, hash, and pointer into the [official JSON mirror](https://www.zeyos.com/__doc/zymbaref.json). Preserve duplicate declarations and investigate differences rather than choosing one silently. Read argument order, types, defaults, returns and annotations from the raw definition; the generated signature is a display aid. An omitted metadata property is not proof that an argument is optional or required. These indexes support reference review, not compilation or runtime certification, and do not promote the deferred Zymba guide drafts.

## Choose a model by testing ZeyOS tasks

For complex ZeyOS work, prioritize correctness over the lowest token price. Start with a provider's capable reasoning/coding model, use its supported reasoning controls, and hold the model fixed while evaluating it. The harness and model are separate choices: changing from Kilo to Pi or OpenCode does not remove the need for the same references and checks.

Select the exact model through the provider's picker and verify its availability in your harness. A model recommendation is a starting point, not a ZeyOS benchmark result. See [Kilo model selection](https://kilo.ai/docs/code-with-ai/agents/model-selection), [Pi model selection](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md), and [OpenCode models](https://opencode.ai/docs/models/).

Evaluate candidates with the same references, tools, prompts, and revision. Run each task more than once:

| Acceptance task | Required behavior |
| --- | --- |
| Repair `<if condition="...">` | Find the documented comparison attributes; preserve XML escaping |
| Return rows from `db:select` | Distinguish `var` from `var_result` and use the intended result type |
| Join Zymba array values | Find `@Array.joinValues` and its signature; avoid `@String.joinValues` |
| Prepare an account creation | Reject `name`, detect missing `currency`, and preview without creating |
| Query transaction records | Reject an invented `visibility` field; resolve the correct resource |
| Query a custom field or unknown join | Retrieve its definition or report the gap instead of guessing |
| Test a hook or service | Identify its invocation context; do not equate an inline run with a full integration test |
| Recover from a write timeout | Reconcile the outcome before considering a retry |

Require zero invented identifiers in the accepted patch, detection of every deliberately planted error, and no unauthorized side effects. Compare first-pass correctness, repair attempts, total cost, and elapsed time. Only move routine work to a cheaper model after it meets the same criteria. Large context windows and general coding leaderboards do not establish ZeyOS competence.

## Supply focused reference context

In a checkout of the developer guide, use `ref/ixmldoc.xml`, `ref/zymbaref.json`, `ref/zymbadoc.md`, `ref/dbref.json`, `ref/simpledb.sql`, `ref/views.txt`, and the relevant `ref/openapi/` and `ref/sdk/` entries. `LEARN.md` records dated successes and failures; `docs/zymba/` remains draft material. Existing application code supplies conventions, not authority for undocumented behavior.

Without a local checkout, start with [AI Resources](https://www.zeyos.com/docs/ai) and [llms.txt](https://www.zeyos.com/llms.txt). Use the namespace, table, and operation indexes to retrieve only the entries needed. The [artifact manifest](https://www.zeyos.com/ai/manifest.json) provides hashes for caching. A hash identifies a snapshot; it does not establish compatibility with your instance.

Keep a small evidence list for each change: symbol or field, reference location, snapshot/version, and relevant runtime result. Re-read the exact entries after context compaction or a schema update. If a source is inaccessible, surface the gap before implementing dependent behavior.

## Validate native code without executing it

Choose the check by what it establishes and where it runs:

| Check | Executes the submitted application code? | What it establishes |
| --- | --- | --- |
| Local reference and source review | No | Documented commands, arguments, schema names, and application input contracts |
| A local XML parser, for a compatible complete XML document | No | XML well-formedness only; not the iXML language contract |
| `zeysdk compile` | No | Whether selected iXML/Zymba source compiles on the linked ZeyOS instance |
| `zeysdk lint` | No | Compilation results for the eligible local project scripts it selects |
| `zeysdk run` or a real form/hook/service invocation | Yes | Runtime behavior; use only when execution is part of the requested test |

### Review structure and contracts locally

Formatting must preserve text and result propagation. For new iXML snippets use two-space indentation, quoted attributes, and compact text-only elements; preserve established conventions in existing files.

```xml
<set var="name">iXML</set>
<output>Hello $name</output>
```

Check each iXML command's attributes, defaults, child elements, content type, and result bindings against the reference. For calls and includes, inspect the called code and its input contract. An attribute without a documented default is not automatically mandatory. A generic XML parser can reject native fragments, prefixed commands or entities that the ZeyOS parser accepts; do not add invented namespace declarations to make a generic parser pass.

For Zymba, review the receiver, method, argument order, defaults, return value, and mutation behavior against the authoritative definitions. PHP or JavaScript syntax validation does not establish Zymba correctness. Neither a reference index nor an agent's review is a full language validator.

### Ask the ZeyOS compiler for diagnostics

In an already linked application directory, after confirming the intended compiler target and permission to send the source there:

```bash
# Check one selected asset without executing its source.
zeysdk compile services/example.ixml

# Check inline iXML or Zymba without executing it.
zeysdk compile --ixml '<set var="name">iXML</set><output>Hello $name</output>'
zeysdk compile --zy 'return 1;'

# Check eligible modified project scripts, or all eligible local scripts.
zeysdk lint
zeysdk lint --all
```

Replace the example path with the asset you intend to check. `compile` and `lint` submit source to the linked instance's authenticated `PUT sdk/v1/compile` endpoint. They do not execute that source and do not run a sync/push, but they require network access, existing authentication, and application linkage. Treat source transmission separately from a local-only check. `lint --all` still compiles remotely; it is not an offline mode. [SDK compile and lint documentation](https://www.zeyos.com/sdk/debugging/).

Inspect the diagnostics and the selected file count. `lint` selects eligible manifest-backed scripts; it is not a recursive validation of every file in the repository. A successful exit with no eligible scripts is not evidence that changed code was checked. Use `compile` on a specific asset when you need explicit coverage.

A compilation pass does not prove database identifiers, required business inputs, permissions, or behavior in a form/hook/HTTP context. Review those contracts separately. If the task is only to validate code, stop with the diagnostics and remaining coverage gaps. Do not run it merely to get stronger evidence. When execution is explicitly needed, perform a separate, bounded sandbox test through the correct entry point; `zeysdk run` belongs to that stage.

See the [native formatting and validation workflow](https://www.zeyos.com/ixml/ixml-guide/development-environment/coding-agents), [iXML reference](https://www.zeyos.com/ixml/), and [Zymba reference](https://www.zeyos.com/zymba/).

## Prevent invented tables and fields

Resolve names before generating a request. For a join, trace every relationship to its target table and check the terminal field. Do this for selections, filters, sorting, grouping, and updates. Keep SQL tables/views separate from API resources, CLI aliases, and custom fields.

The database reference confirms that accounts have `lastname` and `firstname`, not `name`; `accounts.contact` references `contacts.ID`; `accounts.currency` has no database default; and `transactions` has no `visibility` field. A CLI resource such as a billing-invoice alias is not proof of a SQL table with the same name.

With the existing CLI, start locally:

```bash
zeyos resources --json
zeyos describe accounts --json
zeyos list accounts --fields ID,lastname --limit 5 --dry-run --json
zeyos create account --lastname "Agent sandbox example" --currency EUR --dry-run --json
```

The final command previews a create request; it does not create an account. The current CLI still requires configured authentication to construct these request previews, although the preview does not dispatch the request. Use the credential-free JavaScript schema check below if no profile is configured. Do not remove `--dry-run` until the target and write are authorized. Keep validation enabled. The human CLI flag is `--filter`, while JavaScript and MCP request payloads use `filters`.

For JavaScript, inspect a request without sending it:

```js
import { createZeyosClient } from '@zeyos/client';

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: { mode: 'none' },
  validate: true,
});

console.log(client.schema.validate('createAccount', {
  lastname: 'Agent sandbox example',
}));
// valid: false; missing currency. This does not make an API request.

console.log(client.schema.validate('listTransactions', {
  fields: ['ID'],
  filters: { visibility: 0 },
  limit: 5,
}));
// valid: false; transactions has no visibility field.
```

For real requests, use the established authenticated client configuration and retain `validate: true`. The unauthenticated example above is for local schema checks only.

:::warning Validation coverage
Client/CLI 1.0.0 and later check every documented foreign-key hop and terminal field in selections, filters, and sorting. It validates individual custom keys against an explicit `customFields` contract and checks supplied JSON types/enums. Missing custom metadata is an error. Upgrade client and CLI together; older releases accepted these paths unchecked.

It is still not a complete type checker or OpenAPI validator. Required parameters beyond the curated account-currency rule, permissions, record existence, join cardinality, and business rules need separate checks. Relationships absent from the bundled FK metadata are rejected, even if a descriptive column name looks plausible. `describe` reads bundled schema plus your supplied snapshot, not live tenant introspection.
:::

For native database code, apply the same name checks to the database reference and use the documented iXML or Zymba query APIs. The JavaScript validator cannot validate arbitrary SQL. Use documented structured conditions or preparation for values, and allowlist dynamic identifiers. Check cardinality, nullability, and totals as well as syntax: a valid join can still double a sum.

### Configure custom fields once per instance

Use the [snapshot format and setup](../03-cli/03-configuration.md#custom-field-validation) for CLI/MCP, or the [JavaScript contract](../02-javascript-client/03-making-requests.md#custom-field-contracts). Set `ZEYOS_CUSTOM_FIELDS_FILE` to its absolute path in the agent environment. Check `customFieldSource.platform` in `describe` output; actual dispatch rejects snapshots from a different instance.

Discover active extdata definitions using `customfields.context` for the owning resource, `source: 0`, and `activity: 0`; use `reference` as the exact key. Page through all results and verify permissions and completeness before declaring an allowlist. `customfields.entity` describes the target of an entity-valued field, not its owner. Display types are not JSON types: add type and enum constraints only from reviewed application contracts. Refresh after configuration changes. Keep snapshots private and credential-free.

Do not repair `custom_fields_unavailable` or `unknown_custom_field` by disabling validation. Retrieve and review the missing definitions. An absent resource map means unknown; an explicit empty map means known empty. Related custom fields use the destination resource's map, such as `contact.extdata.preferred` on accounts using `contacts` definitions.

## Optional MCP connection

The existing [ZeyOS MCP server](../03-cli/04-mcp-server.md) exposes resource discovery, schema descriptions, and record queries. Install the matching client/CLI version first and ensure the harness can find `zeyos-mcp`. Use your actual configured profile name; `sandbox` below is an example, not evidence of a safe target. Resolve conflicting inherited credential variables and keep authentication in the existing private configuration.

**Kilo and OpenCode** use this structure in their respective project configuration (`kilo.jsonc` or `opencode.json` / `opencode.jsonc`):

```json
{
  "mcp": {
    "zeyos": {
      "type": "local",
      "command": ["zeyos-mcp"],
      "environment": {
        "ZEYOS_PROFILE": "sandbox",
        "ZEYOS_MCP_ALLOW_WRITES": "0"
      },
      "enabled": true
    }
  }
}
```

Sources: [Kilo MCP](https://kilo.ai/docs/automate/mcp/using-in-kilo-code) and [OpenCode MCP](https://opencode.ai/docs/mcp-servers/).

**Pi's current MCP support** uses `.pi/mcp.json` for a trusted project. Its keys differ from the Kilo/OpenCode format:

```json
{
  "mcpServers": {
    "zeyos": {
      "command": "zeyos-mcp",
      "args": [],
      "env": {
        "ZEYOS_PROFILE": "sandbox",
        "ZEYOS_MCP_ALLOW_WRITES": "0"
      }
    }
  }
}
```

Run `pi mcp list` to inspect connections, or use `/mcp` in a session. Use `/reload` after changing the file. Older Pi versions and extensions may use a different integration; use the CLI directly if your installed version does not support this format. See [Pi MCP configuration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md).

Start with `list_resource_types` and `describe_resource`; these work without authenticated API access. MCP write tools require `ZEYOS_MCP_ALLOW_WRITES=1`; there is no delete tool. This switch does not restrict a separate shell or HTTP tool, so configure those permissions and credential scope as well.

The existing [agent skills](./01-agent-quickstart.md) add task-specific business workflows. Discover them with `zeyos skills list` and inspect the installer's supported destinations before installing. Project instructions and the CLI are sufficient for the initial setup; a skill installer target for every harness is not required.

## Make automation repeatable

Use a progression with measurable acceptance gates:

1. **Local assistance:** reference lookup, small patches, schema preflight, and review. Record the model and reference versions.
2. **Sandbox execution:** exercise normal, empty, malformed, and missing-input cases. Include real HTTP/hook/form context where relevant. Record expected and actual results without private data.
3. **Bounded operational jobs:** define the instance, resources, allowed fields, record cap, time budget, retry policy, and stop conditions. Begin with a preview; verify each authorized write by reading its result.
4. **Repeatable unattended operation:** prevent overlapping runs, reconcile uncertain outcomes, and retain redacted audit evidence. Use a documented idempotency mechanism where available; otherwise design explicit deduplication and test it. Do not invent an idempotency header or retry creates blindly.

The join validator and explicit custom-field snapshots now cover API identifier checks. The authoritative Zymba indexes support lookup, and the SDK supports non-executing compilation checks. Broader required-parameter/schema validation and a regression set built from recurring failures remain separate work. A checker should distinguish **error**, **verified within its coverage**, and **requires runtime evidence**; it must never turn missing metadata into a silent pass.

Keep rules short and load domain details on demand. Promote only reproducible fixes into shared instructions. Keep the guide's pinned `LEARN.md` unchanged during normal project work; write new project findings to the designated application log.

## First task to give your agent

```text
Read our ZeyOS project instructions and identify the reference and example files
for this task. Inspect the target entry point and list its required inputs.
Resolve every database field and relationship before writing code.
Make the smallest useful patch and validate without executing it. Report local
checks separately from SDK compilation. Only send source for compilation after
confirming the linked target and permission; otherwise prepare the command.
Do not use zeysdk run, invoke a service, sync, or write business data for this task.
Report any behavior that still needs a separately authorized runtime test.
```
