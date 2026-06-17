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
7. Treat drafts as safe write targets. Treat sending as high risk and require explicit confirmation plus verified sender context.
8. Escalate to `@zeyos/client` when you need binary content, MIME expansion, or richer message correlation than the CLI can express cleanly.

## Output Discipline

- Report the resolved customer identity and the email addresses used for matching.
- Separate inbound, draft, and sent messages.
- Call out whether a thread match was direct by email address or inferred through ticket/opportunity context.
