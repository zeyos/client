---
sidebar_label: Resources
---

# Resources

The ZeyOS REST API exposes a comprehensive set of resources covering CRM, project management, ticketing, commerce, communication, and more. Each resource maps to a RESTful endpoint under the base URL and supports a consistent set of operations.

:::info API Surface vs. CLI Surface
This page documents the **full API surface** exposed by ZeyOS. The CLI intentionally supports a curated subset of common resources. For the CLI boundary and escalation path, see [CLI Coverage and Escalation](../04-agent-workflows/03-cli-coverage-and-escalation.md).
:::

## Available Resources

The table below lists all available API resources and their supported operations.

| Resource | Endpoint | List | Get | Create | Update | Delete |
|----------|----------|:----:|:---:|:------:|:------:|:------:|
| Accounts | `/accounts` | Yes | Yes | Yes | Yes | Yes |
| ActionSteps | `/actionsteps` | Yes | Yes | Yes | Yes | Yes |
| Addresses | `/addresses` | Yes | Yes | Yes | Yes | Yes |
| Applications | `/applications` | Yes | Yes | -- | -- | -- |
| ApplicationAssets | `/applicationassets` | Yes | Yes | -- | -- | -- |
| Appointments | `/appointments` | Yes | Yes | Yes | Yes | Yes |
| Associations | `/associations` | Yes | Yes | Yes | Yes | Yes |
| BinFiles | `/binfiles` | Yes | -- | -- | -- | -- |
| Campaigns | `/campaigns` | Yes | Yes | Yes | Yes | Yes |
| Categories | `/categories` | Yes | Yes | Yes | Yes | Yes |
| Channels | `/channels` | Yes | Yes | Yes | Yes | Yes |
| Comments | `/comments` | Yes | Yes | Yes | Yes | Yes |
| Components | `/components` | Yes | Yes | Yes | Yes | Yes |
| Contacts | `/contacts` | Yes | Yes | Yes | Yes | Yes |
| ContactsToContacts | `/contactstocontacts` | Yes | Yes | Yes | Yes | Yes |
| Contracts | `/contracts` | Yes | Yes | Yes | Yes | Yes |
| Coupons | `/coupons` | Yes | Yes | Yes | Yes | Yes |
| CouponCodes | `/couponcodes` | Yes | Yes | Yes | Yes | Yes |
| CustomFields | `/customfields` | Yes | Yes | -- | -- | -- |
| DAVServers | `/davservers` | Yes | Yes | Yes | Yes | Yes |
| Devices | `/devices` | Yes | Yes | Yes | Yes | Yes |
| Documents | `/documents` | Yes | Yes | Yes | Yes | Yes |
| DunningNotices | `/dunningnotices` | Yes | Yes | Yes | Yes | Yes |
| DunningToTransactions | `/dunningtotransactions` | Yes | Yes | Yes | Yes | Yes |
| EntitiesToChannels | `/entitiestochannels` | Yes | Yes | Yes | Yes | Yes |
| Events | `/events` | Yes | Yes | Yes | Yes | Yes |
| FeedServers | `/feedservers` | Yes | Yes | Yes | Yes | Yes |
| Files | `/files` | Yes | Yes | Yes | Yes | Yes |
| Follows | `/follows` | Yes | Yes | Yes | Yes | Yes |
| Forks | `/forks` | Yes | Yes | -- | -- | -- |
| Groups | `/groups` | Yes | Yes | -- | -- | -- |
| GroupsToUsers | `/groupstousers` | Yes | Yes | -- | -- | -- |
| Invitations | `/invitations` | Yes | Yes | Yes | Yes | Yes |
| Items | `/items` | Yes | Yes | Yes | Yes | Yes |
| Ledgers | `/ledgers` | Yes | Yes | Yes | Yes | Yes |
| Likes | `/likes` | Yes | Yes | Yes | Yes | Yes |
| Links | `/links` | Yes | Yes | Yes | Yes | Yes |
| MailingLists | `/mailinglists` | Yes | Yes | Yes | Yes | Yes |
| MailingRecipients | `/mailingrecipients` | Yes | Yes | Yes | Yes | Yes |
| MailServers | `/mailservers` | Yes | Yes | Yes | Yes | Yes |
| Messages | `/messages` | Yes | Yes | Yes | Yes | Yes |
| MessageReads | `/messagereads` | Yes | Yes | Yes | Yes | Yes |
| Notes | `/notes` | Yes | Yes | Yes | Yes | Yes |
| Objects | `/objects` | Yes | Yes | Yes | Yes | Yes |
| Opportunities | `/opportunities` | Yes | Yes | Yes | Yes | Yes |
| Participants | `/participants` | Yes | Yes | Yes | Yes | Yes |
| Payments | `/payments` | Yes | Yes | Yes | Yes | Yes |
| Permissions | `/permissions` | Yes | Yes | -- | -- | -- |
| PriceLists | `/pricelists` | Yes | Yes | Yes | Yes | Yes |
| PriceListsToAccounts | `/priceliststoaccounts` | Yes | Yes | Yes | Yes | Yes |
| Prices | `/prices` | Yes | Yes | Yes | Yes | Yes |
| Projects | `/projects` | Yes | Yes | Yes | Yes | Yes |
| Records | `/records` | Yes | Yes | Yes | Yes | Yes |
| RelatedItems | `/relateditems` | Yes | Yes | Yes | Yes | Yes |
| Resources | `/resources` | Yes | Yes | -- | -- | -- |
| Services | `/services` | Yes | Yes | -- | -- | -- |
| StockTransactions | `/stocktransactions` | Yes | Yes | Yes | Yes | Yes |
| Storages | `/storages` | Yes | Yes | Yes | Yes | Yes |
| Suppliers | `/suppliers` | Yes | Yes | Yes | Yes | Yes |
| Tasks | `/tasks` | Yes | Yes | Yes | Yes | Yes |
| Tickets | `/tickets` | Yes | Yes | Yes | Yes | Yes |
| Transactions | `/transactions` | Yes | Yes | Yes | Yes | Yes |
| Users | `/users` | Yes | Yes | -- | -- | -- |
| Weblets | `/weblets` | Yes | Yes | -- | -- | -- |

