import { editDistance } from '@zeyos/client';

/**
 * Resource registry — maps CLI resource names to ZeyOS API operation IDs
 * and defines sensible defaults for display fields.
 *
 * Naming rules
 *  - Singular OR plural accepted  (ticket / tickets)
 *  - Case-insensitive
 *  - Common aliases supported
 */

// ── Registry ─────────────────────────────────────────────────────────────────

/** @typedef {import('./types.mjs').ResourceDef} ResourceDef */

/** @type {Record<string, ResourceDef>} */
const REGISTRY = {
  actionstep: {
    list:   'listActionSteps',
    get:    'getActionStep',
    create: 'createActionStep',
    update: 'updateActionStep',
    delete: 'deleteActionStep',
    fields: ['ID', 'actionnum', 'name', 'status', 'date', 'duedate', 'effort', 'ticket', 'task', 'account'],
  },
  ticket: {
    list:   'listTickets',
    get:    'getTicket',
    create: 'createTicket',
    update: 'updateTicket',
    delete: 'deleteTicket',
    fields: ['ID', 'ticketnum', 'name', 'status', 'priority', 'duedate', 'account', 'project', 'lastmodified'],
  },
  task: {
    list:   'listTasks',
    get:    'getTask',
    create: 'createTask',
    update: 'updateTask',
    delete: 'deleteTask',
    fields: ['ID', 'tasknum', 'name', 'status', 'priority', 'duedate', 'ticket', 'project', 'projectedeffort'],
  },
  account: {
    list:   'listAccounts',
    get:    'getAccount',
    create: 'createAccount',
    update: 'updateAccount',
    delete: 'deleteAccount',
    fields: ['ID', 'customernum', 'lastname', 'firstname', 'type', 'assigneduser', 'lastmodified'],
    fieldAliases: { name: 'lastname', companyname: 'lastname', company: 'lastname', accountname: 'lastname' },
    filterAliases: { name: 'lastname', companyname: 'lastname', company: 'lastname', accountname: 'lastname' },
  },
  contact: {
    list:   'listContacts',
    get:    'getContact',
    create: 'createContact',
    update: 'updateContact',
    delete: 'deleteContact',
    fields: ['ID', 'firstname', 'lastname', 'email', 'phone', 'company'],
  },
  address: {
    list:   'listAddresses',
    get:    'getAddress',
    create: 'createAddress',
    update: 'updateAddress',
    delete: 'deleteAddress',
    fields: ['ID', 'account', 'contact', 'type', 'default'],
  },
  project: {
    list:   'listProjects',
    get:    'getProject',
    create: 'createProject',
    update: 'updateProject',
    delete: 'deleteProject',
    fields: ['ID', 'projectnum', 'name', 'status', 'assigneduser', 'lastmodified'],
  },
  appointment: {
    list:   'listAppointments',
    get:    'getAppointment',
    create: 'createAppointment',
    update: 'updateAppointment',
    delete: 'deleteAppointment',
    fields: ['ID', 'name', 'datefrom', 'dateto', 'location'],
  },
  document: {
    list:   'listDocuments',
    get:    'getDocument',
    create: 'createDocument',
    update: 'updateDocument',
    delete: 'deleteDocument',
    fields: ['ID', 'name', 'documentnum', 'status', 'filename', 'lastmodified'],
  },
  note: {
    list:   'listNotes',
    get:    'getNote',
    create: 'createNote',
    update: 'updateNote',
    delete: 'deleteNote',
    fields: ['ID', 'name', 'text', 'creationdate'],
  },
  message: {
    list:   'listMessages',
    get:    'getMessage',
    create: 'createMessage',
    update: 'updateMessage',
    delete: 'deleteMessage',
    fields: ['ID', 'date', 'mailbox', 'subject', 'sender_email', 'to_email', 'ticket', 'reference', 'messageid'],
  },
  item: {
    list:   'listItems',
    get:    'getItem',
    create: 'createItem',
    update: 'updateItem',
    delete: 'deleteItem',
    fields: ['ID', 'itemnum', 'name', 'manufacturer', 'type', 'sellingprice', 'purchaseprice'],
  },
  user: {
    list:   'listUsers',
    get:    'getUser',
    fields: ['ID', 'name', 'email', 'activity', 'expdate'],
  },
  group: {
    list:   'listGroups',
    get:    'getGroup',
    fields: ['ID', 'name', 'description'],
  },
  groupuser: {
    list:   'listGroupsToUsers',
    get:    'getGroupToUser',
    fields: ['ID', 'group', 'user'],
  },
  event: {
    list:   'listEvents',
    get:    'getEvent',
    create: 'createEvent',
    update: 'updateEvent',
    delete: 'deleteEvent',
    fields: ['ID', 'name', 'entity', 'datefrom', 'dateto'],
  },
  transaction: {
    list:   'listTransactions',
    get:    'getTransaction',
    create: 'createTransaction',
    update: 'updateTransaction',
    delete: 'deleteTransaction',
    fields: ['ID', 'transactionnum', 'type', 'date', 'duedate', 'status', 'account', 'netamount'],
    presets: {
      quotes: { type: 0 },
      orders: { type: 1 },
      invoices: { type: 3 },
      credits: { type: 4 },
      'open-invoices': {
        type: 3,
        status: { $nin: [3, 4, 6, 7, 10, 11, 14, 15, 18, 19, 20, 21, 22, 23] }
      },
      'overdue-invoices': () => ({
        type: 3,
        status: { $nin: [3, 4, 6, 7, 10, 11, 14, 15, 18, 19, 20, 21, 22, 23] },
        duedate: { $lt: Math.floor(Date.now() / 1000) }
      }),
      'paid-invoices': { type: 3, status: { $in: [20, 21] } }
    },
  },
  payment: {
    list:   'listPayments',
    get:    'getPayment',
    create: 'createPayment',
    update: 'updatePayment',
    delete: 'deletePayment',
    fields: ['ID', 'amount', 'date', 'status', 'subject', 'transaction', 'account'],
  },
  opportunity: {
    list:   'listOpportunities',
    get:    'getOpportunity',
    create: 'createOpportunity',
    update: 'updateOpportunity',
    delete: 'deleteOpportunity',
    fields: ['ID', 'name', 'opportunitynum', 'status', 'probability', 'mostlikely', 'account'],
  },
  campaign: {
    list:   'listCampaigns',
    get:    'getCampaign',
    create: 'createCampaign',
    update: 'updateCampaign',
    delete: 'deleteCampaign',
    fields: ['ID', 'name', 'status', 'datefrom', 'dateto'],
  },
  mailinglist: {
    list:   'listMailingLists',
    get:    'getMailingList',
    create: 'createMailingList',
    update: 'updateMailingList',
    delete: 'deleteMailingList',
    fields: ['ID', 'name', 'sender', 'campaign', 'lastmodified'],
  },
  mailingrecipient: {
    list:   'listMailingRecipients',
    get:    'getMailingRecipient',
    create: 'createMailingRecipient',
    update: 'updateMailingRecipient',
    delete: 'deleteMailingRecipient',
    fields: ['ID', 'message', 'participant', 'email', 'creationdate'],
  },
  dunning: {
    list:   'listDunningNotices',
    get:    'getDunningNotice',
    create: 'createDunningNotice',
    update: 'updateDunningNotice',
    delete: 'deleteDunningNotice',
    fields: ['ID', 'dunningnum', 'type', 'status', 'date', 'duedate', 'account', 'recipient', 'fee'],
  },
  dunningtransaction: {
    list:   'listDunningToTransactions',
    get:    'getDunningToTransaction',
    create: 'createDunningToTransaction',
    update: 'updateDunningToTransaction',
    delete: 'deleteDunningToTransaction',
    fields: ['ID', 'dunning', 'transaction'],
  },
  pricelist: {
    list:   'listPriceLists',
    get:    'getPriceList',
    create: 'createPriceList',
    update: 'updatePriceList',
    delete: 'deletePriceList',
    fields: ['ID', 'name', 'type', 'currency', 'discount', 'applytoall'],
  },
  pricelistaccount: {
    list:   'listPriceListsToAccounts',
    get:    'getPriceListToAccount',
    create: 'createPriceListToAccount',
    update: 'updatePriceListToAccount',
    delete: 'deletePriceListToAccount',
    fields: ['ID', 'pricelist', 'account'],
  },
  price: {
    list:   'listPrices',
    get:    'getPrice',
    create: 'createPrice',
    update: 'updatePrice',
    delete: 'deletePrice',
    fields: ['ID', 'pricelist', 'item', 'price', 'rebate', 'discount'],
  },
  customfield: {
    list:   'listCustomFields',
    get:    'getCustomField',
    fields: ['ID', 'name', 'identifier', 'context', 'reference', 'type', 'entity', 'activity'],
  },
  file: {
    list:   'listFiles',
    get:    'getFile',
    create: 'createFile',
    update: 'updateFile',
    delete: 'deleteFile',
    fields: ['ID', 'filename', 'mimetype', 'record', 'creationdate'],
  },
  invitation: {
    list:   'listInvitations',
    get:    'getInvitation',
    create: 'createInvitation',
    update: 'updateInvitation',
    delete: 'deleteInvitation',
    fields: ['ID', 'name', 'email', 'appointment', 'contact', 'flag'],
  },
  storage: {
    list:   'listStorages',
    get:    'getStorage',
    create: 'createStorage',
    update: 'updateStorage',
    delete: 'deleteStorage',
    fields: ['ID', 'name', 'description'],
  },
};

