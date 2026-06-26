# ZeyOS Entity Reference For Agents

This file is optimized for coding agents. It is derived from:

- [../../openapi/dbref.json](../../openapi/dbref.json)
- [../../openapi/api.json](../../openapi/api.json)

Current source snapshot:

- `dbref.json`: 357 entities total
- `dbref.json`: 312 tables and 45 views
- `api.json`: 64 listable API resources under the public REST surface
- `api.json`: `config` and `settings` are API endpoints, but not `dbref.json` entities

Use this file when you need to understand what an entity is for before building a query plan.

> **Canonical schema lives in the OKF bundle.** Per-entity columns, types, enums, foreign keys,
> indexes (incl. the GIN/partial indexes behind the `filters` footgun), and operationIds are
> generated into [`okf/entities/`](../../okf/entities/index.md) from the specs, and cross-cutting
> rules into [`okf/concepts/`](../../okf/concepts/index.md). This reference keeps the curated
> narrative (entity families, query priorities, use-case clusters); the operationId table below is
> generated from the same source. When schema facts here and in `okf/` ever disagree, `okf/` wins.

## Source Note: `filter` vs `filters`

Do not treat the spelling as universally settled.

- `openapi/api.json` documents the list request body field as `filter`.
- The repo CLI accepts `--filter` but serializes the JSON into `body.filters`.
- The repo client examples consistently use `filters`.

Agent rule:

- For `@zeyos/client`, follow repo convention and use `filters`.
- For CLI, use the documented `--filter` flag.
- For raw REST/OpenAPI examples, mention that the spec documents `filter` and verify behavior against the target instance before hardcoding one spelling as universally correct.

## Entity Noun to REST operationId

The DB-table noun (from `dbref.json`, also the REST URL path segment) is **not** the
operationId. The `@zeyos/client` methods and the names you reason about are CamelCase
compound operationIds, and several diverge from a naive "capitalize + pluralize the noun".

**Agent rule: when calling `@zeyos/client` (`client.api.<operationId>(...)`), use the
operationIds below, not the raw `dbref.json` table noun.** Building
`client.api.listDunning(...)` from the noun will fail with "operation not found". The CLI
accepts curated resource aliases for common divergent nouns, including
`zeyos count/list dunning` and `zeyos list dunning2transactions`.

### The regular rule (most entities)

For most entities the operationIds follow this pattern, where `<Plural>` is the CamelCase plural
and `<Singular>` is the CamelCase singular:

- `list<Plural>`, `get<Singular>`, `create<Singular>`, `update<Singular>`, `delete<Singular>`, `exists<Singular>`

Example (`accounts`): `listAccounts`, `getAccount`, `createAccount`, `updateAccount`, `deleteAccount`, `existsAccount`.

Entities that follow the regular rule directly (lowercase noun, single English word): `accounts`,
`addresses`, `applications`*, `appointments`, `associations`, `campaigns`, `channels`, `comments`,
`components`, `contacts`, `contracts`, `coupons`, `devices`, `documents`, `events`, `files`,
`follows`, `forks`*, `groups`*, `invitations`, `items`, `ledgers`, `likes`, `links`, `messages`,
`notes`, `objects`, `opportunities`, `participants`, `payments`, `permissions`*, `prices`,
`projects`, `records`, `resources`*, `services`*, `storages`, `suppliers`, `tasks`, `tickets`,
`transactions`, `users`*, `weblets`*.

`*` = read-only entity: only `list*`, `get*`, and `exists*` exist (no create/update/delete).

### The authoritative table (generated from `openapi/api.json`)

