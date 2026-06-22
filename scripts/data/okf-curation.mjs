// Curated OKF content — the single canonical home for ZeyOS business knowledge
// that is NOT mechanically derivable from the specs. Entity purposes are lifted
// from agents/shared/zeyos-entity-reference.md; metric/playbook/concept seeds
// from agents/**/references/workflows.md and project memory. generate-okf.mjs
// uses ENTITY_META for entity frontmatter + curated-note seeds, and seeds the
// metrics/playbooks/concepts docs from the arrays below (seed-if-absent: once a
// doc exists it is owned by humans/the refiner and is not overwritten).

// ── Per-entity curation (purpose → description; cluster → tag; optional note) ──
export const ENTITY_META = {
  // CRM, customer, relationship
  accounts: { description: 'Customer, supplier, prospect, or employee master records.', tags: ['crm'], note: 'No `name` column — use `lastname` + `firstname`. `type`: 0=PROSPECT,1=CUSTOMER,2=SUPPLIER,3=CUSTOMERANDSUPPLIER,4=COMPETITOR,5=EMPLOYEE. `createAccount` REQUIRES `currency` (NOT NULL, no default) or it 500s.' },
  contacts: { description: 'People linked to accounts.', tags: ['crm'] },
  addresses: { description: 'Additional address records linked to accounts or contacts.', tags: ['crm'] },
  contacts2contacts: { description: 'Contact-to-contact relationships.', tags: ['crm'] },
  opportunities: { description: 'Sales pipeline and deal records.', tags: ['crm'] },
  campaigns: { description: 'Marketing or outreach campaigns.', tags: ['outreach'] },
  contracts: { description: 'Long-lived commercial agreements.', tags: ['crm'] },
  participants: { description: 'Contacts enrolled in campaigns or mailing lists.', tags: ['outreach'] },
  mailinglists: { description: 'Mailing list definitions.', tags: ['outreach'] },

  // Work, delivery, calendar
  tickets: { description: 'Support or service work items.', tags: ['work'], note: 'Closed = `status` IN [9 (COMPLETED), 11 (BOOKED)]. Filter time windows on the indexed `date` field, not `creationdate`/`lastmodified` (unindexed → HTTP 503). Has a `visibility` column. `priority`: 0=LOWEST…4=HIGHEST.' },
  tasks: { description: 'Actionable delivery work.', tags: ['work'] },
  actionsteps: { description: 'Cross-record follow-up work items with assignee, due date, status, and effort.', tags: ['work'], note: 'Record-bound follow-ups (linked to a task, ticket, or account, with optional transaction). Do not inflate into full project tasks.' },
  projects: { description: 'Top-level initiatives.', tags: ['work'] },
  appointments: { description: 'Calendar appointments.', tags: ['work'] },
  invitations: { description: 'Appointment invitations.', tags: ['work'] },
  events: { description: 'Generic event records attached to entities.', tags: ['collaboration'] },

  // Messaging, knowledge, collaboration
  messages: { description: 'Email and message records.', tags: ['messaging'], note: 'No direct `account` foreign key — link via `ticket`/`opportunity`/`mailinglist`/`reference`, or resolve customer email addresses first. Reconstruct threads via `reference`/`messageid`/`subject`.' },
  mailingrecipients: { description: 'Recipient records for a message.', tags: ['outreach'] },
  messagereads: { description: 'Read-tracking records for messages.', tags: ['messaging'] },
  notes: { description: 'Text-centric internal knowledge items.', tags: ['knowledge'] },
  documents: { description: 'Formal file-like business documents.', tags: ['knowledge'] },
  files: { description: 'Attachments linked to a record or comment.', tags: ['knowledge'] },
  comments: { description: 'Record-linked comments.', tags: ['collaboration'] },
  channels: { description: 'Collaboration or distribution channels.', tags: ['collaboration'] },
  entities2channels: { description: 'Junction between records and channels.', tags: ['collaboration'] },
  follows: { description: 'Follow/watch subscriptions on entities.', tags: ['collaboration'] },
  likes: { description: 'Lightweight positive reactions on records.', tags: ['collaboration'] },
  records: { description: 'Generic feed and discussion records with entity/index references.', tags: ['collaboration'] },

  // Billing, payments, collections
  transactions: { description: 'Billing, procurement, or production business transactions.', tags: ['billing'], note: 'NO `visibility` column — adding `"visibility":0` to a filter 400s. Use `type` 3=billing invoice, 4=billing credit. Use `netamount` for invoiced revenue; sum client-side (no server-side SUM). Use `date` for period reporting.' },
  payments: { description: 'Cash movement records.', tags: ['billing'], note: 'Cash basis. Links to a `transaction` or directly to an `account`. Sum `amount` for cash received.' },
  ledgers: { description: 'Payment ledger definitions.', tags: ['billing'] },
  dunning: { description: 'Collection or dunning notices.', tags: ['collections'], note: 'operationId trap: list via `listDunningNotices` / get via `getDunningNotice` (NOT `listDunning`). A collection-stage object, not the receivable itself.' },
  dunning2transactions: { description: 'Dunning-to-transaction junction.', tags: ['collections'], note: 'operationId: `listDunningToTransactions`.' },

  // Inventory, pricing, commerce
  items: { description: 'Product and service catalog entries.', tags: ['commerce'] },
  categories: { description: 'Category definitions.', tags: ['commerce'], note: 'operationId trap: list op is `listCategorys` (sic); singular ops use `Category`.' },
  components: { description: 'Item-to-item composition records (BOM/kit).', tags: ['commerce'] },
  relateditems: { description: 'Related product links (cross-sell, substitute, accessory).', tags: ['commerce'] },
  stocktransactions: { description: 'Inventory movements.', tags: ['commerce'] },
  storages: { description: 'Inventory storage locations.', tags: ['commerce'] },
  suppliers: { description: 'Supplier-to-item links.', tags: ['commerce'] },
  pricelists: { description: 'Price list definitions.', tags: ['commerce'], note: 'operationId: `listPriceLists`.' },
  pricelists2accounts: { description: 'Account-to-price-list assignments.', tags: ['commerce'], note: 'operationId: `listPriceListsToAccounts`.' },
  prices: { description: 'Item prices within a price list.', tags: ['commerce'] },
  coupons: { description: 'Coupon definitions.', tags: ['commerce'] },
  couponcodes: { description: 'Codes under a coupon definition.', tags: ['commerce'] },

  // Platform, extensibility, admin, dev
  users: { description: 'System users.', tags: ['platform'], note: 'Resolve assignees/ownership here; user names may not match contact names.' },
  groups: { description: 'User groups.', tags: ['platform'] },
  groups2users: { description: 'Group membership junction.', tags: ['platform'], note: 'Read-only; operationId `listGroupsToUsers`.' },
  permissions: { description: 'Group-level permission grants.', tags: ['platform'] },
  applications: { description: 'Application definitions.', tags: ['platform'] },
  applicationassets: { description: 'Assets linked to an application.', tags: ['platform'] },
  resources: { description: 'Named resources linked to an application or standalone.', tags: ['platform'] },
  services: { description: 'Hook, timing, or remote-call services.', tags: ['platform'] },
  weblets: { description: 'UI modules with view/type metadata.', tags: ['platform'] },
  forks: { description: 'Module/fork definitions with identifiers and module names.', tags: ['platform'] },
  customfields: { description: 'Custom field definitions.', tags: ['platform'] },
  objects: { description: 'Custom object records with arbitrary JSON payloads.', tags: ['platform'] },
  links: { description: 'Link records with name and description.', tags: ['platform'] },
  davservers: { description: 'DAV (calendar/contact sync) server definitions.', tags: ['platform'], note: 'operationId: `listDAVServers`.' },
  feedservers: { description: 'Feed server definitions.', tags: ['platform'] },
  binfiles: { description: 'Binary file storage records.', tags: ['platform'], note: 'List-only: `listBinFiles`.' },
  associations: { description: 'Generic cross-entity relation records with metadata.', tags: ['platform'] },
  devices: { description: 'Inventory device records.', tags: ['platform'] },
  mailservers: { description: 'Mail server definitions.', tags: ['messaging'] }
};

