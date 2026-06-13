# ZeyOS Client, CLI, and Integration Docs

This repository contains the JavaScript client, the CLI, the OpenAPI specs, and the sample applications for integrating external tools with ZeyOS. The `@zeyos/client` npm package ships the client, docs, OpenAPI specs, sample apps, and agent guidance. The CLI is published separately as `@zeyos/cli`.

The authoritative documentation lives in [`docs/`](./docs/).

## Start Here

- [Introduction](./docs/intro.md)
- [Coding Agents](./docs/04-agent-workflows/00-coding-agents.md)
- [Application Developers](./docs/05-tutorials/00-application-developers.md)
- [JavaScript Client](./docs/02-javascript-client/01-getting-started.md)
- [CLI](./docs/03-cli/01-getting-started.md)
- [API Reference](./docs/01-api-reference/01-data-retrieval.md)
- [Agent Skills](./agents/README.md)

## Quick Start

Install dependencies:

```bash
npm install
```

Install the CLI package when you want the `zeyos` command:

```bash
npm install -g @zeyos/cli
zeyos --help
```

Use the client in JavaScript:

```js
import { createZeyosClient, MemoryTokenStore } from '@zeyos/client';

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'oauth',
    oauth: {
      tokenStore: new MemoryTokenStore({ accessToken: 'YOUR_ACCESS_TOKEN' }),
    },
  },
});

const tickets = await client.api.listTickets({
  fields: ['ID', 'name', 'status', 'priority'],
  filters: { visibility: 0 },
  limit: 10,
});
```

## Repository Layout

- [`src/`](./src/) contains the JavaScript client
- `cli/` contains the CLI package in the source repository; npm users should install `@zeyos/cli`
- [`docs/`](./docs/) contains the authoritative documentation
- [`agents/`](./agents/) contains repo-local ZeyOS agent skills and query playbooks
- [`openapi/`](./openapi/) contains the OpenAPI specifications
- [`samples/`](./samples/) contains the sample browser applications

## Samples

- [Kanban docs](./docs/04-sample-apps/01-kanban.md)
- [CRM docs](./docs/04-sample-apps/02-crm.md)
- [Dashboard docs](./docs/04-sample-apps/03-dashboard.md)

Each sample can be served as static files from the repository root. See the linked docs pages for the current run and configuration instructions.

## Testing

```bash
npm test                       # offline unit + schema tests (mocked fetch); add -- --live for OAuth smoke
npm run test:cli-integration   # live CLI CRUD lifecycle (requires `zeyos login`)
npm run test:agent-protocol     # agent-driven live protocol; --dry-run to verify wiring first
```

The **agent test protocol** drives a coding agent (opencode) against a live instance and
uses a model-rotation rule to separate real client defects from model flakiness. See
[`test/agent-protocol/PROTOCOL.md`](./test/agent-protocol/PROTOCOL.md).