The full `list`/`get`/`create`/`update`/`delete`/`exists` operationId for **every** API-backed
entity is generated below and kept in sync with the specs by `scripts/generate-okf.mjs`. The
tricky cases all appear with their real operationIds: junction tables (`X2Y` → `XToY`, often
re-pluralizing the left side), renamed entities (`dunning` → `DunningNotice`), compounds that
keep internal capitalization (`MailingLists`, not `Mailinglists`), and quirks like `listCategorys`
(sic) or the plural `existsMailingRecipients`. A `—` means the operation does not exist
(read-only or list-only entity). Per-entity schema, enums, and foreign keys live in the matching
[`okf/entities/<name>.md`](../../okf/entities/index.md) concept, which is the canonical source.

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
| Entity | Concept | list | get | create | update | delete | exists |
|---|---|---|---|---|---|---|---|
| `accounts` | [↗](../../okf/entities/accounts.md) | `listAccounts` | `getAccount` | `createAccount` | `updateAccount` | `deleteAccount` | `existsAccount` |
| `actionsteps` | [↗](../../okf/entities/actionsteps.md) | `listActionSteps` | `getActionStep` | `createActionStep` | `updateActionStep` | `deleteActionStep` | `existsActionStep` |
| `addresses` | [↗](../../okf/entities/addresses.md) | `listAddresses` | `getAddress` | `createAddress` | `updateAddress` | `deleteAddress` | `existsAddress` |
| `applicationassets` | [↗](../../okf/entities/applicationassets.md) | `listApplicationAssets` | `getApplicationAsset` | — | — | — | `existsApplicationAsset` |
| `applications` | [↗](../../okf/entities/applications.md) | `listApplications` | `getApplication` | — | — | — | `existsApplication` |
| `appointments` | [↗](../../okf/entities/appointments.md) | `listAppointments` | `getAppointment` | `createAppointment` | `updateAppointment` | `deleteAppointment` | `existsAppointment` |
| `associations` | [↗](../../okf/entities/associations.md) | `listAssociations` | `getAssociation` | `createAssociation` | `updateAssociation` | `deleteAssociation` | `existsAssociation` |
| `binfiles` | [↗](../../okf/entities/binfiles.md) | `listBinFiles` | — | — | — | — | — |
| `campaigns` | [↗](../../okf/entities/campaigns.md) | `listCampaigns` | `getCampaign` | `createCampaign` | `updateCampaign` | `deleteCampaign` | `existsCampaign` |
| `categories` | [↗](../../okf/entities/categories.md) | `listCategorys` | `getCategory` | `createCategory` | `updateCategory` | `deleteCategory` | `existsCategory` |
| `channels` | [↗](../../okf/entities/channels.md) | `listChannels` | `getChannel` | `createChannel` | `updateChannel` | `deleteChannel` | `existsChannel` |
| `comments` | [↗](../../okf/entities/comments.md) | `listComments` | `getComment` | `createComment` | `updateComment` | `deleteComment` | `existsComment` |
| `components` | [↗](../../okf/entities/components.md) | `listComponents` | `getComponent` | `createComponent` | `updateComponent` | `deleteComponent` | `existsComponent` |
| `contacts` | [↗](../../okf/entities/contacts.md) | `listContacts` | `getContact` | `createContact` | `updateContact` | `deleteContact` | `existsContact` |
| `contacts2contacts` | [↗](../../okf/entities/contacts2contacts.md) | `listContactsToContacts` | `getContactToContact` | `createContactToContact` | `updateContactToContact` | `deleteContactToContact` | `existsContactToContact` |
| `contracts` | [↗](../../okf/entities/contracts.md) | `listContracts` | `getContract` | `createContract` | `updateContract` | `deleteContract` | `existsContract` |
| `couponcodes` | [↗](../../okf/entities/couponcodes.md) | `listCouponCodes` | `getCouponCode` | `createCouponCode` | `updateCouponCode` | `deleteCouponCode` | `existsCouponCode` |
| `coupons` | [↗](../../okf/entities/coupons.md) | `listCoupons` | `getCoupon` | `createCoupon` | `updateCoupon` | `deleteCoupon` | `existsCoupon` |
| `customfields` | [↗](../../okf/entities/customfields.md) | `listCustomFields` | `getCustomField` | — | — | — | `existsCustomField` |
| `davservers` | [↗](../../okf/entities/davservers.md) | `listDAVServers` | `getDAVServer` | `createDAVServer` | `updateDAVServer` | `deleteDAVServer` | `existsDAVServer` |
| `devices` | [↗](../../okf/entities/devices.md) | `listDevices` | `getDevice` | `createDevice` | `updateDevice` | `deleteDevice` | `existsDevice` |
| `documents` | [↗](../../okf/entities/documents.md) | `listDocuments` | `getDocument` | `createDocument` | `updateDocument` | `deleteDocument` | `existsDocument` |
| `dunning` | [↗](../../okf/entities/dunning.md) | `listDunningNotices` | `getDunningNotice` | `createDunningNotice` | `updateDunningNotice` | `deleteDunningNotice` | `existsDunningNotice` |
| `dunning2transactions` | [↗](../../okf/entities/dunning2transactions.md) | `listDunningToTransactions` | `getDunningToTransaction` | `createDunningToTransaction` | `updateDunningToTransaction` | `deleteDunningToTransaction` | `existsDunningToTransaction` |
| `entities2channels` | [↗](../../okf/entities/entities2channels.md) | `listEntitiesToChannels` | `getEntityToChannel` | `createEntityToChannel` | `updateEntityToChannel` | `deleteEntityToChannel` | `existsEntityToChannel` |
| `events` | [↗](../../okf/entities/events.md) | `listEvents` | `getEvent` | `createEvent` | `updateEvent` | `deleteEvent` | `existsEvent` |
| `feedservers` | [↗](../../okf/entities/feedservers.md) | `listFeedServers` | `getFeedServer` | `createFeedServer` | `updateFeedServer` | `deleteFeedServer` | `existsFeedServer` |
| `files` | [↗](../../okf/entities/files.md) | `listFiles` | `getFile` | `createFile` | `updateFile` | `deleteFile` | `existsFile` |
| `follows` | [↗](../../okf/entities/follows.md) | `listFollows` | `getFollow` | `createFollow` | `updateFollow` | `deleteFollow` | `existsFollow` |
| `forks` | [↗](../../okf/entities/forks.md) | `listForks` | `getFork` | — | — | — | `existsFork` |
| `groups` | [↗](../../okf/entities/groups.md) | `listGroups` | `getGroup` | — | — | — | `existsGroup` |
| `groups2users` | [↗](../../okf/entities/groups2users.md) | `listGroupsToUsers` | `getGroupToUser` | — | — | — | `existsGroupToUser` |
| `invitations` | [↗](../../okf/entities/invitations.md) | `listInvitations` | `getInvitation` | `createInvitation` | `updateInvitation` | `deleteInvitation` | `existsInvitation` |
| `items` | [↗](../../okf/entities/items.md) | `listItems` | `getItem` | `createItem` | `updateItem` | `deleteItem` | `existsItem` |
| `ledgers` | [↗](../../okf/entities/ledgers.md) | `listLedgers` | `getLedger` | `createLedger` | `updateLedger` | `deleteLedger` | `existsLedger` |
| `likes` | [↗](../../okf/entities/likes.md) | `listLikes` | `getLike` | `createLike` | `updateLike` | `deleteLike` | `existsLike` |
| `links` | [↗](../../okf/entities/links.md) | `listLinks` | `getLink` | `createLink` | `updateLink` | `deleteLink` | `existsLink` |
| `mailinglists` | [↗](../../okf/entities/mailinglists.md) | `listMailingLists` | `getMailingList` | `createMailingList` | `updateMailingList` | `deleteMailingList` | `existsMailingList` |
| `mailingrecipients` | [↗](../../okf/entities/mailingrecipients.md) | `listMailingRecipients` | `getMailingRecipient` | `createMailingRecipient` | `updateMailingRecipient` | `deleteMailingRecipient` | `existsMailingRecipients` |
| `mailservers` | [↗](../../okf/entities/mailservers.md) | `listMailServers` | `getMailServer` | `createMailServer` | `updateMailServer` | `deleteMailServer` | `existsMailServer` |
| `messagereads` | [↗](../../okf/entities/messagereads.md) | `listMessageReads` | `getMessageRead` | `createMessageRead` | `updateMessageRead` | `deleteMessageRead` | `existsMessageRead` |
| `messages` | [↗](../../okf/entities/messages.md) | `listMessages` | `getMessage` | `createMessage` | `updateMessage` | `deleteMessage` | `existsMessage` |
| `notes` | [↗](../../okf/entities/notes.md) | `listNotes` | `getNote` | `createNote` | `updateNote` | `deleteNote` | `existsNote` |
| `objects` | [↗](../../okf/entities/objects.md) | `listObjects` | `getObject` | `createObject` | `updateObject` | `deleteObject` | `existsObject` |
| `opportunities` | [↗](../../okf/entities/opportunities.md) | `listOpportunities` | `getOpportunity` | `createOpportunity` | `updateOpportunity` | `deleteOpportunity` | `existsOpportunity` |
| `participants` | [↗](../../okf/entities/participants.md) | `listParticipants` | `getParticipant` | `createParticipant` | `updateParticipant` | `deleteParticipant` | `existsParticipant` |
| `payments` | [↗](../../okf/entities/payments.md) | `listPayments` | `getPayment` | `createPayment` | `updatePayment` | `deletePayment` | `existsPayment` |
| `permissions` | [↗](../../okf/entities/permissions.md) | `listPermissions` | `getPermission` | — | — | — | `existsPermission` |
| `pricelists` | [↗](../../okf/entities/pricelists.md) | `listPriceLists` | `getPriceList` | `createPriceList` | `updatePriceList` | `deletePriceList` | `existsPriceList` |
| `pricelists2accounts` | [↗](../../okf/entities/pricelists2accounts.md) | `listPriceListsToAccounts` | `getPriceListToAccount` | `createPriceListToAccount` | `updatePriceListToAccount` | `deletePriceListToAccount` | `existsPriceListToAccount` |
| `prices` | [↗](../../okf/entities/prices.md) | `listPrices` | `getPrice` | `createPrice` | `updatePrice` | `deletePrice` | `existsPrice` |
| `projects` | [↗](../../okf/entities/projects.md) | `listProjects` | `getProject` | `createProject` | `updateProject` | `deleteProject` | `existsProject` |
| `records` | [↗](../../okf/entities/records.md) | `listRecords` | `getRecord` | `createRecord` | `updateRecord` | `deleteRecord` | `existsRecord` |
| `relateditems` | [↗](../../okf/entities/relateditems.md) | `listRelatedItems` | `getRelatedItem` | `createRelatedItem` | `updateRelatedItem` | `deleteRelatedItem` | `existsRelatedItem` |
| `resources` | [↗](../../okf/entities/resources.md) | `listResources` | `getResource` | — | — | — | `existsResource` |
| `services` | [↗](../../okf/entities/services.md) | `listServices` | `getService` | — | — | — | `existsService` |
| `stocktransactions` | [↗](../../okf/entities/stocktransactions.md) | `listStockTransactions` | `getStockTransaction` | `createStockTransaction` | `updateStockTransaction` | `deleteStockTransaction` | `existsStockTransaction` |
| `storages` | [↗](../../okf/entities/storages.md) | `listStorages` | `getStorage` | `createStorage` | `updateStorage` | `deleteStorage` | `existsStorage` |
| `suppliers` | [↗](../../okf/entities/suppliers.md) | `listSuppliers` | `getSupplier` | `createSupplier` | `updateSupplier` | `deleteSupplier` | `existsSupplier` |
| `tasks` | [↗](../../okf/entities/tasks.md) | `listTasks` | `getTask` | `createTask` | `updateTask` | `deleteTask` | `existsTask` |
| `tickets` | [↗](../../okf/entities/tickets.md) | `listTickets` | `getTicket` | `createTicket` | `updateTicket` | `deleteTicket` | `existsTicket` |
| `transactions` | [↗](../../okf/entities/transactions.md) | `listTransactions` | `getTransaction` | `createTransaction` | `updateTransaction` | `deleteTransaction` | `existsTransaction` |
| `users` | [↗](../../okf/entities/users.md) | `listUsers` | `getUser` | — | — | — | `existsUser` |
| `weblets` | [↗](../../okf/entities/weblets.md) | `listWeblets` | `getWeblet` | — | — | — | `existsWeblet` |
<!-- okf:generated:end -->

