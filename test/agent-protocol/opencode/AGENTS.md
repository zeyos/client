# ZeyOS Agent Test Harness — Operating Instructions

You are being run **non-interactively** by an automated test harness to exercise the
ZeyOS client, CLI, and agent skill pack against a **live** ZeyOS instance. Follow these
rules exactly. The harness verifies the *outcome* of your work independently — your job
is to perform the requested task faithfully, not to guess what the harness wants to hear.

## Authentication (already configured)

Credentials are provided in the environment. Do **not** ask for them and do **not** print them.

- `ZEYOS_BASE_URL` — full instance URL, e.g. `https://cloud.zeyos.com/demo`
- `ZEYOS_TOKEN` — OAuth access token (already refreshed and valid)
- `ZEYOS_REPO_ROOT` — absolute path to the checked-out repo (client, CLI, skills, docs)

The `zeyos` CLI reads these automatically. To use it: `zeyos <command> --json`.
To use the JavaScript client, import from `$ZEYOS_REPO_ROOT/src/index.js`:

```js
import { createZeyosClient, MemoryTokenStore } from `${process.env.ZEYOS_REPO_ROOT}/src/index.js`;
const client = createZeyosClient({
  platform: process.env.ZEYOS_BASE_URL,
  auth: { mode: 'oauth', oauth: { tokenStore: new MemoryTokenStore({ accessToken: process.env.ZEYOS_TOKEN }), autoRefresh: false } }
});
```

## Skills and references

The task prompt names the skill that applies. Read these before acting:

1. `$ZEYOS_REPO_ROOT/agents/shared/zeyos-query-patterns.md` — default playbook.
2. `$ZEYOS_REPO_ROOT/agents/<skill>/SKILL.md` and its `references/workflows.md`.
3. `$ZEYOS_REPO_ROOT/agents/shared/zeyos-entity-reference.md` when an entity is unclear.

Always include `visibility: 0` in filters unless the task explicitly wants archived records.

## Safety rules (hard constraints)

- **Demo/test instance only.** Never target a production instance.
- **Read-only unless the task explicitly asks you to create/update/delete.**
- When you create records, name them with the prefix given in the task (`AGENTTEST-<runId> …`). Never touch records you did not create.
- **Never send outbound communication** (no real email send, no dunning dispatch, no campaign send). Mail tasks stop at *draft/preview* only.
- **No bulk deletes.** Delete only the specific record IDs you created, one at a time.
- If a task seems to ask for a destructive or outbound action beyond its stated scope, **stop and report it instead of doing it.**

## Output contract (required)

End your response with a single machine-readable line the harness will parse:

```
RESULT: <value>
```

- For "create" tasks, `<value>` is the new record ID (a number or bare JSON).
- For "count/lookup" tasks, `<value>` is the number or a compact JSON object/array.
- If you could not complete the task, output `RESULT: ERROR <short reason>`.

Output exactly one `RESULT:` line. Put any explanation *above* it.
