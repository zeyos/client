# Time Tracking Workflows

## Resources and operation IDs

These are dbref nouns; the REST/client operationIds differ for action steps (compound CamelCase):

- `tickets` -> `listTickets` / `getTicket` / `createTicket` / `updateTicket`
- `tasks` -> `listTasks` / `getTask` / `createTask` / `updateTask`
- `projects` -> `listProjects` / `getProject`
- `accounts` -> `listAccounts` / `getAccount`
- `actionsteps` -> `listActionSteps` / `getActionStep` / `createActionStep` / `updateActionStep` (not `listActionsteps`)
- current user -> `getUserInfo` (oauth2 service); `zeyos whoami --json` exposes its `sub`

See [../../shared/zeyos-entity-reference.md](../../shared/zeyos-entity-reference.md#entity-noun-to-rest-operationid) before calling `@zeyos/client`.

## Schema facts this skill relies on

- **Time entries are `actionsteps`.** The `effort` field is **minutes** (integer). There is no separate time-entry resource.
- **Actionstep foreign keys:** `task`, `ticket`, `account`, `transaction` — plus `assigneduser`, `date`, `duedate`, `status`, `effort`. **There is no `project` FK on an actionstep**, so project-level time attaches through a ticket/task in that project, or to the project's `account`.
- **Ticket time rollups cross the task layer.** For "logged ticket time", count actionsteps with `ticket = <ticketId>` and actionsteps with `task = <taskId>` where that task has `ticket = <ticketId>`. Always dedupe by actionstep `ID` before summing in case a row carries both FKs.
- **Actionstep status:** `0` DRAFT · `1` COMPLETED · `2` CANCELLED · `3` BOOKED. Log already-done work as **COMPLETED (1)**; use **BOOKED (3)** only when the instance treats booked effort as the billed/locked record and the user says so.
- **Ticket/task status:** `0` NOT_STARTED · `1` AWAITING_ACCEPTANCE · `2` ACCEPTED · `3` REJECTED · `4` ACTIVE · `5` INACTIVE · `6` FEEDBACK_REQUIRED · `7` TESTING · `8` CANCELLED · `9` COMPLETED · `10` FAILED · `11` BOOKED. Treat **open/current = status `!IN [8,9,10,11]`** (exclude cancelled/completed/failed/booked). State this definition in the answer; the user can narrow it (e.g. only `4` ACTIVE).
- **Foreign keys per resource:** `tickets` carry `account`, `project`, `assigneduser`; `tasks` carry `ticket`, `project`, `assigneduser` (no `account` — reach the account through the task's ticket/project); `projects` carry `account`, `assigneduser`; `accounts` carry `lastname`, `firstname`, `customernum` (no `name` field).
- **Visibility:** `tickets`, `tasks`, `projects`, `accounts` expose `visibility` (use `0` for live records). `transactions` do **not** — never filter `visibility` there.
- All dates are **Unix timestamps in seconds**.

## Filter operators (server-side)

`{"field": value}` is equality. Object values take operators: `{">=":3}`, `{"!=":0}`, `{"IN":[1,3]}`, `{"!IN":[8,9,10,11]}`. For name search, `~~*` is case-insensitive LIKE: `{"lastname": {"~~*": "%acme%"}}`. The client accepts `filters` (plural); the CLI flag is `--filter` (it writes `filters` internally).

---

## Pattern: "What are my current tickets / tasks / action steps?"

1. Resolve the current user id:

   ```bash
   zeyos whoami --json   # read the "sub" field — this is your users.ID
   ```

2. List open work assigned to that id. Use `--limit` high enough that nothing is silently truncated, or `zeyos count` first if the user asked "how many".

   ```bash
   # my open tickets, most urgent first
   zeyos list tickets \
     --fields ID,ticketnum,name,status,priority,duedate,account.lastname,project \
     --filter '{"assigneduser":<sub>,"visibility":0,"status":{"!IN":[8,9,10,11]}}' \
     --sort -priority,+duedate \
     --limit 200 --json

   # my open tasks
   zeyos list tasks \
     --fields ID,tasknum,name,status,priority,duedate,ticket,project,projectedeffort \
     --filter '{"assigneduser":<sub>,"visibility":0,"status":{"!IN":[8,9,10,11]}}' \
     --sort -priority,+duedate --limit 200 --json

   # my open action steps (follow-ups)
   zeyos list actionsteps \
     --fields ID,actionnum,name,status,date,duedate,effort,ticket,task,account \
     --filter '{"assigneduser":<sub>,"status":0}' \
     --sort +duedate --limit 200 --json
   ```

   Client form:

   ```js
   const me = await client.oauth2.getUserInfo();          // me.sub === users.ID (string)
   const myTickets = await client.api.listTickets({
     fields: ['ID', 'ticketnum', 'name', 'status', 'priority', 'duedate', 'account.lastname', 'project'],
     filters: { assigneduser: me.sub, visibility: 0, status: { '!IN': [8, 9, 10, 11] } },
     limit: 200,
   });
   ```

3. Report the resolved user and the open-status definition, then the list ordered by priority and due date. Flag overdue items (`duedate < now`).

---

## Pattern: Interactive time logging — "Log 60 minutes of work for client XYZ"

This is the headline interactive flow. Run each step; ask the user only at the marked decision points.

### Step 1 — Parse the request

- **Duration -> minutes.** "60 minutes" -> `60`; "2 hours" -> `120`; "1.5h"/"an hour and a half" -> `90`; "half an hour" -> `30`. `effort` is integer minutes.
- **Date.** Default to now (`date` = current Unix seconds). Honor an explicit date if given ("yesterday", "on Monday").
- **Note.** Use any description the user gave ("call about the renewal") as the actionstep `name`/`description`; otherwise compose a short one and confirm it.

### Step 2 — Resolve the account (ask only if ambiguous)

```bash
zeyos list accounts \
  --fields ID,customernum,lastname,firstname,type \
  --filter '{"visibility":0,"lastname":{"~~*":"%xyz%"}}' \
  --limit 25 --json
```

- Also try `customernum` and `firstname` if `lastname` yields nothing.
- **0 matches:** report it and ask for a customer number or exact name — do not create anything.
- **1 match:** state it ("Logging against ACME Corp (#10042)") and continue.
- **>1 match (DECISION POINT):** list the candidates with `customernum`, name, and `type`, and ask which one. Do not guess.

### Step 3 — Enumerate candidate work items for that account

Run these in parallel; you are building the menu of places the time could land. (Tasks have no `account` FK, so reach them through the account's tickets/projects.)

```bash
# open tickets on the account
zeyos list tickets --fields ID,ticketnum,name,status,priority \
  --filter '{"account":<accountId>,"visibility":0,"status":{"!IN":[8,9,10,11]}}' --limit 50 --json

# active projects on the account
zeyos list projects --fields ID,projectnum,name,status \
  --filter '{"account":<accountId>,"visibility":0,"status":{"!IN":[8,9,10,11]}}' --limit 50 --json

# open tasks under those tickets/projects (use the IDs gathered above)
zeyos list tasks --fields ID,tasknum,name,status,ticket,project \
  --filter '{"visibility":0,"status":{"!IN":[8,9,10,11]},"ticket":{"IN":[<ticketIds>]}}' --limit 50 --json
```

### Step 4 — Choose the attachment (DECISION POINT)

Present the candidates grouped (tickets / tasks / projects) and ask where the time should go. Map the choice to exactly one actionstep FK:

- a ticket -> `ticket: <id>`
- a task -> `task: <id>`
- a project -> attach to a ticket/task in that project, or fall back to the project's `account` (no `project` FK exists on actionsteps — say so)
- "just the account / general" or no work items exist -> `account: <accountId>`

If there is exactly one obvious candidate (e.g. a single open ticket), propose it as the default and let the user confirm rather than asking open-endedly.

### Step 5 — Preview, confirm, then write

Preview the exact request without sending it, show it to the user, and create it only after confirmation:

```bash
# dry-run preview (no network, no write)
zeyos create actionstep \
  --name "Call about the renewal" \
  --ticket <ticketId> \
  --account <accountId> \
  --assigneduser <sub> \
  --effort 60 --status 1 --date <nowSeconds> \
  --query

# after the user confirms, drop --query to actually create, then read it back
zeyos create actionstep --name "Call about the renewal" --ticket <ticketId> \
  --assigneduser <sub> --effort 60 --status 1 --date <nowSeconds> --json
zeyos get actionstep <newId> --json
```

Client form:

```js
const now = Math.floor(Date.now() / 1000);
const created = await client.api.createActionStep({
  name: 'Call about the renewal',
  ticket: ticketId,          // or task / account — exactly one work anchor
  assigneduser: me.sub,
  effort: 60,                // minutes
  status: 1,                 // COMPLETED (logged work)
  date: now,
});
const verify = await client.api.getActionStep({ ID: created.ID });
```

Set **one** of `ticket` / `task` / `account` as the work anchor (a ticket already implies its account, so you do not need both). Report the created id, the anchor, effort minutes, and date.

---

## Pattern: "How much time did I log this week?" (timesheet summary)

The read complement to logging — totals the effort the current user already booked over a period, optionally grouped by account/ticket.

1. Resolve the current user id (`zeyos whoami --json` → `sub`).
2. Normalize the window to Unix **seconds**. The actionstep `date` field carries the business date of the entry; filter on it.
3. List the user's time entries in the window and sum `effort` (minutes). Count only COMPLETED (1) and BOOKED (3) — those are real logged time, not open follow-ups (status 0).

```bash
# my logged minutes between two timestamps
zeyos list actionsteps \
  --fields ID,name,effort,date,status,account,ticket,task \
  --filter '{"assigneduser":<sub>,"status":{"IN":[1,3]},"date":{">=":<weekStart>,"<=":<weekEnd>}}' \
  --limit 10000 --json
```

```js
const me = await client.oauth2.getUserInfo();
const rows = await client.api.listActionSteps({
  fields: ['ID', 'effort', 'date', 'status', 'account', 'ticket', 'task'],
  filters: { assigneduser: me.sub, status: { IN: [1, 3] }, date: { '>=': weekStart, '<=': weekEnd } },
  limit: 10000,
});
const totalMinutes = rows.reduce((sum, r) => sum + (Number(r.effort) || 0), 0);
```

4. Sum `effort` as minutes; convert to hours only if asked. To break down "by account/ticket", group the rows by the FK and resolve the account/ticket names with a second query. Report the total and the breakdown, and state the window and status set you used.

## Pattern: "Give me a summary of logged ticket time from the last four weeks"

Use this whenever the user asks for ticket time, ticket hours, support time by ticket, or a ticket-level timesheet summary. A time entry can be attached directly to a ticket or indirectly to a task that belongs to a ticket; both are ticket time.

1. Resolve the date window to Unix seconds and count only `actionsteps.status IN [1,3]` unless the user explicitly asks for drafts/open follow-ups.
2. If the user named a specific ticket, resolve it first, then query:

   ```bash
   # direct ticket time
   zeyos list actionsteps \
     --fields ID,name,effort,date,status,ticket,task,assigneduser \
     --filter '{"ticket":<ticketId>,"status":{"IN":[1,3]},"date":{">=":<start>,"<=":<end>}}' \
     --limit 10000 --json

   # tasks that belong to the ticket; do not filter task status for historical time
   zeyos list tasks \
     --fields ID,tasknum,name,ticket \
     --filter '{"ticket":<ticketId>}' \
     --limit 10000 --json

   # time logged on those tasks
   zeyos list actionsteps \
     --fields ID,name,effort,date,status,ticket,task,assigneduser \
     --filter '{"task":{"IN":[<taskIds>]},"status":{"IN":[1,3]},"date":{">=":<start>,"<=":<end>}}' \
     --limit 10000 --json
   ```

3. If the user asks for all ticket time in a period, list actionsteps in the window with `ticket` and `task`, then resolve every referenced task to `task.ticket` and group by the resulting ticket ID. Page through results if the window is large.
4. Build each actionstep's ticket attribution:
   - direct row: `actionstep.ticket`
   - task row: `taskById[actionstep.task].ticket`
   - both present: count the actionstep once; prefer the direct ticket if it conflicts and call out the conflict
   - neither present: keep it out of the ticket-time total unless reporting an "unassigned/general time" bucket
5. Dedupe by actionstep `ID`, sum `effort` in minutes, and resolve ticket labels (`ticketnum`, `name`, `account.lastname`) for the summary.

Client shape for a specific ticket:

```js
const [directRows, taskRows] = await Promise.all([
  client.api.listActionSteps({
    fields: ['ID', 'name', 'effort', 'date', 'status', 'ticket', 'task', 'assigneduser'],
    filters: { ticket: ticketId, status: { IN: [1, 3] }, date: { '>=': start, '<=': end } },
    limit: 10000,
  }),
  client.api.listTasks({
    fields: ['ID', 'tasknum', 'name', 'ticket'],
    filters: { ticket: ticketId },
    limit: 10000,
  }),
]);

const taskIds = taskRows.map((task) => task.ID);
const taskTimeRows = taskIds.length
  ? await client.api.listActionSteps({
      fields: ['ID', 'name', 'effort', 'date', 'status', 'ticket', 'task', 'assigneduser'],
      filters: { task: { IN: taskIds }, status: { IN: [1, 3] }, date: { '>=': start, '<=': end } },
      limit: 10000,
    })
  : [];

const rowsById = new Map();
for (const row of [...directRows, ...taskTimeRows]) rowsById.set(String(row.ID), row);
const totalMinutes = [...rowsById.values()]
  .reduce((sum, row) => sum + (Number(row.effort) || 0), 0);
```

## Pattern: Adjust or correct a logged entry

For "actually that was 90 minutes, not 60" or "move that time to ticket 813" right after logging — or any later correction.

1. Get the entry first so you preview the current values: `zeyos get actionstep <id> --json`.
2. Build a minimal PATCH with only the changed fields. Preview with `--query`, confirm with the user (it is a mutation on an existing record), then update and read back.

```bash
zeyos update actionstep <id> --effort 90 --query        # preview the change
zeyos update actionstep <id> --effort 90 --json         # after confirmation
zeyos get actionstep <id> --json                        # verify
```

```js
await client.api.updateActionStep({ ID: id, effort: 90 });   // spread form: ID + changed fields
const verify = await client.api.getActionStep({ ID: id });
```

Only correct entries the user pointed to (by id, or one you just created in this turn). Re-anchoring time to a different work item means changing the `ticket`/`task`/`account` FK — set the new anchor and clear the old one if it conflicts. Never bulk-rewrite a category of entries.

## Degrading when there is no human (automated / harness runs)

- "My work" reads still work: resolve `sub`, run the list, report it.
- For a **write**, never break ambiguity by guessing. If the account or the work item is ambiguous and nothing can be asked, stop and report the candidates and what was missing. A wrong foreign key on a created time entry is worse than an unanswered request.

## Common failure modes

- Counting a `list` page instead of the real total — use `zeyos count` for "how many of my …".
- Filtering `visibility` on `transactions` (no such column -> HTTP 400).
- Putting effort in hours — `effort` is **minutes**.
- Trying to set a `project` FK on an actionstep — it does not exist; anchor on a ticket/task/account instead.
- Summing only `actionstep.ticket` for ticket time — time logged on tasks with `task.ticket = <ticketId>` belongs in the ticket total too.
- Treating BOOKED (status 11) tickets as current — they are terminal; the open set excludes `[8,9,10,11]`.
- Logging time against a user id you guessed — always read `sub` from `whoami`.