When in doubt, read the entity's OKF concept (linked above) or look the operationId up in
`openapi/api.json` rather than constructing it from the noun.

## API-Backed Entities

These are the 64 entities that have direct list endpoints in `api.json`.

### CRM, Customer, and Relationship Entities

| Entity | Purpose | Agent relevance |
|------|---------|-----------------|
| `accounts` | Customer, supplier, prospect, or employee master records | Resolve customers, suppliers, and account-level ownership |
| `contacts` | People linked to accounts | Resolve human contacts and email addresses |
| `addresses` | Additional address records linked to accounts or contacts | Find customer delivery or contact location details |
| `contacts2contacts` | Contact-to-contact relationships | Trace person-to-person links |
| `opportunities` | Sales pipeline and deal records | Revenue forecasting and pre-sales analysis |
| `campaigns` | Marketing or outreach campaigns | Attribution and participant targeting |
| `contracts` | Long-lived commercial agreements | Billing-cycle and subscription-style reasoning |
| `participants` | Contacts enrolled in campaigns or mailing lists | Audience and outreach analysis |
| `mailinglists` | Mailing list definitions | Bulk communication grouping |

### Work, Delivery, and Calendar Entities

| Entity | Purpose | Agent relevance |
|------|---------|-----------------|
| `tickets` | Support or service work items | Backlog, SLA, customer issue tracking |
| `tasks` | Actionable delivery work | Assignee workload and execution detail |
| `actionsteps` | Cross-record follow-up work items with assignee, due date, status, and effort | Track operational next steps below or alongside tasks and tickets |
| `projects` | Top-level initiatives | Initiative state and work grouping |
| `appointments` | Calendar appointments | Meeting and schedule queries |
| `invitations` | Appointment invitations | Attendance and invite state |
| `events` | Generic event records attached to entities | Timeline or activity display |

