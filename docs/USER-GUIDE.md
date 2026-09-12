# User Guide

This guide is for developers who install this plugin — but it is not only an installation manual. The plugin is a working implementation of **graph engineering**: a discipline for building agent workflows as explicit graphs with typed data on every edge, instead of prose chains held together by good intentions. This guide explains the discipline first, then shows how the plugin puts it into practice, and finally covers the practical matter of installing and driving it day to day.

Contents:

- [What is graph engineering?](#what-is-graph-engineering)
- [How the plugin practices it](#how-the-plugin-practices-it)
- [Programming in this spirit yourself](#programming-in-this-spirit-yourself)
- [Prerequisites](#prerequisites) · [Installation](#installation)
- [A day with the plugin](#a-day-with-the-plugin) · [Steering with Linear statuses](#steering-with-linear-statuses)
- [Skills reference](#skills-reference) · [Troubleshooting](#troubleshooting)

## What is graph engineering?

Most agent workflows are written as prose: "first plan, then implement, then review, then merge". One agent walks the chain top to bottom, handoffs are sentences like "hands off to the close skill", and every rule is a reminder the model may or may not honor. This fails in predictable ways — and graph engineering is the set of principles that name those failures and fix them structurally:

1. **Dependency is not order.** Only a real data dependency forces one step to wait for another. Prose workflows serialize everything out of habit: a planning phase that reads the repo, the docs, prior plans, and related issues *one after another* is a false sequence — none of those reads depends on any other. Independent work should fan out and run concurrently; that is also what keeps the critical path (the longest chain you actually have to wait for) short.

2. **State lives on edges, and it is typed.** What flows between two steps must be data with a declared schema, not a status. The test for every arrow in your workflow: *what data passes through it?* If the honest answer is "a signal that the previous step finished" — the edge is fake, and whatever the next step needs will be re-derived, half-remembered, or lost.

3. **Verification must be asymmetric.** The agent that produced a piece of work is the worst judge of it. A review step where the implementer picks one reviewer and accepts its verdict is decoration. Real verification is adversarial: independent verifiers whose *goal is to refute* the finding or the work, with genuine power to reject it.

4. **Failure must be visible, never silent.** When one branch of a fan-out dies, the run should degrade — produce a result that says exactly what is missing — rather than either crash entirely or pretend nothing happened. Counters and gap lists beat both.

5. **Human gates are architecture, not conversation.** An approval that exists as a chat message lives inside the model's context, where it can be imagined, misremembered, or hallucinated. An approval that exists as *state outside the agent* — a status field in an external system that a human moved by hand — is a real gate: the agent can check it but cannot fake it.

6. **Invariants deserve enforcement, not reminders.** "Remember to keep both versions in sync" is not a rule; it is a hope. A rule is something a validator fails on, a hook denies, or a gate makes unreachable.

7. **Declare widths and budgets.** How wide a fan-out may go is part of the design, declared and bounded — not decided ad hoc at runtime.

8. **Know when *not* to build a graph.** Work that is truly sequential and irreversible — commit, push, merge, close — gains nothing from parallelism and everything from being a short, dumb, deterministic chain. Graphing it would only add failure modes.

If you take one thing from this list: draw your workflow as a graph, write on every edge *what data* crosses it, and be suspicious of every edge where you can't.

## How the plugin practices it

The plugin's skills form one **issue lifecycle axis** — from filing a Linear issue, through planning, implementation and review, to merge and close-out. Every principle above has a concrete, inspectable counterpart in this repo.

### The contract: `workflow-graph.json`

The topology is not documentation — it is data. [`workflow-graph.json`](../workflow-graph.json) in the repo root declares every node of the axis (which skill runs it, in which runtime), every edge (with a **named JSON Schema** for the payload that crosses it), every gate, failure policy and width budget. `node scripts/validate-workflow-graph.ts` enforces it offline: an edge without a schema is a contract error, an orphan node is a contract error, an irreversible action without a gate is a contract error. [ADR-0003](adr/0003-workflow-graph-contract.md) records why the contract and the runtime are deliberately two artifacts.

This is principle 2 made mechanical: the edge `plan-draft → implement` doesn't "hand off" — it carries an `ImplementationPlan`, and the schema for it is right there in the contract.

### Islands, not one big graph

The axis is not one graph end to end, because the workflow runtime takes no mid-run human input — and several steps *need* a human (approving a plan, choosing review scope). So the design is an **island graph**: a conversational backbone with exactly two parallel islands embedded where the work is wide, independent, and human-free:

```
[main agent, conversational, status-driven]
  ├─ island #1: plan-context fan-out                (parallel)
  ├─ [GATE: you set In Progress in Linear]          (outside the agent)
  ├─ implementation                                 (sequential, conversational)
  ├─ island #2: review map → reduce → verify → synthesize   (parallel)
  └─ close-out                                      (a chain, on purpose)
```

**Island #1 — plan fan-out** (principle 1). When you ask for a plan, five gatherers launch *concurrently*, each reading one independent source: repo layout, in-repo conventions (ADRs, glossary), prior plans and merged PRs, related Linear issues, and the project's knowledge-base page. A **reducer** — plain deterministic code, not a model — dedupes, drops empties, and trims the result. What used to be five sequential reads is one fan-out bounded by the width budget the contract declares (principle 7). Each gatherer is the plugin's own read-only `plan-gatherer` agent — Sonnet, with the vault-search recipes preloaded — rather than the default subagent on your session model.

**Island #2 — adversarial review** (principles 3 and 4). The review is not "pick a reviewer". Four fixed, mutually independent **axes** are mapped in parallel — does the change do what the issue asked (`spec-compliance`), does the diff obey the repo's written standards (`repo-standards`), is it correct (`correctness-regressions`), is it safe (`security`). A deterministic reducer dedupes and caps the findings. Then each surviving finding faces **three independent sceptics, each prompted to refute it** — two or more refutations out of three kill the finding; a finding that fails to collect enough votes is dropped *as unverified*, and counted. The final summary is written by an agent, but the findings list is assembled verbatim by the reducer — no model can add or soften a finding after verification. Every run reports `stats {mapped, verified, rejected, unverifiedOverflow}` and a `gaps` list, so degradation is visible in the review comment itself, never silent. The mappers and the summary writer are dedicated read-only plugin agents on cheaper models (`review-mapper` on Sonnet, `review-synthesizer` on Haiku); the sceptics deliberately are not — they are the quality gate, and "when uncertain, refute" on a weaker model would refute everything.

This asymmetry is not theoretical. In this repo's own history the verifier has rejected plausible-but-wrong findings (including a convincing command-injection claim, refuted 3-of-3) and confirmed real defects the implementing agent had missed.

### Gates and frozen rules

The approval that unlocks implementation is **you moving the issue to In Progress in Linear** (principle 5). The agent reads that status at the start of every turn; it never sets it itself to unlock work. The contract marks every irreversible action — writing an issue to Linear, pushing commits, merging, writing the knowledge base — as `irreversible: true`, and the validator rejects any such action that isn't behind a gate.

Invariants are **frozen rules** (principle 6) — a first-class registry in the contract: *no Linear write before approval*, *no repo change before In Progress*, *no merge without green verification*, *knowledge-base access via filesystem only*. Each rule is pointed at by a gate that enforces it — a `decision` gate (a human's call, carried by a Linear status or explicit chat approval) or a `deny` gate (a hard stop that never asks). A rule no gate enforces fails validation. Even repo housekeeping follows this: the old reminder "keep both manifest versions in sync" is now `node scripts/validate-manifests.ts`, which exits non-zero on drift — because the reminder was once forgotten and the validator cannot be.

### One schema, two consumers

Each edge schema in the contract has its body — a JSON Schema literal — consumed twice: inside a workflow island it is what `agent({schema})` enforces at runtime, and outside it is what the skill templates are rendered from (`node scripts/render-templates.ts` generates `plan-template.md`, `issue-template.md`, `session-summary-template.md`). The plan you read as markdown in a Linear comment and the object an island validates at runtime have the same shape, defined once. A drift check keeps the runtime copies honest: every schema inlined in a `workflows/*.js` script must be deep-equal to the registry body, and a hand edit to a generated template turns a test red.

### Chains where chains belong

Close-out — commit leftovers, push, merge the PR, switch branches, set Done — is truly sequential and irreversible, so it is a **chain**, deliberately kept out of the graph and pinned to a small, cheap model (principle 8). The same principle picks the model inside the islands: the mechanical roles — axis mappers, summary writer, context gatherers — run as dedicated read-only plugin agents in `agents/` on Sonnet or Haiku, selected per call with `agentType`, while the sceptics keep the session model because their judgement is the gate. Observability (metrics for the graph itself) is the one principle still open here — tracked as an explicit pending decision, where "we consciously don't collect" is an acceptable answer.

### Degradation is part of the design

None of the above is a precondition. In Claude Code without dynamic workflows (older version, disabled, or a plan without them) — and in any other agent (Cursor, Copilot, …) that has no workflow runtime at all — the same topology is read as prose and executed sequentially. An island is always an optimization, never a requirement. Slower, but the same steps, the same schemas, the same gates.

## Programming in this spirit yourself

The repo doubles as a reference implementation you can copy from. If you want to build your own workflow this way:

1. **Write the contract first.** Nodes, edges, gates — as data in your repo, not prose in a doc. Apply the edge test ruthlessly: every edge names the schema of what crosses it.
2. **Validate it offline.** A small script that fails loudly on schema-less edges, orphan nodes, and ungated irreversible actions costs an afternoon and catches design rot forever. No CI required — this repo runs its validators locally.
3. **Graph only the islands.** Look for stretches that are *wide* (several independent inputs), *independent* (no shared state between branches), and *human-free* (no mid-run decision needed). Everything else — especially anything irreversible — stays a conversational step or a plain chain.
4. **Put humans between islands, as external state.** An approval should be a status in a system of record the agent polls, not a chat reply.
5. **Make verification adversarial.** Separate the mapper from the judge; prompt the judges to refute; give them a real rejection threshold; count every rejection and every unverified drop in the output.
6. **Budget the fan-out and surface the gaps.** Declare max widths; return `stats` and `gaps` with every run so a degraded result is distinguishable from a complete one.

Reading order if you want to go deeper: [`README.md` "Workflow topology"](../README.md) → [`workflow-graph.json`](../workflow-graph.json) → [ADR-0003](adr/0003-workflow-graph-contract.md) → the two island scripts in [`workflows/`](../workflows/) → the glossary in [`CONTEXT.md`](../CONTEXT.md) (Node, Edge, Gate, Frozen rule, Reducer, Rejection rule…).

## Prerequisites

You need [Claude Code](https://claude.com/claude-code) (or another coding agent — see [Other agents](#other-agents)) and these CLIs on your `PATH`:

| CLI | Minimum version | Install | Authentication |
|---|---|---|---|
| `git` | 2.40 | your package manager | — |
| `node` (with npm) | 22 | <https://nodejs.org> | — |
| `gh` (GitHub CLI) | 2.97 | `brew install gh` / `winget install GitHub.cli` | `gh auth login` |
| `linearis` (Linear CLI) | 2026.7.0 | `npm i -g linearis` | see below |
| `rg` (ripgrep) | 14 | `brew install ripgrep` / `winget install BurntSushi.ripgrep.MSVC` | — |

To authenticate `linearis`, create a personal API key in Linear under **Settings → Security & access → API → Personal API keys**, then either set it as the `LINEAR_API_TOKEN` environment variable or run `linearis auth login`. The key does not expire.

You don't have to set this up by hand: once the plugin is installed, run `/nerd4rent:bootstrap-clis` and the agent will probe every dependency, install or update what's missing, and hand you back only the authentication steps a human has to complete.

The Linear-based skills degrade gracefully — if `linearis` is missing or unauthenticated, the rest of the plugin still works.

## Installation

In Claude Code, add the marketplace and install the plugin:

```
/plugin marketplace add https://github.com/nerd4rent/nerd4rent-claude-plugin
/plugin install nerd4rent@nerd4rent-claude-plugin
```

To update later:

```
/plugin marketplace update nerd4rent-claude-plugin
/plugin update nerd4rent@nerd4rent-claude-plugin
```

Merges to `main` don't update your install on their own — the two commands above are what refresh your local copy, and only a release with a bumped plugin version produces an actual update.

The parallel islands need Claude Code ≥ 2.1.154 on a plan that includes dynamic workflows. In the default permission mode each island run asks for consent first; answer "don't ask again" to silence the prompt for that workflow in that project. Without workflows everything still runs — sequentially (see [degradation](#degradation-is-part-of-the-design)).

### Other agents

The skills follow the shared [Agent Skills specification](https://github.com/vercel-labs/skills), so you can install them into Cursor, Copilot, Windsurf, Cline and 70+ other agents:

```bash
npx skills add nerd4rent/nerd4rent-claude-plugin -g   # all skills, detected agents
npx skills update                                     # keep them current
```

Restart the agent after installing. These agents run the sequential degradation path — same topology, read as prose.

## A day with the plugin

A typical feature, from idea to merged PR — with the graph moments marked:

1. **File the issue.** Say *"create an issue: …"* and describe what you want. The agent interviews you if the goal is fuzzy, drafts the issue body, shows it to you, and — only after your approval (a decision gate guarding an irreversible write) — creates it in Linear, in **Backlog**. The body follows a template generated from the `IssueSpec` schema: the issue is the first typed edge of the axis.
2. **Get a plan.** Type the issue ID (e.g. `DEMO-123`). *Island #1 fires*: five gatherers read your repo, conventions, prior art, related issues, and project knowledge in parallel, the reducer joins them, and the agent drafts a plan from the result. The plan lands as a `## Implementation plan` comment on the issue (shaped by the `ImplementationPlan` schema), status moves to **Todo**, and the agent stops — no "please confirm" in chat.
3. **Approve by moving the status.** Read the plan in Linear. When you're happy, drag the issue to **In Progress**. That status change *is* the approval — a human gate stored outside the agent.
4. **Implement.** Seeing In Progress, the agent creates a branch named after the issue, opens a **draft PR** wired to auto-close the issue on merge (`Fixes DEMO-123`), and implements the plan, committing atomically as it goes.
5. **Review.** *Island #2 fires*: four axis mappers in parallel, deterministic reduce, three sceptics per finding trying to refute it, and a summary the model cannot use to smuggle findings past the verifier. The review comment includes the `stats` counters — read them: `rejected` tells you how many plausible findings the adversarial pass killed, `gaps` whether anything degraded. Fixes get pushed to the same PR.
6. **Close.** Say *"merge and close"*. The close-out chain commits leftovers, pushes, merges the PR, switches your checkout back to the base branch, and marks the issue Done. On any error it stops and reports — it never improvises, because this is the irreversible part.

After every working session the agent posts a `## Session summary` comment (generated from the `SessionSummary` schema), so any future session — or any other agent — can resume from Linear alone.

## Steering with Linear statuses

The issue's status in Linear is the single source of truth for what the agent does next. You steer by moving the issue; the agent re-reads the status every turn.

| You set the status to… | The agent… |
|---|---|
| **Backlog** / **Todo** | drafts or refines the implementation plan, posts it to Linear, stops |
| **In Progress** | implements: branch, draft PR, code, commits — the only status that unlocks repo changes |
| **In Review** | runs the adversarial review island and pushes fixes |
| **Done** (with the PR still open) | closes out: merges the PR, syncs your checkout |

Only you can move an issue to **In Progress** — the agent never does it by itself to unlock implementation (an explicit request to implement in chat counts as approval, and the agent then sets the status to reflect it).

## Skills reference

How to trigger each skill and what to expect. All of them also respond to the slash form `/nerd4rent:<skill-name>`.

### `issue-writer` — file a new issue

- **Say:** *"create an issue"*, *"new task"*, *"utwórz/zgłoś issue"* — intent to file new work, with no existing issue ID.
- **What happens:** the agent resolves the target team/project (and confirms it), interviews you only if the goal is unclear, shows you the drafted body, and creates the issue in Backlog only after you approve. For big topics it can split the work into real sub-issues, and optionally run a "grilling session" — a one-question-at-a-time interrogation that sharpens the requirements before planning starts.

### `issue-workflow` — plan, implement, review

- **Say:** any Linear issue ID (`DEMO-123`) with intent to work on it — *"plan DEMO-123"*, *"zrealizuj DEMO-123"*, or just the bare ID.
- **What happens:** the status-driven flow described [above](#steering-with-linear-statuses), including both islands. During implementation it offers whichever implementation-style skills you have installed (TDD, subagent-driven, or plain).

### `issue-close` — merge and finish

- **Say:** *"merge and close"*, *"close out DEMO-123"*, *"domknij"*, *"zmerguj i zamknij"*.
- **What happens:** the deliberately mechanical close-out chain — commit leftovers, push, merge the PR (GitHub or GitLab), switch your checkout to the base branch, set the issue to Done. On any error it stops and reports.

### `new-project-workflow` — bootstrap a project

- **Say:** *"start a new project"*, *"bootstrap this project"* — typically from an empty directory.
- **What happens:** git init, `README.md` scaffold, GitHub repo via `gh`, a matching Linear project, and a hand-off to a spec-writing interview. One approval up front covers the whole sequence.

### `bootstrap-clis` — set up a machine

- **Say:** `/nerd4rent:bootstrap-clis`, or just let a skill fail because a CLI is missing.
- **What happens:** every dependency from the table above is probed, installed, or updated (with checksum verification for downloads). Authentication is never done for you — the skill ends with the exact steps you need to run yourself.

### `nerdbrain-wiki` / `nerdbrain-search` — personal second brain (optional)

These maintain a personal Obsidian vault with one entity page per project — the plan-phase island reads it as one of its five context sources, and decisions made during work are written back. They assume a specific vault layout under `~/obsidian/nerdbrain/` and matching rules in your global `~/.claude/CLAUDE.md`; without that setup they simply stay inactive.

## Troubleshooting

- **`Issue with identifier "X" not found`** — wrong team prefix or workspace; check `linearis teams list`.
- **`Status "X" for team ... not found`** — Linear statuses are your team's own names, spelled exactly (`In Progress`, not `in progress`).
- **`linearis` errors about authentication** — set `LINEAR_API_TOKEN` or run `linearis auth login` (see [Prerequisites](#prerequisites)).
- **`/plugin update` says nothing changed** — run `/plugin marketplace update nerd4rent-claude-plugin` first; if it still reports no change, no new version has been released yet.
- **A skill doesn't trigger** — invoke it explicitly with the slash form, e.g. `/nerd4rent:issue-workflow DEMO-123`.
- **The plan or review runs sequentially and slowly** — dynamic workflows are unavailable or disabled; see [Installation](#installation). The result is the same, only slower.