## Common Resources

The following resources are the most frequently used when building integrations with ZeyOS.

### Tickets

Support and service tickets with status tracking, priority levels, due dates, and assignment to users. Tickets are the central work item in ZeyOS and can be linked to accounts, projects, contacts, and tasks.

```js
// List open tickets sorted by priority
const tickets = await client.api.listTickets({
  filters: { visibility: 0, status: 4 },
  sort: ['-priority', '+duedate'],
  limit: 50,
});

// Get a single ticket with extended data
const ticket = await client.api.getTicket({ ID: 12345, extdata: 1, tags: 1 });

// Create a new ticket
const newTicket = await client.api.createTicket({
  name: 'Server maintenance required',
  priority: 3,
  status: 0,
});

// Update a ticket — flat spread form or explicit body key both work
await client.api.updateTicket({ ID: 12345, status: 4, priority: 4 });
// Equivalent using explicit body key:
// await client.api.updateTicket({ ID: 12345, body: { status: 4, priority: 4 } });
```

### Accounts

Customer and company records that serve as the primary organizational entity in the CRM. Accounts can have linked contacts, tickets, documents, and transactions.

```js
const accounts = await client.api.listAccounts({
  fields: ['ID', 'lastname', 'firstname'],
  filters: { visibility: 0 },
  sort: ['+lastname'],
  limit: 100,
});
```

### Contacts

Individual people linked to accounts. Contacts store personal details such as name, email, phone, and address information.

```js
const contacts = await client.api.listContacts({
  fields: {
    Id: 'ID',
    Name: 'lastname',
    Email: 'email',
    Company: 'account.lastname',
  },
  filters: { visibility: 0 },
  sort: ['+lastname'],
});
```

