# Campaign And Outreach Workflows

## Primary Resources

- `campaigns`
- `mailinglists`
- `participants`
- `messages`
- `mailingrecipients`
- `messagereads`

These are dbref nouns, not operationIds. Several diverge: `mailinglists` -> `listMailingLists`,
`mailingrecipients` -> `listMailingRecipients`, `messagereads` -> `listMessageReads`. See
[../../shared/zeyos-entity-reference.md](../../shared/zeyos-entity-reference.md#entity-noun-to-rest-operationid)
before calling `@zeyos/client`.

## First Commands For Counts

- Active campaigns: `zeyos count campaigns --filter '{"visibility":0}'`
- All campaigns: `zeyos count campaigns`
- Participants in a campaign: `zeyos count participants --filter '{"campaign":123}'`

Replace `123` with the resolved campaign ID when the user gives a campaign name.

## Schema Shape To Respect

- A `participant` belongs either to a `campaign` or to a `mailinglist`.
- A `message` can point to a `mailinglist`.
- `mailingrecipients` connect messages to participants.
- This means campaign-send analysis is usually:
  `campaign -> mailinglists -> messages -> mailingrecipients -> participants`

## Pattern: Active Campaigns

Use this for prompts like:

- "Which campaigns are currently active?"
- "Show current outreach initiatives."

Recommended approach:

1. Query `campaigns`.
2. Filter by date window and non-terminal status where needed.
3. Present campaign name, owner, status, and date window.

## Pattern: Audience Size For A Campaign Or Mailing List

Use this for prompts like:

- "How many participants are in campaign Spring Renewal?"
- "Who is on mailing list Partner News?"

Recommended approach:

1. Resolve the campaign or mailing list.
2. Query `participants` using the matching foreign key.
3. Report counts first, then individual contacts only if requested.
4. If the user needs customer enrichment, resolve the participant contacts back to `contacts` or `accounts`.

## Pattern: Which Mailing Lists Belong To A Campaign

Use this for prompts like:

- "Which mailing lists belong to campaign XYZ?"
- "What sending lists do we use for Spring Renewal?"

Recommended approach:

1. Resolve the campaign.
2. Query `mailinglists` by `campaign`.
3. Report sender, visibility, and assigned owner when helpful.

## Pattern: Who Received The Latest Mailing

Use this for prompts like:

- "Who received the latest mailing for this campaign?"
- "Show recipients of the newest Partner News mailing."

Recommended approach:

1. Resolve the campaign, then the mailing list.
2. Query `messages` for that mailing list, usually with the most recent `date` or `senddate`.
3. Query `mailingrecipients` for the selected message.
4. Join back to `participants` to report recipient names and emails.
5. Keep drafts separate from sent mailings.

## Pattern: Participants With No Outbound Mailing Yet

Use this for prompts like:

- "Which participants still have no outbound mailing?"
- "Who is on this campaign but has not been contacted yet?"

Recommended approach:

1. Resolve the campaign or mailing list.
2. Query all `participants`.
3. Query all related messages and their `mailingrecipients`.
4. Compare the participant set against the recipient set client-side.
5. Report unmatched participants as "no recorded mailing recipient yet", not as "not contacted" if drafts or off-platform sends may exist.

## Common Failure Modes

- Treating campaign membership as proof of email delivery.
- Ignoring the mailing-list layer and jumping straight from campaign to messages.
- Mixing inbox thread analysis with campaign mailings.
- Overstating read-tracking precision from `messagereads`.
