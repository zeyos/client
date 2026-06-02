---
sidebar_label: Data Retrieval
---

# Data Retrieval

The ZeyOS REST API provides a flexible query language for retrieving data from any resource endpoint. You can control exactly which fields are returned, apply composite filters, search by keyword, sort results, paginate through large datasets, expand JSON and binary columns, and access extended data fields.

:::info HTTP Method
All list operations use **POST** requests with a JSON body, not GET. This is because queries can include complex filters, field selections, and composite expressions that would be impractical as URL query parameters.
:::

## Field Selection

By default, list endpoints return all standard fields for a resource. Use the `fields` parameter to request only the columns you need, reducing payload size and improving performance.

### Array Form

Pass a simple array of field names to select specific columns:

```json
{
  "fields": ["ID", "name", "status", "priority"]
}
```

**JavaScript client:**

```js
const result = await client.api.listTickets({
  fields: ['ID', 'name', 'status', 'priority'],
});
```

### Object Form with Aliases

Use an object to rename fields in the response. Keys become the output names; values are the source field paths:

```json
{
  "fields": {
    "Id": "ID",
    "Name": "lastname",
    "Nickname": "extdata.nickname",
    "Address": "contact.address",
    "Postalcode": "contact.postalcode",
    "Town": "contact.city",
    "SalesAgent": "assigneduser.name"
  }
}
```

**JavaScript client:**

```js
const result = await client.api.listAccounts({
  fields: {
    Id: 'ID',
    Name: 'lastname',
    Nickname: 'extdata.nickname',
    Address: 'contact.address',
    Postalcode: 'contact.postalcode',
    Town: 'contact.city',
    SalesAgent: 'assigneduser.name',
  },
});
```

### Dot-Notation Joins

Use dot notation to access fields on related records without a separate request. You can discover available relationships in the [Schema Reference](./04-schema.md).

| Notation | Description |
|----------|-------------|
| `contact.city` | City field from the linked contact record |
| `contact.address` | Address from the linked contact |
| `contact.postalcode` | Postal code from the linked contact |
| `contact.country` | Country from the linked contact |
| `assigneduser.name` | Name of the assigned user |
| `account.name` | Name of the linked account |
| `project.name` | Name of the linked project |

### Extended Data Fields via Dot-Notation

Access custom fields stored in a record's `extdata` JSON column using the `extdata.` prefix in your field selection:

```json
{
  "fields": {
    "Nickname": "extdata.nickname",
    "Department": "extdata.department"
  }
}
```

:::info
Extended data fields are user-defined and may vary between ZeyOS instances. Whenever you create a new form field in ZeyOS, the field's value is stored in `extdata`. Check your instance configuration for available custom fields.
:::

## Filters

The `filter` parameter lets you restrict results using comparison operators, string-matching operators, and composite logical expressions.