// ── Curated narrative docs (seed-if-absent) ───────────────────────────────────

export const METRICS = [
  {
    id: 'invoiced-net-revenue',
    title: 'Invoiced Net Revenue',
    description: 'Net invoiced revenue from billing invoices over a date window.',
    tags: ['billing', 'revenue'],
    body: `**Definition.** Sum of \`netamount\` over [transactions](/entities/transactions.md) where \`type = 3\` (billing invoice) and \`date\` falls in the window. For *net after credits*, also sum \`type = 4\` (billing credit) and subtract.

**Why \`date\`, not \`lastmodified\`.** \`date\` is the business-effective invoice date; \`lastmodified\` is change tracking. See [dates-unix-seconds](/concepts/dates-unix-seconds.md).

**No server-side SUM.** \`list\` the matching rows (high \`--limit\`, up to 10000) with \`netamount\` and add them up client-side. See [counting-and-sums](/concepts/counting-and-sums.md).

**Do not** add \`"visibility":0\` — \`transactions\` has no such column and it 400s. See [visibility-column](/concepts/visibility-column.md).

Related playbook: [revenue-this-year](/playbooks/revenue-this-year.md).`
  },
  {
    id: 'cash-received',
    title: 'Cash Received',
    description: 'Cash collected (settlement basis) over a date window.',
    tags: ['billing', 'payments'],
    body: `**Definition.** Sum of \`amount\` over [payments](/entities/payments.md) with \`date\` in the window. This is cash basis — distinct from [invoiced-net-revenue](/metrics/invoiced-net-revenue.md) (accrual/billed basis).

Separate direct account payments from transaction-linked payments if the answer needs it. Sum client-side; there is no server-side SUM.`
  },
  {
    id: 'open-customers',
    title: 'Open Customers',
    description: 'Count of active customer accounts.',
    tags: ['crm'],
    body: `**Definition.** Count of [accounts](/entities/accounts.md) where \`type = 1\` (CUSTOMER), excluding archived (\`visibility = 0\`).

\`\`\`bash
zeyos count accounts --filter '{"type":1,"visibility":0}'
\`\`\`

Count server-side (\`count\`), never \`list\` + row length. See [counting-and-sums](/concepts/counting-and-sums.md). State the definition you used ("customer = type 1, excluding archived").`
  },
  {
    id: 'overdue-receivables',
    title: 'Overdue Receivables',
    description: 'Receivables in collection, via dunning — not from transactions alone.',
    tags: ['collections'],
    body: `**Definition.** Overdue/in-collection exposure is tracked through [dunning](/entities/dunning.md) notices and the [dunning2transactions](/entities/dunning2transactions.md) junction, not inferred from [transactions](/entities/transactions.md) alone.

**operationId trap.** Use \`listDunningNotices\` / \`getDunningNotice\` and \`listDunningToTransactions\`. See [operationid-vocabulary](/concepts/operationid-vocabulary.md).

Separate invoice exposure (the receivable) from collection stage and next action.`
  }
];

