# Portable topology contract plus Workflow scripts as the Claude Code runtime

The issue lifecycle axis (`linear-issue-writer` → `linear-issue-workflow` →
`linear-issue-close` → `nerdbrain-wiki`/`nerdbrain-search`) was described only in
prose spread across `SKILL.md` files, so its edges carried status ("hands off
to") instead of data, and none of its rules were enforceable. We adopt a
**hybrid**: `workflow-graph.json` in the repo root is the single source of truth
for the topology — nodes, typed edges, gates, failure policies, budgets — and
`scripts/validate-workflow-graph.ts` enforces it offline; the Claude Code
`Workflow` scripts under `workflows/` are one *runtime* rendering of the
graphable islands of that contract, not the contract itself. Agents without the
`Workflow` tool read the same topology as prose and degrade to the existing
sequence.

## Considered Options

- **Workflow scripts only** — rejected: the topology would exist only as Claude
  Code JavaScript, breaking the Agent Skills portability the README promises,
  and nothing outside Claude Code could read or check it.
- **Prose only** (the status quo) — rejected: this is the anti-pattern the work
  targets. A rule without enforcement is not a rule; the manifest version
  lockstep broke exactly this way (commit `1269084`).

## Consequences

- **The main trade-off: the contract is unreadable at runtime, so schemas are
  duplicated.** A workflow script has no filesystem or shell access, and a
  script containing `import()` fails *before the run starts*. The script
  therefore cannot read `workflow-graph.json` or import edge schemas — every
  schema a workflow enforces must be inlined into the script as a JSON Schema
  literal passed to `agent({schema})`. Consistency between the contract and
  those inline copies is bought with a **drift check in the validator** (rule 10
  below), not with a shared definition. This duplication is deliberate, and the
  drift check is an acceptance criterion rather than a nice-to-have, because it
  is the only defence against the two drifting apart.
- The contract describes the **whole axis**, including nodes that will never
  become a workflow. Each node declares `runtime`: `conversational` (needs
  mid-run human interaction, stays in the main agent), `workflow` (a graphable
  island), or `chain` (sequential and irreversible on purpose). The runtime
  allows no mid-run user input, so decision gates cannot live inside a workflow
  — the validator enforces that as a data rule.
- `workflows/*.js` is plain JavaScript, the only untyped place in a repo that
  otherwise runs on Node 24 native type stripping. `Date.now()`,
  `Math.random()` and argument-less `new Date()` throw inside a script (they
  would break resume), so timestamps arrive through `args` or are stamped after
  the run returns.
- The contract file sits in the repo root next to `cli-dependencies.json`, and
  the validator follows `scripts/validate-cli-dependencies.ts` 1:1 (pure
  `validateContract()` in `scripts/types/`, thin runner, `node --test`). There
  is no CI: the validator runs locally, exactly like the existing one.
