# Refining with Loops

OKF and the skill pack are refined with the same loop machinery the agent protocol already
uses — a measurement loop and a refinement loop that close on each other.

## Measure: OKF as agent context

The agent protocol (`npm run test:agent-protocol`) drives a real coding agent through
business scenarios against a live demo instance and verifies each outcome independently. A
`--context` axis chooses which knowledge the agent is pointed at:

```bash
# Skills only (default), OKF only, or both
npm run test:agent-protocol -- --context okf  --scenario b03-billing-transaction-count
npm run test:agent-protocol -- --context both --layer b
```

The bundle is exposed to the agent as `ZEYOS_OKF_ROOT` (mirroring `ZEYOS_SKILL_ROOT`). The
loop runner sweeps the axis and reports per-context pass rates, so you can see whether
OKF-as-context lifts accuracy and which concepts correlate with failures:

```bash
npm run test:agent-loop -- --context skills,okf,both --read-only --agents opencode
```

The scorecard tells you which **skill** and which **OKF concept** to improve.

## Refine: generate → validate → judge → apply

`npm run okf:refine` improves a concept's **curated** guidance (never the generated block):

```bash
# Target a concept directly, or derive weak concepts from a run's scorecard
npm run okf:refine -- --concept entities/tickets
npm run okf:refine -- --scorecard test/agent-protocol/results/<run>/scorecard.json
npm run okf:refine -- --concept entities/transactions --apply   # write the accepted revision
```

Each target goes through:

1. **Generate** — a proposer model drafts improved curated notes from the current concept.
2. **Validate** — any field the proposal references must exist on the entity (checked
   against the client schema), so the model can't invent columns or enums.
3. **Judge** — a held-out judge model (`agentProtocol.judgeModel`, reusing `judge.mjs`)
   approves only if the revision is more accurate and useful and contradicts no schema fact.
4. **Apply** — with `--apply`, the accepted notes replace the curated tail; the generated
   managed block is never touched. Without `--apply`, proposals are written for review.

## The closed loop

```
specs + curation ──▶ okf/ ──▶ agent-protocol (--context okf) ──▶ scorecard
        ▲                                                          │
        └──────────── okf:refine (curated notes) ◀─────────────────┘
```

Drive it self-paced with the Claude Code `/loop` skill: *measure → pick the weakest concept
→ refine → re-measure*, until pass rates plateau.