### Messaging, Knowledge, and Collaboration Entities

| Entity | Purpose | Agent relevance |
|------|---------|-----------------|
| `messages` | Email and message records | Inbox summaries, draft preparation, thread reconstruction |
| `mailingrecipients` | Recipient records for a message | Audit mail recipients beyond the primary `to` field |
| `messagereads` | Read-tracking records for messages | Detect whether users opened a message |
| `notes` | Text-centric internal knowledge items | SOP summaries and operational notes |
| `documents` | Formal file-like business documents | Final SOPs, policies, controlled artifacts |
| `files` | Attachments linked to a record or comment | Attachment lookup and file inventory |
| `comments` | Record-linked comments | Discussion and audit context |
| `channels` | Collaboration or distribution channels | Group records into shared streams; practical business meaning should be confirmed |
| `entities2channels` | Junction between records and channels | Determine which records belong to which channels |
| `follows` | Follow/watch subscriptions on entities | Track who follows a record |
| `likes` | Lightweight positive reactions on records | Lightweight engagement signal |
| `records` | Generic feed and discussion records with entity/index references | Activity, posting, and collaboration wrapper for comments, likes, files, and channels |

### Billing, Payments, and Collections Entities

| Entity | Purpose | Agent relevance |
|------|---------|-----------------|
| `transactions` | Billing, procurement, or production business transactions | Invoice totals, revenue-like metrics, line-item analysis |
| `payments` | Cash movement records | Cash received, settlement, payment history |
| `ledgers` | Payment ledger definitions | Ledger-scoped payment analysis |
| `dunning` | Collection or dunning notices | Overdue collection workflows |
| `dunning2transactions` | Dunning-to-transaction junction | Trace which invoices are part of a dunning process |