// ── Aliases ───────────────────────────────────────────────────────────────────

// ── Transaction pseudo-entities ──────────────────────────────────────────────
// `transactions` is one table holding twelve different business documents,
// separated only by the `type` column. Working with it means remembering that
// an invoice is `type: 3`, which is exactly the kind of detail that makes the
// raw table hostile to both people and agents.
//
// Each type therefore gets a first-class entity name. They are ordinary
// transactions with `type` bound: the filter is applied on every read, and set
// on every create, so `zeyos list billing_invoices` and
// `zeyos create billing_invoices --account 42` both do the obvious thing.
//
// Names and codes come from the `transactions.type` enum in the canonical
// schema (cloud.zeyos.com/__doc/dbref.json), verified 2026-08-28.

/** Status codes that mean an invoice is no longer outstanding. */
const SETTLED_STATUS = [3, 4, 6, 7, 10, 11, 14, 15, 18, 19, 20, 21, 22, 23];

const TRANSACTION_TYPES = {
  billing_quote:            0,
  billing_order:            1,
  billing_delivery:         2,
  billing_invoice:          3,
  billing_credit:           4,
  procurement_request:      5,
  procurement_order:        6,
  procurement_delivery:     7,
  procurement_invoice:      8,
  procurement_credit:       9,
  production_fabrication:  10,
  production_disassembly:  11,
};

