---
name: zeyos-campaign-and-outreach
description: Analyze ZeyOS campaigns, mailing lists, participants, outbound mailings, and recipient coverage. Use when asked about active campaigns, mailing-list membership, participant counts, who received a campaign mailing, or how outreach execution maps from campaign to message recipients.
---

# ZeyOS Campaign And Outreach

Read [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. Read [../shared/zeyos-entity-map.md](../shared/zeyos-entity-map.md) when the request crosses campaigns, mailing lists, participants, messages, and contacts. Read [references/workflows.md](references/workflows.md) for outreach-specific query plans.

Typical prompts:

- "How many participants are in campaign Spring Renewal?"
- "Which mailing lists belong to campaign XYZ?"
- "Who received the latest mailing for this campaign?"
- "Which participants still have no outbound mailing?"

## Workflow

1. Decide whether the user wants:
   - campaign inventory or status
   - mailing-list membership
   - participant lookup
   - send coverage for a mailing
2. Resolve the campaign or mailing list first.
3. Use the correct structural layer:
   - `campaigns` for initiative state
   - `mailinglists` for sender-facing list containers
   - `participants` for audience membership
   - `messages` plus `mailingrecipients` for actual outbound sends
4. Separate audience definition from execution. A participant in a campaign is not proof that a message was sent.
5. Treat `messagereads` cautiously. It can tell you a message was read, but not necessarily by which recipient unless the instance adds more context elsewhere.
6. Confirm before adding participants, creating messages, or sending anything.

## Output Discipline

- Report the resolved campaign or mailing list first.
- Separate campaign state, audience size, and actual sent messages.
- Say whether the answer is campaign-wide, mailing-list-specific, or message-specific.