### Inventory, Pricing, and Commerce Entities

| Entity | Purpose | Agent relevance |
|------|---------|-----------------|
| `items` | Product and service catalog entries | Price, SKU, and product mix analysis |
| `categories` | Category definitions | Organize items or related commerce objects |
| `components` | Item-to-item composition records | BOM or kit-like breakdowns |
| `relateditems` | Related product links | Cross-sell, substitute, or accessory logic |
| `stocktransactions` | Inventory movements | Stock flow and location history |
| `storages` | Inventory storage locations | Warehouse and storage analysis |
| `suppliers` | Supplier-to-item links | Procurement sourcing and vendor pricing |
| `pricelists` | Price list definitions | Segment or channel pricing |
| `pricelists2accounts` | Account-to-price-list assignments | Determine which pricing applies to a customer |
| `prices` | Item prices within a price list | Effective sell price and discounts |
| `coupons` | Coupon definitions | Promotion logic |
| `couponcodes` | Codes under a coupon definition | Redeemable campaign-style coupon values |

### Platform, Extensibility, Admin, and Dev Entities

| Entity | Purpose | Agent relevance |
|------|---------|-----------------|
| `users` | System users | Resolve assignees and ownership |
| `groups` | User groups | Access control and team grouping |
| `groups2users` | Group membership junction | Resolve team membership |
| `permissions` | Group-level permission grants | Access and authorization analysis |
| `applications` | Application definitions | Dev/admin surface, app inventory |
| `applicationassets` | Assets linked to an application | App packaging and static resources |
| `resources` | Named resources linked to an application or standalone | Dev/admin runtime surface; likely asset/resource registry |
| `services` | Hook, timing, or remote-call services | Automation and lifecycle hook inventory |
| `weblets` | UI modules with view/type metadata | Embedded or detached UI component inventory |
| `forks` | Module/fork definitions with identifiers and module names | Platform modularization and ownership boundaries |
| `customfields` | Custom field definitions | Understand extdata and dynamic schema |
| `objects` | Custom object records with arbitrary JSON payloads | Custom domain data not covered by core entities |
| `links` | Link records with name and description | Generic linkage surface; exact business role should be confirmed |
| `davservers` | DAV server definitions | Calendar/contact sync infrastructure |
| `feedservers` | Feed server definitions | Feed ingestion infrastructure |
| `binfiles` | Binary file storage records | Underlying binary payload access |
| `associations` | Generic cross-entity relation records with metadata | Flexible graph-style linking when typed FKs do not exist |
| `devices` | Inventory device records | Hardware or device inventory tracking |
| `mailservers` | Mail server definitions | Messaging infrastructure and account routing |