/** Presets that only make sense on an invoice-shaped transaction. */
const INVOICE_PRESETS = {
  open:     { status: { $nin: SETTLED_STATUS } },
  overdue:  () => ({ status: { $nin: SETTLED_STATUS }, duedate: { $lt: Math.floor(Date.now() / 1000) } }),
  paid:     { status: { $in: [20, 21] } },
  draft:    { status: 0 },
  booked:   { status: 1 },
  cancelled:{ status: 3 },
};

for (const [name, type] of Object.entries(TRANSACTION_TYPES)) {
  REGISTRY[name] = {
    list:   'listTransactions',
    get:    'getTransaction',
    create: 'createTransaction',
    update: 'updateTransaction',
    delete: 'deleteTransaction',
    // `type` is omitted from the display columns: it is constant by definition.
    fields: ['ID', 'transactionnum', 'date', 'duedate', 'status', 'account', 'netamount'],
    // Applied beneath any --preset and any user --filter, and merged into the
    // body on create.
    boundFilters: { type },
    boundFields:  { type },
    ...(name.endsWith('_invoice') || name.endsWith('_credit') ? { presets: { ...INVOICE_PRESETS } } : {}),
  };
}

const ALIASES = {
  // Plurals
  actionsteps:  'actionstep',
  'action-steps': 'actionstep',
  action_steps: 'actionstep',
  timeentry:    'actionstep',
  timeentries:  'actionstep',
  'time-entry': 'actionstep',
  'time-entries': 'actionstep',
  tickets:      'ticket',
  tasks:        'task',
  accounts:     'account',
  contacts:     'contact',
  addresses:    'address',
  projects:     'project',
  appointments: 'appointment',
  documents:    'document',
  doc:          'document',
  docs:         'document',
  notes:        'note',
  messages:     'message',
  items:        'item',
  users:        'user',
  groups:       'group',
  groupuser:    'groupuser',
  groupusers:   'groupuser',
  groups2user:  'groupuser',
  groups2users: 'groupuser',
  'group-user': 'groupuser',
  'group-users': 'groupuser',
  'groups-to-user': 'groupuser',
  'groups-to-users': 'groupuser',
  events:       'event',
  transactions: 'transaction',
  payments:     'payment',
  opportunities:'opportunity',
  campaigns:    'campaign',
  mailinglists:  'mailinglist',
  'mailing-list': 'mailinglist',
  'mailing-lists': 'mailinglist',
  mailingrecipients: 'mailingrecipient',
  'mailing-recipient': 'mailingrecipient',
  'mailing-recipients': 'mailingrecipient',
  dunnings:      'dunning',
  'dunning-notice': 'dunning',
  'dunning-notices': 'dunning',
  dunningnotice: 'dunning',
  dunningnotices: 'dunning',
  dunning2transaction: 'dunningtransaction',
  dunning2transactions: 'dunningtransaction',
  'dunning-transaction': 'dunningtransaction',
  'dunning-transactions': 'dunningtransaction',
  'dunning-to-transaction': 'dunningtransaction',
  'dunning-to-transactions': 'dunningtransaction',
  pricelists:    'pricelist',
  'price-list':  'pricelist',
  'price-lists': 'pricelist',
  pricelistaccount: 'pricelistaccount',
  pricelistaccounts: 'pricelistaccount',
  pricelists2account: 'pricelistaccount',
  pricelists2accounts: 'pricelistaccount',
  'price-list-account': 'pricelistaccount',
  'price-list-accounts': 'pricelistaccount',
  prices:        'price',
  customfields:  'customfield',
  custom_fields: 'customfield',
  'custom-fields': 'customfield',
  files:        'file',
  invitations:  'invitation',
  storages:     'storage',
  // Transaction pseudo-entities: plural and hyphenated spellings.
  billing_quotes:           'billing_quote',
  'billing-quote':          'billing_quote',
  'billing-quotes':         'billing_quote',
  billing_orders:           'billing_order',
  'billing-order':          'billing_order',
  'billing-orders':         'billing_order',
  billing_deliveries:       'billing_delivery',
  'billing-delivery':       'billing_delivery',
  'billing-deliveries':     'billing_delivery',
  billing_invoices:         'billing_invoice',
  'billing-invoice':        'billing_invoice',
  'billing-invoices':       'billing_invoice',
  billing_credits:          'billing_credit',
  'billing-credit':         'billing_credit',
  'billing-credits':        'billing_credit',
  procurement_requests:     'procurement_request',
  'procurement-request':    'procurement_request',
  'procurement-requests':   'procurement_request',
  procurement_orders:       'procurement_order',
  'procurement-order':      'procurement_order',
  'procurement-orders':     'procurement_order',
  procurement_deliveries:   'procurement_delivery',
  'procurement-delivery':   'procurement_delivery',
  'procurement-deliveries': 'procurement_delivery',
  procurement_invoices:     'procurement_invoice',
  'procurement-invoice':    'procurement_invoice',
  'procurement-invoices':   'procurement_invoice',
  procurement_credits:      'procurement_credit',
  'procurement-credit':     'procurement_credit',
  'procurement-credits':    'procurement_credit',
  production_fabrications:  'production_fabrication',
  'production-fabrication': 'production_fabrication',
  'production-fabrications':'production_fabrication',
  production_disassemblies: 'production_disassembly',
  'production-disassembly': 'production_disassembly',
  'production-disassemblies': 'production_disassembly',

  // Colloquials. Unqualified sales vocabulary maps to the billing side, which is
  // what someone asking for "invoices" or "orders" almost always means; the
  // procurement equivalents must be named explicitly.
  invoice:      'billing_invoice',
  invoices:     'billing_invoice',
  quote:        'billing_quote',
  quotes:       'billing_quote',
  order:        'billing_order',
  orders:       'billing_order',
  delivery:     'billing_delivery',
  deliveries:   'billing_delivery',
  credit:       'billing_credit',
  credits:      'billing_credit',
  bill:         'procurement_invoice',
  bills:        'procurement_invoice',
  purchaseorder:  'procurement_order',
  purchaseorders: 'procurement_order',
  'purchase-order':  'procurement_order',
  'purchase-orders': 'procurement_order',
  po:           'procurement_order',
  crm:          'account',
  lead:         'opportunity',
  leads:        'opportunity',
};

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Resolve a CLI resource name to a ResourceDef.
 * Returns undefined if not found.
 *
 * @param {string} name  - e.g. "ticket", "tickets", "TICKET"
 * @returns {ResourceDef|undefined}
 */
