---
name: zeyos-collaboration-and-activity
description: Analyze ZeyOS record timelines, comments, followers, channels, files, likes, and events. Use when asked what happened on an account, project, or ticket recently, who follows a record, which channel a record is linked to, or which comments and attachments make up the collaboration history around a business object.
---

# ZeyOS Collaboration And Activity

Read [../shared/zeyos-agent-operating-guide.md](../shared/zeyos-agent-operating-guide.md) and [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. Read [../shared/business-app-benchmarks.md](../shared/business-app-benchmarks.md) for the cross-platform semantic defaults. Read [../shared/zeyos-entity-map.md](../shared/zeyos-entity-map.md) when the timeline must be correlated with work, mail, or knowledge entities. Read [references/workflows.md](references/workflows.md) for activity-specific query plans.

Typical prompts:

- "What happened on account ACME this week?"
- "Who follows Project Atlas?"
- "Which channel is linked to ticket 812?"
- "Show recent comments and files on this record."

## Workflow

1. Decide whether the user wants:
   - a record timeline
   - comments or attachments
   - follower or engagement state
   - channel linkage
2. Resolve the anchor business record first: account, project, ticket, task, or transaction.
3. Default to this layered model:
   - `records`, `comments`, `files`, `events` for the activity timeline
   - `follows` and `likes` for watcher and engagement state
   - `channels` and `entities2channels` for collaboration spaces
4. Treat this layer as user-facing by default, not as background infrastructure, unless the instance clearly says otherwise.
5. Keep the answer separated by layer so the user can tell work state apart from discussion state.
6. If the question is really about operational work ownership or inbox mail, switch to the more specific work or mail skill after the timeline summary.

## Output Discipline

- Start with the resolved record and time window.
- Separate timeline items, comments/files, followers, and channels.
- Call out when a result is inferred from `entity` and `index` indirection rather than a direct foreign key.
