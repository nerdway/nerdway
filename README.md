# nerd4rent-claude-plugin

Open-source Claude Code skills that automate the daily developer workflow at [Nerd4Rent](https://nerd4rent.io).

New here? Start with the [User Guide](docs/USER-GUIDE.md) — what graph engineering is, how this plugin practices it, and how to install and drive it day to day.

## Skills

> **Renamed in 0.20.0:** `linear-issue-writer` → `issue-writer`, `linear-issue-workflow` → `issue-workflow`, `linear-issue-close` → `issue-close`, `linear-continue` → `project-continue`. Update any `nerd4rent:` references in your `CLAUDE.md` and hooks after `/plugin update`.

### `nerd4rent:new-project-workflow`

Bootstraps a new project end-to-end in a single approval:

1. Resolves the project directory (argument or `$PWD`).
2. Initializes git if absent.
3. Scaffolds `README.md` if absent.
4. Creates a GitHub repo with `gh` (public by default, confirm to flip).
5. Creates a matching Linear project via the `linearis` CLI (team picked at runtime) — or, when you pick **GitHub Issues** as the tracker, skips it: the repo is the container.
6. Lets you pick a spec-creating skill: an always-available **inline grilling** interview run by the agent itself, plus whatever external spec skills are installed (e.g. `/to-prd`, `/office-hours`; wrappers like `/grill-me` are marked manual-only).

Trigger phrases: *"new project workflow"*, *"bootstrap project"*, *"start a new project the nerd4rent way"*, or `/new-project-workflow` / `/nerd4rent:new-project-workflow`.

### `nerd4rent:determine-platform`

Establishes which **tracker** holds the project's issues (Linear, GitHub Issues, GitLab Issues, Azure DevOps Boards, or none) and which **VCS host** holds its code (GitHub, GitLab, Azure DevOps), and records it — see [Platform config and adapters](#platform-config-and-adapters):

1. Reads what is already recorded: the `## Platform` section of the repo `CLAUDE.md`, then `platform:` on the nerdbrain entity page, then a legacy `linear:` block there.
2. Otherwise infers: the origin remote host names the VCS; an authenticated Linear CLI plus exactly one Linear project named like the repo names the tracker — then it writes without asking.
3. When the answer is ambiguous, asks **one** question: a numbered list of the six tracker + host combinations with a recommendation.
4. Writes the result to both places — replacing only the `## Platform` section of `CLAUDE.md` (a second run leaves no diff, and an existing `statuses` key survives), and `platform:` on the entity page in place of the legacy `linear:`.
5. Chains into **`bind-statuses`** (below) to bind the workflow phases to the tracker, then returns the result to the conversation.

Writing that section is allowed at any issue status: it is an exemption from the "no repo change before In Progress" rule. Trigger: `/determine-platform`, a core skill reporting that no platform is configured, or *"which tracker does this project use"*.

### `nerd4rent:bind-statuses`

Binds the five **canonical phases** the workflow runs on — `backlog`, `todo`, `in-progress`, `in-review`, `done` — to how the tracker shows them, and records it as the `statuses` key of `## Platform` — see [Platform config and adapters](#platform-config-and-adapters):

1. Reads the platform and the tracker adapter's supported strategies and default map.
2. Proposes a **status strategy**: `native` (the tracker's own states) when the adapter supports it, else `label` (one label per phase plus open/closed), else `comment` (a `Status: <value>` marker comment) — `comment` also when you turn labels down.
3. Lists the tracker's real states or labels where its CLI can, and asks **one** question: the proposed map with its reason.
4. Creates missing labels only after an explicit yes, naming each one.
5. Writes the block to `CLAUDE.md` (a second run leaves no diff) and to `platform.statuses` on the entity page, runs `validate-platform-config.ts`, and returns the result.

Runs at the end of `determine-platform` or on its own at any time. Without a `statuses` block the adapter default applies, so Linear projects need nothing. Trigger: `/bind-statuses`, *"bind statuses"*, *"zmapuj statusy"*.

### `nerd4rent:issue-writer`

Creates a **new** issue (Linear, GitHub Issues, GitLab Issues or Azure DevOps Boards) for the current repo with goals specified clearly enough that the planning agent can build an implementation plan straight from it. Upstream of `issue-workflow`:

1. Resolves the platform (`## Platform` in `CLAUDE.md` → entity page → **delegates to `determine-platform`** when none is configured), then the target team/project (on GitHub Issues and GitLab Issues: the repo; on Azure DevOps Boards: the project and the work item type), and confirms.
2. Adaptively interviews for missing goals — straight to a draft for small clear tasks, a short one-question-at-a-time interview for vague or multi-part work.
3. Drafts the issue from an adaptive template (full vs minimal) and gates the Linear write on your approval.
4. Decomposes the work: a checklist in the body by default, or **real Linear sub-issues** (parent + children via `--parent-ticket`) when the topic plainly splits into stages — and you can force or decline the split.
5. Creates the issue **in Backlog** (explicit `--status Backlog`), then offers an optional **inline grilling session** (one question at a time, a recommended answer with each, facts checked by the agent, only decisions asked) that can sharpen the description or split the topic into sub-issues.
6. Prints the new issue ID and hands off to the status-driven flow: type the issue ID in a new session/message to start planning with `issue-workflow`.

Uses the `linearis` CLI (see Requirements). Trigger: intent to create a new issue/task with no existing ID — *"utwórz/stwórz/dodaj/zgłoś issue"*, *"create issue"*, *"new task"*.

### `nerd4rent:issue-workflow`

A mandatory **status-driven** workflow for working a tracker issue by ID (e.g. `KAM-145` on Linear, `#123` or `owner/repo#123` on GitHub Issues, `#123` or `group/project#123` on GitLab Issues, `#123` or `AB#123` on Azure DevOps Boards). The issue's Linear status is the single source of truth — you steer by changing the status, the agent never asks you to "confirm the plan" in chat:

1. Fetches the issue (`linearis issues read <ID>`) at the start of every turn and dispatches on its **phase**, read through the project's status strategy (on Linear by default: the state name) — also when a bare issue ID is typed into a fresh session.
2. **Backlog/Todo** → drafts an implementation plan (for ambiguous requirements, first offers an inline grilling session with an ADR/glossary docs discipline), posts it as a `## Implementation plan` comment, sets the status to Todo, and ends the turn with no instructions.
3. **In Progress** (set manually by you = plan approved) → starts implementation by delegating to **`nerd4rent:issue-start`** (below): branch from the Linear `branchName`, empty commit, push, **draft PR with magic words** (`Fixes TEAM-123`) so the Linear↔GitHub integration closes the issue on merge; then offers an implementation mode (superpowers / Matt Pocock skills / plain agent — whichever is available).
4. After implementation or on **In Review** → offers a code-review menu (superpowers / Matt Pocock / review it yourself); never offers to merge or close on its own.
5. Close-out on request: delegates to **`nerd4rent:issue-close`** (below) to merge and finish the issue.
6. Posts a `## Session summary` comment after every working session, and in the same step records a one-line **checkpoint** (date, issue, status, branch, HEAD, next step) under `## Checkpoints` on the project's nerdbrain entity page — the entry `project-continue` reads back later; skipped silently when the vault is unreachable.

Uses the tracker's CLI through its adapter (`linearis`, `gh` for GitHub Issues, `glab` for GitLab Issues, or `az` for Azure DevOps Boards). Trigger: any issue ID with intent to plan or implement (incl. Polish *zaplanuj*, *zrealizuj*, *napraw*).

### `nerd4rent:issue-start`

The mirror of `issue-close` at the other end of an issue: a deliberately **mechanical, lightweight** Start for an issue the user has already moved to In Progress — purely procedural with explicit commands, no questions and no multi-step reasoning, pinned to **Haiku** via `model: haiku`. Invoked by `issue-workflow`'s Start step, or directly:

1. Reads the issue (`linearis issues read <ID> --fields identifier,title,branchName,state.name,url`) and stops unless it is **In Progress** — the same approval gate `issue-workflow` enforces.
2. Requires a clean checkout on `main`/`master`; on any other branch or with leftover changes it stops and reports (branching from another issue branch is `issue-workflow`'s decision, not the chain's).
3. Creates the branch through the tracker's `issue.create-branch` (Linear: from its `branchName`; GitHub Issues: `gh issue develop`, which links the branch to the issue; GitLab Issues and Azure DevOps Boards: `git checkout -b <number>-<title-slug>`), makes the empty start commit (`Rozpoczęcie prac nad <ID>`, no co-author) and pushes with upstream.
4. Opens a **draft** PR/MR on the configured VCS host (`gh pr create --draft` / `glab mr create --draft` / `az repos pr create --draft true`) whose body starts with `Fixes <ID>`, so the Linear integration tracks it and auto-closes the issue on merge. Azure DevOps has no Linear integration, so there the body also carries the issue URL; with Azure DevOps Boards as the tracker the PR is linked to the work item (`--work-items`) instead.

On any error (branch already exists, push rejected, missing `gh`/`glab`/`az`) it stops and reports rather than improvising. Uses the `linearis` CLI. Trigger: intent to start an issue that is In Progress — *"zacznij"*, *"rozpocznij"*, *"start DEMO-123"*, *"open the PR for"*.

### `nerd4rent:issue-close`

A deliberately **mechanical, lightweight** close-out for a finished issue — purely procedural with explicit commands and no multi-step reasoning. It pins itself to **Haiku** via a `model: haiku` frontmatter field (a Claude Code skill extension; other agents ignore the field), so the close-out runs cheap regardless of the session model. Invoked by `issue-workflow`'s close-out phase, or directly:

1. Commits any leftover changes (repo convention: Polish, noun-form message, no co-author) — or skips if the tree is clean.
2. Pushes the branch (sets upstream if needed).
3. Merges the PR/MR on the configured VCS host with a merge commit (`gh pr merge --merge` / `glab mr merge` / `az repos pr update --status completed --squash false`; marks a draft PR ready first). A branch policy that blocks completion on Azure DevOps stops the chain — it is never bypassed.
4. Switches the local checkout to the PR/MR's **base** branch (read from the PR/MR, not assumed to be `main`) and pulls.
5. Sets the Linear issue to **Done** (`linearis issues update <ID> --status Done`) — deterministic and covering GitLab and Azure DevOps, where there's no Linear↔GitHub auto-close.

On any error (e.g. merge conflict, missing `gh`/`glab`/`az`) it stops and reports rather than improvising. Uses the `linearis` CLI. Trigger: intent to close/merge/finish an issue — *"domknij"*, *"zamknij"*, *"zmerguj i zamknij"*, *"close out"*, *"merge and close"*.

### `nerd4rent:auto-issue-mode`

Runs one issue **autonomously** from a task description or an existing issue ID to a merged PR/MR and the `done` phase. User-invoked only (`disable-model-invocation: true`): typing it is the consent that lets the agent write every phase itself, `in-progress` included — the one exception to `issue-workflow`'s status gate, valid only inside the run and registered in `workflow-graph.json` as an exemption from `no-repo-change-before-in-progress`.

1. **Task description** → drafts the issue per `issue-writer` (no grilling, no sub-issues, full template) and waits for **one** approval of the draft — the run's only human stop.
2. **Issue ID** → skips creation, reads the phase and resumes at the matching stage (`backlog`/`todo` → start, `in-progress` → plan or implementation, `in-review` → review, `done` → verify close-out).
3. Each stage runs on its own subagent — start (`issue-start`), plan (posted as a `## Implementation plan` comment, no approval gate), implementation (baseline and final tests, atomic commits), review (acceptance criteria, plan and repo standards; fixes committed; PR/MR marked ready), then close-out (`issue-close`) in parallel with a nerdbrain update when a write trigger fired. The orchestrator edits no code and prints a short progress line after each stage.
4. Stops and reports — never forces — on a tracker/CLI error, red tests the review cannot fix, a merge conflict or a blocked tool, with the command to resume.

Ends with the issue link, PR/MR number, merge commit, test results (pre-existing unrelated failures listed apart) and what went to nerdbrain. Trigger: `/nerd4rent:auto-issue-mode <task description | issue ID>`.

### `nerd4rent:issue-next-step`

Answers "what next" for **one issue** and starts it, so you don't have to check the status, change it by hand and retype the ID:

1. **Diagnoses** — reads the phase through the status strategy and the evidence: the `## Implementation plan` comment, the issue branch (local and on `origin`), the PR/MR, the newest commits.
2. **Names one next step**, following `issue-workflow`'s dispatch table — planning (`backlog`, or `todo` without a plan), implementation (`todo` with a plan, `in-progress`), review (`in-review`), close-out (`done` with an open PR/MR), or nothing left (`done`, merged).
3. **Asks once** — continue step by step with `issue-workflow`, run it autonomously with `auto-issue-mode`, or end. When the step is implementation and the issue is not In Progress yet, the step-by-step choice also moves it there: the skill writes `in-progress` only after that yes in chat, registered in `workflow-graph.json` as an exemption from `no-repo-change-before-in-progress`. Any other answer writes nothing.
4. **Hands off** with the same ID — `issue-workflow` through the `Skill` tool, `auto-issue-mode` from its issue-ID entry (the skill reads it, since `auto-issue-mode` is user-invoked only).

Stops and reports, writing nothing, on an unknown phase, a missing adapter, an unbound status strategy or a CLI error. Trigger: *"następny krok"*, *"co dalej z DEMO-123"*, *"next step"*, *"what's next for #123"*, or `/nerd4rent:issue-next-step <issue ID>`.

### `nerd4rent:project-continue`

Answers "where are we" for the current project in one step, after you switch to it — on this machine or another one — instead of re-investigating issues and the repo from scratch:

1. Reads the newest entry of `## Checkpoints` **directly from the entity page file** (the section is lazy, so the SessionStart inject never carries it).
2. Verifies it against git (`git fetch --prune`, then four cases checked in order against the local and remote branch tips, stopping at the first that fires: hash unknown after the fetch = commit never pushed from the other machine; branch gone = merged or lost, decided against the default branch; hash no longer an ancestor = history rewritten; commits after the hash = work without a checkpoint) and against Linear (`linearis issues read <ID> --fields identifier,title,state.name` vs the recorded status).
3. Reports the checkpoint, the git and Linear verdicts, the project's active issues (`Todo / In Progress / In Review`, team and project from the page frontmatter), and one hint line: type the issue ID to resume it with `issue-workflow` — it never enters the workflow on its own.
4. On drift, **asks** before recording a new checkpoint; without a yes nothing is written. With no checkpoint at all it establishes the state from Linear and git, shows it, and records the first entry. With no entity page (`tier=none`) it reports only.

The entry format and the *Prepend, capped* (10 newest) write mode live in `nerdbrain-wiki`. Uses `linearis` (read-only) and `git`. Trigger: *"gdzie jesteśmy"*, *"na czym stanęliśmy"*, *"kontynuuj projekt"*, *"continue"*, *"where were we"*.

### `nerd4rent:nerdbrain-wiki`

The HOW for maintaining a personal Obsidian "second brain" — one entity page per project at `5-wiki/entities/projects/<slug>.md`. It carries:

- Section update modes (Edit/rewrite vs Append/chronological vs Prepend-capped vs flag-staleness).
- The `## Checkpoints` section: a one-line entry format (date, issue, Linear status, branch, HEAD, next step), newest first, capped at 10 — the project's resumable state written by `issue-workflow` and read by `project-continue`.
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

1. Probes every entry declared in `cli-dependencies.json` (currently `node`, `linearis`, `gh`, `glab`, `jq`, `az`, `rg`, `git`). A missing `glab` only matters on GitLab-hosted repos or GitLab Issues trackers, a missing `jq` only on GitLab Issues or Azure DevOps Boards trackers, a missing `az` (or its `azure-devops` extension) only on Azure DevOps-hosted repos or Azure DevOps Boards trackers.
2. Installs or updates whatever is missing or outdated — download with checksum verification, or `npm install --global` for entries declaring the `npm` method.
3. Hands back the authentication steps only a human can complete — it never runs `auth login` flows itself.

Trigger: `/bootstrap-clis` / `/nerd4rent:bootstrap-clis`, on a freshly set up machine, or when a skill fails because a command like `linearis`, `gh`, or `rg` is missing or too old.

### `nerd4rent:nerd-documentation-write`

Style rules for documentation aimed at readers outside your own tooling stack (a client's engineers, open-source users), covering what to cut from a draft and how to phrase what stays:

1. A doc states the fact the reader needs, never the investigation trail that produced it. A repair log solves the writer's problem, not the reader's; if the investigation has lasting value it belongs in a wiki page or a commit message.
2. No internal issue-tracker IDs in reader-facing prose, since the reader has no account in your tracker. Issue tracking stays in commit messages, PR descriptions and tracker comments.
3. Sentences open with a real word rather than an inline-code identifier, and headings are noun phrases rather than conjugated "we do X" sentences.
4. Plain hyphens instead of em dashes, no emoji, and bold or italic reserved for phrases that name a scenario, a scope boundary, or a tool the reader must recognise later.
5. One runnable command per fenced code block, described in prose above it, never labelled with `#`-comments inside the fence.

The rules are general-purpose, scoped to no project or language, and the skill is a living document: a review that surfaces a new generalizable convention adds a rule. Trigger: writing or revising a tutorial, README, or step-by-step guide for an audience outside your own tooling.

## Platform config and adapters

Every skill that talks to a tracker or a VCS host reads the project's **platform config** first — one YAML object kept as a `## Platform` section in the repo's committed `CLAUDE.md` (so it travels with the repo into every worktree) and mirrored as `platform:` on the nerdbrain entity page:

````markdown
## Platform

```yaml
tracker: linear
vcs: github
linear:
  team: DEMO
  project: <project-uuid>
github:
  owner: nerd4rent
  repo: nerd4rent-claude-plugin
```
````

`tracker` is one of `linear`, `github`, `gitlab`, `ado`, `none`; `vcs` one of `github`, `gitlab`, `ado`. The shape is the `PlatformConfig` schema in `workflow-graph.json`. `determine-platform` writes it; an entity page with only the older `linear: {team, project}` block keeps working as an alias.

An optional `statuses` key, written by `bind-statuses`, binds the workflow's canonical phases to the tracker:

```yaml
statuses:
  strategy: comment
  map:
    backlog: backlog
    todo: todo
    in-progress: in-progress
    in-review: in-review
    done: done
```

`native` maps phases to the tracker's state names, `label` to label names plus the reserved `open` (backlog only) and `closed` (always `done`), `comment` to the value of a `Status: <value>` marker comment. Without the key, the tracker adapter's `## Statuses` default applies — on Linear `native` with `Backlog / Todo / In Progress / In Review / Done`, so existing projects behave as before; on GitHub Issues and GitLab Issues `label` with `open / status::todo / status::in-progress / status::in-review / closed` (create the three labels with `/bind-statuses`); on Azure DevOps Boards `native` with the board columns `New / Todo / Active / In Review / Closed` (add the missing columns with `/bind-statuses`). What each strategy means is in [`adapters/statuses.md`](adapters/statuses.md); `node scripts/validate-platform-config.ts [path/to/CLAUDE.md]` checks a config (all five phases, a strategy the adapter supports, no value twice) and every tracker adapter's default. See [ADR-0006](docs/adr/0006-canonical-phases-and-status-strategies.md).

The commands themselves live in **adapter files**, one per platform per axis:

| Axis | Adapter files | Required sections |
|---|---|---|
| tracker | `adapters/trackers/linear.md`, `adapters/trackers/github.md`, `adapters/trackers/gitlab.md`, `adapters/trackers/ado.md` | `CLI`, `Issue ID`, `Operations`, `URL`, `Statuses`, `Status strategies` |
| VCS host | `adapters/vcs/github.md`, `adapters/vcs/gitlab.md`, `adapters/vcs/ado.md` | `CLI`, `Detection`, `Operations`, `Magic words`, `URL` |

Skills never quote a command: they name an **operation ID** (`issue.set-status`, `pr.merge`, …) and look it up in the adapter's `## Operations` table, read through `${CLAUDE_PLUGIN_ROOT}`. The `adapters` block of `workflow-graph.json` declares each axis's sections and operation IDs, and `node scripts/validate-workflow-graph.ts` rejects an adapter that misses one, repeats one, lists an undeclared one, or is named outside the config enum — and a tracker adapter whose `## Status strategies` table does not list exactly the strategies of the config enum, or supports none. A configured platform with no adapter file yet makes the skill stop with "adapter not available yet" — it never falls back to Linear.

**GitHub Issues as the tracker** (`tracker: github`): issue IDs are `#123` (the configured repo) or `owner/repo#123`, and a PR number is rejected. The repo is the container — no team or project. Phases default to `status::*` labels plus open/closed, so a PR merged with `Fixes #123` into the default branch lands the issue on `done`. The `comment` strategy counts only markers whose author has write access to the repo (checked per author through the collaborator permission API). Sub-issues are GitHub's native ones (`gh issue create --parent`), and branches come from `gh issue develop` with an ASCII name `<number>-<title-slug>`. The token needs the `repo` scope (fine-grained: Issues, Contents and Pull requests, read and write). See [ADR-0005](docs/adr/0005-platform-adapters-as-reference-files.md).

**GitLab Issues as the tracker** (`tracker: gitlab`): issue IDs are `#123` (the configured project) or `group/project#123`. The project is the container — no team or project to pick. Phases default to `status::*` labels plus opened/closed, and work on the Free tier: scoped-label exclusivity is a paid feature, so every status write removes the other status labels itself, and because GitLab silently creates a label that does not exist, a write stops unless the label is already there. An MR merged with `Fixes #123` into the default branch closes the issue and so lands it on `done`. The `comment` strategy counts only markers whose author is at least a Developer on the project (checked per author through the members API). GitLab Free has no sub-issues, so a child is an ordinary issue linked `relates_to` to its parent, with `Parent: #<n>` as the first line of its description. Branches are plain `git checkout -b <number>-<title-slug>`. The recipes pipe `glab api` output through `jq`; the token needs the `api` and `write_repository` scopes.

**Azure DevOps Boards as the tracker** (`tracker: ado`, with Azure DevOps Repos as the host): issue IDs are `#123`; `AB#123` and a bare number are accepted too. Work item IDs are unique across the organisation, so every lookup checks the item belongs to the configured project. The stock processes have too few states for five phases, so `native` binds the phases to the **columns of one team's board** — `ado.team`, `ado.board` and `ado.workItemType` in the `ado` block, all written by `/bind-statuses`, which also adds the missing columns with your consent (team admin rights). A column write sets the state the column maps and reads the column back, because Azure DevOps silently ignores a column that disagrees with the state. If you cannot add columns, `label` uses `status::*` tags plus the state's Completed category as `closed`, and `comment` uses `Status:` marker comments (only project members can comment, so no author check). Issues are created with a Markdown description; sub-issues are the same work item type with a Parent link. The draft PR is linked to the work item and its description starts with `Fixes #123`, so completing it moves the work item to Closed. A personal access token needs Work Items (Read, write & manage), Code (Read & write) and Project and Team (Read).

## Plugin agents

Four read-only agents ship in `agents/` and register as `nerd4rent:<name>`
in the same registry the Agent tool uses. They exist for the islands' mechanical
roles — reading a diff or a source and returning data under a schema — so those
roles run with a structural tool whitelist (no Edit, Write or NotebookEdit; no
ToolSearch, so no MCP) instead of the default workflow subagent with full tools,
and, where the role allows it, on a cheaper model than the session's. The islands select them per `agent()` call via
`agentType`; the contract in `workflow-graph.json` is unchanged, because which
agent runs a role is an execution parameter, not topology.

| Agent | Model | Tools | Called by |
|---|---|---|---|
| `nerd4rent:review-mapper` | Sonnet | Read, Grep, Glob, Bash, Skill | the four axis mappers of `review-verify` |
| `nerd4rent:review-sceptic` | `inherit` (the session model) | Read, Grep, Glob, Bash, Skill | the three sceptics per finding of `review-verify` |
| `nerd4rent:review-synthesizer` | Haiku | Read | the summary writer of `review-verify` |
| `nerd4rent:plan-gatherer` | Sonnet | Read, Grep, Glob, Bash, Skill; preloads `nerd4rent:nerdbrain-search` | the five gatherers of `plan-context-fanout` |

The sceptics of the review island keep the **session model** on purpose
(`model: inherit`): they are the only quality gate, and their "when uncertain,
refute" rule on a weaker model would refute everything. What they gain from a
dedicated agent is the tool whitelist alone — the default workflow subagent was
observed running `git checkout` in the repo during a review, which the
whitelist plus the agent's read-only rule now rule out. The agents are not meant for direct delegation
— their descriptions say so — and `plugin.json` does not list them, since the
`agents` manifest field would replace the auto-discovered directory rather than
add to it.

None of the agents quotes a tracker or VCS command. Their read-only Bash lists
name adapter **operation IDs** (`issue.read`, `issue.read-relations`, `pr.view`,
`pr.diff`, `pr.list-merged`, plus `issue.list-active` for the gatherer), and
every other adapter operation is forbidden to them. Since a workflow script
cannot read files, `issue-workflow` resolves the adapter paths and passes them
to both islands as `args.platform.adapters`; an island hands the path to its
agents in the prompt, and a missing adapter (`null`) becomes a `gaps` entry
instead of a command from another platform.

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
the axis — creating tracker labels (`statuses-bind`), writing the issue to Linear (`issue-write`), pushing commits
(`implement`), merging and setting Done (`close`), writing the vault
(`wiki-write`), running one issue end to end (`auto-issue-mode`) — is marked `irreversible: true` and must sit behind a gate.
A gate is one of two kinds with a closed mechanism vocabulary the validator
enforces: a `decision` gate is the human's call (`tracker-status` or
`chat-approval` — the Linear status is the only carrier of acceptance), a
`deny` gate is a hard stop that never asks (`pretooluse-hook` or
`settings-deny`). The **`frozenRules`** registry makes the invariants
first-class: a gate's `rule` field points into it, a deny gate exists only to
enforce one, and a rule no gate points to is rejected — so a dangerous
transition is unreachable, not merely "usually asked about". A rule's rare
legitimate exception is data too: `exemptions` names the node, the narrow scope
and the reason (today `platform-determine` writing the `## Platform`
section of `CLAUDE.md`, `statuses-bind` writing its `statuses` key,
`auto-issue-mode` setting In Progress itself for the one issue it was invoked
for, and `issue-next-step` setting In Progress for the one issue it diagnosed
after the user agrees in chat). Human gates sit
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
fan-out (trigger `/plan-context-fanout` / `/nerd4rent:plan-context-fanout`, or `Workflow({name: "nerd4rent:plan-context-fanout", args})`
during development). One script realises both plan-phase workflow nodes — the
contract's `script` binding on `wiki-recall` and `plan-context-fanout` points at
the same file — spawning five concurrent gatherers (repo layout, conventions,
prior plans, related tracker issues, nerdbrain vault) and reducing their output
deterministically into `PlanContext` + `ProjectContext`. The five gatherers
run as the `nerd4rent:plan-gatherer` agent (see [Plugin agents](#plugin-agents)).
The binding also arms
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
the findings verbatim. The mappers run as `nerd4rent:review-mapper`, the
sceptics as `nerd4rent:review-sceptic` on the session model, and the
synthesizer as `nerd4rent:review-synthesizer` (see
[Plugin agents](#plugin-agents)). Rejections and
overflow are counted in the required `ReviewFindings.stats`, so degradation is
visible, never silent.

Both islands have a **second host**: on Cursor (no `Workflow` tool) the main
agent runs the same topology manually — the island agents spawn through `Task`
with `subagent_type`, `workflows/*.js` is read verbatim for prompts and shapes,
and `node scripts/island-reduce.ts` replaces the inlined reducer, emitting the
same typed payloads (`PlanContext` + `ProjectContext` + `gaps`,
`ReviewFindings` with `stats`). Claude Code keeps the `Workflow` scripts; the
contract stays host-agnostic (ADR-0003, amended).

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

Not every skill is a node. `project-continue`, like `bootstrap-clis`, is an
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
  ├─ start: a chain, pinned to Haiku, no workflow    ← first half of `implement`: issue-start
  ├─ implementation (sequential, conversational)
  ├─ workflow island: review map → reduce → verify → synthesize   ← built: workflows/review-verify.js
  └─ close-out: a chain, pinned to Haiku, no workflow
```

Chains sit at both ends of the axis: `issue-start` opens the branch and the
draft PR, `issue-close` merges and finishes. Neither is a graph node of its
own — Start is the first half of `implement`, behind the same `tracker-status`
gate, and a separate node would only duplicate that gate.

| Node | Skill | Phase | Runtime | Edge in → out |
|---|---|---|---|---|
| `platform-determine` | `determine-platform` | write | conversational | — → `PlatformConfig` |
| `statuses-bind` | `bind-statuses` | write | conversational | `PlatformConfig` → `PlatformConfig` |
| `issue-write` | `issue-writer` | write | conversational | `PlatformConfig` → `IssueSpec` |
| `wiki-recall` | `nerdbrain-search` | plan | **workflow** | `IssueSpec` → `ProjectContext` |
| `plan-context-fanout` | `issue-workflow` | plan | **workflow** | `IssueSpec` → `PlanContext` |
| `plan-draft` | `issue-workflow` | plan | conversational | `PlanContext`, `ProjectContext` → `ImplementationPlan` |
| `implement` | `issue-workflow` | implement | conversational | `ImplementationPlan` → `ChangeSet` |
| `session-summary` | `issue-workflow` | implement | conversational | `ChangeSet` → `SessionSummary` |
| `review-menu` | `issue-workflow` | review | conversational | `ChangeSet` → `ReviewRequest` |
| `review-verify` | `issue-workflow` | review | **workflow** | `ReviewRequest` → `ReviewFindings` |
| `close` | `issue-close` | close | chain | `ReviewFindings` → `MergedBranch` |
| `wiki-write` | `nerdbrain-wiki` | wiki | chain | `SessionSummary` → `EntityPageUpdate` |
| `auto-issue-mode` | `auto-issue-mode` | orchestrate | conversational | `PlatformConfig` → `MergedBranch` |
| `issue-next-step` | `issue-next-step` | orchestrate | conversational | `PlatformConfig` → `PlatformConfig` |

Degradation runs on two tracks, and both end in the same place — the sequence
the skills already describe in prose:

- **Cursor** has no `Workflow` tool but has `Task`: the islands run manually —
  the same agents via `subagent_type`, prompts and shapes taken verbatim from
  `workflows/*.js`, and `node scripts/island-reduce.ts` as the deterministic
  reducer. The payloads and stats match the `Workflow` run.
- **Other agents** (Copilot, Windsurf, …) have neither `Workflow` nor `Task`;
  they read the topology as documentation and run the axis sequentially.
- **Claude Code with workflows unavailable** — below v2.1.154, on a plan that
  does not include them, or switched off via `"disableWorkflows": true`, the
  *Dynamic workflows* toggle in `/config`, or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`
  — falls back the same way, so an island is always an optimization, never a
  precondition. A degraded run is flagged in the session summary's metrics,
  never silent.

## Installation

### Claude Code

Add this marketplace and install the plugin:

```bash
/plugin marketplace add https://github.com/nerd4rent/nerd4rent-claude-plugin
/plugin install nerd4rent@nerd4rent-claude-plugin
```

### Cursor

**Recommended — team marketplace (updates follow `main`).** In the Cursor dashboard → **Plugins & MCPs** → **Team Marketplaces** → **Add Marketplace** → **Import from Repo**, paste `https://github.com/nerd4rent/nerd4rent-claude-plugin`. Cursor reads `.cursor-plugin/marketplace.json`. Install the [Cursor GitHub App](https://github.com/apps/cursor) on this repository, then turn on **Enable Auto Refresh** under Marketplace Settings. Each push to `main` is re-indexed within about 10 minutes, and clients pick it up on their next restart or window focus. **Refresh** forces a re-index. Install `nerd4rent` from that marketplace in **Customize**.

**Do not use `/add-plugin <this repo URL>`** (the personal GitHub import). Cursor pins that install to the commit it resolved on first import. Update, Reinstall and running `/add-plugin` again all reuse that snapshot ([forum #163895](https://forum.cursor.com/t/add-plugin-github-imports-can-get-stuck-on-stale-plugin-versions/163895)). If you already have that card, uninstall it and remove its marketplace in **Customize** before you install from the team marketplace.

**Local development (no marketplace).** Clone directly into Cursor's local plugin folder. Cursor skips a symlink in `~/.cursor/plugins/local` whose target is outside that folder, so a symlink to a checkout elsewhere does not load:

```bash
mkdir -p ~/.cursor/plugins/local
git clone https://github.com/nerd4rent/nerd4rent-claude-plugin ~/.cursor/plugins/local/nerd4rent
# later: git -C ~/.cursor/plugins/local/nerd4rent pull, then Developer: Reload Window
```

Then **Reload Window** and open **Customize**. The `nerd4rent` card should list the skills under `skills/`, the four agents, and the SessionStart / vault-MCP deny hooks. If a marketplace plugin with the same `name: nerd4rent` is installed, it takes precedence over the local copy. Uninstall it first.

`npx skills add` (below) remains a fallback if you only want the skill files.

### Other agents (Copilot, Windsurf, Cline, …)

The skills follow the shared [Agent Skills specification](https://github.com/vercel-labs/skills), so the [`skills` CLI](https://github.com/vercel-labs/skills) can install them into 70+ coding agents — including Cursor, if you prefer not to use the native plugin:

```bash
# Install all skills globally into your detected agent(s)
npx skills add nerd4rent/nerd4rent-claude-plugin -g

# Or target a specific agent and/or skill
npx skills add nerd4rent/nerd4rent-claude-plugin -g -a cursor -s '*'

# Keep them current
npx skills update
```

Those agents read global skills from `~/.agents/skills/` (Cursor also reads `~/.cursor/skills/`); the CLI installs there automatically. Restart the agent after installing. This path ships skills only — no Cursor agents or hooks.

## Requirements

- `git`
- `gh` (GitHub CLI), authenticated (`gh auth status`)
- `glab` (GitLab CLI), authenticated (`glab auth status`) — only for GitLab-hosted repos or GitLab Issues trackers
- `jq` — only for GitLab Issues or Azure DevOps Boards trackers
- `az` (Azure CLI) with the `azure-devops` extension, signed in (`az login` or `az devops login`) — only for Azure DevOps-hosted repos or Azure DevOps Boards trackers
- Node.js ≥ 22 (with npm)
- `linearis` CLI (`npm i -g linearis`), authenticated with a personal API key from Linear Settings → API (`LINEAR_API_TOKEN` or `linearis auth login`); the Linear skills degrade gracefully if absent

## Releasing

Three manifests carry a version, and they move together:

- `.claude-plugin/plugin.json` → `version`
- `.claude-plugin/marketplace.json` → `metadata.version`
- `.cursor-plugin/plugin.json` → `version`

The Claude Code installed version comes from `.claude-plugin/plugin.json`. Bumping it is what forces Claude Code to refresh its `cache/<marketplace>/<plugin>/<version>/` copy — an unchanged number makes `/plugin update` a no-op even when `main` has moved on. `marketplace.json` versions the marketplace itself and does not drive that cache. The Cursor manifest must stay on the same string so both runtimes see one release. Keep them equal — `node scripts/validate-manifests.ts` checks all three and Cursor's closed schemas, and exits non-zero when they drift.

Claude Code must never see a Cursor file: it reads `hooks/hooks.json` and a root `plugin.json` by convention, whatever its manifest says, and the claude.ai marketplace sync rejects what the CLI only warns about (ADR 0007, DEMO-364). Cursor's hooks therefore live in `hooks/cursor.hooks.json`, named in `.cursor-plugin/plugin.json`. The sync also checks claude.ai's upload rules, which the CLI does not, and reports a breach as a warning (DEMO-365): the plugin description is at most 500 characters (one text in all four manifests), and a skill or agent `name` or `description` holds no `<` or `>` (write `{slug}`, not `<slug>`). Before every release run both guards:

```bash
node scripts/validate-manifests.ts      # versions, Cursor schema, nothing Cursor-only at Claude Code's paths, claude.ai upload rules
node scripts/validate-claude-plugin.ts  # `claude plugin validate`; any warning fails (needs the Claude Code CLI)
```

Merging to `main` does not update anyone's install on its own: the local marketplace clone is only refreshed by `/plugin marketplace update <marketplace>`, followed by `/plugin update <plugin>@<marketplace>`.

## License

MIT — see [LICENSE](LICENSE).
