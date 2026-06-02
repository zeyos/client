---
sidebar_position: 3
sidebar_label: Agent Recipes
---

# Agent Recipes

These workflows are designed for coding agents and shell automation. Every example is safe to convert into CI jobs, local scripts, or ad hoc operational tooling.

## Work a Ticket Queue

List active tickets with only the fields you need:

```bash
zeyos list tickets \
  --fields ID,ticketnum,name,status,priority,assigneduser,lastmodified \
  --filter '{"visibility":0,"status":4}' \
  --sort -lastmodified \
  --limit 50 \
  --json
```

Count the backlog before acting:

```bash
zeyos count tickets --filter '{"visibility":0,"status":0}' --json
```

Move a ticket to a new status:

```bash
zeyos update ticket 42 --data '{"status":7}' --json
```

## Create a Follow-up Ticket

```bash
zeyos create ticket \
  --data '{"name":"Escalate billing issue","status":0,"priority":3,"account":15,"visibility":0}' \
  --json
```

Use `zeyos get ticket <id> --json` immediately after creation if the workflow needs server-confirmed fields or related data.

## Query Accounts for an Agent-Facing CRM View

Use field aliases and joins when you need a compact response:

```bash
zeyos list accounts \
  --fields '{"Id":"ID","Name":"lastname","City":"contact.city","Agent":"assigneduser.name"}' \
  --filter '{"visibility":0}' \
  --sort +lastname \
  --limit 25 \
  --json
```

## Pull Tasks for a Project or Ticket

```bash
zeyos list tasks \
  --fields ID,tasknum,name,status,priority,duedate \
  --filter '{"visibility":0,"project":123}' \
  --sort +duedate \
  --json
```

```bash
zeyos list tasks \
  --fields ID,tasknum,name,status,priority,duedate \
  --filter '{"visibility":0,"ticket":42}' \
  --json
```

## Paginate Deterministically

```bash
zeyos list tickets \
  --filter '{"visibility":0}' \
  --sort -lastmodified \
  --limit 100 \
  --offset 0 \
  --json
```

Advance by incrementing `--offset` yourself. For long-running jobs, always keep the sort explicit so the ordering stays stable.

## Pipe to `jq`

Extract IDs:

```bash
zeyos list tickets --fields ID,name --filter '{"visibility":0}' --json | jq '.[].ID'
```

Extract the current access token for another tool:

```bash
zeyos whoami --json | jq -r '.accessToken'
```

## Destructive Guardrails

- `zeyos delete` prompts by default. Keep that behavior in human-in-the-loop sessions.
- Use `--force` only in automation that already has a clear selection rule.
- Prefer `count` or a dry-run `list` before a bulk action.
- If a workflow needs unsupported resources, raw request control, or custom retry logic, move it to [`@zeyos/client`](./03-cli-coverage-and-escalation.md).