export function resolveResource(name) {
  const lower = name.toLowerCase();
  const canonical = ALIASES[lower] ?? lower;
  return REGISTRY[canonical];
}

/**
 * Return the canonical resource name for a given input.
 * Returns undefined if not found.
 */
export function canonicalName(name) {
  const lower = name.toLowerCase();
  return ALIASES[lower] ?? (REGISTRY[lower] ? lower : undefined);
}

/** Return a sorted list of all canonical resource names. */
export function listResources() {
  return Object.keys(REGISTRY).sort();
}

/**
 * Every spelling that resolves to a resource — canonical names plus aliases.
 * Used for "did you mean" on a typo, where `invoces` should reach `invoices`
 * even though only `billing_invoice` is canonical.
 */
export function listResourceSpellings() {
  return [...Object.keys(REGISTRY), ...Object.keys(ALIASES)];
}

/**
 * Closest known entity spelling for a typo, or null when nothing is close.
 * @param {string} name
 * @returns {string|null}
 */
export function suggestResource(name) {
  const input = String(name || '').toLowerCase();
  if (!input) return null;

  // Rank purely by edit distance. `suggestClosest` prefers a substring match,
  // which is wrong here: the alias list holds short names like `bill`, `po` and
  // `crm`, so "billing_invoces" would be answered with "bill".
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of listResourceSpellings()) {
    const distance = editDistance(input, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  // Scale the threshold to the input so short names don't attract nonsense.
  return bestDistance <= Math.max(2, Math.floor(input.length / 3)) ? best : null;
}

// ── Grouping (for discovery output) ──────────────────────────────────────────
// A flat alphabetical dump of 43 entities buries the ones people actually want.
// Groups are ordered by how often they are the answer to "what can I list?".

/** @type {[string, string[]][]} */
const GROUPS = [
  ['Billing documents', [
    'billing_quote', 'billing_order', 'billing_delivery', 'billing_invoice', 'billing_credit'
  ]],
  ['Procurement documents', [
    'procurement_request', 'procurement_order', 'procurement_delivery',
    'procurement_invoice', 'procurement_credit'
  ]],
  ['Production documents', ['production_fabrication', 'production_disassembly']],
  ['Finance', ['transaction', 'payment', 'dunning', 'dunningtransaction']],
  ['CRM', ['account', 'contact', 'address', 'opportunity', 'campaign', 'mailinglist', 'mailingrecipient']],
  ['Service & projects', ['ticket', 'task', 'actionstep', 'project', 'appointment', 'note', 'message', 'event']],
  ['Catalog & pricing', ['item', 'price', 'pricelist', 'pricelistaccount']],
  ['Documents & files', ['document', 'file', 'storage']],
  ['System', ['user', 'group', 'groupuser', 'invitation', 'customfield']],
];

/** One-line descriptions for the entities whose names don't fully explain them. */
const DESCRIPTIONS = {
  billing_quote:          'Quotes issued to customers',
  billing_order:          'Sales orders',
  billing_delivery:       'Delivery notes to customers',
  billing_invoice:        'Invoices issued to customers',
  billing_credit:         'Credit notes issued to customers',
  procurement_request:    'Purchase requisitions',
  procurement_order:      'Purchase orders to suppliers',
  procurement_delivery:   'Goods received from suppliers',
  procurement_invoice:    'Supplier invoices (bills)',
  procurement_credit:     'Credit notes from suppliers',
  production_fabrication: 'Production/assembly runs',
  production_disassembly: 'Disassembly runs',
  transaction:            'All transaction types, unfiltered',
  payment:                'Payments against transactions',
  dunning:                'Dunning notices for overdue receivables',
  dunningtransaction:     'Links between dunning notices and transactions',
  account:                'Customers, suppliers and organizations',
  contact:                'People linked to accounts',
  actionstep:             'Worklog entries and booked effort',
  groupuser:              'Group membership links',
  pricelistaccount:       'Links between price lists and accounts',
  customfield:            'Custom field definitions',
  event:                  'System event records',
  storage:                'Storage locations',
  address:                'Postal and business addresses',
  opportunity:            'Sales opportunities and pipeline',
  campaign:               'Marketing campaigns',
  mailinglist:            'Marketing mailing lists',
  mailingrecipient:       'Recipients linked to mailings',
  ticket:                 'Support, service and work requests',
  task:                   'Project and ticket tasks',
  project:                'Customer and internal projects',
  appointment:            'Calendar appointments',
  note:                   'Free-form notes on records',
  message:                'Email and communication messages',
  item:                   'Products, services and catalog items',
  price:                  'Item prices within a price list',
  pricelist:              'Price-list definitions',
  document:               'Business documents and file records',
  file:                   'Uploaded file metadata',
  user:                   'ZeyOS user accounts',
  group:                  'User and permission groups',
  invitation:             'User invitations',
};

/**
 * The entity that owns a given `transactions.type`, for pointing a caller at the
 * right name when they try to override a bound type.
 * @param {number} type
 * @returns {string|undefined}
 */
export function resourceForTransactionType(type) {
  return Object.keys(TRANSACTION_TYPES).find((name) => TRANSACTION_TYPES[name] === type);
}

/**
 * One-line description for a canonical entity name, if one is defined.
 * @param {string} name
 * @returns {string|undefined}
 */
export function resourceDescription(name) {
  return DESCRIPTIONS[name];
}

/**
 * Entities grouped for discovery output.
 *
 * Every registry entry appears exactly once: anything missing from GROUPS falls
 * into "Other", so adding a resource can never make it silently undiscoverable.
 *
 * @returns {{ label: string, entities: { name: string, description?: string, boundType?: number, operations: string[] }[] }[]}
 */
export function listResourceGroups() {
  const grouped = new Set(GROUPS.flatMap(([, names]) => names));
  const ungrouped = Object.keys(REGISTRY).filter((name) => !grouped.has(name)).sort();
  const sections = ungrouped.length ? [...GROUPS, ['Other', ungrouped]] : GROUPS;

  return sections.map(([label, names]) => ({
    label,
    entities: names.filter((name) => REGISTRY[name]).map((name) => {
      const res = REGISTRY[name];
      return {
        name,
        description: DESCRIPTIONS[name],
        boundType: res.boundFilters?.type,
        operations: ['list', 'get', 'create', 'update', 'delete'].filter((op) => res[op])
      };
    })
  })).filter((section) => section.entities.length > 0);
}
