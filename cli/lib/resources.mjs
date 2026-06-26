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
    fieldAliases: { name: 'lastname' },
    filterAliases: { name: 'lastname' },
  },
  contact: {
    list:   'listContacts',
    get:    'getContact',
    create: 'createContact',
    update: 'updateContact',
    delete: 'deleteContact',
    fields: ['ID', 'firstname', 'lastname', 'email', 'phone', 'account'],
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
    fields: ['ID', 'name', 'startdate', 'enddate', 'location'],
  },
  document: {
    list:   'listDocuments',
    get:    'getDocument',
    create: 'createDocument',
    update: 'updateDocument',
    delete: 'deleteDocument',
    fields: ['ID', 'name', 'doctype', 'docnum', 'account', 'date', 'nettotal'],
  },
  note: {
    list:   'listNotes',
    get:    'getNote',
    create: 'createNote',
    update: 'updateNote',
    delete: 'deleteNote',
    fields: ['ID', 'name', 'text', 'created'],
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
    fields: ['ID', 'name', 'email', 'role', 'active'],
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
    fields: ['ID', 'name', 'type', 'created', 'account'],
  },
  transaction: {
    list:   'listTransactions',
    get:    'getTransaction',
    create: 'createTransaction',
    update: 'updateTransaction',
    delete: 'deleteTransaction',
    fields: ['ID', 'name', 'amount', 'date', 'account'],
  },
  payment: {
    list:   'listPayments',
    get:    'getPayment',
    create: 'createPayment',
    update: 'updatePayment',
    delete: 'deletePayment',
    fields: ['ID', 'amount', 'date', 'method', 'transaction'],
  },
  opportunity: {
    list:   'listOpportunities',
    get:    'getOpportunity',
    create: 'createOpportunity',
    update: 'updateOpportunity',
    delete: 'deleteOpportunity',
    fields: ['ID', 'name', 'status', 'probability', 'amount', 'account'],
  },
  campaign: {
    list:   'listCampaigns',
    get:    'getCampaign',
    create: 'createCampaign',
    update: 'updateCampaign',
    delete: 'deleteCampaign',
    fields: ['ID', 'name', 'status', 'startdate', 'enddate'],
  },
  mailinglist: {
    list:   'listMailingLists',
    get:    'getMailingList',
    create: 'createMailingList',
    update: 'updateMailingList',
    delete: 'deleteMailingList',
    fields: ['ID', 'name', 'description', 'status', 'lastmodified'],
  },
  mailingrecipient: {
    list:   'listMailingRecipients',
    get:    'getMailingRecipient',
    create: 'createMailingRecipient',
    update: 'updateMailingRecipient',
    delete: 'deleteMailingRecipient',
    fields: ['ID', 'message', 'mailinglist', 'campaign', 'email', 'recipientuser', 'recipientgroup'],
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
    fields: ['ID', 'name', 'type', 'discount', 'allaccounts'],
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
    fields: ['ID', 'name', 'mimetype', 'filesize', 'created'],
  },
  invitation: {
    list:   'listInvitations',
    get:    'getInvitation',
    create: 'createInvitation',
    update: 'updateInvitation',
    delete: 'deleteInvitation',
    fields: ['ID', 'email', 'status', 'created'],
  },
  storage: {
    list:   'listStorages',
    get:    'getStorage',
    create: 'createStorage',
    update: 'updateStorage',
    delete: 'deleteStorage',
    fields: ['ID', 'name', 'type', 'capacity'],
  },
};

// ── Aliases ───────────────────────────────────────────────────────────────────

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
  // Colloquials
  invoice:      'document',
  invoices:     'document',
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
