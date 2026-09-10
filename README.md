# nerd4rent-claude-plugin

Open-source Claude Code skills that automate the daily developer workflow at [Nerd4Rent](https://nerd4rent.io).

New here? Start with the [User Guide](docs/USER-GUIDE.md) — what graph engineering is, how this plugin practices it, and how to install and drive it day to day.

## Skills

### `nerd4rent:new-project-workflow`

Bootstraps a new project end-to-end in a single approval:

1. Resolves the project directory (argument or `$PWD`).
2. Initializes git if absent.
3. Scaffolds `README.md` if absent.
4. Creates a GitHub repo with `gh` (public by default, confirm to flip).
5. Creates a matching Linear project via the `linearis` CLI (team picked at runtime).
6. Lets you pick a spec-creating skill: an always-available **inline grilling** interview run by the agent itself, plus whatever external spec skills are installed (e.g. `/to-prd`, `/office-hours`; wrappers like `/grill-me` are marked manual-only).

Trigger phrases: *"new project workflow"*, *"bootstrap project"*, *"start a new project the nerd4rent way"*, or `/nerd4rent:new-project-workflow`.

### `nerd4rent:linear-issue-writer`

Creates a **new** Linear issue for the current repo with goals specified clearly enough that the planning agent can build an implementation plan straight from it. Upstream of `linear-issue-workflow`:

1. Resolves the target team/project (nerdbrain entity-page → git remote → ask), and confirms.
2. Adaptively interviews for missing goals — straight to a draft for small clear tasks, a short one-question-at-a-time interview for vague or multi-part work.
3. Drafts the issue from an adaptive template (full vs minimal) and gates the Linear write on your approval.
4. Decomposes the work: a checklist in the body by default, or **real Linear sub-issues** (parent + children via `--parent-ticket`) when the topic plainly splits into stages — and you can force or decline the split.
5. Creates the issue **in Backlog** (explicit `--status Backlog`), then offers an optional **inline grilling session** (one question at a time, a recommended answer with each, facts checked by the agent, only decisions asked) that can sharpen the description or split the topic into sub-issues.
6. Prints the new issue ID and hands off to the status-driven flow: type the issue ID in a new session/message to start planning with `linear-issue-workflow`.

Uses the `linearis` CLI (see Requirements). Trigger: intent to create a new issue/task with no existing ID — *"utwórz/stwórz/dodaj/zgłoś issue"*, *"create issue"*, *"new task"*.

### `nerd4rent:linear-issue-workflow`

A mandatory **status-driven** workflow for working a Linear issue by ID (e.g. `KAM-145`). The issue's Linear status is the single source of truth — you steer by changing the status, the agent never asks you to "confirm the plan" in chat:

1. Fetches the issue (`linearis issues read <ID>`) at the start of every turn and dispatches on status — also when a bare issue ID is typed into a fresh session.
2. **Backlog/Todo** → drafts an implementation plan (for ambiguous requirements, first offers an inline grilling session with an ADR/glossary docs discipline), posts it as a `## Implementation plan` comment, sets the status to Todo, and ends the turn with no instructions.
3. **In Progress** (set manually by you = plan approved) → starts implementation: branch from the Linear `branchName`, empty commit, push, **draft PR with magic words** (`Fixes TEAM-123`) so the Linear↔GitHub integration closes the issue on merge; then offers an implementation mode (superpowers / Matt Pocock skills / plain agent — whichever is available).
4. After implementation or on **In Review** → offers a code-review menu (superpowers / Matt Pocock / review it yourself); never offers to merge or close on its own.
5. Close-out on request: delegates to **`nerd4rent:linear-issue-close`** (below) to merge and finish the issue.
6. Posts a `## Session summary` comment after every working session, and in the same step records a one-line **checkpoint** (date, issue, status, branch, HEAD, next step) under `## Checkpoints` on the project's nerdbrain entity page — the entry `linear-continue` reads back later; skipped silently when the vault is unreachable.

Uses the `linearis` CLI (syntax proven in the skill's own CLI reference). Trigger: any Linear issue ID with intent to plan or implement (incl. Polish *zaplanuj*, *zrealizuj*, *napraw*).

### `nerd4rent:linear-issue-close`

A deliberately **mechanical, lightweight** close-out for a finished issue — purely procedural with explicit commands and no multi-step reasoning. It pins itself to **Haiku** via a `model: haiku` frontmatter field (a Claude Code skill extension; other agents ignore the field), so the close-out runs cheap regardless of the session model. Invoked by `linear-issue-workflow`'s close-out phase, or directly:

1. Commits any leftover changes (repo convention: Polish, noun-form message, no co-author) — or skips if the tree is clean.
2. Pushes the branch (sets upstream if needed).
3. Detects GitHub vs GitLab from the origin remote and merges the PR/MR with a merge commit (`gh pr merge --merge` / `glab mr merge`; marks a draft PR ready first).
4. Switches the local checkout to the PR/MR's **base** branch (read from the PR/MR, not assumed to be `main`) and pulls.
5. Sets the Linear issue to **Done** (`linearis issues update <ID> --status Done`) — deterministic and covering GitLab, where there's no Linear↔GitHub auto-close.

On any error (e.g. merge conflict, missing `gh`/`glab`) it stops and reports rather than improvising. Uses the `linearis` CLI. Trigger: intent to close/merge/finish an issue — *"domknij"*, *"zamknij"*, *"zmerguj i zamknij"*, *"close out"*, *"merge and close"*.

### `nerd4rent:linear-continue`

Answers "where are we" for the current project in one step, after you switch to it — on this machine or another one — instead of re-investigating issues and the repo from scratch:

1. Reads the newest entry of `## Checkpoints` **directly from the entity page file** (the section is lazy, so the SessionStart inject never carries it).
2. Verifies it against git (`git fetch --prune`, then four cases checked in order against the local and remote branch tips, stopping at the first that fires: hash unknown after the fetch = commit never pushed from the other machine; branch gone = merged or lost, decided against the default branch; hash no longer an ancestor = history rewritten; commits after the hash = work without a checkpoint) and against Linear (`linearis issues read <ID> --fields identifier,title,state.name` vs the recorded status).
3. Reports the checkpoint, the git and Linear verdicts, the project's active issues (`Todo / In Progress / In Review`, team and project from the page frontmatter), and one hint line: type the issue ID to resume it with `linear-issue-workflow` — it never enters the workflow on its own.
4. On drift, **asks** before recording a new checkpoint; without a yes nothing is written. With no checkpoint at all it establishes the state from Linear and git, shows it, and records the first entry. With no entity page (`tier=none`) it reports only.

The entry format and the *Prepend, capped* (10 newest) write mode live in `nerdbrain-wiki`. Uses `linearis` (read-only) and `git`. Trigger: *"gdzie jesteśmy"*, *"na czym stanęliśmy"*, *"kontynuuj projekt"*, *"continue"*, *"where were we"*.

### `nerd4rent:nerdbrain-wiki`

The HOW for maintaining a personal Obsidian "second brain" — one entity page per project at `5-wiki/entities/projects/<slug>.md`. It carries:

- Section update modes (Edit/rewrite vs Append/chronological vs Prepend-capped vs flag-staleness).
- The `## Checkpoints` section: a one-line entry format (date, issue, Linear status, branch, HEAD, next step), newest first, capped at 10 — the project's resumable state written by `linear-issue-workflow` and read by `linear-continue`.
- The filesystem write pattern (`Read`/`Edit`/`Write` on the vault path; propagation is Obsidian Sync, not this skill's concern).
- Graph recall on-demand: following `related:`/`[[links]]` (direct `Read`) and vault search via `nerd4rent:nerdbrain-search`, with hard context limits — no speculative reading of the graph.
- Index (`index.md`) and log (`log.md`) maintenance steps.
- A bundled `entity-page-template.md` to scaffold a brand-new page.

The *when to write* triggers and hard safety rules stay in the user's global `~/.claude/CLAUDE.md`; this skill is invoked once a write is warranted. Trigger: about to create or update a nerdbrain wiki entity page.

### `nerd4rent:nerdbrain-search`

`rg`-based recipes for searching the nerdbrain vault (`~/obsidian/nerdbrain/5-wiki/`) — the read path behind `nerdbrain-wiki`'s Graph recall step (ADR-0001: filesystem+`rg`, no CLI abstraction):

1. **Phrase in vault** — `rg -il` for filenames, `rg -i -n -C2` for context snippets.
2. **Outgoing `[[links]]`** — extract link/embed targets from a page.
3. **Backlinks** — find every page linking to a given slug (handles `[[slug|alias]]` and `![[slug]]`).
4. **1-hop graph** — outgoing links plus backlinks for an entity page, composed from recipes 2 and 3.

Limits on how much to read (max related pages, snippet caps) stay with the calling skill. Trigger: another skill's recall step needs to search the vault or follow links.

### `nerd4rent:bootstrap-clis`

Brings this machine to the CLI state the skills in this repo require:

1. Probes every entry declared in `cli-dependencies.json` (currently `node`, `linearis`, `gh`, `rg`, `git`).
2. Installs or updates whatever is missing or outdated — download with checksum verification, or `npm install --global` for entries declaring the `npm` method.
3. Hands back the authentication steps only a human can complete — it never runs `auth login` flows itself.

Trigger: `/nerd4rent:bootstrap-clis`, on a freshly set up machine, or when a skill fails because a command like `linearis`, `gh`, or `rg` is missing or too old.

## Workflow topology

The skills above are not a loose bag: they form the **issue lifecycle axis**,
written down as a contract in [`workflow-graph.json`](workflow-graph.json) and
enforced by `node scripts/validate-workflow-graph.ts` (tests:
`node --test scripts/**/*.test.ts`). The contract declares, per node, which
skill runs it, what schema each edge carries, which gates guard it, what happens
on failure, and how wide it may fan out (`budget.maxWidth`, an integer from 1 to
the runtime's cap of 16). Two nodes sharing an upstream is what "these may run
at once" looks like — `wiki-recall` and `plan-context-fanout` are both plan-phase
branches off `issue-write`, split into separate nodes only because a node belongs
to exactly one skill. See
[ADR-0003](docs/adr/0003-workflow-graph-contract.md) for why the contract and
the runtime are two different artifacts.

Gates and frozen rules are data, not prose. Every **irreversible** action on
the axis — writing the issue to Linear (`issue-write`), pushing commits
(`implement`), merging and setting Done (`close`), writing the vault
(`wiki-write`) — is marked `irreversible: true` and must sit behind a gate.
A gate is one of two kinds with a closed mechanism vocabulary the validator
enforces: a `decision` gate is the human's call (`linear-status` or
`chat-approval` — the Linear status is the only carrier of acceptance), a
`deny` gate is a hard stop that never asks (`pretooluse-hook` or
`settings-deny`). The **`frozenRules`** registry makes the invariants
first-class: a gate's `rule` field points into it, a deny gate exists only to
enforce one, and a rule no gate points to is rejected — so a dangerous
transition is unreachable, not merely "usually asked about". Human gates sit
on the boundaries between workflows, never inside them.

Every registry entry carries its **schema body** — the JSON Schema the payload on
that edge is checked against — and the body has two consumers, which is what keeps
the shape defined once instead of twice. `node scripts/render-templates.ts`
renders it into the templates the skills ship (`plan-template.md`,
`issue-template.md`, `session-summary-template.md`), and inside a workflow island
the same body is what `agent({schema})` enforces at runtime, inlined verbatim.
Those three files are generated artifacts: change a
section by editing the schema, and a hand edit reddens the drift test. A body is
also self-contained — a `$ref` may only point into the entry's own `$defs` — because
a workflow script has to inline it verbatim. None of this ever becomes a
precondition: a session without the workflow runtime fills the same generated
template in prose, exactly as before.

Two islands are real. `workflows/plan-context-fanout.js` runs the plan-phase
fan-out (trigger `/nerd4rent:plan-context-fanout`, or `Workflow({name: "nerd4rent:plan-context-fanout", args})`
during development). One script realises both plan-phase workflow nodes — the
contract's `script` binding on `wiki-recall` and `plan-context-fanout` points at
the same file — spawning five concurrent gatherers (repo layout, conventions,
prior plans, related Linear issues, nerdbrain vault) and reducing their output
deterministically into `PlanContext` + `ProjectContext`. The binding also arms
the drift check in the omission direction: every `out` schema of a bound node
must be inlined in its script (rule 17) and every inline body must be a
strict-JSON literal deep-equal to the registry body (rule 18).

The second island, `workflows/review-verify.js`, runs the review phase as
map → reduce → verify → synthesize: one mapper per review axis
(spec-compliance, repo-standards, correctness-regressions, security), a
deterministic reducer (schema-invalid records dropped, dedup by `file:line`
with the most severe finding winning the anchor, severity sort, cap 12), then
adversarial verification — 3 sceptics per
finding, each prompted to refute it, 2 or more refutations out of 3 reject it
— and a synthesizer that writes only the summary while the reducer assembles
the findings verbatim. Rejections and overflow are counted in the required
`ReviewFindings.stats`, so degradation is visible, never silent.

The axis measures itself **passively**: a figure is collected only when it is a
by-product of a run that happens anyway, and it is stored only where that run's
result already lands — a Linear comment. Three of them. The **verifier
rejection rate** (`rejected / (verified + rejected)` from `ReviewFindings.stats`)
says whether adversarial verification earns its latency: read over the last ~5
runs, below 10% the verifier is decoration and above 50% the reviewers are
ill-defined — the thresholds live in [`CONTEXT.md`](CONTEXT.md). The **node
failure rate** comes from the `gaps` both islands report, plus
`stats.unverifiedOverflow`. **Fan-out effectiveness** is the optional
`PlanContext.stats`: per gatherer, how many items it returned and how many it
was the first to contribute, so a gatherer stuck near zero across runs becomes
a removal candidate. The plan island's figures reach Linear through the
optional `metrics` section of the session summary. Nothing here needs CI, a
telemetry channel or a clock — the one candidate that did, critical-path
length, was dropped rather than deferred.

Not every skill is a node. `linear-continue`, like `bootstrap-clis`, is an
entry point *from outside* the axis: it answers "where
were we" by reading the `## Checkpoints` entry that the `session-summary` →
`wiki-write` edge already produces, and it asks the user before writing —
which makes it conversational by nature and rules out an island. Registering it
as a node would mean inventing a `dependsOn` and an edge schema for a step that
consumes an existing edge's output instead of extending the axis, so the
contract stays at 10 nodes.

The axis is an **island graph**, not one graph end to end. The Claude Code
workflow runtime takes no mid-run user input, so every step that needs a human
— the grilling session, the "user sets In Progress" gate, the review menu —
stays in the conversational main agent, and only the wide, independent,
human-free stretches become workflow islands:

```
[main agent, conversational, status-driven]
  ├─ workflow island: plan-context fanout           ← built: workflows/plan-context-fanout.js
  ├─ [GATE: the human sets In Progress in Linear]   ← outside the graph, necessarily
  ├─ implementation (sequential, conversational)
  ├─ workflow island: review map → reduce → verify → synthesize   ← built: workflows/review-verify.js
  └─ close-out: a chain, pinned to Haiku, no workflow
```

| Node | Skill | Phase | Runtime | Edge in → out |
|---|---|---|---|---|
| `issue-write` | `linear-issue-writer` | write | conversational | — → `IssueSpec` |
| `wiki-recall` | `nerdbrain-search` | plan | **workflow** | `IssueSpec` → `ProjectContext` |
| `plan-context-fanout` | `linear-issue-workflow` | plan | **workflow** | `IssueSpec` → `PlanContext` |
| `plan-draft` | `linear-issue-workflow` | plan | conversational | `PlanContext`, `ProjectContext` → `ImplementationPlan` |
| `implement` | `linear-issue-workflow` | implement | conversational | `ImplementationPlan` → `ChangeSet` |
| `session-summary` | `linear-issue-workflow` | implement | conversational | `ChangeSet` → `SessionSummary` |
| `review-menu` | `linear-issue-workflow` | review | conversational | `ChangeSet` → `ReviewRequest` |
| `review-verify` | `linear-issue-workflow` | review | **workflow** | `ReviewRequest` → `ReviewFindings` |
| `close` | `linear-issue-close` | close | chain | `ReviewFindings` → `MergedBranch` |
| `wiki-write` | `nerdbrain-wiki` | wiki | chain | `SessionSummary` → `EntityPageUpdate` |

Degradation runs on two tracks, and both end in the same place — the sequence
the skills already describe in prose:

- **Other agents** (Cursor, Copilot, …) have no `Workflow` tool at all; they
  read the topology as documentation and run the axis sequentially.
- **Claude Code with workflows unavailable** — below v2.1.154, on a plan that
  does not include them, or switched off via `"disableWorkflows": true`, the
  *Dynamic workflows* toggle in `/config`, or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`
  — falls back the same way, so an island is always an optimization, never a
  precondition.

## Installation

### Claude Code

Add this marketplace and install the plugin:

```bash
/plugin marketplace add https://github.com/nerd4rent/nerd4rent-claude-plugin
/plugin install nerd4rent@nerd4rent-claude-plugin
```

### Other agents (Cursor, Copilot, Windsurf, Cline, …)

The skills follow the shared [Agent Skills specification](https://github.com/vercel-labs/skills), so the [`skills` CLI](https://github.com/vercel-labs/skills) can install them into 70+ coding agents:

```bash
# Install all skills globally into your detected agent(s)
npx skills add nerd4rent/nerd4rent-claude-plugin -g

# Or target a specific agent and/or skill
npx skills add nerd4rent/nerd4rent-claude-plugin -g -a cursor -s '*'

# Keep them current
npx skills update
```

Cursor reads global skills from `~/.agents/skills/` (and `~/.cursor/skills/`); the CLI installs there automatically. Restart the agent after installing.

## Requirements

- `git`
- `gh` (GitHub CLI), authenticated (`gh auth status`)
- Node.js ≥ 22 (with npm)
- `linearis` CLI (`npm i -g linearis`), authenticated with a personal API key from Linear Settings → API (`LINEAR_API_TOKEN` or `linearis auth login`); the Linear skills degrade gracefully if absent

## Releasing

Two manifests carry a version, and they move together:

- `.claude-plugin/plugin.json` → `version`
- `.claude-plugin/marketplace.json` → `metadata.version`

The installed plugin version comes from `plugin.json`. Bumping it is what forces Claude Code to refresh its `cache/<marketplace>/<plugin>/<version>/` copy — an unchanged number makes `/plugin update` a no-op even when `main` has moved on. `marketplace.json` versions the marketplace itself and does not drive that cache, but the two numbers have matched for every release; a mismatch publishes an inconsistent manifest. Keep them equal — `node scripts/validate-manifests.ts` checks it and exits non-zero when they drift.

Merging to `main` does not update anyone's install on its own: the local marketplace clone is only refreshed by `/plugin marketplace update <marketplace>`, followed by `/plugin update <plugin>@<marketplace>`.

## License

MIT — see [LICENSE](LICENSE).
