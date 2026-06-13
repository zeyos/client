# ZeyOS CRM Account Sample

This directory contains the static CRM account sample application.

The canonical documentation is:

- [CRM sample docs](../../docs/04-sample-apps/02-crm.md)

## Quick Run

Serve the repository root with any static file server:

```bash
cd /path/to/zeyos/client
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/samples/crm/
```

Configure the sample via `data-zeyos-*` attributes in [`index.html`](./index.html) or through the `window.ZeyOS` console API described in the docs.

For localhost, token mode is usually the reliable path. Session mode only works from the same origin or when the ZeyOS instance allows credentialed CORS.

> **Note:** The sample must be served from the **repository root** (the directory containing `src/`), because the client is imported via `../../../src/index.js`. Copying the `samples/` folder in isolation will break that import. Also, do **not** open `index.html` directly via the `file://` protocol — browsers block ES module relative imports under `file://`. Always use a local static server as shown above.
