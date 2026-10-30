# Platform And Schema Workflows

## Primary Resources

- `applications`
- `applicationassets`
- `resources`
- `services`
- `weblets`
- `forks`
- `groups`
- `groups2users`
- `permissions`
- `customfields`
- `objects`

These are dbref nouns, not operationIds. Several diverge: `applicationassets` ->
`listApplicationAssets`, `groups2users` -> `listGroupsToUsers` / `getGroupToUser`, `customfields` ->
`listCustomFields`. Note that `applications`, `applicationassets`, `customfields`, `forks`, `groups`,
`groups2users`, `permissions`, `resources`, `services`, and `weblets` are **read-only** (only
`list*`, `get*`, `exists*` — no create/update/delete). See
[../../shared/zeyos-entity-reference.md](../../shared/zeyos-entity-reference.md#entity-noun-to-rest-operationid)
before calling `@zeyos/client`.

## First Commands For Counts

- All custom fields: `zeyos count customfields --json`
- Active extdata definitions for tickets: `zeyos count customfields --filter '{"context":"tickets","source":0,"activity":0}' --json`

`customfields` is read-only and has no `visibility` field. In the JS client the list
operation is `listCustomFields`, not `listCustomfields`.

For a total count, use the `count` value from the CLI JSON response. Do not answer `0`
because `customfields` is missing from an old CLI registry, because a command failed, or
because `zeyos resources` did not list it. If `zeyos count customfields` fails with
"Unknown resource", run `zeyos doctor agent --json` to inspect the CLI version and then
switch to the JavaScript client:

```bash
node --input-type=module -e 'const { createZeyosClient, normalizeListResult } = await import(`${process.env.ZEYOS_REPO_ROOT}/src/index.js`);
const client = createZeyosClient({
  platform: process.env.ZEYOS_BASE_URL,
  auth: { mode: "oauth", oauth: { token: { accessToken: process.env.ZEYOS_TOKEN }, autoRefresh: false } }
});
const rows = normalizeListResult(await client.api.listCustomFields({ limit: 10000 })).data;
console.log(rows.length);'
```

## Pattern: Custom Fields For An Entity

Use this for prompts like:

- "Which custom fields exist on tickets?"
- "What dynamic fields do we have on accounts?"

Recommended approach:

1. Query `customfields`.
2. Filter `context` by the owning resource, with `source: 0` for EXTDATA and `activity: 0` for active definitions. Do not use `entity` as the owner: it is the target for an entity-valued display field.
3. Report `reference` (the custom key), display `type`, activity, and relevant options. Page through all definitions and verify access/completeness. Do not automatically convert display types or labels into JSON types/enums.
4. Supply a reviewed `customFields` contract or CLI/MCP `ZEYOS_CUSTOM_FIELDS_FILE` instance snapshot before referencing or writing individual custom keys. Unknown and missing metadata must remain errors. Refresh after configuration changes.
5. If the user needs values rather than definitions, use the resource with `extdata`; retrieving the collection does not establish that a particular guessed key exists.

## Pattern: Service Hooks For An Entity

Use this for prompts like:

- "Which services run after ticket modification?"
- "What timing services are configured?"

Recommended approach:

1. Query `services`.
2. Distinguish timing services from entity lifecycle hooks using `services.type`.
3. For lifecycle hooks, filter by `entity`.
4. Report application ownership, schedule or interval, and activity state.

## Pattern: Application Surface Inventory

Use this for prompts like:

- "Which weblets belong to application XYZ?"
- "Show me the active resources and services for this app."

Recommended approach:

1. Resolve the application.
2. Query `resources`, `services`, and `weblets` separately.
3. Report identifiers, activity state, and UI/service type.

## Pattern: Group Access And Membership

Use this for prompts like:

- "Which groups grant access to application XYZ?"
- "Which users belong to the billing admin group?"

Recommended approach:

1. Resolve the group or application.
2. Query `permissions` for app-, fork-, or identifier-based grants.
3. Query `groups2users` for membership.
4. Report whether the group membership or permission is writable where that matters.

## Pattern: Custom Objects

Use this for prompts like:

- "What custom objects exist for entity quote_review?"
- "Show recent objects for this custom entity."

Recommended approach:

1. Query `objects` by `entity`.
2. Pull `data` only when the answer needs JSON payload content.
3. Treat custom objects as instance-defined domain data and avoid guessing semantics from the entity name alone.

## Common Failure Modes

- Assuming custom fields and custom objects are the same thing.
- Confusing app resources with weblets or services.
- Treating collaboration entities such as `records` or `channels` as if they were only low-level infrastructure when the user is actually asking for activity history.
