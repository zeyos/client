# Work Management Workflows

## Primary Resources

- `projects`: top-level initiatives
- `tickets`: support and service work, often linked to accounts or projects
- `tasks`: actionable units linked to tickets or projects
- `actionsteps`: smaller follow-up work linked to tasks, tickets, accounts, or transactions; default to these when the user is really asking for a scheduled follow-up rather than a broader deliverable
- `users`: system identities for assignees

These are dbref nouns, not operationIds. Note `actionsteps` -> `listActionSteps` /
`getActionStep` / `createActionStep` / `updateActionStep` / `deleteActionStep`
(compound CamelCase, not `listActionsteps`). See
[../../shared/zeyos-entity-reference.md](../../shared/zeyos-entity-reference.md#entity-noun-to-rest-operationid)
before calling `@zeyos/client`.

Actionstep status values:

- `0` = DRAFT / open follow-up
- `1` = COMPLETED
- `2` = CANCELLED
- `3` = BOOKED

Use `effort` as minutes of effort only when the question is about time entries or booked/completed work. Do not infer booked time from task assignment alone.

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
4. Query recent `actionsteps` for the same user when you need stronger evidence of follow-up activity or booked effort.
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

- Assignment-based "worked on" answers are activity proxies. `actionsteps` with `date`, `status` COMPLETED/BOOKED, and `effort` are the better evidence for time-entry summaries.

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

For ticket work packets, include:

- ticket status, priority, due date, account/project links
- open tasks linked by `task.ticket`
- open actionsteps linked by `actionstep.ticket` or by task
- recent messages linked by `message.ticket` if the request asks for customer context

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

CLI examples:

```bash
zeyos list actionsteps \
  --fields ID,actionnum,name,status,date,duedate,effort,ticket,task,account,transaction \
  --filter '{"ticket":812}' \
  --sort +duedate \
  --limit 100 \
  --json
```

For counts:

```bash
zeyos count actionsteps --filter '{"ticket":812,"status":0}' --json
```

For unanchored due-date counts, first narrow by equality filters and due-date presence
server-side. The API can return misleading zero counts for comparison filters like
`{"duedate":{"<=":4102444800}}`, and `duedate:null` is not a due item. If the
presence count is zero, the due-date count is zero.

```bash
zeyos count actionsteps --filter '{"status":0,"duedate":{"!=":null}}' --json
```

If due dates exist, list those rows and count the timestamp range client-side.

```bash
zeyos list actionsteps \
  --fields ID,status,duedate \
  --filter '{"status":0,"duedate":{"!=":null}}' \
  --limit 10000 \
  --json
```

Then parse the JSON and count rows where `duedate != null && Number(duedate) <= cutoff`.

## Pattern: Time Entry / Effort Summaries

Use this for prompts like:

- "How many minutes were booked on ticket 812 last week?"
- "Give me a summary of logged ticket time from the last four weeks."
- "Summarize completed actionstep effort for this account."
- "Which user logged effort against this project?"

Recommended approach:

1. Resolve the anchor and the date window.
2. Query `actionsteps` with fields `ID`, `date`, `status`, `effort`, and the relevant FK (`ticket`, `task`, `account`, or `transaction`).
3. Include statuses `1` COMPLETED and `3` BOOKED for time-entry totals unless the user asks for drafts/open follow-ups.
4. For a simple ungrouped total, run `zeyos sum actionsteps effort --filter '{"status":[1,3]}'`.
   For anchored or grouped totals, list the needed rows and sum `effort` as minutes.
   Convert to hours only if the user asked for hours.
5. For ticket-level totals, roll task time up to the ticket:
   - direct ticket time is `actionsteps.ticket = <ticketId>`
   - task ticket time is `actionsteps.task = <taskId>` where `tasks.ticket = <ticketId>`
   - fetch tasks by `ticket` for a named ticket, or resolve every referenced `actionstep.task` to `task.ticket` for a period-wide ticket summary
   - do not filter tasks by status when resolving historical time; a completed task can still carry valid logged time
   - dedupe by `actionsteps.ID` before summing in case a row has both `ticket` and `task`
6. Keep task/ticket assignment separate from effort totals.

Ticket-specific client example:

```js
const [directRows, tasks] = await Promise.all([
  client.api.listActionSteps({
    fields: ['ID', 'date', 'status', 'effort', 'ticket', 'task', 'assigneduser'],
    filters: { ticket: ticketId, status: { IN: [1, 3] }, date: { '>=': start, '<=': end } },
    limit: 10000,
  }),
  client.api.listTasks({
    fields: ['ID', 'ticket', 'name'],
    filters: { ticket: ticketId },
    limit: 10000,
  }),
]);

const taskIds = tasks.map((task) => task.ID);
const taskRows = taskIds.length
  ? await client.api.listActionSteps({
      fields: ['ID', 'date', 'status', 'effort', 'ticket', 'task', 'assigneduser'],
      filters: { task: { IN: taskIds }, status: { IN: [1, 3] }, date: { '>=': start, '<=': end } },
      limit: 10000,
    })
  : [];

const uniqueRows = new Map();
for (const row of [...directRows, ...taskRows]) uniqueRows.set(String(row.ID), row);
const totalMinutes = [...uniqueRows.values()]
  .reduce((sum, row) => sum + (Number(row.effort) || 0), 0);
```

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
3. Confirm the new owner, due date, and priority/effort if they are not explicit.
4. Use explicit PATCH or create bodies and return the created record ID.

## Common Failure Modes

- The same person may exist as a contact and as a user with different names.
- A ticket can link to an account or a project, but not both in the documented schema.
- A task can link to a ticket or a project, but not both in the documented schema.
- An action step can link to a task, ticket, or account, plus an optional transaction.
- Project answers become noisy if you do not dedupe project IDs gathered from tasks and tickets.
