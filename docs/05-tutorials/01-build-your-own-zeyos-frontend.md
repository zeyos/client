---
sidebar_position: 3
sidebar_label: Browser UI Playbook
---

# Browser UI Playbook

This playbook walks through building a browser-based interface on top of the ZeyOS REST API using the `@zeyos/client` JavaScript library. By the end, you will have a working single-page application that authenticates, queries data, renders a UI, and writes changes back with patterns you can reuse in any ZeyOS-connected browser app.

We will build a minimal **Ticket Dashboard** step by step. No application framework or build step is required -- just ES modules, the ZeyOS client, and a browser. The starter HTML below uses the Tailwind CDN only for concise demo styling; remove it or self-host your CSS for production or stricter security environments.

---

## Prerequisites

- A **ZeyOS instance** with some ticket data (e.g. `https://cloud.zeyos.com/demo/`)
- An **access token** (obtain one via the [CLI](../03-cli/01-getting-started.md) or the ZeyOS OAuth2 flow)
- A **local HTTP server** to serve static files (e.g. `python3 -m http.server 8080` or `npx serve .`)

---

## Step 1: Project Setup

Create a project folder with this structure:

```
my-zeyos-app/
  index.html
  app.js
  zeyos-client/        # symlink or copy of the @zeyos/client src/ directory
```

Link the ZeyOS client source so your browser can import it:

```bash
# Symlink (Linux/macOS)
ln -s /path/to/zeyos/client/src ./zeyos-client

# Or copy
cp -r /path/to/zeyos/client/src ./zeyos-client
```

Create a minimal `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My ZeyOS App</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen font-sans p-8">

  <div id="app">
    <h1 class="text-2xl font-bold mb-6">My ZeyOS Ticket Dashboard</h1>
    <div id="content">Loading...</div>
  </div>

  <script type="module" src="./app.js"></script>
</body>
</html>
```

---

## Step 2: Initialize the Client

Create `app.js` and set up the ZeyOS client. You have two authentication options:

### Option A: Token Mode

Use this when you already have an OAuth access token. This is most useful for development and controlled demos:

```js
import { createZeyosClient, MemoryTokenStore } from './zeyos-client/index.js';

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'oauth',
    oauth: {
      tokenStore: new MemoryTokenStore({
        accessToken: 'YOUR_ACCESS_TOKEN',
      }),
    },
  },
});
```

Use session mode or a backend token broker for long-lived browser apps. Do not embed `clientSecret` in shipped browser code just to enable OAuth refresh.

### Option B: Session Mode

Use this when you are already logged into ZeyOS in the same browser:

```js
import { createZeyosClient } from './zeyos-client/index.js';

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'session',
    session: { enabled: true, credentials: 'include' },
  },
});
```

:::tip
For a real application, never hardcode tokens in source files. Persist them only if you control the environment, or prefer session mode or a backend-assisted token flow. See the [Kanban sample](../04-sample-apps/01-kanban.md) for a reusable config pattern.
:::

---

## Step 3: Fetch and Display Data

Add a function to load tickets and render them as a table:

```js
async function loadTickets() {
  const result = await client.api.listTickets({
    fields: ['ID', 'ticketnum', 'name', 'status', 'priority', 'duedate', 'assigneduser'],
    filters: { visibility: 0 },
    sort: ['-lastmodified'],
    limit: 50,
  });

  // Normalise response: list APIs return either an array or { data: [...] }
  const tickets = Array.isArray(result) ? result : (result?.data ?? []);
  return tickets;
}
```

Key things to note:

- **List operations are POST requests.** The client handles this; you just pass an object.
- **Always include `visibility: 0`** to exclude archived/deleted records.
- **Use `filters` (plural)** for best compatibility across all field types. This handles both simple equality filters and GIN-indexed foreign key fields.
- **Always specify `fields`** to keep payloads small. Without it, every field on every record is returned.
- **Normalise the response.** Count-enabled list responses are not uniform across every endpoint or client layer. Treat list calls as either an array or an object wrapper, and inspect count metadata separately when you request it.

Now render it:

```js
const STATUS_LABELS = {
  0: 'Not Started', 1: 'Awaiting Acceptance', 2: 'Accepted',
  3: 'Rejected', 4: 'Active', 5: 'Inactive',
  6: 'Feedback Required', 7: 'Testing', 8: 'Cancelled',
  9: 'Completed', 10: 'Failed', 11: 'Booked',
};

const PRIORITY_LABELS = {
  0: 'Lowest', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Highest',
};

function formatDate(unix) {
  if (!unix) return '';
  return new Date(unix * 1000).toLocaleDateString();
}

function renderTickets(tickets) {
  if (tickets.length === 0) {
    return '<p class="text-gray-500">No tickets found.</p>';
  }

  const rows = tickets.map(t => `
    <tr class="border-t hover:bg-gray-50">
      <td class="py-2 px-3 font-mono text-sm text-gray-400">${t.ticketnum ?? t.ID}</td>
      <td class="py-2 px-3 font-medium">${esc(t.name ?? '')}</td>
      <td class="py-2 px-3 text-sm">${STATUS_LABELS[t.status] ?? t.status}</td>
      <td class="py-2 px-3 text-sm">${PRIORITY_LABELS[t.priority] ?? t.priority}</td>
      <td class="py-2 px-3 text-sm">${formatDate(t.duedate)}</td>
      <td class="py-2 px-3 text-sm">${esc(t.assigneduser ?? '')}</td>
    </tr>
  `).join('');

  return `
    <table class="w-full bg-white rounded-lg shadow text-left">
      <thead>
        <tr class="text-xs uppercase text-gray-500 border-b">
          <th class="py-2 px-3">#</th>
          <th class="py-2 px-3">Name</th>
          <th class="py-2 px-3">Status</th>
          <th class="py-2 px-3">Priority</th>
          <th class="py-2 px-3">Due</th>
          <th class="py-2 px-3">Assigned</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