### Tasks

Actionable work items that can be linked to tickets, projects, or other entities. Tasks track completion status and can be assigned to users.

```js
const tasks = await client.api.listTasks({
  filters: { ticket: 12345, visibility: 0 },
  sort: ['+name'],
  limit: 200,
});
```

### Projects

Organizational groupings for tickets, tasks, and other work items. Projects provide a way to plan and track larger initiatives.

```js
const projects = await client.api.listProjects({
  fields: ['ID', 'name'],
  filters: { visibility: 0 },
  sort: ['+name'],
});
```

### Items

Products and services with pricing information. Items are referenced in documents (invoices, quotes) and can be linked to price lists, categories, and suppliers.

```js
const items = await client.api.listItems({
  fields: ['ID', 'name', 'price', 'unit'],
  sort: ['+name'],
  limit: 100,
});
```

### Documents

Business documents such as invoices, quotes, orders, and delivery notes. Documents are linked to accounts and contain line items referencing products/services.

```js
const invoices = await client.api.listDocuments({
  filters: { doctype: 'invoice', visibility: 0 },
  sort: ['-date'],
  limit: 25,
});
```

## Resource Naming

The API follows consistent naming conventions for endpoints and operations:

### Endpoint Paths

Resource endpoints use **plural, lowercase** paths:

```
/accounts
/tickets
/contacts
/documents
```

Individual records are accessed by appending `/{ID}`:

```
/accounts/{ID}
/tickets/{ID}
```

### Operation IDs

The JavaScript client uses camelCase operation IDs that follow a verb-noun pattern:

| Operation | Pattern | Example |
|-----------|---------|---------|
| List | `list{Resources}` | `listTickets`, `listAccounts` |
| Get | `get{Resource}` | `getTicket`, `getAccount` |
| Create | `create{Resource}` | `createTicket`, `createAccount` |
| Update | `update{Resource}` | `updateTicket`, `updateAccount` |
| Delete | `delete{Resource}` | `deleteTicket`, `deleteAccount` |
| Exists | `exists{Resource}` | `existsTicket`, `existsAccount` |

All operations are available as methods on the `client.api` object:

```js
// List operations accept query parameters (fields, filter, sort, etc.)
const results = await client.api.listTickets({ limit: 10 });

// Get operations require an ID path parameter
const ticket = await client.api.getTicket({ ID: 123 });

// Create operations accept a request body
const created = await client.api.createTicket({ name: 'New ticket' });

// Update operations require an ID and changed fields (flat spread or explicit body key)
await client.api.updateTicket({ ID: 123, status: 4 });

// Delete operations require an ID
await client.api.deleteTicket({ ID: 123 });

// Exists operations return a boolean-like HEAD response
await client.api.existsTicket({ ID: 123 });
```

:::info
The client library is auto-generated from the OpenAPI specification files located in the `/openapi/` directory of this project. The spec files (`api.json`, `oauth2.json`, `auth.json`) define every available resource, operation, parameter, and response schema. Run `npm run generate` to regenerate the client after modifying the spec files.
:::

## HTTP Methods

The API uses the following HTTP methods, which may differ from typical REST conventions:

| Operation | HTTP Method | Description |
|-----------|-------------|-------------|
| List | `POST` | Retrieve a filtered list of records (body contains query parameters) |
| Get | `GET` | Retrieve a single record by ID |
| Create | `PUT` | Create a new record |
| Update | `PATCH` | Partially update an existing record |
| Delete | `DELETE` | Delete a record by ID |
| Exists | `HEAD` | Check if a record exists (returns no body) |

:::tip
Note that **list** operations use `POST` rather than `GET`. This is because the query language (filters, field selection, sorting) can produce request payloads that exceed URL length limits. Using `POST` allows complex queries to be sent reliably in the request body.
:::
