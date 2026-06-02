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

## Source Note: `filter` vs `filters`

Do not treat the spelling as universally settled.

- `openapi/api.json` documents the list request body field as `filter`.
- The repo CLI accepts `--filter` but serializes the JSON into `body.filters`.
- The repo client examples consistently use `filters`.

Agent rule:

- For `@zeyos/client`, follow repo convention and use `filters`.
- For CLI, use the documented `--filter` flag.
- For raw REST/OpenAPI examples, mention that the spec documents `filter` and verify behavior against the target instance before hardcoding one spelling as universally correct.

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
2. Junction entities such as `mailingrecipients`, `pricelists2accounts`, `dunning2transactions`, `groups2users`, `entities2channels`
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
