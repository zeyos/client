---
name: zeyos-platform-and-schema
description: Inspect ZeyOS platform, schema, and admin-facing entities such as applications, resources, services, weblets, forks, groups, permissions, custom fields, custom objects, and generic record structures. Use when asked about application inventory, service hooks, UI modules, group permissions, custom schema, or how the extensibility model is wired.
---

# ZeyOS Platform And Schema

Read [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. Read [../shared/zeyos-entity-reference.md](../shared/zeyos-entity-reference.md) for the full source-backed model. Read [references/workflows.md](references/workflows.md) for platform/admin query plans.

Typical prompts:

- "Which custom fields exist on tickets?"
- "Which services run after ticket modification?"
- "Which groups grant access to application XYZ?"
- "Which weblets belong to application XYZ?"

## Workflow

1. Decide whether the question is about:
   - platform application inventory
   - automation hooks and services
   - UI surfaces and weblets
   - access control
   - schema extensibility
2. Resolve the application, group, entity, or custom field target first.
3. Use:
   - `applications`, `resources`, `services`, `weblets`, `forks` for platform structure
   - `groups`, `groups2users`, `permissions` for access control
   - `customfields`, `objects`, and extdata helper families for schema and custom data
4. Treat `records`, `comments`, `files`, `channels`, `follows`, and `likes` as a collaboration layer. Switch to `zeyos-collaboration-and-activity` when the user asks for timeline or discussion behavior rather than platform structure.
5. Be explicit when the schema tells you structure but not the product convention.

## Output Discipline

- Separate confirmed schema facts from product-level inference.
- Report entity identifiers, activity states, and dependencies.
- Call out when a recommendation depends on instance-specific app conventions.
