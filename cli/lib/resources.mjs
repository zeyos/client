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

/**
 * @typedef {Object} ResourceDef
 * @property {string}   list      - operationId for list/query
 * @property {string}   get       - operationId for single-record fetch
 * @property {string}   [create]  - operationId for create
 * @property {string}   [update]  - operationId for update
 * @property {string}   [delete]  - operationId for delete
 * @property {string[]} fields    - default display fields (table view)
 * @property {string}   [idField] - primary key field name (default: 'ID')
 */

/** @type {Record<string, ResourceDef>} */
const REGISTRY = {
  ticket: {
    list:   'listTickets',
    get:    'getTicket',
    create: 'createTicket',
    update: 'updateTicket',
    delete: 'deleteTicket',
    fields: ['ID', 'ticketnum', 'name', 'status', 'priority', 'duedate', 'lastmodified'],
  },
  task: {
    list:   'listTasks',
    get:    'getTask',
    create: 'createTask',
    update: 'updateTask',
    delete: 'deleteTask',
    fields: ['ID', 'tasknum', 'name', 'status', 'priority', 'duedate', 'ticket'],
  },
  account: {
    list:   'listAccounts',
    get:    'getAccount',
    create: 'createAccount',
    update: 'updateAccount',
    delete: 'deleteAccount',
    fields: ['ID', 'customernum', 'lastname', 'firstname', 'type', 'assigneduser', 'lastmodified'],
  },
  contact: {
    list:   'listContacts',
    get:    'getContact',
    create: 'createContact',
    update: 'updateContact',
    delete: 'deleteContact',
    fields: ['ID', 'firstname', 'lastname', 'email', 'phone', 'account'],
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
    fields: ['ID', 'subject', 'sender', 'created', 'read'],
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
  tickets:      'ticket',
  tasks:        'task',
  accounts:     'account',
  contacts:     'contact',
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
  events:       'event',
  transactions: 'transaction',
  payments:     'payment',
  opportunities:'opportunity',
  campaigns:    'campaign',
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
