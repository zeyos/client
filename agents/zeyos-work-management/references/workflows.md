# Work Management Workflows

## Primary Resources

- `projects`: top-level initiatives
- `tickets`: support and service work, often linked to accounts or projects
- `tasks`: actionable units linked to tickets or projects
- `actionsteps`: smaller follow-up work linked to tasks, tickets, accounts, or transactions; default to these when the user is really asking for a scheduled follow-up rather than a broader deliverable
- `users`: system identities for assignees

These are dbref nouns, not operationIds. Note `actionsteps` -> `listActionSteps` /
`getActionStep` / `createActionStep` (compound CamelCase, not `listActionsteps`). See
[../../shared/zeyos-entity-reference.md](../../shared/zeyos-entity-reference.md#entity-noun-to-rest-operationid)
before calling `@zeyos/client`.

## Resolve Before Querying

1. Resolve the user or account first.
2. Resolve the time window second.
3. Query `tasks`, `tickets`, and `actionsteps` separately if the question asks what work happened.
4. Dedupe projects only after collecting both direct and inferred project IDs.

## Pattern: Projects A User Worked On In The Last Two Weeks

Use this for prompts like:

- "On which projects did Max Power work in the last two weeks?"
- "What has Sarah been touching recently?"

Recommended approach:

1. Resolve the user from `users.name` or `users.email`.
2. Query recent tasks assigned to that user with `lastmodified > cutoff`.
3. Query recent tickets assigned to that user with `lastmodified > cutoff`.
4. Optionally query recent `actionsteps` for the same user when you want stronger evidence of follow-up activity.
5. Collect direct `project` links from tasks and tickets.
6. For tasks that only link to a ticket, fetch the ticket or include `ticket.project` if available in the selected fields.
7. For action steps linked to tasks or tickets, infer the project through the linked parent only if the user asked for a broad activity summary.
8. Dedupe project IDs and present them as:
   - directly linked through tasks/projects
   - inferred through linked tickets
   - indirectly supported by recent action steps

Client example:

```js
const recentTasks = await client.api.listTasks({
  fields: ['ID', 'name', 'project', 'project.name', 'ticket', 'ticket.name', 'lastmodified'],
  filters: {
    assigneduser: userId,
    visibility: 0,
    lastmodified: { '>': cutoff },
  },
  limit: 200,
});

const recentTickets = await client.api.listTickets({
  fields: ['ID', 'name', 'project', 'project.name', 'lastmodified'],
  filters: {
    assigneduser: userId,
    visibility: 0,
    lastmodified: { '>': cutoff },
  },
  limit: 200,
});
```

Important caveat:

- The documented schema does not expose timesheets or effort logs here. "Worked on" is therefore an activity proxy, not proof of time spent.

## Pattern: Review A Ticket Queue

Use `tickets` as the primary record set when the question is about backlog, SLAs, due dates, or support prioritization.

CLI example:

```bash
zeyos list tickets \
  --fields ID,ticketnum,name,status,priority,duedate,assigneduser,project,account \
  --filter '{"visibility":0,"status":4}' \
  --sort -priority,+duedate \
  --limit 100 \
  --json
```

Follow up with `tasks` only if the answer requires execution detail below the ticket level.
Follow up with `actionsteps` if the queue management style in this instance uses reminders or next steps below the ticket.

## Pattern: Overdue Work For An Account Or Project

Use this for prompts like:

- "Show overdue high-priority tickets for customer ACME."
- "Which tasks are overdue on Project Atlas?"

Recommended approach:

1. Resolve the account or project first.
2. Query the primary work entity with `duedate < now`.
3. Keep status filters explicit so closed/completed work stays out of the result set.
4. Present overdue work ordered by priority and due date.

For account-scoped support work, start with `tickets`.
For project delivery work, query both `tickets` and `tasks` if the project uses both layers.
For account-scoped or transaction-scoped follow-up work, query `actionsteps` as well.

## Pattern: Open Action Steps For A Customer, Ticket, Or Invoice

Use this for prompts like:

- "Which action steps are due this week for ACME?"
- "What follow-ups are open on invoice 2025-0191?"
- "Show me the next steps on ticket 812."

Recommended approach:

1. Resolve the anchor record first: account, ticket, task, or transaction.
2. Query `actionsteps` as the primary resource.
3. Filter by the direct foreign key you actually have.
4. Keep due date and status visible in the result.
5. If the anchor is a transaction and the user also wants broader work context, then check related tickets or account-level tasks second.

## Pattern: Create Follow-Up Work

For prompts like:

- "Create a task for this ticket."
- "Open a follow-up ticket for the billing issue."

Recommended approach:

1. Get the source record first.
2. Preserve the strongest available context:
   - use `ticket` on a task if the task belongs to a ticket
   - use `project` if the follow-up is project-wide
   - use `actionsteps` if the follow-up is small, account-scoped, or transaction-scoped and does not justify a standalone task
   - keep `visibility: 0`
3. Confirm the new owner, due date, and priority if they are not explicit.
4. Use explicit PATCH or create bodies and return the created record ID.

## Common Failure Modes

- The same person may exist as a contact and as a user with different names.
- A ticket can link to an account or a project, but not both in the documented schema.
- A task can link to a ticket or a project, but not both in the documented schema.
- An action step can link to a task, ticket, or account, plus an optional transaction.
- Project answers become noisy if you do not dedupe project IDs gathered from tasks and tickets.