:::tip JavaScript Client: use `filters` (plural)
The REST API parameter is named `filter` (singular), but the JavaScript client also accepts `filters` (plural). Use `filters` when working with the client — it correctly handles both simple fields and GIN-indexed foreign key fields like `project`, `ticket`, and `account`. See the [Practical Guide](../02-javascript-client/04-practical-guide.md#filter-vs-filters) for details.
:::

### Filter Syntax

Filters are expressed as an object where keys are field names and values define the match condition:

```
filter = {
  "field": "value",
  "field2": {"=": "value"},
  "field3": {"<": "value1", ">": "value2"},
  "field4": {"IN": ["value1", "value2"]},
  N: ["AND/OR/NOT", {...}, {...}]
}
```

### Simple Equality

Pass a field name with a plain value for equality matching:

```json
{
  "filter": {
    "status": 1,
    "visibility": 0
  }
}
```

### Comparison Operators

Use an object value with operator keys for more advanced comparisons:

```json
{
  "filter": {
    "priority": {">=": 3},
    "amount": {">": 100, "<": 1000}
  }
}
```

The full set of comparison operators:

| Operator | Description |
|----------|-------------|
| `=` | Equal to |
| `!=` or `<>` | Not equal to |
| `<` | Less than |
| `<=` | Less than or equal to |
| `>` | Greater than |
| `>=` | Greater than or equal to |
| `IN` | Value is in the given set |
| `!IN` | Value is not in the given set |

**IN operator example:**

```json
{
  "filter": {
    "contact.country": {"IN": ["DE", "AT", "GB"]}
  }
}
```

### String Operators

For string fields, additional pattern-matching operators are available:

| Operator | Description | Case Sensitive |
|----------|-------------|:-:|
| `~` | Matches regular expression | Yes |
| `~*` | Matches regular expression | No |
| `!~` | Does not match regular expression | Yes |
| `!~*` | Does not match regular expression | No |
| `~~` | LIKE (pattern match) | Yes |
| `~~*` | LIKE (pattern match) | No |
| `!~~` | NOT LIKE | Yes |
| `!~~*` | NOT LIKE | No |

:::tip
The `~` operators test regular expressions, while `~~` operators use SQL-style LIKE patterns. The `*` suffix makes any operator case-insensitive.
:::

### Composite Filters (AND, OR, NOT)

Combine multiple conditions using logical operators. Composite filters use **numbered keys** in the filter object to include logical groups alongside simple field conditions:

```json
{
  "filter": {
    "visibility": 0,
    "contact.country": {"IN": ["DE", "AT", "GB"]},
    "2": ["OR",
      {"lastmodified": {">": 1524472045}},
      {"contact.lastmodified": {">": 1524472045}}
    ]
  }
}
```

In this example:
- `"visibility": 0` is a simple equality filter.
- `"contact.country": {"IN": [...]}` uses the IN operator on a joined field.
- The key `"2"` contains an OR group: the record matches if either its own `lastmodified` or its contact's `lastmodified` exceeds the given timestamp.

You can nest logical operators as deeply as needed:

```json
{
  "filter": {
    "0": ["AND",
      {"status": {"IN": [1, 2]}},
      {"visibility": 0},
      {"1": ["OR",
        {"priority": {">=": 3}},
        {"duedate": {"<": "2025-06-01"}}
      ]}
    ]
  }
}
```

## Search Queries

The `query` parameter performs a search across all searchable string fields for a resource (typically `name`, `description`, and similar columns):

```json
{
  "query": "server outage"
}
```

You can combine `query` with `filter` to narrow results further:

```json
{
  "query": "payment",
  "filter": {"status": 1}
}
```

**JavaScript client:**

```js
const results = await client.api.listTickets({
  query: 'server outage',
  filters: { status: 1 },
});
```

## Sorting

Control the order of results using the `sort` parameter. Provide an array of field names, each prefixed with `+` for ascending or `-` for descending:

```json
{
  "sort": ["+lastname", "-contact.country"]
}
```

| Prefix | Direction | Example |
|--------|-----------|---------|
| `+` | Ascending (A-Z, 0-9, oldest first) | `"+lastname"` |
| `-` | Descending (Z-A, 9-0, newest first) | `"-lastmodified"` |

Multiple sort fields are applied in order -- the example above sorts by `lastname` ascending first, then by `contact.country` descending within each name.

:::tip
Sort by `"-lastmodified"` to get the most recently updated records first. This is a common default for dashboard-style views.
:::

## Distinct Results

The `distinct` parameter eliminates duplicate rows from the result set. This is useful when a query returns multiple rows for the same record due to joins or multi-value fields.

```json
{
  "distinct": true,
  "fields": ["ID", "lastname", "contact.country"],
  "filter": { "visibility": 0 }
}
```

**JavaScript client:**

```js
const result = await client.api.listAccounts({
  distinct: true,
  fields: ['ID', 'lastname', 'contact.country'],
  filters: { visibility: 0 },
});
```

## Pagination

The API supports offset-based pagination using `limit` and `offset`:

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | integer | `1000` | `10000` | Maximum number of records to return |
| `offset` | integer | `0` | — | Number of records to skip before returning results |

```json
{
  "limit": 25,
  "offset": 50
}
```

:::info Default limit
When no `limit` is specified, the API returns up to **1000** records. The maximum supported value is **10000**. For large datasets, always paginate using `limit` and `offset`.
:::

### Getting the Total Count

To retrieve the total number of matching records without fetching the data itself, set `count` to `1`. The response will contain only the count:

**Request:**

```json
{
  "count": true,
  "filter": {
    "visibility": 0,
    "contact.country": {"IN": ["DE", "AT", "GB"]},
    "2": ["OR",
      {"lastmodified": {">": 1524472045}},
      {"contact.lastmodified": {">": 1524472045}}
    ]
  }
}
```

**Response:**

```json
{
  "count": 5
}
```

**JavaScript client:**

```js
const countResult = await client.api.listAccounts({
  count: true,
  filters: { visibility: 0 },
});
// countResult => { count: 5 }
```

:::info
Use `count` to build pagination controls in your UI. First request the count to determine the total number of pages, then paginate through results using `limit` and `offset`. Higher-level client helpers may normalize count-enabled responses differently, so keep the raw API shape and the client-layer shape conceptually separate.
:::

## Expanding JSON and Binary Data

Some table columns contain JSON data or reference binary files. By default, these columns are not expanded in list responses. The `expand` parameter tells the API to load and inline the column's content automatically.

:::warning
The `expand` parameter is **only** for JSON data columns (like `items` in transactions or `data` in objects) and binary file references (like `binfile`). It is **not** used for extended data fields -- see [Extended Data (extdata)](#extended-data-extdata) below.
:::

**Example -- expanding a binary file column:**

```json
{
  "fields": ["ID", "subject", "binfile"],
  "expand": ["binfile"],
  "limit": 1
}
```

**curl:**

```bash
curl -X POST "https://cloud.zeyos.com/demo/api/v1/messages/" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": ["ID", "subject", "binfile"],
    "expand": ["binfile"],
    "limit": 1
  }'
```

**Response:**

```json
[{"ID": 188, "subject": "Test", "binfile": {"content": "UmV0dXJuLVBhdGg6IDx..."}}]
```

The binary content is returned inline as base64-encoded data. In the example above, the `binfile` column is expanded to include the full email message content as [RFC 822](https://www.ietf.org/rfc/rfc822.txt).

Other common use cases for `expand`:
- `items` in transaction records (invoice line items as JSON)
- `data` in object records (structured JSON data)

## Extended Data (extdata)

Extended data (`extdata`) is a concept in ZeyOS that allows storing additional custom values for any entity. Whenever you create a new form field in ZeyOS, the field's value is stored in `extdata`. Accessing extdata is **separate** from the `expand` parameter.

### In List Requests (POST)

There are two ways to include extended data in list responses:

**Option 1: Select specific extdata fields via dot-notation in `fields`:**

```json
{
  "fields": {
    "Id": "ID",
    "Name": "lastname",
    "Nickname": "extdata.nickname",
    "Department": "extdata.department"
  }
}
```

This approach lets you pick individual extdata fields and give them aliases.

**Option 2: Include all extdata using the `extdata` body parameter:**

```json
{
  "fields": ["ID", "lastname", "status"],
  "extdata": 1,
  "limit": 10
}
```

**JavaScript client:**

```js
// Select specific extdata fields
const result = await client.api.listAccounts({
  fields: {
    Id: 'ID',
    Name: 'lastname',
    Nickname: 'extdata.nickname',
  },
});

// Or include all extdata
const result = await client.api.listAccounts({
  fields: ['ID', 'lastname', 'status'],
  extdata: 1,
  limit: 10,
});
```

### In GET Requests

When fetching a single record, pass `extdata=1` as a query parameter:

```bash
curl "https://cloud.zeyos.com/demo/api/v1/accounts/42?extdata=1" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**JavaScript client:**

```js
const account = await client.api.getAccount({
  ID: 42,
  extdata: 1,
});
```

## Complete Example

Here is the canonical example from the ZeyOS documentation, combining field selection with aliases, dot-notation joins, extdata fields, composite filters, sorting, and pagination.

### Query

```json
{
  "fields": {
    "Id": "ID",
    "Name": "lastname",
    "Nickname": "extdata.nickname",
    "Address": "contact.address",
    "Postalcode": "contact.postalcode",
    "Town": "contact.city",
    "SalesAgent": "assigneduser.name"
  },
  "filter": {
    "visibility": 0,
    "contact.country": {"IN": ["DE", "AT", "GB"]},
    "2": ["OR",
      {"lastmodified": {">": 1524472045}},
      {"contact.lastmodified": {">": 1524472045}}
    ]
  },
  "sort": ["+lastname", "-contact.country"],
  "limit": 3,
  "offset": 0
}
```

### Using curl

```bash
curl -X POST "https://cloud.zeyos.com/demo/api/v1/accounts/" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "Id": "ID",
      "Name": "lastname",
      "Nickname": "extdata.nickname",
      "Address": "contact.address",
      "Postalcode": "contact.postalcode",
      "Town": "contact.city",
      "SalesAgent": "assigneduser.name"
    },
    "filter": {
      "visibility": 0,
      "contact.country": {"IN": ["DE", "AT", "GB"]},
      "2": ["OR",
        {"lastmodified": {">": 1524472045}},
        {"contact.lastmodified": {">": 1524472045}}
      ]
    },
    "sort": ["+lastname", "-contact.country"],
    "limit": 3,
    "offset": 0
  }'
```

### Using the JavaScript Client

```js
const accounts = await client.api.listAccounts({
  fields: {
    Id: 'ID',
    Name: 'lastname',
    Nickname: 'extdata.nickname',
    Address: 'contact.address',
    Postalcode: 'contact.postalcode',
    Town: 'contact.city',
    SalesAgent: 'assigneduser.name',
  },
  filters: {
    visibility: 0,
    'contact.country': { IN: ['DE', 'AT', 'GB'] },
    2: [
      'OR',
      { lastmodified: { '>': 1524472045 } },
      { 'contact.lastmodified': { '>': 1524472045 } },
    ],
  },
  sort: ['+lastname', '-contact.country'],
  limit: 3,
  offset: 0,
});
```

### Response

```json
[
  {
    "Id": 2,
    "Name": "BEQ Building Equipment",
    "Nickname": null,
    "Address": "Queensstreet",
    "Postalcode": "12923",
    "Town": "London",
    "SalesAgent": "Max Mueller"
  },
  {
    "Id": 15,
    "Name": "CleanTexx",
    "Nickname": null,
    "Address": "Tower Bridge",
    "Postalcode": "12923",
    "Town": "London",
    "SalesAgent": null
  },
  {
    "Id": 1,
    "Name": "Lightexx AG",
    "Nickname": null,
    "Address": "Schmittstr. 4",
    "Postalcode": "80172",
    "Town": "Munich",
    "SalesAgent": null
  }
]
```

:::tip
When building interactive UIs, start with a `count` request to determine the total result set size, then use `limit` and `offset` to implement paginated loading.
:::
