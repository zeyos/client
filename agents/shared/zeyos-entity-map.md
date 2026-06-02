# ZeyOS Entity Map

Use this file when a question spans more than one business area.

This is the high-level relationship map. For the source-backed inventory, read [zeyos-entity-reference.md](./zeyos-entity-reference.md), which is derived from [../../openapi/dbref.json](../../openapi/dbref.json) and [../../openapi/api.json](../../openapi/api.json).

## Work Graph

- `projects` are the top-level work containers.
- `tickets` link to either an `account` or a `project`.
- `tasks` link to either a `ticket` or a `project`.
- `actionsteps` are smaller follow-up work items linked to a `task`, `ticket`, or `account`, with an optional `transaction`.
- `assigneduser` appears on projects, tickets, tasks, transactions, documents, notes, and payments.

Implication:

- To answer project-workload questions, you often need `tasks`, `tickets`, and sometimes `actionsteps`.
- To infer project activity from tasks, follow `task.project` directly or infer it through `task.ticket -> ticket.project`.
- Account or transaction follow-up work can live in `actionsteps` even when there is no standalone task.

## Customer Graph

- `accounts` are the main company/customer records.
- `contacts` are people linked to accounts.
- `addresses` add typed billing and shipping address records.
- `opportunities` add pipeline state and expected commercial value.
- `contracts` add signed or active commercial commitments.
- `pricelists2accounts` maps account-specific pricing.
- `users` are system identities and may not match contact names directly.

Implication:

- Human prompts such as "customer XYZ" often resolve through `accounts`.
- Human prompts such as "Max Power" may require checking both `users` and `contacts`.
- Customer 360 answers often need multiple follow-up queries rather than one joined query.

## Communication Graph

- `messages` link directly to `ticket`, `opportunity`, `mailinglist`, and `reference`.
- `messages` do not expose a direct `account` foreign key in the documented schema.
- `mailingrecipients` link outbound messages to `participants`.
- Email context often has to be inferred from `sender_email`, `to_email`, or linked tickets/opportunities.

Implication:

- For "recent mails from customer XYZ", resolve customer email addresses first, then search messages.
- Use `reference`, `messageid`, and `subject` to reconstruct threads.
- For mailing or campaign questions, go through `mailinglist -> messages -> mailingrecipients -> participants`.

## Outreach Graph

- `campaigns` define outreach initiatives and status windows.
- `mailinglists` belong to campaigns and define sender-facing communication groups.
- `participants` belong either to a `campaign` or a `mailinglist`.
- `messages` can point to a `mailinglist`.
- `mailingrecipients` connect outbound messages to individual participants.

Implication:

- Audience definition and actual message delivery are different layers.
- To answer "who received this campaign mailing?", resolve the campaign, then the mailing list, then the messages, then the recipients.

## Finance Graph

- `transactions` are the main billing and procurement records.
- `payments` link either to a `transaction` or directly to an `account`.
- `dunning` stores reminder and notice records for overdue receivables.
- `dunning2transactions` links collection notices back to the covered invoices.
- `items` appear in product catalogs and transaction line-item JSON.
- `pricelists`, `prices`, and `pricelists2accounts` shape effective commercial pricing.
- `documents` can represent invoice-like business documents, but `transactions` are the better source for monetary analysis.

Implication:

- Use `transactions` for invoice value, credits, and billing pipeline questions.
- Use `payments` for cash movement and settlement questions.
- Use `dunning` and `dunning2transactions` when the question is about collection stage, notices, or reminder fees.
- Use `expand: ['items']` or the raw JSON field when line-item analysis matters.

## Commerce Graph

- `items` are the catalog anchor.
- `prices` belong to items and price lists.
- `pricelists2accounts` applies price lists to customers.
- `stocktransactions` move item quantities across `storages`.
- `suppliers` link items to vendor accounts.

Implication:

- "What price does customer XYZ get?" usually needs account resolution, price-list resolution, then item pricing.
- "What stock do we have?" is often an aggregation over stock movements, not a single scalar field.

## Platform Graph

- `applications` own app-level assets.
- `resources`, `services`, and `weblets` describe runtime, automation, and UI surfaces.
- `groups`, `groups2users`, and `permissions` shape access.
- `customfields` and `objects` extend the schema.

Implication:

- Builder and admin questions often require platform entities rather than business entities.
- The schema often reveals structure even when product semantics remain instance-specific.

## Collaboration Graph

- `records` are the generic activity and posting wrapper tied to an `entity` and `index`.
- `comments` attach to a `record`.
- `files` can attach to either a `record` or a `comment`.
- `channels` group records, and `entities2channels` map business records into channels.
- `follows`, `likes`, and `events` add watchers, reactions, and timeline-style activity.

Implication:

- Questions like "what happened on this project recently?" may require `records`, `comments`, `files`, and `events`, not only tickets and tasks.
- This layer looks powerful in the schema, but the product importance still needs confirmation per instance.

## Knowledge Graph

- `notes` store plain text and are the easiest source for direct summarization.
- `documents` store formal file-like artifacts and metadata such as `documentnum`, `filename`, and status.
- `files` are attachment records linked to a `record` or `comment`.

Implication:

- Prefer `notes` when the user wants readable text now.
- Prefer `documents` when the user wants the official or final SOP artifact.
- Prefer `files` only when the question is explicitly about attachments.

## Ambiguity Patterns

- "Worked on" is not the same as logged time. The documented schema shows assignment and modification timestamps, not timesheets.
- "Revenue" can mean invoiced value, net revenue, gross revenue, or cash received.
- "Latest SOP" can mean most recently modified, most recently finalized, or the document currently in force.

Always state which interpretation you used.