## Non-API Entity Families And Helper Structures

These entities exist in `dbref.json` but are not listed as top-level list resources in `api.json`. Agents should understand them as storage helpers, views, metadata, or internal runtime tables.

### Extdata Helper Families

Purpose:

- support indexed custom-field storage
- separate regular, numeric, empty, and zero-like extdata states
- materialize query-friendly views over custom data

Family members are defined for these 40 base entities:

`accounts`, `actionsteps`, `applications`, `appointments`, `campaigns`, `channels`, `contacts`, `contracts`, `couponcodes`, `coupons`, `customfields`, `davservers`, `devices`, `documents`, `dunning`, `feedservers`, `forks`, `groups`, `items`, `ledgers`, `links`, `mailinglists`, `mailservers`, `messages`, `notes`, `objects`, `opportunities`, `participants`, `payments`, `pricelists`, `projects`, `resources`, `services`, `stocktransactions`, `storages`, `tasks`, `tickets`, `transactions`, `users`, `weblets`

Families:

- `extdataempty_*`
- `extdatanumeric_*`
- `extdataregular_*`
- `extdatazero_*`
- `extdatavalues_*`

Exact entity names:

```text
extdataempty_accounts
extdataempty_actionsteps
extdataempty_applications
extdataempty_appointments
extdataempty_campaigns
extdataempty_channels
extdataempty_contacts
extdataempty_contracts
extdataempty_couponcodes
extdataempty_coupons
extdataempty_customfields
extdataempty_davservers
extdataempty_devices
extdataempty_documents
extdataempty_dunning
extdataempty_feedservers
extdataempty_forks
extdataempty_groups
extdataempty_items
extdataempty_ledgers
extdataempty_links
extdataempty_mailinglists
extdataempty_mailservers
extdataempty_messages
extdataempty_notes
extdataempty_objects
extdataempty_opportunities
extdataempty_participants
extdataempty_payments
extdataempty_pricelists
extdataempty_projects
extdataempty_resources
extdataempty_services
extdataempty_stocktransactions
extdataempty_storages
extdataempty_tasks
extdataempty_tickets
extdataempty_transactions
extdataempty_users
extdataempty_weblets
extdatanumeric_accounts
extdatanumeric_actionsteps
extdatanumeric_applications
extdatanumeric_appointments
extdatanumeric_campaigns
extdatanumeric_channels
extdatanumeric_contacts
extdatanumeric_contracts
extdatanumeric_couponcodes
extdatanumeric_coupons
extdatanumeric_customfields
extdatanumeric_davservers
extdatanumeric_devices
extdatanumeric_documents
extdatanumeric_dunning
extdatanumeric_feedservers
extdatanumeric_forks
extdatanumeric_groups
extdatanumeric_items
extdatanumeric_ledgers
extdatanumeric_links
extdatanumeric_mailinglists
extdatanumeric_mailservers
extdatanumeric_messages
extdatanumeric_notes
extdatanumeric_objects
extdatanumeric_opportunities
extdatanumeric_participants
extdatanumeric_payments
extdatanumeric_pricelists
extdatanumeric_projects
extdatanumeric_resources
extdatanumeric_services
extdatanumeric_stocktransactions
extdatanumeric_storages
extdatanumeric_tasks
extdatanumeric_tickets
extdatanumeric_transactions
extdatanumeric_users
extdatanumeric_weblets
extdataregular_accounts
extdataregular_actionsteps
extdataregular_applications
extdataregular_appointments
extdataregular_campaigns
extdataregular_channels
extdataregular_contacts
extdataregular_contracts
extdataregular_couponcodes
extdataregular_coupons
extdataregular_customfields
extdataregular_davservers
extdataregular_devices
extdataregular_documents
extdataregular_dunning
extdataregular_feedservers
extdataregular_forks
extdataregular_groups
extdataregular_items
extdataregular_ledgers
extdataregular_links
extdataregular_mailinglists
extdataregular_mailservers
extdataregular_messages
extdataregular_notes
extdataregular_objects
extdataregular_opportunities
extdataregular_participants
extdataregular_payments
extdataregular_pricelists
extdataregular_projects
extdataregular_resources
extdataregular_services
extdataregular_stocktransactions
extdataregular_storages
extdataregular_tasks
extdataregular_tickets
extdataregular_transactions
extdataregular_users
extdataregular_weblets
extdatavalues_accounts
extdatavalues_actionsteps
extdatavalues_applications
extdatavalues_appointments
extdatavalues_campaigns
extdatavalues_channels
extdatavalues_contacts
extdatavalues_contracts
extdatavalues_couponcodes
extdatavalues_coupons
extdatavalues_customfields
extdatavalues_davservers
extdatavalues_devices
extdatavalues_documents
extdatavalues_dunning
extdatavalues_feedservers
extdatavalues_forks
extdatavalues_groups
extdatavalues_items
extdatavalues_ledgers
extdatavalues_links
extdatavalues_mailinglists
extdatavalues_mailservers
extdatavalues_messages
extdatavalues_notes
extdatavalues_objects
extdatavalues_opportunities
extdatavalues_participants
extdatavalues_payments
extdatavalues_pricelists
extdatavalues_projects
extdatavalues_resources
extdatavalues_services
extdatavalues_stocktransactions
extdatavalues_storages
extdatavalues_tasks
extdatavalues_tickets
extdatavalues_transactions
extdatavalues_users
extdatavalues_weblets
extdatazero_accounts
extdatazero_actionsteps
extdatazero_applications
extdatazero_appointments
extdatazero_campaigns
extdatazero_channels
extdatazero_contacts
extdatazero_contracts
extdatazero_couponcodes
extdatazero_coupons
extdatazero_customfields
extdatazero_davservers
extdatazero_devices
extdatazero_documents
extdatazero_dunning
extdatazero_feedservers
extdatazero_forks
extdatazero_groups
extdatazero_items
extdatazero_ledgers
extdatazero_links
extdatazero_mailinglists
extdatazero_mailservers
extdatazero_messages
extdatazero_notes
extdatazero_objects
extdatazero_opportunities
extdatazero_participants
extdatazero_payments
extdatazero_pricelists
extdatazero_projects
extdatazero_resources
extdatazero_services
extdatazero_stocktransactions
extdatazero_storages
extdatazero_tasks
extdatazero_tickets
extdatazero_transactions
extdatazero_users
extdatazero_weblets
```