Wire it up:

```js
async function boot() {
  try {
    const tickets = await loadTickets();
    document.getElementById('content').innerHTML = renderTickets(tickets);
  } catch (err) {
    document.getElementById('content').innerHTML =
      `<p class="text-red-500">Error: ${esc(err.message)}</p>`;
  }
}

boot();
```

Start your server and open the page -- you should see a table of tickets.

---

## Step 4: Filter by Project

Add a project selector above the table. First, load the available projects:

```js
async function loadProjects() {
  try {
    const result = await client.api.listProjects({
      fields: ['ID', 'name'],
      filters: { visibility: 0 },
      sort: ['+name'],
      limit: 500,
    });
    return Array.isArray(result) ? result : (result?.data ?? []);
  } catch {
    return [];
  }
}
```

Then build a `<select>` and reload tickets when the selection changes:

```js
function renderProjectFilter(projects, onSelect) {
  const options = projects.map(p =>
    `<option value="${p.ID}">${esc(p.name)}</option>`
  ).join('');

  return `
    <select id="project-filter"
      class="border rounded-lg px-3 py-2 text-sm mb-4">
      <option value="">All Projects</option>
      ${options}
    </select>`;
}

async function boot() {
  const projects = await loadProjects();
  const app = document.getElementById('content');

  app.innerHTML = renderProjectFilter(projects) + '<div id="tickets">Loading...</div>';

  const loadAndRender = async (projectId) => {
    const filters = { visibility: 0 };
    if (projectId) filters.project = Number(projectId);

    const result = await client.api.listTickets({
      fields: ['ID', 'ticketnum', 'name', 'status', 'priority', 'duedate', 'assigneduser'],
      filters,
      sort: ['-lastmodified'],
      limit: 50,
    });
    const tickets = Array.isArray(result) ? result : (result?.data ?? []);
    document.getElementById('tickets').innerHTML = renderTickets(tickets);
  };

  document.getElementById('project-filter').addEventListener('change', e => {
    loadAndRender(e.target.value);
  });

  await loadAndRender('');
}
```

---

## Step 5: Create a New Ticket

Add a simple form and use the `createTicket` API. Note: **create operations use PUT**, not POST.

```js
function renderCreateForm() {
  return `
    <form id="create-form" class="bg-white rounded-lg shadow p-4 mb-6 flex gap-3 items-end">
      <div class="flex-1">
        <label class="block text-xs font-medium text-gray-600 mb-1">Ticket Name</label>
        <input id="f-name" type="text" placeholder="What needs to be done?"
          class="w-full border rounded-lg px-3 py-2 text-sm" required>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">Priority</label>
        <select id="f-priority" class="border rounded-lg px-3 py-2 text-sm">
          <option value="0">Lowest</option>
          <option value="1">Low</option>
          <option value="2" selected>Medium</option>
          <option value="3">High</option>
          <option value="4">Highest</option>
        </select>
      </div>
      <button type="submit"
        class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
        Create
      </button>
    </form>`;
}
```

Handle form submission:

```js
document.getElementById('create-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('f-name').value.trim();
  if (!name) return;

  try {
    await client.api.createTicket({
      name,
      priority: Number(document.getElementById('f-priority').value),
      status: 0,
      visibility: 0,
    });

    document.getElementById('f-name').value = '';
    await loadAndRender(''); // Refresh the list
  } catch (err) {
    alert(`Create failed: ${err.message}`);
  }
});
```

For generated create and update operations, the flat input style works for normal record fields.

---

## Step 6: Update a Ticket

Update a record by passing the record ID and the changed fields:

```js
async function updateTicketStatus(ticketId, newStatus) {
  const updated = await client.api.updateTicket({
    ID: ticketId,
    status: newStatus,
  });

  // The response contains the full updated record -- use it to
  // confirm the change was applied
  return updated;
}
```

If you prefer explicit separation, `body` and `data` are also supported:

```js
await client.api.updateTicket({ ID: ticketId, body: { status: newStatus } });
```

---

## Step 7: Delete a Ticket

Deletion is straightforward:

```js
async function removeTicket(ticketId) {
  await client.api.deleteTicket({ ID: ticketId });
}
```

Always confirm with the user before deleting -- there is no undo.

---

## Step 8: Fetch Related Data

