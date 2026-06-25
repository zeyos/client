# Agent Test Protocol — Harness

Drives a coding agent (opencode by default) through a catalog of scenarios against a
live ZeyOS instance and classifies each result using a model-rotation confirmation
loop. **Read [`PROTOCOL.md`](./PROTOCOL.md) for the full methodology** — this file is
the operational quickstart.

## Layout

```
PROTOCOL.md            the protocol (methodology, scenario format, safety, scorecard)
opencode/
  opencode.json.example  optional opencode provider config (openrouter + ollama)
  AGENTS.md              agent contract (auth, safety, RESULT) — inlined into each prompt by the harness
scenarios/
  layer-a/*.json         deterministic conformance scenarios
  layer-b/*.json         agent-experience scenarios
  harness/
  run.mjs                orchestrator + rotation engine + scorecard (entry point)
  loop.mjs               baseline-vs-candidate skill improvement loop
  verify.mjs             independent ground-truth verification via @zeyos/client
  opencode-adapter.mjs   shells out to the configurable runner, captures transcripts
  judge.mjs              optional rubric judge for `manual` scenarios
  verify.test.mjs        offline unit tests for the engine (run by `npm test`)
results/<runId>/         gitignored: scorecard.json, scorecard.md, transcripts/
```

## Setup (once)

1. **Config + auth.** Copy the repo-root [`config.test.json.example`](../../config.test.json.example)
   to `config.test.json` (gitignored) and fill in `live`. Two auth options:
   - **Password grant (headless):** set `live.username` + `live.password` (+ `live.otp`
     if 2FA). The harness logs in automatically and caches the token in `live.token`.
   - **Browser OAuth:** run `npm test -- --instance demo --port 8080` once.

   The harness reads this repo-root `config.test.json` (same file the live OAuth test
   uses); add the `agentProtocol` block (already present in the example).
2. **Runner + models.**
   ```bash
   npm i -g opencode-ai                         # or your preferred runner
   export OPENROUTER_API_KEY=sk-or-...           # for openrouter/* models
   ollama serve && ollama pull llama3.1:8b       # for ollama/* models (optional)
   ```
   The harness runs the runner with `cwd` at the repo root and **inlines the AGENTS
   contract into each prompt**, so opencode only needs working provider access — its
   global config (`opencode auth`) or `OPENROUTER_API_KEY` is enough. For per-project
   provider setup (e.g. to register local `ollama` models, which need explicit entries),
   copy `opencode/opencode.json.example` to a project `opencode.json`. The model strings
   in `config.test.json` → `agentProtocol.models` select which provider/model runs.

## Run

```bash
node test/agent-protocol/harness/run.mjs --list        # catalog (no creds)
npm run test:agent-protocol -- --dry-run               # verify wiring, no model/mutation
npm run test:agent-protocol -- --scenario a01-ticket-crud-roundtrip --models openrouter/anthropic/claude-sonnet-4.6
npm run test:agent-protocol                            # full rotation
npm run test:agent-benchmark -- --timeout-ms 600000    # fixed model-selection matrix
npm run test:agent-loop -- --read-only                 # baseline vs candidate developer loop
```

Then open `results/<runId>/scorecard.md` — the `🔴 CLIENT_DEFECT` section is the
actionable one.
Transcripts redact bearer/access-token values before writing to disk, but they still
capture prompts, commands, and business output; treat `results/` as local test artifacts
and avoid publishing them wholesale.

## Model Benchmark

For the reproducible OpenRouter model-selection benchmark, run the fixed read-only count
matrix:

```bash
node test/agent-protocol/harness/run.mjs \
  --benchmark \
  --timeout-ms 600000 \
  --transient-retries 0 \
  --run-id benchmark-$(date +%Y%m%d-%H%M)
```

Equivalent npm form:

```bash
npm run test:agent-benchmark -- --timeout-ms 600000 --transient-retries 0 --run-id benchmark-$(date +%Y%m%d-%H%M)
```

