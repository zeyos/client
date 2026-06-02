---
sidebar_position: 1
sidebar_label: Kanban Board
---

# Kanban Board

The `samples/kanban/` application shows how to build a browser-based work queue on top of ZeyOS using plain ES modules and the generated JavaScript client.

## Problem Solved

Use this sample when you need a UI for operators who move work through statuses, inspect details, and create follow-up work without leaving a lightweight browser app.

## Auth Model

The sample supports both browser auth models used throughout this docs set:

- **Token mode** using a pre-obtained access token and optional stored refresh token
- **Session mode** by probing `/oauth2/v1/userinfo` with `credentials: 'include'`

Configuration can come from:

- `data-zeyos-*` attributes in `samples/kanban/index.html`
- persisted `localStorage` values
- the `window.ZeyOS` console API

For long-lived browser sessions, prefer session mode or move OAuth refresh to a backend. The sample does not embed client credentials for browser-side refresh.

## Main API Calls

| Operation | Usage in the sample |
|-----------|---------------------|
| `listTickets` | Load the board columns and context-filtered ticket lists |
| `getTicket` | Fetch the full ticket for the detail dialog |
| `createTicket` | Create new tickets from the modal |
| `updateTicket` | Move tickets between columns and edit ticket details |
| `deleteTicket` | Remove tickets from the board |
| `listTasks` | Load tasks linked to a ticket |
| `listProjects` | Populate the project context dropdown |

## Reusable Patterns

- **Auth boot sequence**: URL resolution, token detection, session probe, then app boot
- **Optimistic UI update**: move the card first, then confirm with `updateTicket`, then revert on failure
- **Explicit update body**: all ticket updates use `{ ID, body }`
- **Context filtering**: a single filter object drives board views such as “all tickets” or “project tickets”
- **Persistent UI settings**: board columns and runtime config live in `localStorage`

## Safe to Copy

The following pieces are good starting points for a new UI:

- the token/session boot sequence in `samples/kanban/js/main.js`
- the session detection helper in `samples/kanban/js/auth.js`
- the optimistic update pattern around `updateTicket`
- the `window.ZeyOS` console API for local development and troubleshooting

## Run Locally

Serve the repository root with any static file server:

```bash
cd /path/to/zeyos/client
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/samples/kanban/
```

## Console API

| Method | Description |
|--------|-------------|
| `ZeyOS.setUrl(url)` | Set the ZeyOS instance URL |
| `ZeyOS.setToken(access, refresh?)` | Persist access and optional refresh tokens |
| `ZeyOS.status()` | Print effective connection state |
| `ZeyOS.logout()` | Clear stored config and reload |
| `ZeyOS.reconnect()` | Reload and re-run the auth boot sequence |

## What to Read Next

- [Browser UI Playbook](../05-tutorials/01-build-your-own-zeyos-frontend.md)
- [Practical Guide](../02-javascript-client/04-practical-guide.md)
- [Kanban sample README](../../samples/kanban/README.md)
