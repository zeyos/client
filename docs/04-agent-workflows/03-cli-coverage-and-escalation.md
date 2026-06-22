---
sidebar_position: 4
sidebar_label: CLI Coverage and Escalation
---

# CLI Coverage and Escalation

The CLI is the default interface for coding agents, but it intentionally covers a curated registry instead of the full API surface.

## What the CLI Covers Directly

The command `zeyos resources` is the source of truth for CLI-supported resource types. At the time of writing, the curated registry includes:

| Resource | Operations |
|----------|------------|
| `account`, `actionstep`, `appointment`, `campaign`, `contact`, `document`, `event`, `file`, `invitation`, `item`, `message`, `note`, `opportunity`, `payment`, `project`, `storage`, `task`, `ticket`, `transaction` | `list`, `get`, `create`, `update`, `delete` |
| `customfield` / `customfields` | `list`, `get` |
| `group`, `user` | `list`, `get` |

Plural names and common aliases such as `tickets`, `actionsteps`, `time-entries`, `docs`, `invoice`, and `crm` are resolved by the CLI, but the underlying coverage boundary is still the registry above.

## What the CLI Does Not Try to Cover

Switch away from the CLI when you need:

- Resources that are present in the generated API client but missing from `zeyos resources`
- Low-level request control beyond the registry-backed commands
- Browser session behavior or embedded app flows
- Full access to generated operations such as `listApplications`, `listServices`, `listResources`, `listPermissions`, or `listWeblets`
- Custom auth overrides, raw responses, or path-and-method requests

## Escalation Path

### 1. Stay on the CLI if the resource exists in the registry

This remains the best option for shell automation, quick operational tooling, and JSON-first CRUD workflows.

### 2. Move to `@zeyos/client` for the full generated API surface

```js
import { createZeyosClient, MemoryTokenStore } from '@zeyos/client';

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'oauth',
    oauth: {
      tokenStore: new MemoryTokenStore({ accessToken: process.env.ZEYOS_TOKEN }),
    },
  },
});

const services = await client.api.listServices({ limit: 20 });
```

Use the JavaScript client whenever the CLI registry is insufficient or the workflow needs request-level control.

### 3. Drop to raw REST/OpenAPI when your runtime is not JavaScript

Use the API reference and OpenAPI files when you are implementing integrations in another language or building a custom SDK.

## Rule of Thumb

- If `zeyos resources` shows the resource and the built-in command shape is enough, stay with the CLI.
- If the resource exists in the API but not in the CLI registry, move to `@zeyos/client`.
- If you are not using JavaScript at all, use the REST/OpenAPI reference directly.