`--benchmark` implies `--read-only` and `--all-models`. The optional
`--transient-retries 0` form is useful for model-selection runs where one clean attempt per
scenario is preferable to hiding runner timeouts behind retries. It uses the fixed 10-scenario
Layer-B count set (`b01`, `b02`, `b03`, `b04`, `b05`, `b08`, `b09`, `b10`, `b14`,
`b16`) and the five candidate OpenRouter models:
`openrouter/openai/gpt-oss-120b`, `openrouter/xiaomi/mimo-v2.5`,
`openrouter/z-ai/glm-5.2`, `openrouter/deepseek/deepseek-v4-flash`, and
`openrouter/moonshotai/kimi-k2.7-code`. Pass `--models <csv>` only when intentionally
running a different model set.

The scorecard includes a **Model Scorecard** table with pass rate, average latency, and
actual captured runner cost/token usage. For opencode, the harness reads the matching
opencode session stats after each attempt; if usage cannot be captured, that attempt is
marked unknown instead of estimated from list prices.

For CI, use the manual **Agent model benchmark** workflow. It requires repository secrets
`OPENROUTER_API_KEY` and `ZEYOS_AGENT_CONFIG_JSON`, where `ZEYOS_AGENT_CONFIG_JSON` is the
full `config.test.json` content for the allowed benchmark instance. The workflow uploads
`test/agent-protocol/results/` as an artifact.

Agent subprocess auth is token-only by default: the harness injects `ZEYOS_BASE_URL`,
`ZEYOS_TOKEN`, `ZEYOS_NO_REFRESH=1`, and `ZEYOS_CREDENTIALS_READONLY=1`. The CLI treats
that token as authoritative, ignores local/profile/global credential stores for normal
API commands, does not refresh, and does not persist tokens back into credential stores.
Auth-mutating CLI commands (`login`, `logout`, `profile`) are disabled in the agent
environment so off-task model behavior cannot clear a developer's local CLI state.
Direct protocol runs also default to per-attempt workspaces under the run's results
directory, keeping scratch files and accidental local auth lookups out of the repo root.

For skill iteration, use `npm run test:agent-loop -- --run-id <id>`. It runs the
protocol against `HEAD:agents` as the baseline and the working-tree `agents/` folder as
the candidate, across the OpenCode/Pi runner presets and this default OpenRouter set:
`openrouter/qwen/qwen3.7-plus`, `openrouter/x-ai/grok-build-0.1`,
`openrouter/nvidia/nemotron-3-ultra-550b-a55b`, and `openrouter/z-ai/glm-5.2`. Add
`--models` to override that list, `--read-only` for a cheaper loop, `--scenario <id>` for
a one-scenario loop, and `--full-only` to skip bare-skill coverage. Live loop runs
preflight the requested model IDs through the native `opencode models` /
`pi --list-models` commands and fail before launching agents when a listed model is
unavailable; use `--no-model-preflight` only when that native list command is known to be
stale or unavailable.

## Adding a scenario

Drop a JSON file in `scenarios/layer-a/` or `scenarios/layer-b/` following the schema in
[`PROTOCOL.md` §6–7](./PROTOCOL.md). It is auto-discovered. Run
`--scenario <id> --dry-run` (for read-only kinds) or a single-model live run to validate
it before adding it to a full rotation.

The current catalog includes operational scenarios for tickets, tasks, e-mail messages,
and actionsteps/time-entry effort. Seeded scenarios must declare `mutates: true` even
when the agent itself is only asked to read, because the harness creates disposable
`AGENTTEST-*` records for independent verification.

## Swapping the runner

The runner command lives in `config.test.json` → `agentProtocol.runner`
(`command`, `args` with `{model}`/`{prompt}` placeholders, `cwd`, `timeoutMs`). Point it
at any non-interactive coding agent — no harness code changes required.
