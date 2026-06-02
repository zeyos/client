---
sidebar_position: 1
sidebar_label: Coding Agents
---

# Coding Agents

This path is for coding agents, automation scripts, and operational tools that need a deterministic way to read and write business data in ZeyOS.

ZeyOS should be treated as the central system for business records and business rules. For v1, these docs stay focused on **external integrations**: the CLI, the JavaScript client, and the REST/OpenAPI surface exposed by a ZeyOS instance.

## Start Here

For most agent workflows, start with the CLI:

| Need | Recommended interface | Why |
|------|-----------------------|-----|
| Fast CRUD against common business resources | [`zeyos`](../03-cli/01-getting-started.md) | Human-readable help, JSON output, built-in auth flow, safe delete confirmation |
| Reliable shell automation and pipelines | [`zeyos --json`](./01-agent-quickstart.md) | Stable machine-readable output, easy to combine with `jq` and scripts |
| Access beyond the CLI's curated resource registry | [`@zeyos/client`](../02-javascript-client/01-getting-started.md) | Covers the full generated API surface |
| Non-JavaScript or custom HTTP clients | [REST/OpenAPI](../01-api-reference/03-resources.md) | Raw endpoint and schema reference |

## Recommended Route

1. Follow the [Agent Quickstart](./01-agent-quickstart.md) to authenticate and make your first read/write calls.
2. Use [Agent Recipes](./02-agent-recipes.md) for common ticket, account, task, and project workflows.
3. Check [CLI Coverage and Escalation](./03-cli-coverage-and-escalation.md) whenever you need a resource or request shape the CLI does not expose directly.

## Working Rules

- Prefer `--json` for agent-driven flows.
- Prefer `filters`-style JSON payloads in CLI examples so the transition to `@zeyos/client` stays consistent.
- Include `visibility: 0` unless you intentionally want archived or deleted records.
- Treat `delete` as destructive. The CLI prompts by default; use `--force` only in deliberate automation.
- Switch to the JavaScript client when the task needs unsupported resources, browser/session behavior, or low-level request control.
