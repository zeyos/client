# Mail Operations Workflows

## Mailbox Values

- `0` = inbox
- `1` = drafts
- `2` = sent
- `3` = templates
- `4` = mailings
- `5` = archive
- `6` = trash
- `7` = junk

## Key Constraint

The documented `messages` schema does not expose a direct `account` foreign key. Customer mail questions usually require one of these paths:

- resolve customer email addresses and match `sender_email` / `to_email`
- resolve linked tickets or opportunities and match `message.ticket` / `message.opportunity`

Mailing-list and campaign questions are different:

- `messages.mailinglist` links a message to a mailing list
- `mailingrecipients` links that message to `participants`
- deeper outreach analysis belongs in `zeyos-campaign-and-outreach`

## Pattern: Summarize Recent Mail From A Customer

Use this for prompts like:

- "Give me a summary of all recent mails from customer XYZ."
- "What has Acme sent us this week?"

Recommended approach:

1. Resolve the customer account.
2. Resolve related contacts and likely email addresses.
3. Query recent messages where `sender_email` or `to_email` matches those addresses.
4. Sort by descending `date`.
5. Pull `text` only for the matched subset you need to summarize.
6. Group by thread using `reference`, `messageid`, and subject.

Client example:

```js
const recentMessages = await client.api.listMessages({
  fields: ['ID', 'date', 'mailbox', 'subject', 'sender_email', 'to_email', 'ticket', 'reference', 'messageid', 'text'],
  filters: {
    sender_email: customerEmail,
    date: { '>': cutoff },
  },
  sort: ['-date'],
  limit: 100,
});
```

If more than one customer email exists, run one query per address or build a composite filter group.

## Pattern: Reconstruct A Thread

Use this for prompts like:

- "Show me the conversation behind ticket 812."
- "What happened in this email thread?"

Recommended approach:

1. Query messages linked to the ticket or opportunity if you have that ID.
2. Sort by ascending `date` for reading order.
3. Use `reference` and `messageid` to confirm direct reply relationships.
4. Use subject matching only as a fallback.

CLI example:

```bash
zeyos list messages \
  --fields ID,date,mailbox,subject,sender_email,to_email,ticket,reference,messageid \
  --filter '{"ticket":812}' \
  --sort +date \
  --limit 100 \
  --json
```

## Pattern: Find Unanswered Customer Mail

Use this for prompts like:

- "Which open tickets have unanswered customer emails?"
- "Show inbox messages from customers that still need a reply."

Recommended approach:

1. Start from recent inbox messages (`mailbox = 0`).
2. Limit to customer identities you can resolve through contacts or linked tickets.
3. Group by thread using `reference`, `messageid`, and subject.
4. Look for a later sent message (`mailbox = 2`) in the same thread. The strongest match is `sent.reference == inbound.ID`; subject matching is only a fallback.
5. Report unresolved threads and their linked tickets if available.

For an operational count, use this exact definition unless the user specifies another one: inbox message (`mailbox = 0`) linked to an open ticket, with no later sent message (`mailbox = 2`) whose `reference` points back to that inbound message.

Fast path for "how many inbox messages on open tickets are still unanswered":

1. If the prompt already states mailbox values and closed ticket statuses, skip schema
   discovery. Do not use `notin`; open tickets are status `IN [0,1,2,3,4,5,6,7,11]`
   with `visibility:0`.
   Use the CLI commands below directly; do not write a scratch JavaScript client script
   for this count because the CLI normalizes array filters to the API's native `IN`
   operator.
2. Query open ticket IDs once:
   `zeyos list tickets --fields ID,status --filter '{"visibility":0,"status":[0,1,2,3,4,5,6,7,11]}' --limit 10000 --json`
3. Query inbox and sent messages for those ticket IDs using batched `ticket:[ids]`:
   `zeyos list messages --fields ID,ticket,reference,date --filter '{"mailbox":0,"ticket":[<ticketIds>]}' --limit 10000 --json`
   `zeyos list messages --fields ID,ticket,reference,date --filter '{"mailbox":2,"ticket":[<ticketIds>]}' --limit 10000 --json`
4. Count inbound rows where no sent row has the same `ticket`, `reference == inbound.ID`,
   and `sent.date >= inbound.date`. Do not run a separate `zeyos count messages` after
   listing the rows; the join logic, not the raw inbox count, is the answer.

For this operational count, do not select `messageid`; `ID`, `ticket`, `reference`, and
`date` are sufficient, and some instances reject `messageid` in list field selection.

## Pattern: Draft A Reply

Use this for prompts like:

- "Draft a response to the latest mail from customer XYZ."
- "Prepare an answer but do not send it."

Recommended approach:

1. Summarize the relevant thread first.
2. Extract the action items, commitments, and unresolved questions.
3. Draft reply text separately from any ZeyOS mutation.
4. Create or update a draft message only if the user explicitly asks for a real ZeyOS draft and the required sender/mailserver context is known.

Important caveat:

- Creating a real draft may require more than subject and body. Inspect an existing draft or the instance-specific sending setup before writing message records.
- Do not set `messageid` when creating test/draft messages; the API may reject it even though list/get responses can expose the field.
- Never send email just because a user asked for a summary or a draft.
- In agent protocol tests, "draft" means text output only. Do not call `createMessage`, `updateMessage`, or any send/dispatch path unless the scenario explicitly asks for a real draft record.

## Common Failure Modes

- Matching only on subject can merge unrelated threads.
- Matching only on company name misses messages from individual contacts.
- Messages may be linked to tickets or opportunities but not directly to accounts.
- Campaign mailings run through `mailinglists` and `mailingrecipients`, which is a different workflow from inbox thread analysis.
