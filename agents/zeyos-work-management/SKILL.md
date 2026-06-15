---
name: zeyos-work-management
description: Manage ZeyOS tickets, tasks, projects, action steps, assignees, and workload questions. Use when asked to summarize work queues, trace which projects or tickets a user worked on, create follow-up work, inspect active or overdue work items, or answer operational questions that span tickets, tasks, projects, accounts, transactions, and users.
---

# ZeyOS Work Management

Read [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. Read [../shared/zeyos-entity-map.md](../shared/zeyos-entity-map.md) when the request crosses users, accounts, tickets, tasks, and projects. Read [references/workflows.md](references/workflows.md) for the concrete query patterns.

Typical prompts:

- "On which projects did Max Power work in the last two weeks?"
- "Show overdue high-priority tickets for customer ACME."
- "Which open tasks are blocking Project Atlas?"
- "Which action steps are due this week for ACME?"
- "Create a follow-up ticket for this billing issue."

## Workflow

1. Resolve user, project, account, ticket, task, and transaction names to IDs before correlating records.
2. Decide whether the primary record set is `tickets`, `tasks`, `projects`, `actionsteps`, or a mixed workload view.
3. Start with the narrowest query that can answer the question:
   - use `tickets` for queue, backlog, priority, and account-linked support work
   - use `tasks` for actionable delivery work and short-lived assignments
   - use `actionsteps` for smaller cross-record follow-ups attached to tasks, tickets, accounts, or transactions
   - use `projects` for top-level initiative state
4. Follow relationships only after the primary record set is clear.
5. Treat "worked on" as a proxy unless a stronger activity source exists. Use assignment plus recent timestamps, optionally strengthened by linked action steps, and say so explicitly.
6. Distinguish direct project assignment from project inference through linked tickets.
7. When the question is really about account or transaction follow-up, check `actionsteps` before inventing a new task.
8. For mutations, preview the affected record first and update with an explicit PATCH body.
9. Escalate from the CLI to `@zeyos/client` if the workflow needs unsupported joins, additional request control, or correlation across multiple list responses.

## Destructive Operations

- **Refuse unscoped bulk deletes.** A request to delete a *category* of work — "delete all completed tickets", "clean up the queue", "close out everything old" — is a bulk destructive operation. Do not perform it: refuse and ask the user to confirm the specific record IDs, even if the matched records look like throwaway/test data.
- Delete or bulk-modify only records the user has explicitly identified by ID (or that you created yourself in this session), one at a time, after previewing each.
- "Clean up", "tidy", or "archive the queue" are not authorization to delete — treat them as requests for a *proposed* list the user approves before any deletion.
- Never pass `--force` or auto-answer a delete confirmation prompt on the user's behalf for records you did not create.

## Output Discipline

- Report the resolved entities and time window first.
- Separate direct evidence from inferred relationships.
- Call out missing project links, ambiguous user resolution, incomplete task-ticket chains, or action steps that only prove account-level follow-up rather than project activity.
