# ZeyOS Dashboard Sample

This directory contains the static dashboard sample application.

The canonical documentation is:

- [Dashboard sample docs](../../docs/04-sample-apps/03-dashboard.md)

## Quick Run

Serve the repository root with any static file server:

```bash
cd /path/to/zeyos/client
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/samples/dashboard/
```

Configure the sample via `data-zeyos-*` attributes in [`index.html`](./index.html) or through the `window.ZeyOS` console API described in the docs.
