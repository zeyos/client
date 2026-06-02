---
sidebar_label: Schema Reference
---

# Schema Reference

This page documents the fields, types, and relationships for the most commonly used ZeyOS resources. Use it as a quick lookup when building queries, creating records, or planning data integrations.

## Conventions

- **Timestamps** are Unix timestamps in **seconds** (not milliseconds). Convert with `new Date(value * 1000)` in JavaScript.
- **Visibility** controls soft-delete behaviour: `0` = regular, `1` = archived, `2` = deleted. Always include `visibility: 0` in filters to exclude archived and deleted records.
- **GIN-indexed fields** support the `filters` (plural) parameter. Using `filter` (singular) with these fields silently returns unfiltered results. See the [Practical Guide](../02-javascript-client/04-practical-guide.md#filter-vs-filters) for details.
- Fields marked **(required)** must be included when creating a record. On updates (PATCH), only the fields you send are changed.
- **Foreign key fields** (e.g. `account`, `project`, `ticket`) accept integer IDs referencing the related resource.

---

### Accounts

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Account ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `assigneduser` | integer | Assigned user ID |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `contact` | integer | Contact ID |
| `visibility` | integer | Visibility (`0`=REGULAR, `1`=ARCHIVED, `2`=DELETED) (required) |
| `lastname` | text | Last name (surname or company name); required if `firstname` is empty (required) |
| `firstname` | text | First name (given name); required if `lastname` is empty (required) |
| `type` | integer | Account type (`0`=PROSPECT, `1`=CUSTOMER, `2`=SUPPLIER, `3`=CUSTOMERANDSUPPLIER, `4`=COMPETITOR, `5`=EMPLOYEE) (required) |
| `customernum` | text | Customer number; only for PROSPECT, CUSTOMER, CUSTOMERANDSUPPLIER, or EMPLOYEE (required) |
| `suppliernum` | text | Supplier number; only for SUPPLIER or CUSTOMERANDSUPPLIER (required) |
| `taxid` | text | Tax ID (e.g. VATIN or SSN) (required) |
| `currency` | varchar | Currency code (ISO 4217) (required) |
| `locked` | integer | Deny booking of billing or procurement transactions (required) |
| `excludetax` | integer | Exclude from taxation (required) |
| `description` | text | Detailed general description (required) |

**GIN-indexed fields** (use `filters` plural): `assigneduser`, `customernum`, `firstname`, `lastname`, `suppliernum`

---

### Contacts

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Contact ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `assigneduser` | integer | Assigned user ID |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `davserver` | integer | DAV server ID |
| `picbinfile` | integer | Binary file ID; read-only (not for PUT or PATCH) |
| `visibility` | integer | Visibility (`0`=REGULAR, `1`=ARCHIVED, `2`=DELETED) (required) |
| `lastname` | text | Last name (surname or company name); required if `firstname` is empty (required) |
| `firstname` | text | First name (given name); required if `lastname` is empty (required) |
| `type` | integer | Contact type (`0`=COMPANY, `1`=PERSON) (required) |
| `title` | text | Title or salutation; only for PERSON (required) |
| `company` | text | Company name; only for PERSON (required) |
| `position` | text | Position or job title; only for PERSON (required) |
| `department` | text | Department; only for PERSON (required) |
| `address` | text | Address (street and building/suite number) (required) |
| `postalcode` | text | Postal or ZIP code (required) |
| `city` | text | City or locality (required) |
| `region` | text | Region or state (required) |
| `country` | varchar | Country code (ISO 3166-1 alpha-2) (required) |
| `phone` | text | Primary phone number (required) |
| `phone2` | text | Secondary phone number (required) |
| `cell` | text | Cell phone number (required) |
| `fax` | text | Fax number (required) |
| `email` | text | Primary e-mail address (required) |
| `email2` | text | Secondary e-mail address (required) |
| `website` | text | Website URL (required) |
| `birthdate` | timestamp | Birth date as Unix timestamp; only for PERSON |
| `description` | text | Detailed general description (required) |

**GIN-indexed fields** (use `filters` plural): `assigneduser`, `davserver`, `company`, `email`, `email2`, `firstname`, `lastname`

---

### Tickets

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Ticket ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `assigneduser` | integer | Assigned user ID |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `account` | integer | Account ID; mutually exclusive with `project` |
| `project` | integer | Project ID; mutually exclusive with `account` |
| `visibility` | integer | Visibility (`0`=REGULAR, `1`=ARCHIVED, `2`=DELETED) (required) |
| `name` | text | Name (required) |
| `ticketnum` | text | Ticket number (required) |
| `date` | timestamp | Designated date as Unix timestamp (defaults to now on creation) (required) |
| `duedate` | timestamp | Due date as Unix timestamp |
| `status` | integer | Status (`0`=NOTSTARTED, `1`=AWAITINGACCEPTANCE, `2`=ACCEPTED, `3`=REJECTED, `4`=ACTIVE, `5`=INACTIVE, `6`=FEEDBACKREQUIRED, `7`=TESTING, `8`=CANCELLED, `9`=COMPLETED, `10`=FAILED, `11`=BOOKED) (required) |
| `priority` | integer | Priority (`0`=LOWEST, `1`=LOW, `2`=MEDIUM, `3`=HIGH, `4`=HIGHEST) (required) |
| `description` | text | Detailed general description (required) |
| `billingitems` | json | JSON-encoded billing items (array) |
| `procurementitems` | json | JSON-encoded procurement items (array) |

**GIN-indexed fields** (use `filters` plural): `assigneduser`, `project`, `name`, `ticketnum`

---

### Tasks

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Task ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `assigneduser` | integer | Assigned user ID |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `davserver` | integer | DAV server ID |
| `ticket` | integer | Ticket ID; mutually exclusive with `project` |
| `project` | integer | Project ID; mutually exclusive with `ticket` |
| `visibility` | integer | Visibility (`0`=REGULAR, `1`=ARCHIVED, `2`=DELETED) (required) |
| `name` | text | Name (required) |
| `tasknum` | text | Task number (required) |
| `datefrom` | timestamp | Start date as Unix timestamp |
| `duedate` | timestamp | Due date as Unix timestamp |
| `status` | integer | Status (`0`=NOTSTARTED, `1`=AWAITINGACCEPTANCE, `2`=ACCEPTED, `3`=REJECTED, `4`=ACTIVE, `5`=INACTIVE, `6`=FEEDBACKREQUIRED, `7`=TESTING, `8`=CANCELLED, `9`=COMPLETED, `10`=FAILED, `11`=BOOKED) (required) |
| `priority` | integer | Priority (`0`=LOWEST, `1`=LOW, `2`=MEDIUM, `3`=HIGH, `4`=HIGHEST) (required) |
| `projectedeffort` | integer | Projected effort in minutes (required) |
| `description` | text | Detailed general description (required) |

**GIN-indexed fields** (use `filters` plural): `assigneduser`, `davserver`, `project`, `name`, `tasknum`

---

### Projects

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Project ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `assigneduser` | integer | Assigned user ID |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `account` | integer | Account ID |
| `visibility` | integer | Visibility (`0`=REGULAR, `1`=ARCHIVED, `2`=DELETED) (required) |
| `name` | text | Name (required) |
| `projectnum` | text | Project number (required) |
| `status` | integer | Status (`0`=DRAFT, `1`=NOTSTARTED, `2`=AWAITINGAPPROVAL, `3`=APPROVED, `4`=DISMISSED, `5`=ACTIVE, `6`=INACTIVE, `7`=TESTING, `8`=CANCELLED, `9`=COMPLETED, `10`=FAILED, `11`=BOOKED) (required) |
| `description` | text | Detailed general description (required) |

**GIN-indexed fields** (use `filters` plural): `assigneduser`, `name`, `projectnum`

---

### Appointments

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Appointment ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `assigneduser` | integer | Assigned user ID |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `davserver` | integer | DAV server ID |
| `visibility` | integer | Visibility (`0`=REGULAR, `1`=ARCHIVED, `2`=DELETED) (required) |
| `name` | text | Name (required) |
| `location` | text | Location (required) |
| `color` | varchar | Color code (CSS hex without `#`) (required) |
| `datefrom` | timestamp | Start date as Unix timestamp; must be <= `dateto` (required) |
| `dateto` | timestamp | End date as Unix timestamp; must be >= `datefrom` (required) |
| `recurrence` | integer | Recurrence (`0`=DAY, `1`=WORKDAY, `2`=WEEK, `3`=MONTH, `4`=YEAR) |
| `interval` | integer | Recurrence interval in minutes (required) |
| `maxoccurrences` | integer | Maximum occurrences including start date (`0`=unlimited) (required) |
| `daterecurrence` | timestamp | Recurrence end date as Unix timestamp |
| `description` | text | Detailed general description (required) |

**GIN-indexed fields** (use `filters` plural): `assigneduser`, `davserver`, `location`, `name`

---

### Transactions

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Transaction ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `assigneduser` | integer | Assigned user ID |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `account` | integer | Account ID |
| `item` | integer | Item ID; must be `null` for BILLING and PROCUREMENT |
| `contract` | integer | Contract ID |
| `transactionnum` | text | Transaction number (required) |
| `type` | integer | Transaction type (`0`=BILLING_QUOTE, `1`=BILLING_ORDER, `2`=BILLING_DELIVERY, `3`=BILLING_INVOICE, `4`=BILLING_CREDIT, `5`=PROCUREMENT_REQUEST, `6`=PROCUREMENT_ORDER, `7`=PROCUREMENT_DELIVERY, `8`=PROCUREMENT_INVOICE, `9`=PROCUREMENT_CREDIT, `10`=PRODUCTION_FABRICATION, `11`=PRODUCTION_DISASSEMBLY) (required) |
| `date` | timestamp | Designated date as Unix timestamp (defaults to now on creation) (required) |
| `duedate` | timestamp | Due date as Unix timestamp |
| `status` | integer | Status (`0`=DRAFT, `1`=BOOKED, `2`=HOLD, `3`=CANCELLED, `4`=CLOSED, ... `20`=PAID, `21`=OVERPAID, `22`=PROCESSED, `23`=PROCESSED_CANCELLED) (required) |
| `calculation` | integer | Calculation method (`0`=NET, `1`=GROSS, `2`=EXACT, `3`=LEGACY, `4`=EXTERNAL) (required) |
| `productionfactor` | integer | Production factor; required for PRODUCTION, otherwise `null` |
| `currency` | varchar | Currency code (ISO 4217) (required) |
| `exchangerate` | float | Exchange rate as multiple of system currency unit (required) |
| `taxid` | text | Buyer Tax ID (e.g. VATIN or SSN) (required) |
| `shippingrecipient` | text | Shipping recipient (required) |
| `shippingaddress` | text | Shipping address (required) |
| `shippingpostalcode` | text | Shipping postal code (required) |
| `shippingcity` | text | Shipping city (required) |
| `shippingregion` | text | Shipping region or state (required) |
| `shippingcountry` | varchar | Shipping country code (ISO 3166-1 alpha-2) (required) |
| `billingrecipient` | text | Billing recipient (required) |
| `billingaddress` | text | Billing address (required) |
| `billingpostalcode` | text | Billing postal code (required) |
| `billingcity` | text | Billing city (required) |
| `billingregion` | text | Billing region or state (required) |
| `billingcountry` | varchar | Billing country code (ISO 3166-1 alpha-2) (required) |
| `sellertaxid` | text | Seller Tax ID (required) |
| `sellername` | text | Seller name (required) |
| `selleraddress` | text | Seller address (required) |
| `sellerpostalcode` | text | Seller postal code (required) |
| `sellercity` | text | Seller city (required) |
| `sellerregion` | text | Seller region or state (required) |
| `sellercountry` | varchar | Seller country code (ISO 3166-1 alpha-2) (required) |
| `discount` | float | Total absolute discount (required) |
| `netamount` | float | Total net amount (required) |
| `tax` | float | Total tax amount (required) |
| `margin` | float | Total absolute margin (required) |
| `weight` | float | Total shipping weight in kg (required) |
| `items` | json | JSON-encoded line items (array) |

**GIN-indexed fields** (use `filters` plural): `assigneduser`, `transactionnum`

---

### Items

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Item ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `model` | integer | Model item ID; only for non-MODEL items |
| `picbinfile` | integer | Binary file ID; read-only (not for PUT or PATCH) |
| `visibility` | integer | Visibility (`0`=REGULAR, `1`=ARCHIVED, `2`=DELETED) (required) |
| `name` | text | Product name (required) |
| `manufacturer` | text | Manufacturer (brand or company) (required) |
| `itemnum` | text | Item number / SKU (required) |
| `barcode` | text | Barcode (e.g. GTIN, EAN, UPC) (required) |
| `type` | integer | Item type (`0`=SIMPLE, `1`=SERIALS, `2`=CHARGES, `3`=SERIALSANDCHARGES, `4`=SET, `5`=CONTAINER, `6`=NOSTOCK, `7`=MODEL) (required) |
| `forcestock` | integer | Force stock check on depletion (`0`=STORAGE, `1`=LOCATION) |
| `applicability` | integer | Applicability (`0`=ALWAYS, `1`=NEVER, `2`=BILLINGONLY, `3`=PROCUREMENTONLY) (required) |
| `unit` | varchar | Unit code (UN/CEFACT Recommendation 20) (required) |
| `sellingprice` | float | Default selling price per unit (required) |
| `purchaseprice` | float | Default purchase price per unit (required) |
| `taxrate` | float | Tax rate in percent |
| `weight` | float | Shipping weight per unit in kg (required) |
| `classcode` | text | Product classification code (e.g. GPC, UNSPSC) (required) |
| `tariffcode` | text | Tariff code (e.g. HS, CN, HTS) (required) |
| `origin` | varchar | Origin country code (ISO 3166-1 alpha-2) (required) |
| `description` | text | Detailed general description (required) |
| `foreigntaxrates` | json | Country-specific tax rates; use country code as key |

**GIN-indexed fields** (use `filters` plural): `barcode`, `itemnum`, `manufacturer`, `name`

---

### Opportunities

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Opportunity ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `assigneduser` | integer | Assigned user ID |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `account` | integer | Account ID |
| `contact` | integer | Contact ID |
| `campaign` | integer | Campaign ID |
| `visibility` | integer | Visibility (`0`=REGULAR, `1`=ARCHIVED, `2`=DELETED) (required) |
| `name` | text | Name (required) |
| `opportunitynum` | text | Opportunity number (required) |
| `date` | timestamp | Designated date as Unix timestamp (defaults to now on creation) (required) |
| `duedate` | timestamp | Due date as Unix timestamp |
| `status` | integer | Status (`0`=UNEVALUATED, `1`=ELIGIBLE, `2`=FEEDBACKREQUIRED, `3`=INNEGOTIATION, `4`=OFFERED, `5`=ACCEPTED, `6`=REJECTED) (required) |
| `priority` | integer | Priority (`0`=LOWEST, `1`=LOW, `2`=MEDIUM, `3`=HIGH, `4`=HIGHEST) (required) |
| `probability` | integer | Probability of success in percent; must be `100` for ACCEPTED (required) |
| `worstcase` | float | Worst-case monetary outcome (required) |
| `mostlikely` | float | Most likely monetary outcome (required) |
| `upside` | float | Upside monetary outcome (required) |
| `description` | text | Detailed general description (required) |

**GIN-indexed fields** (use `filters` plural): `assigneduser`, `name`, `opportunitynum`

---

### Documents

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Document ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `assigneduser` | integer | Assigned user ID |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `binfile` | integer | Binary file ID; read-only (not for PUT or PATCH) |
| `visibility` | integer | Visibility (`0`=REGULAR, `1`=ARCHIVED, `2`=DELETED) (required) |
| `name` | text | Name (required) |
| `documentnum` | text | Document number (required) |
| `status` | integer | Status (`0`=DRAFT, `1`=FEEDBACKREQUIRED, `2`=INREVISION, `3`=AWAITINGAPPROVAL, `4`=FINAL, `5`=OBSOLETE) (required) |
| `filename` | text | Filename (required) |
| `mimetype` | text | MIME type (required) |
| `public` | integer | Publicly accessible (required) |
| `description` | text | Detailed general description (required) |

**GIN-indexed fields** (use `filters` plural): `assigneduser`, `documentnum`, `filename`, `name`

---

### Notes

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Note ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `assigneduser` | integer | Assigned user ID |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `binfile` | integer | Binary file ID; read-only (not for PUT or PATCH) |
| `visibility` | integer | Visibility (`0`=REGULAR, `1`=ARCHIVED, `2`=DELETED) (required) |
| `name` | text | Name (required) |
| `status` | integer | Status (`0`=DRAFT, `1`=FEEDBACKREQUIRED, `2`=INREVISION, `3`=AWAITINGAPPROVAL, `4`=FINAL, `5`=OBSOLETE) (required) |
| `contenttype` | text | Content MIME type (required) |
| `text` | text | Plain text content (required) |
| `attachments` | text[] | Array of attachment filenames |
| `description` | text | Detailed general description (required) |

**GIN-indexed fields** (use `filters` plural): `assigneduser`, `name`

---

### Messages

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Message ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `mailserver` | integer | Mail server ID |
| `ticket` | integer | Ticket ID; mutually exclusive with `opportunity` |
| `opportunity` | integer | Opportunity ID; mutually exclusive with `ticket` |
| `mailinglist` | integer | Mailing list ID |
| `reference` | integer | Reference message (reply-to) ID; must be distinct from `ID` |
| `binfile` | integer | Binary file ID; read-only (not for PUT or PATCH) |
| `mailbox` | integer | Mailbox type (`0`=INBOX, `1`=DRAFTS, `2`=SENT, `3`=TEMPLATES, `4`=MAILINGS, `5`=ARCHIVE, `6`=TRASH, `7`=JUNK) (required) |
| `verified` | integer | Verified sender e-mail address (required) |
| `date` | timestamp | Designated date as Unix timestamp (defaults to now on creation) (required) |
| `subject` | text | Subject (required) |
| `sender` | text | Sender name and e-mail address (required) |
| `sender_email` | text | Sender e-mail address (required) |
| `sender_name` | text | Sender name (required) |
| `to` | text | All regular recipient names and e-mail addresses (required) |
| `to_email` | text | First regular recipient e-mail address (required) |
| `to_name` | text | First regular recipient name (required) |
| `to_count` | integer | Number of regular recipients (required) |
| `cc` | text | Carbon copy recipients (required) |
| `bcc` | text | Blind carbon copy recipients (required) |
| `contenttype` | text | Content MIME type (required) |
| `text` | text | Plain text content (required) |
| `attachments` | text[] | Array of attachment filenames |
| `senddate` | timestamp | Scheduled send date as Unix timestamp |
| `senderror` | text | Last send error message (required) |
| `messageid` | text | Message-ID header (required) |

**GIN-indexed fields** (use `filters` plural): `mailinglist`, `mailserver`, `sender`, `subject`, `to`

---

### Comments

| Field | Type | Description |
|-------|------|-------------|
| `ID` | timestamp | Comment ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `record` | timestamp | Record ID (parent record dependency) (required) |
| `date` | timestamp | Designated date as Unix timestamp (defaults to now on creation) (required) |
| `sender` | text | Sender (required) |
| `text` | text | Comment text (Markdown for rich text) (required) |
| `meta` | json | JSON-encoded metadata (object) |

---

### Events

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Event ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `entity` | t_entity | Canonical entity (required) |
| `index` | integer | Entity ID (required) |
| `name` | text | Name (required) |
| `color` | varchar | Color code (CSS hex without `#`) (required) |
| `datefrom` | timestamp | Start date as Unix timestamp; must be <= `dateto` (required) |
| `dateto` | timestamp | End date as Unix timestamp; must be >= `datefrom` (required) |
| `meta` | json | JSON-encoded metadata (object) |

---

### Campaigns

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Campaign ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `assigneduser` | integer | Assigned user ID |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `visibility` | integer | Visibility (`0`=REGULAR, `1`=ARCHIVED, `2`=DELETED) (required) |
| `name` | text | Name (required) |
| `datefrom` | timestamp | Start date as Unix timestamp; must be <= `dateto` (required) |
| `dateto` | timestamp | End date as Unix timestamp; must be >= `datefrom` |
| `status` | integer | Status (`0`=DRAFT, `1`=NOTSTARTED, `2`=AWAITINGAPPROVAL, `3`=APPROVED, `4`=DISMISSED, `5`=ACTIVE, `6`=INACTIVE, `7`=INEVALUATION, `8`=CANCELLED, `9`=CLOSED) (required) |
| `description` | text | Detailed general description (required) |

**GIN-indexed fields** (use `filters` plural): `assigneduser`, `name`

---

### Contracts

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Contract ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `assigneduser` | integer | Assigned user ID |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `account` | integer | Account ID |
| `visibility` | integer | Visibility (`0`=REGULAR, `1`=ARCHIVED, `2`=DELETED) (required) |
| `name` | text | Name (required) |
| `contractnum` | text | Contract number (required) |
| `date` | timestamp | Designated date as Unix timestamp (defaults to now on creation) (required) |
| `datefrom` | timestamp | Start date as Unix timestamp; must be <= `dateto` |
| `dateto` | timestamp | End date as Unix timestamp; must be >= `datefrom` |
| `datecancel` | timestamp | Cancellation date as Unix timestamp |
| `status` | integer | Status (`0`=DRAFT, `1`=AWAITINGAPPROVAL, `2`=APPROVED, `3`=DISMISSED, `4`=ACTIVE, `5`=INACTIVE, `6`=EXPIRED, `7`=CANCELLED, `8`=CLOSED) (required) |
| `currency` | varchar | Currency code (ISO 4217) (required) |
| `exchangerate` | float | Exchange rate as multiple of system currency unit (required) |
| `billingcycle` | integer | Billing cycle in months |
| `lastbilling` | timestamp | Last billing date as Unix timestamp |
| `description` | text | Detailed general description (required) |
| `contractitems` | json | JSON-encoded contract items (array) |
| `billingitems` | json | JSON-encoded billing items (array) |
| `procurementitems` | json | JSON-encoded procurement items (array) |
| `autobilling` | json | JSON-encoded auto-billing data; only if `billingcycle` is set |

**GIN-indexed fields** (use `filters` plural): `assigneduser`, `status`, `contractnum`, `name`

---

### Files

| Field | Type | Description |
|-------|------|-------------|
| `ID` | timestamp | File ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `record` | timestamp | Record ID (parent dependency); mutually exclusive with `comment` |
| `comment` | timestamp | Comment ID (parent dependency); mutually exclusive with `record` |
| `binfile` | integer | Binary file ID; read-only (not for PUT or PATCH) |
| `filename` | text | Filename (required) |
| `mimetype` | text | MIME type (required) |

**GIN-indexed fields** (use `filters` plural): `filename`

---

### Payments

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Payment ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `assigneduser` | integer | Assigned user ID |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `ledger` | integer | Ledger ID |
| `transaction` | integer | Transaction ID; mutually exclusive with `account` |
| `account` | integer | Account ID; mutually exclusive with `transaction` |
| `date` | timestamp | Designated date as Unix timestamp (defaults to now on creation) (required) |
| `subject` | text | Subject (e.g. bank statement or reference number) (required) |
| `status` | integer | Status (`0`=DRAFT, `1`=COMPLETED, `2`=CANCELLED, `3`=BOOKED) (required) |
| `amount` | float | Amount (monetary) (required) |
| `autoadvance` | integer | Auto-advance to next transaction (required) |
| `description` | text | Detailed general description (required) |

**GIN-indexed fields** (use `filters` plural): `assigneduser`, `ledger`, `subject`

---

### Users

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | User ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `contact` | integer | Contact ID |
| `activity` | integer | Activity (`0`=ACTIVE, `1`=DEACTIVATED, `2`=DELETED) (required) |
| `name` | text | Username (case-insensitively unique) (required) |
| `email` | text | System e-mail address (case-insensitively unique) (required) |
| `nopublic` | integer | Deny access to public data (required) |
| `apionly` | integer | Restricted to API access, no regular login (required) |
| `expdate` | timestamp | Expiry date as Unix timestamp |
| `description` | text | Description (required) |

**GIN-indexed fields** (use `filters` plural): `email`, `name`

---

### Groups

| Field | Type | Description |
|-------|------|-------------|
| `ID` | integer | Group ID (required) |
| `creator` | integer | Creator user ID (defaults to authenticated user on creation) |
| `creationdate` | timestamp | Creation date as Unix timestamp (defaults to now on creation) (required) |
| `lastmodified` | timestamp | Last modification date as Unix timestamp (auto-reset on modification) (required) |
| `leader` | integer | Leader user ID |
| `activity` | integer | Activity (`0`=ACTIVE, `1`=DEACTIVATED, `2`=DELETED) (required) |
| `name` | text | Name (case-insensitively unique) (required) |
| `description` | text | Description (required) |

**GIN-indexed fields** (use `filters` plural): `name`