export const PLAYBOOKS = [
  {
    id: 'revenue-this-year',
    title: 'Revenue This Year',
    description: 'Answer "what have we invoiced/collected this year?" end to end.',
    tags: ['billing'],
    body: `1. Decide invoiced revenue vs cash received. If unspecified, state you are using invoiced net revenue ([invoiced-net-revenue](/metrics/invoiced-net-revenue.md)).
2. Normalize the window to Unix **seconds** (e.g. 2026-01-01 = 1767225600). See [dates-unix-seconds](/concepts/dates-unix-seconds.md).
3. \`list\` billing invoices ([transactions](/entities/transactions.md) \`type = 3\`) in the window with \`netamount\`; high \`--limit\`.
4. If net-after-credits, \`list\` \`type = 4\` and subtract.
5. Sum client-side and report the figure (do not describe the plan — run it).

\`\`\`bash
zeyos list transactions \\
  --filter '{"type":3,"date":{">=":1767225600,"<":1798761600}}' \\
  --fields ID,transactionnum,date,netamount --limit 10000 --json \\
  | python3 -c 'import sys,json; r=json.load(sys.stdin); print(sum(x.get("netamount",0) for x in r.get("data",r)))'
\`\`\``
  },
  {
    id: 'customer-360',
    title: 'Customer 360',
    description: 'Assemble a cross-domain summary for one customer.',
    tags: ['crm'],
    body: `1. Resolve the account first ([accounts](/entities/accounts.md) by \`customernum\`/\`lastname\`).
2. Open work: [tickets](/entities/tickets.md) for the account.
3. Billing: [transactions](/entities/transactions.md) (invoices/credits) and [payments](/entities/payments.md).
4. Mail: resolve [contacts](/entities/contacts.md) email, then [messages](/entities/messages.md) (no direct account FK — see the entity note).
5. Present facts and inference separately; state interpretations.`
  },
  {
    id: 'ticket-work-packet',
    title: 'Ticket Work Packet',
    description: 'Trace a ticket down to its tasks and follow-ups.',
    tags: ['work'],
    body: `1. Resolve the [ticket](/entities/tickets.md) (\`ticketnum\`/\`name\`).
2. [tasks](/entities/tasks.md) where \`ticket\` = that ID (use the \`filters\` form for the FK — see [filters-vs-filter](/concepts/filters-vs-filter.md)).
3. [actionsteps](/entities/actionsteps.md) bound to the ticket/its tasks for smaller follow-ups.
4. Summarize open vs closed (closed ticket = \`status\` IN [9, 11]).`
  }
];