Global extdata support objects:

- `extdata`
- `extdatafields`
- `extdatavalues`

### Tagging Structures

Purpose:

- provide global tag names and per-entity tag assignments

Global objects:

- `tagnames`
- `tags`
- `tagrels`

Per-entity tag relation tables exist for these 37 base entities:

`accounts`, `actionsteps`, `applications`, `appointments`, `campaigns`, `channels`, `contacts`, `contracts`, `coupons`, `customfields`, `davservers`, `devices`, `documents`, `dunning`, `feedservers`, `forks`, `groups`, `items`, `ledgers`, `links`, `mailinglists`, `mailservers`, `messages`, `notes`, `objects`, `opportunities`, `payments`, `pricelists`, `projects`, `resources`, `services`, `storages`, `tasks`, `tickets`, `transactions`, `users`, `weblets`

Exact entity names:

```text
tagrels_accounts
tagrels_actionsteps
tagrels_applications
tagrels_appointments
tagrels_campaigns
tagrels_channels
tagrels_contacts
tagrels_contracts
tagrels_coupons
tagrels_customfields
tagrels_davservers
tagrels_devices
tagrels_documents
tagrels_dunning
tagrels_feedservers
tagrels_forks
tagrels_groups
tagrels_items
tagrels_ledgers
tagrels_links
tagrels_mailinglists
tagrels_mailservers
tagrels_messages
tagrels_notes
tagrels_objects
tagrels_opportunities
tagrels_payments
tagrels_pricelists
tagrels_projects
tagrels_resources
tagrels_services
tagrels_storages
tagrels_tasks
tagrels_tickets
tagrels_transactions
tagrels_users
tagrels_weblets
```

### Static Metadata Tables

Purpose:

- provide reference dictionaries for geography, currencies, languages, taxonomies, modules, time zones, and units

