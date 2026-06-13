# Agent Test Protocol — Harness

Drives a coding agent (opencode by default) through a catalog of scenarios against a
live ZeyOS instance and classifies each result using a model-rotation confirmation
loop. **Read [`PROTOCOL.md`](./PROTOCOL.md) for the full methodology** — this file is
the operational quickstart.

## Layout

```
PROTOCOL.md            the protocol (methodology, scenario format, safety, scorecard)
config.example.json    template for the config.test.json `agentProtocol` block
opencode/
  opencode.json.example  provider config (openrouter + ollama) — copy to opencode.json
  AGENTS.md              instructions the agent reads (auth, skills, safety, RESULT)
scenarios/
  layer-a/*.json         deterministic conformance scenarios
  layer-b/*.json         agent-experience scenarios
harness/
  run.mjs                orchestrator + rotation engine + scorecard (entry point)
  verify.mjs             independent ground-truth verification via @zeyos/client
  opencode-adapter.mjs   shells out to the configurable runner, captures transcripts
  judge.mjs              optional rubric judge for `manual` scenarios
  verify.test.mjs        offline unit tests for the engine (run by `npm test`)
results/<runId>/         gitignored: scorecard.json, scorecard.md, transcripts/
```

## Setup (once)

1. **Tokens.** From the repo root, obtain OAuth tokens for the demo instance:
   ```bash
   npm test -- --live          # interactive browser OAuth; writes config.test.json
   ```
2. **Config.** Ensure `config.test.json` has an `agentProtocol` block — copy it from
   [`config.example.json`](./config.example.json). The harness reads the repo-root
   `config.test.json` (same file the live OAuth test uses).
3. **Runner + models.**
   ```bash
   npm i -g opencode-ai                         # or your preferred runner
   cp opencode/opencode.json.example opencode/opencode.json
   export OPENROUTER_API_KEY=sk-or-...           # for openrouter/* models
   ollama serve && ollama pull llama3.1:8b       # for ollama/* models (optional)
   ```
   `opencode.json` declares two providers: `openrouter` (cloud; uses `OPENROUTER_API_KEY`
   and OpenRouter model slugs like `anthropic/claude-sonnet-4.6`) and `ollama` (local;
   add an entry under `models` for each tag you pull). The model strings in
   `config.test.json` → `agentProtocol.models` select which provider/model runs.

## Run

```bash
node test/agent-protocol/harness/run.mjs --list        # catalog (no creds)
npm run test:agent-protocol -- --dry-run               # verify wiring, no model/mutation
npm run test:agent-protocol -- --scenario a01-ticket-crud-roundtrip --models openrouter/anthropic/claude-sonnet-4.6
npm run test:agent-protocol                            # full rotation
```

Then open `results/<runId>/scorecard.md` — the `🔴 CLIENT_DEFECT` section is the
actionable one.

## Adding a scenario

Drop a JSON file in `scenarios/layer-a/` or `scenarios/layer-b/` following the schema in
[`PROTOCOL.md` §6–7](./PROTOCOL.md). It is auto-discovered. Run
`--scenario <id> --dry-run` (for read-only kinds) or a single-model live run to validate
it before adding it to a full rotation.

## Swapping the runner

The runner command lives in `config.test.json` → `agentProtocol.runner`
(`command`, `args` with `{model}`/`{prompt}` placeholders, `cwd`, `timeoutMs`). Point it
at any non-interactive coding agent — no harness code changes required.