Most ZeyOS entities are related to each other. For example, tickets can have tasks. To load tasks for a specific ticket:

```js
async function loadTasks(ticketId) {
  const result = await client.api.listTasks({
    fields: ['ID', 'tasknum', 'name', 'status', 'duedate', 'assigneduser'],
    filters: { ticket: ticketId, visibility: 0 },
    sort: ['+name'],
    limit: 200,
  });
  return Array.isArray(result) ? result : (result?.data ?? []);
}
```

You can also use **dot-notation joins** to pull fields from related records in a single request:

```js
const tickets = await client.api.listTickets({
  fields: {
    Id: 'ID',
    Name: 'name',
    ProjectName: 'project.name',
    AssignedTo: 'assigneduser.name',
    ContactCity: 'contact.city',
  },
  filters: { visibility: 0 },
  limit: 50,
});
```

This returns flattened objects like `{ Id: 42, Name: '...', ProjectName: 'Acme', AssignedTo: 'Jane', ContactCity: 'Berlin' }` -- no extra API calls needed.

---

## Step 9: Handle Errors Gracefully

Every API error throws a `ZeyosApiError` with rich context:

```js
import { ZeyosApiError } from './zeyos-client/index.js';

try {
  await client.api.getTicket({ ID: 999999 });
} catch (err) {
  if (err instanceof ZeyosApiError) {
    switch (err.status) {
      case 401:
        // Token expired and auto-refresh failed
        showLoginScreen();
        break;
      case 403:
        showMessage('You do not have permission to view this record.');
        break;
      case 404:
        showMessage('Record not found.');
        break;
      default:
        showMessage(`Error ${err.status}: ${err.body ?? err.message}`);
    }
  } else {
    // Network error, timeout, etc.
    showMessage('Network error. Please check your connection.');
  }
}
```

---

## Step 10: Working with Dates

All ZeyOS date fields are **Unix timestamps in seconds** (not milliseconds). This catches most JavaScript developers off guard since `Date.now()` returns milliseconds.

```js
// Reading: multiply by 1000
const jsDate = new Date(ticket.duedate * 1000);

// Writing: divide by 1000
const duedate = Math.floor(new Date('2026-06-15').getTime() / 1000);
await client.api.updateTicket({ ID: id, body: { duedate } });

// Checking overdue
const isOverdue = ticket.duedate * 1000 < Date.now();
```

---

## Summary: Quick Reference Card

| Task | Code |
|------|------|
| List records | `client.api.listTickets({ fields: [...], filters: {...}, sort: [...], limit: N })` |
| Get one record | `client.api.getTicket({ ID: 42 })` |
| Create | `client.api.createTicket({ name: '...', status: 0, visibility: 0 })` |
| Update | `client.api.updateTicket({ ID: 42, body: { status: 4 } })` |
| Delete | `client.api.deleteTicket({ ID: 42 })` |
| Related data | `client.api.listTasks({ filters: { ticket: 42 } })` |
| Dot-notation join | `fields: { City: 'contact.city', Agent: 'assigneduser.name' }` |
| Date read | `new Date(record.duedate * 1000)` |
| Date write | `Math.floor(date.getTime() / 1000)` |

---

## Where to Go Next

- **[Practical Guide](../02-javascript-client/04-practical-guide.md)** -- deeper coverage of `filter` vs `filters`, token persistence, and optimistic UI patterns
- **[Making Requests](../02-javascript-client/03-making-requests.md)** -- full reference for field selection, sorting, pagination, extended data, and error handling
- **[Data Retrieval](../01-api-reference/01-data-retrieval.md)** -- the complete REST query language with advanced filter operators, full-text search, and composite expressions
- **[Kanban Sample](../04-sample-apps/01-kanban.md)** -- a reusable sample browser app with drag-and-drop, modals, and session detection
- **[Authentication](../02-javascript-client/02-authentication.md)** -- OAuth 2.0 flows, session mode, legacy auth, and token management

---

## Available Resources

The ZeyOS API provides access to over 50 resource types. Here are the ones most commonly used when building custom frontends:

| Resource | Operations | Use case |
|----------|-----------|----------|
| `Tickets` | list, get, create, update, delete | Issue tracking, support, project work |
| `Tasks` | list, get, create, update, delete | Task management within tickets/projects |
| `Accounts` | list, get, create, update, delete | CRM contacts and companies |
| `Projects` | list, get, create, update, delete | Project organisation |
| `Contacts` | list, get, create, update, delete | Contact details (addresses, phone, email) |
| `Appointments` | list, get, create, update, delete | Calendar and scheduling |
| `Transactions` | list, get, create, update, delete | Invoices, quotes, orders |
| `Items` | list, get, create, update, delete | Products and services |
| `Documents` | list, get, create, update, delete | File management |
| `Notes` | list, get, create, update, delete | Notes attached to any entity |
| `Messages` | list, get, create, update, delete | Email and messaging |
| `Opportunities` | list, get, create, update, delete | Sales pipeline |
| `Users` | list, get | Team members and permissions |

Every resource follows the same API patterns shown in this guide. Once you know how to work with tickets, you can work with any resource.
