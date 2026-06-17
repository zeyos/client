# Collaboration And Activity Workflows

## Primary Resources

- `records`
- `comments`
- `files`
- `events`
- `channels`
- `entities2channels`
- `follows`
- `likes`

These are dbref nouns, not operationIds. Note the junction `entities2channels` ->
`listEntitiesToChannels` / `getEntityToChannel` (not `listEntities2channels`). See
[../../shared/zeyos-entity-reference.md](../../shared/zeyos-entity-reference.md#entity-noun-to-rest-operationid)
before calling `@zeyos/client`.

## First Commands For Counts

- All timeline events: `zeyos count events`
- Events for account ID 123: `zeyos count events --filter '{"entity":"accounts","index":123}'`
- Feed records for account ID 123: `zeyos count records --filter '{"entity":"accounts","index":123}'`

`events` and `records` use `entity` plus `index` indirection and have no `visibility`
field.

## Benchmark-Backed Default

Treat this layer like the record timeline or collaboration feed found in Salesforce, Odoo, and Dynamics:

- `records` are the main feed wrapper
- `comments` and `files` enrich a record thread
- `events` add timeline markers
- `channels` represent shared collaboration spaces

## Pattern: Recent Activity On A Record

Use this for prompts like:

- "What happened on account ACME this week?"
- "Show recent activity for ticket 812."

Recommended approach:

1. Resolve the anchor entity and ID.
2. Query `records` by `entity` and `index`.
3. Query `events` for the same anchor.
4. If the user needs discussion detail, fetch `comments` and `files` for the matching record IDs.
5. Present the result as a chronological timeline.

## Pattern: Comments And Attachments Around A Record

Use this for prompts like:

- "Show recent comments and files on this ticket."
- "What attachments were added to Project Atlas?"

Recommended approach:

1. Resolve the anchor entity and ID.
2. Query `records` by `entity` and `index`.
3. Query `comments` by record ID.
4. Query `files` by record ID and by comment ID where needed.
5. Keep attachments on comments distinct from attachments on the root record.

## Pattern: Who Follows This Record

Use this for prompts like:

- "Who follows Project Atlas?"
- "Is anyone watching this account?"

Recommended approach:

1. Resolve the anchor entity and ID.
2. Query `follows` by `entity` and `index`.
3. Resolve follower user IDs to `users` if the API response is not already expanded.
4. Present follower count first, then the individual users if requested.

## Pattern: Which Channel Is Linked To This Record

Use this for prompts like:

- "Which channel is linked to ticket 812?"
- "What collaboration room is used for this project?"

Recommended approach:

1. Resolve the anchor entity and ID.
2. Query `entities2channels` for that entity/index pair.
3. Resolve channel details through `channels`.
4. Present active channel name, owner, and description when useful.

## Pattern: Account Or Project Narrative

Use this for prompts like:

- "Give me a narrative of what happened on ACME in the last 7 days."
- "Summarize Project Atlas activity this month."

Recommended approach:

1. Start with the collaboration layer: `records`, `comments`, `files`, `events`.
2. Add work items, messages, or documents only after the baseline timeline is assembled.
3. Label each entry by source type so the answer does not blur discussion, work, and mail.

## Common Failure Modes

- Looking only at tickets or tasks when the user asked for "activity".
- Treating channels as tags without checking `entities2channels`.
- Confusing watchers in `follows` with owners or assignees.
- Missing attachments because files can hang off either a `record` or a `comment`.
