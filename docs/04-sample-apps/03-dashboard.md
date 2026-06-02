---
sidebar_position: 3
sidebar_label: Dashboard
---

# Dashboard

The `samples/dashboard/` application shows how to build a read-only operational dashboard that combines multiple ZeyOS queries into one browser view.

## Problem Solved

Use this sample when you need KPI cards, summary charts, and recent-activity panels without building a heavy frontend stack.

## Auth Model

The dashboard follows the same browser auth model as the other samples:

- **Token mode** with a pre-obtained access token and optional stored refresh token
- **Session mode** via `/oauth2/v1/userinfo`

Configuration can come from `data-zeyos-*` attributes, `localStorage`, or the `window.ZeyOS` console API.

For long-lived browser sessions, prefer session mode or move OAuth refresh to a backend. The sample avoids shipping client credentials in browser code.

## Main API Calls

| Operation | Usage in the sample |
|-----------|---------------------|
| `listTickets` with `count: true` | Build total, active, and overdue KPI cards |
| `listTickets` with explicit fields | Render recent ticket activity |
| `listAccounts` with `count: true` | Build total account KPIs |
| `listAccounts` with joins | Render recent account activity |

## Reusable Patterns

- **Parallel data loading**: the dashboard fires independent queries with `Promise.all`
- **Count-first dashboards**: KPI cards use count-enabled requests instead of loading full datasets
- **Defensive count handling**: the sample treats count-enabled responses conservatively instead of assuming a single wrapper shape
- **Read-only browser views**: the app demonstrates a useful UI that never mutates records
- **Minimal field selection**: each summary query requests only the fields needed for display

## Safe to Copy

The dashboard is a good template for:

- status or backlog overview pages
- home pages for internal operator portals
- management dashboards that aggregate a few targeted ZeyOS queries
- small browser apps that need strong perceived performance from parallel loading

## Run Locally

```bash
cd /path/to/zeyos/client
python3 -m http.server 8080
```

Open:

```text
http://localhost:8080/samples/dashboard/
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

- [Server-Side Integrations](../05-tutorials/03-server-side-integrations.md)
- [Making Requests](../02-javascript-client/03-making-requests.md)
- [Dashboard sample README](../../samples/dashboard/README.md)
