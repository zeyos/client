---
sidebar_label: MCP Server
---

# MCP Server

`zeyos-mcp` is the zero-dependency Model Context Protocol server included with `@zeyos/cli`. It exposes the CLI’s resource registry, aliases, operator normalization, business presets, local schema validation, and credential/profile resolution to MCP hosts such as Claude Desktop.

The server uses newline-delimited JSON-RPC 2.0 over stdio. It writes protocol messages to stdout and reserves stderr for diagnostics.

It supports MCP `2025-06-18` and retains `2025-03-26` negotiation for older hosts.
The structured output contract follows the [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).

## Install and run

Install the package globally to make both executables available:

```bash
npm install -g @zeyos/cli
zeyos-mcp
```

To run it without a global install, ask `npx` to install the package and invoke its second binary explicitly:

```bash
npx -y -p @zeyos/cli zeyos-mcp
```

Running `npx -y @zeyos/cli` by itself selects the package’s default `zeyos` executable, not `zeyos-mcp`.

## Host configuration

The server uses exactly the same environment variables, named profiles, project pin, and stored credential files as the CLI. A Claude Desktop configuration using environment credentials looks like this:

```json
{
  "mcpServers": {
    "zeyos": {
      "command": "npx",
      "args": ["-y", "-p", "@zeyos/cli", "zeyos-mcp"],
      "env": {
        "ZEYOS_BASE_URL": "https://cloud.zeyos.com/your-instance",
        "ZEYOS_TOKEN": "YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

For an existing named CLI profile, avoid copying credentials into the host configuration:

```json
{
  "mcpServers": {
    "zeyos": {
      "command": "zeyos-mcp",
      "env": {
        "ZEYOS_PROFILE": "production"
      }
    }
  }
}
```

The same `command`, `args`, and `env` shape works in generic stdio MCP hosts. The server starts and provides schema/discovery tools even when credentials are missing; authenticated calls return the CLI’s actionable configuration guidance as a tool error.

## Tools

| Tool | Purpose |
|---|---|
| `list_resource_types` | List canonical resource names, descriptions, and presets. |
| `describe_resource` | Inspect local fields, types, enums, aliases, presets, and operations. |
| `find_records` | Resolve human-readable names to record IDs with full-text search. |
| `list_records` | Query and paginate records with normalized filters, presets, fields, sorting, or search. |
| `count_records` | Count records server-side without fetching every row. |
| `sum_records` | Page through matches and sum one numeric field. |
| `get_record` | Fetch one exact record by ID. |
| `create_record` | Create one validated record; hidden unless writes are enabled. |
| `update_record` | Update one validated record; hidden unless writes are enabled. |

There is deliberately no delete tool.

## Filters and structured results

`list_records`, `count_records`, and `sum_records` accept canonical `filters`:

```json
{
  "name": "list_records",
  "arguments": {
    "resource": "tickets",
    "filters": { "visibility": 0, "status": 4 },
    "limit": 25
  }
}
```

The singular `filter` spelling remains a deprecated alias and produces a warning
in a successful structured result. Supplying both keys fails validation before
authentication or an API request. Upstream requests contain only `filters`.
The human CLI flag remains `--filter`; request previews use `--dry-run`.

Every tool advertises an `outputSchema` and behavior annotations. The result
contains `structuredContent: { ok: true, data: ... }` on success, or
`structuredContent: { ok: false, error: { code, message, actions? } }` together
with `isError: true` for tool failures. Hosts can branch on `ok` and consume
`data` without parsing JSON from text. The existing text payload is retained for
compatibility. Resource discovery's `data` is an array; lists contain
`data.rows`; count and sum tools expose their named values inside `data`.

Billing `invoice` / `invoices` aliases resolve to `billing_invoice`, whose
transaction type is bound to `3`. Use `documents` for formal document artifacts
and `procurement_invoices` for supplier invoices. The aliases never route a
billing query to document records.

## Write gating

Read tools are always advertised. To expose `create_record` and `update_record`, set the gate when starting the host:

```json
{
  "env": {
    "ZEYOS_MCP_ALLOW_WRITES": "1"
  }
}
```

Write access remains off for every other value. Enabling the tools does not replace normal agent safeguards: resolve and read the exact target first, scope the payload, and obtain authorization for the specific write.
