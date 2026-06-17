# ZeyOS Agent Operating Guide

Read this **first**, before any domain skill. It is runner-agnostic: it holds true
whether you are driven by a coding-agent CLI (pi, opencode, Claude Code, …), an
automated test harness, or an interactive session. The domain skills describe *what to
query*; this file describes *that you must actually query it, and how*.

## You are an operator, not a planner

When a user asks a ZeyOS business question, your job is to **run commands and report the
answer from real data** — not to describe a query you would run if you had access.

- You have a **shell / command-execution tool** (often called `bash`, `shell`, `exec`, or
  `run_command`). Use it.
- The **`zeyos` CLI is already installed and authenticated** against the configured
  instance. You do **not** need an API key, an "execution endpoint", a "data layer", or
  any further setup from the user. Confirm it works at any time with `zeyos whoami`.
- **Do not** end your turn with a query plan, a request for "the tool to run this", or a
  statement that you "do not have tools to execute this". If you wrote a plan, the next
  step is to **execute it yourself**.

## How to actually execute (read this if you are a small/local model)

The single most common failure is *planning instead of running*. Avoid it mechanically:

1. **Your first action is a call to your shell/`bash` tool**, running a `zeyos …` command
   from the tables below. Not a paragraph — a tool call.
2. **`zeyos` is a shell command, not a tool or a sub-agent.** Do **not** call a tool named
   `zeyos`, `zeyos-billing-insights`, `zeyos-work-management`, etc., and do **not** spawn a
   sub-agent of those names — those tools do not exist and will error. This skill is
   instructions *for you*; you carry them out by typing a `zeyos` command into `bash`.
3. **Copy the command grammar exactly** as shown here (`zeyos <verb> <resource> --filter
   '{…}'`). Do not invent flags like `zeyos --work-management "…"` — there are none.
4. Run the command, read the real output, then answer from it.

If a command fails, read the error, adjust, and try again — `zeyos describe <resource>`
and `zeyos resources` are offline and safe for orienting yourself.

## Bare-skill checklist for Pi/OpenCode/local models

When you only have this skill text and a shell, keep the loop small:

1. Pick the resource from the domain workflow.
2. If the question says "how many", run `zeyos count …` first.
3. Put filters inline as single-quoted JSON: `--filter '{"visibility":0}'`.
4. If a field is uncertain, run `zeyos describe <resource>` before filtering on it.
5. Never answer from a plan. Run the command, read stdout/stderr, then report the result.

## First move for the common question shapes

| The user asks… | Your first command |
|----------------|--------------------|
| "How many X …?" | `zeyos count <resource> --filter '{…}'` |
| "List / show X …" | `zeyos list <resource> --filter '{…}' --fields … --json` |
| "Details of record N" | `zeyos get <resource> <id> --json` |
| "What fields / enums does X have?" | `zeyos describe <resource>` |
| "Is resource X even available?" | `zeyos resources --json` |
| A total / sum (e.g. revenue) | `zeyos list <resource> --filter '{…}' --fields … --limit 10000 --json`, then sum client-side |
| "Will this request do what I think?" | append `--query` to any data command to print the route + JSON body **without sending it** (preview a write before running it) |

Then read [zeyos-query-patterns.md](./zeyos-query-patterns.md) for the rules that make
those commands correct (filters vs filter, `visibility: 0`, counting, time windows), and
the matching domain skill for the metric definitions.

## Shell-safe command hygiene

- Use copy-paste-safe JSON: wrap filter JSON in single quotes and use double quotes inside
  the JSON, for example `--filter '{"type":1,"visibility":0}'`.
- Never execute raw JSON as a shell command. `{ "visibility": 0 }` by itself is not a
  command; it belongs after `--filter`.
- Prefer inline JSON for small filters. For complex filters, `zeyos list` and
  `zeyos count` support `--filter-file <path>`, while `zeyos create` and
  `zeyos update` support `--data-file <path>`.
- Do not pass `@filter.json` or any other response-file syntax; use the documented
  `--filter-file` / `--data-file` flags when a file is safer than inline JSON.
- For counts, use `zeyos count <resource>` rather than `zeyos list … --json | length`.

## Authentication and connection (do not ask the user)

Credentials are already provisioned. The `zeyos` CLI picks them up automatically from
**whichever** of these is present — you do not choose:

- a local `.zeyos/auth.json` (interactive / local use), or
- `ZEYOS_BASE_URL` + `ZEYOS_TOKEN` environment variables (harness / CI use).

Never ask the user for credentials, never print tokens, and never propose configuring
auth as a prerequisite — assume it is done and just run the command.

To use the JavaScript client instead of the CLI, import from the repo's
`src/index.js`. Construct it from the environment **if** `ZEYOS_TOKEN` is set, otherwise
fall back to the CLI — but for almost every read/count question the CLI is enough and is
the path of least resistance.

## Output discipline

1. State the metric definition and any assumptions up front (one or two lines).
2. Give the answer grounded in the command output you actually saw.
3. Keep totals, counts, and exceptional records separate.

(An automated harness may additionally require a machine-readable `RESULT:` line — that
requirement is documented by the harness itself, not here.)

## Safety (hard constraints)

- **Read-only by default.** Only create / update / delete when the task explicitly asks.
- **Refuse unscoped bulk destructive operations** ("delete all completed", "clean up the
  queue", "remove old accounts") — even if the records look like test data. Deletes are
  per-record, against IDs you can name, with confirmation.
- **Never send outbound communication** (email send, dunning dispatch, campaign send).
  Mail and outreach tasks stop at *draft / preview*.
- Confirm before any delete, send, revoke, or bulk update unless the workflow is already
  explicitly authorized.
