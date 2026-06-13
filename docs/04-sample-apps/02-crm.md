---
sidebar_position: 2
sidebar_label: CRM Account List
---

# CRM Account List

The `samples/crm/` application shows how to build a read-heavy account UI with server-side search, joined contact fields, modal editing, and predictable pagination.

## Problem Solved

Use this sample when you need a compact CRUD interface for operational data such as accounts or contacts and you want the server, not the browser, to do the filtering and sorting work.

## Auth Model

The sample uses the same dual browser model as the Kanban app:

- **Token mode** with a pre-obtained access token and optional stored refresh token
- **Session mode** with a `/oauth2/v1/userinfo` probe

Configuration can come from `data-zeyos-*` attributes, `localStorage`, or the `window.ZeyOS` console API.

For long-lived browser sessions, prefer session mode or move OAuth refresh to a backend. Session mode only works from the same origin or when the ZeyOS instance allows credentialed CORS, so token mode is usually the local-development path. The sample keeps browser code free of client credentials.

## Main API Calls

| Operation | Usage in the sample |
|-----------|---------------------|
| `listAccounts` | Fetch paginated CRM rows with aliased and joined fields |
| `getAccount` | Load the full record before editing |
| `createAccount` | Create new accounts from the modal |
| `updateAccount` | Apply modal edits with flat `{ ID, ...fields }` input |
| `deleteAccount` | Remove records from the dataset |

## Reusable Patterns

- **Object-form `fields`**: the UI requests aliased fields such as `City: 'contact.city'`
- **Server-side search**: full-text queries use the `query` parameter instead of client-side filtering
- **Server-side sorting**: column headers map friendly names back to raw API fields
- **Flat update helpers**: update helpers pass path parameters and changed fields in one object
- **Token persistence**: runtime tokens are stored in `localStorage` for the next page load

## Safe to Copy

The sample is a strong reference for:

- dot-notation joins with aliased output fields
- building sort maps from UI column names to API field paths
- debounced search that resets pagination
- small browser apps that still keep auth, state, API, and UI concerns separate

When copying code outside this repository, replace source-tree imports such as `../../../src/index.js` with an import path that exists in your app: an npm package import, a vendored copy of `src/`, or a local symlink.

## Run Locally

```bash
cd /path/to/zeyos/client
python3 -m http.server 8080
```

Open:

```text
http://localhost:8080/samples/crm/
```

## Console API

| Method | Description |
|--------|-------------|
| `ZeyOS.setUrl(url)` | Set the ZeyOS instance URL |
| `ZeyOS.setToken(access, refresh?)` | Persist access and optional refresh tokens |
| `ZeyOS.status()` | Print connection state, search, sort, and page info |
| `ZeyOS.logout()` | Clear stored config and reload |
| `ZeyOS.reconnect()` | Reload and re-run the auth boot sequence |

## What to Read Next

- [Browser UI Playbook](../05-tutorials/01-build-your-own-zeyos-frontend.md)
- [Making Requests](../02-javascript-client/03-making-requests.md)
- [CRM sample README](../../samples/crm/README.md)
