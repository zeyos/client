---
name: zeyos-mail-operations
description: Query, summarize, and draft ZeyOS email and message records. Use when asked to summarize recent customer mail, reconstruct threads, find inbox or draft messages, prepare reply drafts, or explain how messages connect to tickets, opportunities, and customer identities.
---

# ZeyOS Mail Operations

Read [../shared/zeyos-agent-operating-guide.md](../shared/zeyos-agent-operating-guide.md) and [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. Read [../shared/zeyos-entity-map.md](../shared/zeyos-entity-map.md) when the request crosses accounts, contacts, tickets, and messages. Read [references/workflows.md](references/workflows.md) for mail-specific correlation patterns.

Typical prompts:

- "Give me a summary of all recent mails from customer XYZ."
- "Which open tickets have unanswered customer emails?"
- "Draft a reply to the latest complaint from ACME."
- "Show me the conversation behind ticket 812."

## Workflow

1. Resolve the business subject first:
   - customer account
   - contact or email address
   - linked ticket or opportunity
2. Decide whether the user wants inbox analysis, thread reconstruction, or draft creation.
3. Query `messages` with a minimal field set first: sender, recipient, subject, date, mailbox, ticket, opportunity, reference, and message ID.
4. Pull message `text` only when you actually need a summary or draft context.
5. Group related mail using `reference`, `messageid`, and normalized subject.
6. If the request is about campaigns, mailing lists, participant coverage, or mailing performance, switch to `zeyos-campaign-and-outreach`.
7. Treat textual drafts as safe. Treat message record creation/update as a write and sending or marking `mailbox=2` as high risk; require explicit confirmation plus verified sender context before any real mail mutation.
8. Escalate to `@zeyos/client` when you need binary content, MIME expansion, or richer message correlation than the CLI can express cleanly.

## Fast Path: Unanswered Inbox Count On Open Tickets

For "how many inbox messages (`mailbox` 0) are linked to open tickets and still
unanswered", use the workflow directly. This is a joined count, not a simple
`zeyos count messages` task.

If the prompt already states mailbox values and closed ticket statuses, skip schema
discovery. Do **not** use `notin`, `status_neq`, or `messageid` for this count.
Use the CLI commands below directly; do not write a scratch JavaScript client script for
this count because the CLI normalizes array filters to the API's native `IN` operator.

```bash
zeyos list tickets --fields ID,status --filter '{"visibility":0,"status":[0,1,2,3,4,5,6,7,11]}' --limit 10000 --json
zeyos list messages --fields ID,ticket,reference,date --filter '{"mailbox":0,"ticket":[<ticketIds>]}' --limit 10000 --json
zeyos list messages --fields ID,ticket,reference,date --filter '{"mailbox":2,"ticket":[<ticketIds>]}' --limit 10000 --json
```

Count inbound rows where no sent row has the same `ticket`, `reference == inbound.ID`,
and `sent.date >= inbound.date`. Do not run a separate raw inbox count after listing the
rows; the join logic is the answer.

## Safety

- Never send email from an agent test or from a summary/draft request.
- Do not create or update message records unless the user explicitly asks for a real ZeyOS draft and the sender/mailserver context is known.
- For "draft a reply", produce reply text in the response and leave ZeyOS unchanged.

## Output Discipline

- Report the resolved customer identity and the email addresses used for matching.
- Separate inbound, draft, and sent messages.
- Call out whether a thread match was direct by email address or inferred through ticket/opportunity context.