Entities:

`meta_cities`, `meta_countries`, `meta_countries_borders`, `meta_countries_languages`, `meta_countries_names`, `meta_currencies`, `meta_currencies_names`, `meta_languages`, `meta_languages_names`, `meta_modules`, `meta_modules_names`, `meta_postalcodes`, `meta_regions`, `meta_regions_names`, `meta_states`, `meta_subregions`, `meta_subregions_names`, `meta_taxonomy_cn`, `meta_taxonomy_cn_names`, `meta_taxonomy_cpv`, `meta_taxonomy_cpv_names`, `meta_taxonomy_google`, `meta_taxonomy_google_names`, `meta_taxonomy_gpc`, `meta_taxonomy_gpc_names`, `meta_taxonomy_hts`, `meta_taxonomy_hts_names`, `meta_taxonomy_unspsc`, `meta_taxonomy_unspsc_names`, `meta_timezones`, `meta_timezones_offsets`, `meta_tlds`, `meta_units`

### Versioning, Mapping, and Sync Tables

Purpose:

- store binary version history, protocol mappings, or sync identifiers

Entities:

- `documentversions`
- `enhancementversions`
- `feedids`
- `imapids`
- `davids`

### Runtime, Audit, Session, and Personalization Tables

Purpose:

- store usage, authentication, imports, recently viewed records, saved views, and user-specific UI state

Entities:

- `cpu`
- `cpucollector`
- `imports`
- `logins`
- `notifications`
- `numcounters`
- `recent`
- `tokens`
- `usagestats`
- `userfields`
- `userfilters`
- `views`

## Agent Query Priority

Use this priority order when deciding what to read first:

1. Core business entities such as `accounts`, `contacts`, `tickets`, `tasks`, `projects`, `messages`, `notes`, `documents`, `transactions`, and `payments`
2. Junction entities such as `mailingrecipients`, `pricelists2accounts`, `dunning2transactions`, `groups2users`, `entities2channels` (note: these have diverging operationIds — see [Entity Noun to REST operationId](#entity-noun-to-rest-operationid))
3. Platform and extensibility entities such as `customfields`, `objects`, `applications`, `services`, `weblets`, `forks`
4. Internal helper families such as `extdata*`, `tagrels*`, `meta_*`, and runtime tables

## High-Value Use Cases By Entity Cluster

- Customer 360: `accounts`, `contacts`, `addresses`, `tickets`, `transactions`, `payments`, `messages`
- Work routing: `users`, `tasks`, `tickets`, `projects`, `actionsteps`
- Customer mail summaries: `accounts`, `contacts`, `messages`, `mailingrecipients`, `tickets`
- Revenue and collections: `transactions`, `payments`, `ledgers`, `dunning`, `dunning2transactions`
- Campaign and outreach execution: `campaigns`, `mailinglists`, `participants`, `messages`, `mailingrecipients`, `messagereads`
- Knowledge retrieval: `notes`, `documents`, `files`, `comments`
- Pricing and stock: `items`, `prices`, `pricelists`, `pricelists2accounts`, `stocktransactions`, `storages`, `suppliers`
- Collaboration and activity feeds: `records`, `comments`, `files`, `channels`, `entities2channels`, `follows`, `likes`, `events`
- Platform and schema: `applications`, `resources`, `services`, `weblets`, `forks`, `groups`, `groups2users`, `permissions`, `customfields`, `objects`

## Benchmark-Backed Agent Defaults

Use these defaults unless the target instance clearly behaves differently:

- `actionsteps`: record-bound activities or follow-ups
- `records`, `comments`, `files`, and `events`: user-facing timeline/feed layer
- `channels` and `entities2channels`: collaboration spaces and record-to-channel links
- `follows`: watcher/subscription state
- `likes`: lightweight engagement signal
- `dunning`: collection-stage object, not the receivable itself

## Open Product-Semantics Questions

These are structurally understandable from the schema, but their business meaning is still partly product-specific:

- `links`: what business object does a link usually represent in your instance?
- `records`, `comments`, `follows`, `likes`, and `events`: how important is this collaboration layer in real customer deployments?
- `channels` and `entities2channels`: are they widely used as collaboration rooms, or only in selected app modules?
- `forks`, `resources`, `services`, and `weblets`: should these stay low-priority platform/admin surfaces for agents, or are they intended to be queried by external coding agents regularly?