export const CONCEPTS = [
  {
    id: 'filters-vs-filter',
    title: 'filters vs filter (the FK/GIN footgun)',
    description: 'Use `filters` (plural) so foreign-key fields match via their GIN/partial indexes.',
    tags: ['query'],
    body: `The OpenAPI spec documents the list body field as \`filter\` (singular), but **\`filters\` (plural)** is what reliably matches GIN-indexed / partial-indexed foreign-key fields (\`account\`, \`project\`, \`ticket\` on related resources).

- \`@zeyos/client\`: use \`filters\`.
- \`zeyos\` CLI: pass \`--filter '{…}'\` — it serializes to \`filters\` internally.
- Raw REST: the spec says \`filter\`; verify against the target instance.

\`client.schema.validate()\` flags a top-level \`filter\` on list/count ops and suggests \`filters\`. Only filter on columns the resource actually has — an unknown column 400s with no hint which field was wrong (run \`zeyos describe <resource>\` first).`
  },
  {
    id: 'visibility-column',
    title: 'visibility: 0 (only where the column exists)',
    description: 'visibility:0 hides archived rows — but only resources that have the column.',
    tags: ['query'],
    body: `\`visibility = 0\` excludes archived/deleted rows, but **only some resources have a \`visibility\` column**:

- Have it: [tickets](/entities/tickets.md), [accounts](/entities/accounts.md), [items](/entities/items.md).
- Do **not** have it: [transactions](/entities/transactions.md) — adding \`"visibility":0\` there returns an opaque **HTTP 400**.

More generally, filtering on any column a resource lacks 400s with no field name. Include \`visibility:0\` on resources that have it unless the user wants archived records; \`zeyos describe <resource>\` tells you whether the column exists.`
  },
  {
    id: 'dates-unix-seconds',
    title: 'Dates are Unix seconds',
    description: 'All ZeyOS timestamps are Unix seconds; pick the indexed date field.',
    tags: ['query'],
    body: `All ZeyOS dates are Unix timestamps in **seconds** (not milliseconds).

- \`date\` — business-effective date (invoice date, message date). Use for period reporting. Indexed.
- \`lastmodified\` — recent-change tracking.
- \`creationdate\` — often **unindexed**; filtering a time window on it (or other unindexed date columns) can return **HTTP 503**. Prefer the indexed \`date\` field for windows.`
  },
  {
    id: 'operationid-vocabulary',
    title: 'operationId ≠ table noun',
    description: 'REST operationIds are CamelCase compounds; several diverge from the dbref noun.',
    tags: ['query'],
    body: `The dbref table noun (also the REST URL path segment) is **not** the \`@zeyos/client\` operationId. Most follow \`list<Plural>\`/\`get<Singular>\`/… but several diverge:

- \`dunning\` → \`listDunningNotices\` / \`getDunningNotice\`
- \`dunning2transactions\` → \`listDunningToTransactions\`
- \`pricelists\` → \`listPriceLists\`; \`pricelists2accounts\` → \`listPriceListsToAccounts\`
- \`mailinglists\` → \`listMailingLists\`; \`actionsteps\` → \`listActionSteps\`
- \`categories\` → \`listCategorys\` (sic) but \`getCategory\`
- \`davservers\` → \`listDAVServers\`; \`binfiles\` → \`listBinFiles\` (list-only)

Each entity concept's **Operations** section lists its real operationIds (read straight from \`api.json\`). \`client.schema.validate()\` suggests the closest operationId for an unknown name.`
  },
  {
    id: 'enums',
    title: 'Common enums',
    description: 'Priority and ticket status enum values.',
    tags: ['reference'],
    body: `Each entity concept's **Enums** section carries that entity's enums (parsed from the schema). The most-used:

**Priority** (tickets/tasks): \`0\`=LOWEST, \`1\`=LOW, \`2\`=MEDIUM, \`3\`=HIGH, \`4\`=HIGHEST.

**Ticket status**: \`0\`=NOT_STARTED, \`1\`=AWAITING_ACCEPTANCE, \`2\`=ACCEPTED, \`3\`=REJECTED, \`4\`=ACTIVE, \`5\`=INACTIVE, \`6\`=FEEDBACK_REQUIRED, \`7\`=TESTING, \`8\`=CANCELLED, \`9\`=COMPLETED, \`10\`=FAILED, \`11\`=BOOKED. Closed = IN [9, 11].

**Account type**: \`0\`=PROSPECT, \`1\`=CUSTOMER, \`2\`=SUPPLIER, \`3\`=CUSTOMERANDSUPPLIER, \`4\`=COMPETITOR, \`5\`=EMPLOYEE.`
  },
  {
    id: 'counting-and-sums',
    title: 'Counting and summing',
    description: 'Count server-side; there is no server-side SUM.',
    tags: ['query'],
    body: `**Counts.** Use \`zeyos count <resource>\` (CLI) or \`count: true\` on the list call (client). Never \`list\` + array length: \`zeyos list\` defaults to \`--limit 50\`, so you get the page size, not the total (the only \`--json\` truncation signal is a stderr "Showing X–Y of TOTAL" hint).

**Sums.** There is no server-side SUM. \`list\` the matching rows with the numeric field at a high \`--limit\` (up to 10000) and add them up client-side.`
  }
];
