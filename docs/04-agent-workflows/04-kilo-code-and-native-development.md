---
title: Set Up Kilo Code for ZeyOS Development
description: Configure coding agents for iXML, Zymba, and schema-checked ZeyOS automation.
sidebar_label: Kilo Code and Native Development
sidebar_position: 5
slug: /agent-workflows/kilo-code
---

# Set Up Kilo Code for ZeyOS Development

A useful ZeyOS coding agent needs the relevant reference, a repeatable validation loop, and a clear execution target. Give it those before asking it to implement an automation. A capable model can still invent an iXML attribute or a database column if it is allowed to work from memory.

This setup covers both native iXML/Zymba development and external integrations. The tools serve different purposes:

| Work | Tool | Contract to check |
| --- | --- | --- |
| Services, resources, weblets, forms, and hooks | ZeyOS SDK `zeysdk` and the platform runtime | iXML/Zymba reference and the application's entry point |
| Business data queries and bounded updates | `zeyos` CLI or its MCP server | CLI resource registry, database metadata, and API contract |
| Connected JavaScript applications | `@zeyos/client` | Generated operations and runtime schema |

The client validator and MCP server do not compile iXML or Zymba. The SDK's `run` command executes code remotely; it is not an offline linter.

## Configure Kilo Code

1. Install Kilo Code using its [official installation instructions](https://kilo.ai/docs/getting-started/installing). Open the application repository as the workspace.
2. Configure a provider in Kilo's settings and choose a model. Use your organization's approved provider and credential storage. See [Kilo authentication](https://kilo.ai/docs/getting-started/setup-authentication).
3. Merge the [copyable ZeyOS instructions](./05-zeyos-project-instructions.md) into the project's uppercase `AGENTS.md`. Kilo loads this file automatically. Start a new task after changing it. See [Kilo's AGENTS.md documentation](https://kilo.ai/docs/customize/agents-md).
4. Add a short project map: application root, local reference paths, two relevant verified examples, validation commands, and sandbox profile. Keep secrets out of this file.
5. Enable file access and the specific local checks needed for development. Configure tool permissions and environment credentials separately from prompt instructions. Start remote access with reads, and scope any later writes to the task.

If you prefer a separate instruction file, save the copied block to `instructions/zeyos.md` and merge this entry into the existing project configuration:

```json
{
  "instructions": ["instructions/zeyos.md"]
}
```

The current Kilo configuration is `kilo.jsonc`. Its settings UI can manage the same instruction list. For shared global rules, reference a shared file in the global configuration and keep application paths in each project. Avoid loading duplicate or contradictory copies. Older installations may use `.kilocode/rules/`; consult the documentation for the installed version before migrating. [Kilo custom rules](https://kilo.ai/docs/customize/custom-rules).

No additional retrieval framework or vector database is required to begin. Local reference files and targeted file search are sufficient for the first workflow.

## Retrieve authoritative Zymba entries

Start with the [symbol index](https://www.zeyos.com/ai/zymba/symbols.json) and [namespace index](https://www.zeyos.com/ai/zymba/namespaces.json). For example, find `Array.joinValues` with `kind: "method"`, then inspect its exact `definition` and source JSON pointer. Keep static and instance methods distinct. Fetch a single [Array namespace](https://www.zeyos.com/ai/zymba/namespace.Array.json), or use the [full reference working set](https://www.zeyos.com/zymba/llms-full.txt) when needed.

Each entry retains the source URL, hash, and pointer into the [official JSON mirror](https://www.zeyos.com/__doc/zymbaref.json). Preserve duplicate declarations and investigate differences rather than choosing one silently. Read argument order, types, defaults, returns and annotations from the raw definition; the generated signature is a display aid. An omitted metadata property is not proof that an argument is optional or required. These indexes support reference review, not compilation or runtime certification, and do not promote the deferred Zymba guide drafts.

## Choose a model by testing ZeyOS tasks

For a reliability-first starting point, try **Claude Opus 5.5** on a small native-development task. Compare it with **GPT-6 Astra** for difficult debugging and **GPT-6.1 Sol** for routine work at lower listed token prices. These are candidates, not a ZeyOS benchmark result. Kilo listed these models when this guidance was checked on **30 October 2026**: [Opus 5.5](https://kilo.ai/models/anthropic-claude-opus-5-5), [GPT-6 Astra](https://kilo.ai/models/openai-gpt-6-astra), [GPT-6.1 Sol](https://kilo.ai/models/openai-gpt-6-1-sol).

Select the exact model through your provider's picker; availability and identifiers depend on the provider. Use one fixed model for the initial comparison so routing changes do not obscure failures. Recheck the [current model selection guidance](https://kilo.ai/docs/code-with-ai/agents/model-selection) when upgrading.

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

## Check native code in layers

First check the XML structure or Zymba syntax, then the language contract, then the schema, and finally the behavior in a sandbox. Formatting must preserve text and result propagation. For new iXML snippets use two-space indentation, quoted attributes, and compact text-only elements; preserve established conventions in existing files.

```xml
<set var="name">iXML</set>
<output>Hello $name</output>
```

This fragment produced `Hello iXML` in the guide's execution log on 6 February 2026. Its runtime result is historical evidence, not a test of your current instance.

For each iXML statement, look up the command's attributes, defaults, child elements, content type, and result bindings. Check application-defined parameters by reading the called function, include, or service. The reference does not provide a complete machine-readable required-parameter contract: an attribute without a default is not automatically mandatory.

For Zymba, check the class and receiver, argument order, defaults, nullable arguments, return type, and mutation behavior. Use the native runtime for execution checks. PHP or JavaScript syntax validation is not a substitute. See the [iXML formatting and validation workflow](https://www.zeyos.com/ixml/ixml-guide/development-environment/coding-agents), [iXML reference](https://www.zeyos.com/ixml/), and [Zymba reference](https://www.zeyos.com/zymba/).

In an already linked, authorized sandbox application directory, these historically verified smoke tests exercise the runtime:

```bash
zeysdk run --ixml '<set var="name">iXML</set><output>Hello $name</output>'
zeysdk run --zymba '$a = "Hello "; $b = "World"; echo $a . $b;'
```

Expected outputs are `Hello iXML` and `Hello World`. Check the installed SDK's help and target before running. Neither test proves that a form, hook, or inbound HTTP route works in its real invocation context. Test those through the corresponding sandbox entry point. Do not sync or deploy an entire application merely to check a fragment.

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

The existing [ZeyOS MCP server](../03-cli/04-mcp-server.md) exposes resource discovery, schema descriptions, and record queries. It does not require a new custom server. If `@zeyos/cli` is already installed and an authorized sandbox profile named `sandbox` exists, merge this into Kilo's project `kilo.jsonc`:

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

Use your real profile name and ensure Kilo can find the executable. Resolve conflicting inherited credential variables before use; the profile name alone is not proof of the target. Keep credentials in the existing private configuration. Kilo's current format uses `mcp`, a command array, and `environment`; other hosts may use `mcpServers`, `args`, and `env`. [Kilo MCP configuration](https://kilo.ai/docs/automate/mcp/using-in-kilo-code).

Start by calling `list_resource_types` and `describe_resource`. These work without authenticated API access. The server's write tools require `ZEYOS_MCP_ALLOW_WRITES=1`; there is no delete tool. Read-only MCP settings do not restrict a separate shell or HTTP tool, so configure those permissions and credential scope as well.

The existing [agent skills](./01-agent-quickstart.md) can add task-specific business workflows. Discover them with `zeyos skills list`. The current installer has no `--target kilo`; use its documented custom destination option only after checking Kilo's skill discovery rules. Project instructions alone are enough for the initial native-development setup.

## Make automation repeatable

Use a progression with measurable acceptance gates:

1. **Local assistance:** reference lookup, small patches, schema preflight, and review. Record the model and reference versions.
2. **Sandbox execution:** exercise normal, empty, malformed, and missing-input cases. Include real HTTP/hook/form context where relevant. Record expected and actual results without private data.
3. **Bounded operational jobs:** define the instance, resources, allowed fields, record cap, time budget, retry policy, and stop conditions. Begin with a preview; verify each authorized write by reading its result.
4. **Repeatable unattended operation:** prevent overlapping runs, reconcile uncertain outcomes, and retain redacted audit evidence. Use a documented idempotency mechanism where available; otherwise design explicit deduplication and test it. Do not invent an idempotency header or retry creates blindly.

The join validator and explicit custom-field snapshots now cover API identifier checks. Next improvements are a reference-derived iXML/Zymba contract index and a broader regression set built from recurring runtime failures. Those language checks remain future work. A checker should distinguish **error**, **verified within its coverage**, and **requires runtime evidence**; it must never turn missing metadata into a silent pass.

Keep rules short and load domain details on demand. Promote only reproducible fixes into shared instructions. Keep the guide's pinned `LEARN.md` unchanged during normal project work; write new project findings to the designated application log.

## First task to give your agent

```text
Read our ZeyOS project instructions and identify the reference and example files
for this task. Inspect the target entry point and list its required inputs.
Resolve every database field and relationship before writing code.
Make the smallest useful patch and run local checks. Prepare the sandbox test
with expected results and report what needs runtime verification.
Do not execute remote code or write business data for this first task.
```
