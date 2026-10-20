# User Guide

This guide is for developers who install this plugin - but it is not only an installation manual. The plugin is a working implementation of **graph engineering**: a discipline for building agent workflows as explicit graphs with typed data on every edge, instead of prose chains held together by good intentions. This guide explains the discipline first, then shows how the plugin puts it into practice, and finally covers the practical matter of installing and driving it day to day.

Contents:

- [What is graph engineering?](#what-is-graph-engineering)
- [How the plugin practices it](#how-the-plugin-practices-it)
- [Programming in this spirit yourself](#programming-in-this-spirit-yourself)
- [Installation](#installation)
- [A day with the plugin](#a-day-with-the-plugin) · [Steering with Linear statuses](#steering-with-linear-statuses)
- [Skills reference](#skills-reference) · [Troubleshooting](#troubleshooting)

## What is graph engineering?

Most agent workflows are written as prose: "first plan, then implement, then review, then merge". One agent walks the chain top to bottom, handoffs are sentences like "hands off to the close skill", and every rule is a reminder the model may or may not honor. This fails in predictable ways - and graph engineering is the set of principles that name those failures and fix them structurally:

1. **Dependency is not order.** Only a real data dependency forces one step to wait for another. Prose workflows serialize everything out of habit: a planning phase that reads the repo, the docs, prior plans, and related issues *one after another* is a false sequence - none of those reads depends on any other. Independent work should fan out and run concurrently; that is also what keeps the critical path (the longest chain you actually have to wait for) short.

2. **State lives on edges, and it is typed.** What flows between two steps must be data with a declared schema, not a status. The test for every arrow in your workflow: *what data passes through it?* If the honest answer is "a signal that the previous step finished" - the edge is fake, and whatever the next step needs will be re-derived, half-remembered, or lost.

3. **Verification must be asymmetric.** The agent that produced a piece of work is the worst judge of it. A review step where the implementer picks one reviewer and accepts its verdict is decoration. Real verification is adversarial: independent verifiers whose *goal is to refute* the finding or the work, with genuine power to reject it.

4. **Failure must be visible, never silent.** When one branch of a fan-out dies, the run should degrade - produce a result that says exactly what is missing - rather than either crash entirely or pretend nothing happened. Counters and gap lists beat both.

5. **Human gates are architecture, not conversation.** An approval that exists as a chat message lives inside the model's context, where it can be imagined, misremembered, or hallucinated. An approval that exists as *state outside the agent* - a status field in an external system that a human moved by hand - is a real gate: the agent can check it but cannot fake it.

6. **Invariants deserve enforcement, not reminders.** "Remember to keep both versions in sync" is not a rule; it is a hope. A rule is something a validator fails on, a hook denies, or a gate makes unreachable.

7. **Declare widths and budgets.** How wide a fan-out may go is part of the design, declared and bounded - not decided ad hoc at runtime.

8. **Know when *not* to build a graph.** Work that is truly sequential and irreversible - open the branch and the PR, commit, push, merge, close - gains nothing from parallelism and everything from being a short, dumb, deterministic chain. Graphing it would only add failure modes.

If you take one thing from this list: draw your workflow as a graph, write on every edge *what data* crosses it, and be suspicious of every edge where you can't.

## How the plugin practices it

The plugin's skills form one **issue lifecycle axis** - from filing a Linear issue, through planning, implementation and review, to merge and close-out. Every principle above has a concrete, inspectable counterpart in this repo.

### The contract: `workflow-graph.json`

The topology is not documentation - it is data. [`workflow-graph.json`](../workflow-graph.json) in the repo root declares every node of the axis (which skill runs it, in which runtime), every edge (with a **named JSON Schema** for the payload that crosses it), every gate, failure policy and width budget. `node scripts/validate-workflow-graph.ts` enforces it offline: an edge without a schema is a contract error, an orphan node is a contract error, an irreversible action without a gate is a contract error. [ADR-0003](adr/0003-workflow-graph-contract.md) records why the contract and the runtime are deliberately two artifacts.

This is principle 2 made mechanical: the edge `plan-draft → implement` doesn't "hand off" - it carries an `ImplementationPlan`, and the schema for it is right there in the contract.

### Islands, not one big graph

The axis is not one graph end to end, because the workflow runtime takes no mid-run human input - and several steps *need* a human (approving a plan, choosing review scope). So the design is an **island graph**: a conversational backbone with exactly two parallel islands embedded where the work is wide, independent, and human-free:

```
[main agent, conversational, status-driven]
  ├─ island #1: plan-context fan-out                (parallel)
  ├─ [GATE: you set In Progress in Linear]          (outside the agent)
  ├─ start                                          (a chain, on purpose)
  ├─ implementation                                 (sequential, conversational)
  ├─ island #2: review map → reduce → verify → synthesize   (parallel)
  └─ close-out                                      (a chain, on purpose)
```

**Island #1 - plan fan-out** (principle 1). When you ask for a plan, five gatherers launch *concurrently*, each reading one independent source: repo layout, in-repo conventions (ADRs, glossary), prior plans and merged PRs, related tracker issues, and the project's knowledge-base page. A **reducer** - plain deterministic code, not a model - dedupes, drops empties, and trims the result. What used to be five sequential reads is one fan-out bounded by the width budget the contract declares (principle 7). Each gatherer is the plugin's own read-only `plan-gatherer` agent - Sonnet, with the vault-search recipes preloaded - rather than the default subagent on your session model. Gatherers read the tracker and the VCS host through the project's platform adapters, so the fan-out works the same on Linear with GitHub, GitLab or Azure DevOps; a platform without an adapter shows up as a gap, not as a wrong command.

**Island #2 - adversarial review** (principles 3 and 4). The review is not "pick a reviewer". Four fixed, mutually independent **axes** are mapped in parallel - does the change do what the issue asked (`spec-compliance`), does the diff obey the repo's written standards (`repo-standards`), is it correct (`correctness-regressions`), is it safe (`security`). A deterministic reducer dedupes and caps the findings. Then each surviving finding faces **three independent sceptics, each prompted to refute it** - two or more refutations out of three kill the finding; a finding that fails to collect enough votes is dropped *as unverified*, and counted. When verified findings from two axes land on the same line - say `spec-compliance` asks for a flag that `security` wants gone - a **judge** is called for that one conflict and decides which axis prevails; the overruled finding is kept verbatim in a `conflicts` list with the reason, and a review without such collisions never runs a judge. The final summary is written by an agent, but the findings list is assembled verbatim by the reducer - no model can add or soften a finding after verification, and the judge can only set one aside on the record. Every run reports `stats {mapped, verified, rejected, unverifiedOverflow, overruled}` and a `gaps` list, so degradation is visible in the review comment itself, never silent. The mappers, the sceptics, the judge and the summary writer are all dedicated read-only plugin agents - no Edit, Write or MCP tools, by construction - but only the mappers and the summary writer run on cheaper models (`review-mapper` on Sonnet, `review-synthesizer` on Haiku). The sceptics (`review-sceptic`) and the judge (`review-judge`) deliberately keep the session model: they are the quality gate, and "when uncertain, refute" on a weaker model would refute everything.

This asymmetry is not theoretical. In this repo's own history the verifier has rejected plausible-but-wrong findings (including a convincing command-injection claim, refuted 3-of-3) and confirmed real defects the implementing agent had missed.

### Gates and frozen rules

The approval that unlocks implementation is **you moving the issue to In Progress in Linear** (principle 5). The agent reads that status at the start of every turn; it never sets it itself to unlock work. The contract marks every irreversible action - writing an issue to Linear, pushing commits, merging, writing the knowledge base - as `irreversible: true`, and the validator rejects any such action that isn't behind a gate.

Invariants are **frozen rules** (principle 6) - a first-class registry in the contract: *no Linear write before approval*, *no repo change before In Progress*, *no merge without green verification*, *knowledge-base access via filesystem only*. Each rule is pointed at by a gate that enforces it - a `decision` gate (a human's call, carried by a Linear status or explicit chat approval) or a `deny` gate (a hard stop that never asks). A rule no gate enforces fails validation. Even repo housekeeping follows this: the old reminder "keep both manifest versions in sync" is now `node scripts/validate-manifests.ts`, which exits non-zero on drift - because the reminder was once forgotten and the validator cannot be.

### One schema, two consumers

Each edge schema in the contract has its body - a JSON Schema literal - consumed twice: inside a workflow island it is what `agent({schema})` enforces at runtime, and outside it is what the skill templates are rendered from (`node scripts/render-templates.ts` generates `plan-template.md`, `issue-template.md`, `session-summary-template.md`). The plan you read as markdown in a Linear comment and the object an island validates at runtime have the same shape, defined once. A drift check keeps the runtime copies honest: every schema inlined in a `workflows/*.js` script must be deep-equal to the registry body, and a hand edit to a generated template turns a test red.

### Chains where chains belong

Chains sit at both ends of the axis. Start - branch from the issue, empty first commit, push, draft PR with the `Fixes` magic word - and close-out - commit leftovers, push, merge the PR, switch branches, set Done - are truly sequential and irreversible, so each is a **chain** (`issue-start`, `issue-close`), deliberately kept out of the graph and pinned to a small, cheap model (principle 8). Start is not even a node of its own: it is the first half of `implement`, behind the same In Progress gate, and a separate node would only duplicate that gate. The same principle picks the model inside the islands: the mechanical roles - axis mappers, summary writer, context gatherers - run as dedicated read-only plugin agents in `agents/` on Sonnet or Haiku, selected per call with `agentType`, while the sceptics run as the read-only `review-sceptic` agent on the session model because their judgement is the gate. Observability (metrics for the graph itself) is settled the same way: the axis measures itself passively, with three figures counted from what a run already emits and stored in its own tracker comment, described in [Workflow topology](ARCHITECTURE.md#workflow-topology).

### Degradation is part of the design

None of the above is a precondition. In Claude Code without dynamic workflows (older version, disabled, or a plan without them) - and in any other agent (Cursor, Copilot, …) that has no workflow runtime at all - the same topology is read as prose and executed sequentially. An island is always an optimization, never a requirement. Slower, but the same steps, the same schemas, the same gates.

## Programming in this spirit yourself

The repo doubles as a reference implementation you can copy from. If you want to build your own workflow this way:

1. **Write the contract first.** Nodes, edges, gates - as data in your repo, not prose in a doc. Apply the edge test ruthlessly: every edge names the schema of what crosses it.
2. **Validate it offline.** A small script that fails loudly on schema-less edges, orphan nodes, and ungated irreversible actions costs an afternoon and catches design rot forever. CI is optional: this repo runs its validators locally and the release guards on every pull request as well.
3. **Graph only the islands.** Look for stretches that are *wide* (several independent inputs), *independent* (no shared state between branches), and *human-free* (no mid-run decision needed). Everything else - especially anything irreversible - stays a conversational step or a plain chain.
4. **Put humans between islands, as external state.** An approval should be a status in a system of record the agent polls, not a chat reply.
5. **Make verification adversarial.** Separate the mapper from the judge; prompt the judges to refute; give them a real rejection threshold; count every rejection and every unverified drop in the output.
6. **Budget the fan-out and surface the gaps.** Declare max widths; return `stats` and `gaps` with every run so a degraded result is distinguishable from a complete one.

Reading order if you want to go deeper: [Workflow topology](ARCHITECTURE.md#workflow-topology) → [`workflow-graph.json`](../workflow-graph.json) → [ADR-0003](adr/0003-workflow-graph-contract.md) → the two island scripts in [`workflows/`](../workflows/) → the glossary in [`CONTEXT.md`](../CONTEXT.md) (Node, Edge, Gate, Frozen rule, Reducer, Rejection rule…).

## Installation

Requirements, installation in Claude Code, Cursor and other agents, and updating are in the [README](../README.md#requirements). Without dynamic workflows everything still runs, only sequentially (see [degradation](#degradation-is-part-of-the-design)).

### The plugin tells you when it is out of date

Neither Claude Code nor Cursor says when a newer version of a third-party plugin exists, so the plugin checks for itself at the start of every session (startup, resume and `/clear` in Claude Code; every `sessionStart` in Cursor). When something is off, the agent opens its first reply with one line per finding, and in Claude Code the same text also appears as a system message:

- `nerd4rent plugin 0.45.0 is installed, main is 0.51.0: run ...`. Your copy is older than the `main` branch of the repository. The line ends with the fix for your runtime. In Claude Code: `/plugin marketplace update nerd4rent-claude-plugin`, then `/plugin update nerd4rent@nerd4rent-claude-plugin`, then restart. In Cursor, for a clone under `~/.cursor/plugins/local/`: `git -C <that directory> pull --ff-only`, then Reload Window; for a marketplace install: `agent plugin marketplace remove nerd4rent-claude-plugin`, `agent plugin marketplace add nerd4rent/nerd4rent-claude-plugin`, then reinstall the card in Customize.
- `stale copy of the nerd4rent skill <name> at <path>: remove it`. A skill directory of yours (`~/.claude/skills`, `~/.cursor/skills`, `~/.agents/skills`, or the same under the project) holds an old copy of a plugin skill, typically from an `npx skills add` run or an early manual install. Such a copy shadows or duplicates the plugin's current skill. Delete the directory named in the line.

When everything is current the check prints nothing. The version of `main` is fetched from GitHub at most once a day and the check stays silent when the network is unavailable (this includes `claude.ai/code`, which blocks that host), so an offline session is never slowed down or warned by mistake. The check needs `node` in the session's PATH; without it, it exits silently.

### No commit without an issue

Every piece of work starts with an issue. In a repo whose `CLAUDE.md` has a `## Platform` section with a tracker, the plugin reminds the agent of that when work starts (on every prompt in Claude Code, at session start in Cursor), and it refuses `git commit` and `git push` on a branch whose name carries no issue ID. On Linear that means the team key and a number anywhere in the branch name (`demo-123-...`); on GitHub Issues, GitLab Issues and Azure DevOps Boards a branch that starts with the issue number (`123-...`). The branches `issue-start` creates always pass. A commit whose message names the issue (`DEMO-123`, `#123`) passes too.

Questions, reading code and edits are never blocked, and the plugin asks the tracker nothing: it only looks at the branch name and the command. A repo without a `## Platform` section is not checked at all. To work without an issue on purpose, start the agent with `NERD4RENT_NO_ISSUE=1` in its environment (for example `NERD4RENT_NO_ISSUE=1 claude`); the agent cannot set it for itself. If the check itself breaks (no `node`, a timeout), the commit goes through.

Agents that do not run the plugin's hooks get the same rule from the `issue-workflow` and `auto-issue-mode` skills: the first step is the issue and its number, before any work.

## Telling the plugin which platform a project uses

Before the first issue, the plugin needs to know where the project's issues live (Linear, GitHub Issues, GitLab Issues or Azure DevOps Boards) and where its code lives (GitHub, GitLab or Azure DevOps). Run `/determine-platform` once per repo - or just file an issue and `issue-writer` runs it for you.

It checks what is already recorded, infers the rest from the git remote and your Linear CLI, and asks you a single numbered question only when the answer is ambiguous. The result lands as a `## Platform` section in the repo's `CLAUDE.md` (commit it with the next change - it is meant to travel with the repo) and, if you use the nerdbrain vault, as `platform:` on the project's entity page. Running it again changes nothing.

At the end it runs `/bind-statuses`, which decides how the tracker shows the workflow's five phases - `backlog`, `todo`, `in-progress`, `in-review`, `done`. On Linear the recommendation is the team's own states (`native`), which is also what applies when you decline, so nothing changes for you. Where a tracker has no states, the phases become labels (`status::todo`, plus open/closed), or - if you can't or don't want to add labels - `Status: <phase>` marker comments. It asks one question, creates labels only after you say yes, and adds a `statuses` key to the same `## Platform` section. You can run `/bind-statuses` again at any time.

The skills then read the matching adapter files - the one place the plugin keeps Linear, GitHub, GitLab and Azure DevOps commands. If you configure a platform whose adapter isn't in your plugin version yet, the skills tell you so instead of guessing.

## A day with the plugin

A typical feature, from idea to merged PR - with the graph moments marked:

1. **File the issue.** Say *"create an issue: …"* and describe what you want. The agent interviews you if the goal is fuzzy, drafts the issue body, shows it to you, and - only after your approval (a decision gate guarding an irreversible write) - creates it in Linear, in **Backlog**. The body follows a template generated from the `IssueSpec` schema: the issue is the first typed edge of the axis.
2. **Get a plan.** Type the issue ID (e.g. `DEMO-123`). *Island #1 fires*: five gatherers read your repo, conventions, prior art, related issues, and project knowledge in parallel, the reducer joins them, and the agent drafts a plan from the result. The plan lands as a `## Implementation plan` comment on the issue (shaped by the `ImplementationPlan` schema), status moves to **Todo**, and the agent stops - no "please confirm" in chat.
3. **Approve by moving the status.** Read the plan in Linear. When you're happy, drag the issue to **In Progress**. That status change *is* the approval - a human gate stored outside the agent.
4. **Implement.** Seeing In Progress, the agent hands the mechanical opening to the start chain - a branch named after the issue, an empty first commit, a **draft PR** wired to auto-close the issue on merge (`Fixes DEMO-123`) - and then implements the plan, committing atomically as it goes. Implementation is tests first by default (a failing test, then the code that makes it pass); the plan's **Test approach** can switch that to `no tests`, but only with a written reason and the check that replaces the test, which the session summary repeats.
5. **Review.** *Island #2 fires*: four axis mappers in parallel, deterministic reduce, three sceptics per finding trying to refute it, and a summary the model cannot use to smuggle findings past the verifier. The review comment includes the `stats` counters - read them: `rejected` tells you how many plausible findings the adversarial pass killed, `gaps` whether anything degraded. Fixes get pushed to the same PR.
6. **Close.** Say *"merge and close"*. First the agent writes or updates your guide for the change in the nerdbrain vault, when you have one. Then the close-out chain checks the guide is there, commits leftovers, pushes, merges the PR, switches your checkout back to the base branch, and marks the issue Done. On any error it stops and reports - it never improvises, because this is the irreversible part.

After every working session the agent posts a `## Session summary` comment (generated from the `SessionSummary` schema), so any future session - or any other agent - can resume from Linear alone.

## The spec lives in the issue

Spec-driven frameworks keep the specification and the plan as files in the repository, because they have nowhere else to put them. This plugin does: the tracker. The issue description is the spec - what to build and why, with acceptance criteria that each name the test or command that proves them. The `## Implementation plan` comment is the plan - how, including the list of files it will change. The repository holds code only.

That keeps everything about one piece of work in one thread, dated and next to its status, readable by anyone with access to the tracker and without the code. In a client repository, developers who don't use your tracker see clean code and a PR description, with no spec files written for readers who don't need them.

The path, spec → plan → build → verify:

1. **Spec.** For a complex issue the agent compares the description with the full issue template, settles the gaps with you, and leaves anything nobody discussed empty instead of making it up. It shows you the new description and updates the issue only after you accept it. Small, clear issues skip this.
2. **Plan.** The plan lists its affected files. If the agent later needs to change a file outside that list, it stops and asks; after your yes it adds the file in a comment extending the plan.
3. **Build.** If the spec turns out wrong mid-work, the agent proposes the change, and after your yes updates the description and posts a `## Spec change` comment saying what changed and why - the issue thread stays the full history.
4. **Verify.** Before review, the agent runs the check of every acceptance criterion and reports a table - criterion, check, pass or fail, evidence. A single fail keeps the issue out of review.

## Steering with Linear statuses

The issue's status in Linear is the single source of truth for what the agent does next. You steer by moving the issue; the agent re-reads the status every turn.

| You set the status to… | The agent… |
|---|---|
| **Backlog** / **Todo** | drafts or refines the implementation plan, posts it to Linear, stops |
| **In Progress** | implements: branch, draft PR, code, commits - the only status that unlocks repo changes |
| **In Review** | runs the adversarial review island and pushes fixes |
| **Done** (with the PR still open) | closes out: merges the PR, syncs your checkout |

Only you can move an issue to **In Progress** - the agent never does it by itself to unlock implementation (an explicit request to implement in chat counts as approval, and the agent then sets the status to reflect it). The exceptions are a run you start with `/nerd4rent:auto-issue-mode`, where invoking the skill is the approval, and `issue-next-step`, which moves the issue to In Progress only after you say yes to it in chat.

The table uses Linear's default names. On GitHub Issues and GitLab Issues the same steps are labels: **Backlog** is an open issue with no status label, then `status::todo`, `status::in-progress`, `status::in-review`, and **Done** is a closed issue - so merging the PR or MR with `Fixes #123` finishes it. On Azure DevOps Boards the steps are the columns of your team's board - `New`, `Todo`, `Active`, `In Review`, `Closed` by default - and `/bind-statuses` offers to add the columns your board lacks; you steer by dragging the card, and completing the PR with `Fixes #123` moves it to Closed. Under the hood the agent works with five phases and reads them through the project's status strategy, so the same steering works with labels (`status::in-progress`) or with a comment whose first line is `Status: in-progress` - whatever `/bind-statuses` recorded. A status the map doesn't know (say, *Canceled*) makes the agent report it and do nothing.

### An issue that is Done with no work behind it

`project-continue`, `issue-next-step`, `issue-workflow` and `auto-issue-mode` check every Done issue they read against the history of the default branch: the PR title, the start commit, `Fixes <ID>`, or the merge of the issue's branch. An issue with none of these was closed by mistake. The agent warns you and offers to file a bug through `issue-writer`, related to that issue and marked as a bug (the `Bug` label on Linear, `bug` on GitHub and GitLab, the `Bug` tag on Azure DevOps). It never settles for a comment and never moves the issue back to the Backlog: the issue stays closed as a record, and the bug carries the work still to do. You decide on it after reading the draft.

A parent issue is checked through its children. When you close an issue on purpose with no code in this repo (a duplicate, a decision, work done in another repo), add a comment starting with these two lines, and the check skips it:

```
## No code in this repo
Reason: duplicate of DEMO-213
```

## Skills reference

How to trigger each skill and what to expect. All of them also respond to `/<skill-name>` and `/nerd4rent:<skill-name>`.

### `determine-platform` - record the tracker and host

- **Say:** `/determine-platform`, *"which tracker does this project use"* - or nothing: `issue-writer` calls it when no platform is configured.
- **What happens:** reads the `## Platform` section of `CLAUDE.md` and the entity page, infers from the git remote and the Linear CLI, asks one question only if still ambiguous, then writes the section (and the entity page mirror) and shows you the result. It is the only skill allowed to change the repo before an issue is In Progress, and it touches that one section alone.

### `bind-statuses` - map workflow phases to the tracker

- **Say:** `/bind-statuses`, *"bind statuses"*, *"zmapuj statusy"* - or nothing: `determine-platform` ends with it.
- **What happens:** proposes a status strategy (the tracker's states, labels, or marker comments) and a phase map in one question, creates missing labels only after you agree, writes the `statuses` key into `## Platform` (and the entity page mirror), and validates it. Running it twice with the same answers changes nothing.

### `issue-writer` - file a new issue

- **Say:** *"create an issue"*, *"new task"*, *"utwórz/zgłoś issue"* - intent to file new work, with no existing issue ID.
- **What happens:** the agent resolves the platform (running `determine-platform` if none is recorded) and the target team/project - on GitHub Issues and GitLab Issues the repo, on Azure DevOps Boards the project and work item type - (and confirms it), interviews you only if the goal is unclear, shows you the drafted body, and creates the issue in Backlog only after you approve. The interview and the optional "grilling session" after the issue is created both run through `grill` (below): questions in numbered rounds, each with a recommended answer, until the requirements are sharp enough for planning. For big topics it proposes a split and says which kind it is. Parts of one result become a parent with sub-issues, and the parent closes after them. Stages that ship one after another become sibling issues under a shared epic, each blocked by the stage before it, so closing stage 1 never closes stage 2.

### `issue-workflow` - plan, implement, review

- **Say:** any issue ID (`DEMO-123` on Linear; `#123` or `owner/repo#123` in a GitHub Issues project; `#123` or `group/project#123` in a GitLab Issues project; `#123` or `AB#123` in an Azure DevOps Boards project) with intent to work on it - *"plan DEMO-123"*, *"zrealizuj DEMO-123"*, or just the bare ID.
- **What happens:** the status-driven flow described [above](#steering-with-linear-statuses), including both islands. During implementation it follows the **Test approach** in the approved plan (see step 4 of [A day with the plugin](#a-day-with-the-plugin)): tests first through `tdd` by default, or `no tests` when the plan gives a reason and names the check that replaces the test.

### `issue-start` - open the branch and the PR

- **Say:** *"start DEMO-123"*, *"zacznij DEMO-123"*, *"open the PR for DEMO-123"* - or nothing: `issue-workflow` calls it the moment it sees In Progress.
- **What happens:** the mirror of the close-out chain - checks the issue is In Progress and the checkout is a clean `main`/`master`, creates the branch (from the Linear `branchName`, or with `gh issue develop` on GitHub Issues and `git checkout -b` on GitLab Issues and Azure DevOps Boards, named `<number>-<title>` in ASCII), makes the empty start commit, pushes, opens a draft PR (GitHub, Azure DevOps) or MR (GitLab) with `Fixes DEMO-123` in the body - on Azure DevOps followed by the issue link, since Linear doesn't track PRs there (with Azure DevOps Boards as the tracker the PR is linked to the work item instead). On any error it stops and reports.

### `issue-close` - merge and finish

- **Say:** *"merge and close"*, *"close out DEMO-123"*, *"domknij"*, *"zmerguj i zamknij"*.
- **What happens:** the deliberately mechanical close-out chain - first a check that your guide in nerdbrain exists (`issue-workflow` and `auto-issue-mode` write it just before with `nerd-personal-docs`, below; without it the chain stops and tells you to run that skill), then a check that every sub-issue is done (an unfinished one stops the chain before the merge and is listed with its link, so closing a parent never closes work nobody did), then commit leftovers, push, merge the PR (GitHub, GitLab or Azure DevOps), switch your checkout to the base branch, set the issue to Done. On any error it stops and reports.

### `auto-issue-mode` - run an issue end to end

- **Say:** `/nerd4rent:auto-issue-mode <task description>` or `/nerd4rent:auto-issue-mode DEMO-123` - only by typing it; the agent never picks this skill on its own.
- **What happens:** from a description, the agent drafts the issue and asks for your approval once; from an ID, it picks up at the issue's current status. Everything after that runs without questions, each stage on its own subagent: start, a plan posted as a comment on the issue, implementation, review, merge and Done, then a nerdbrain update. The review is the same four-axis island with sceptics and a judge that `issue-workflow` runs, and the run fixes only the findings that survived verification. That update runs after the merge and records a checkpoint with the merge commit on the base branch, so `project-continue` shows the real state of the project afterwards. Invoking it is your approval, so here the agent moves the issue to In Progress and In Review itself. On an error, a merge conflict or tests it cannot fix it stops and tells you how to resume with the issue ID.

### `issue-next-step` - take the next step

- **Say:** *"what's next for DEMO-123"*, *"co dalej z DEMO-123"*, *"następny krok"*, or `/nerd4rent:issue-next-step DEMO-123`.
- **What happens:** the agent reads the issue's status and what already exists for it - the plan comment, the branch, the PR, recent commits - and names one next step: plan, implement, review, or close out. It then asks one question: continue step by step with `issue-workflow`, run it autonomously with `auto-issue-mode`, or stop. When the next step is implementation and the issue isn't In Progress yet, choosing to continue moves it there; saying no writes nothing. For a Done issue with no work on the default branch the next step is a bug report instead (see above). Whatever you pick starts right away with the same issue ID.

### `new-project-workflow` - bootstrap a project

- **Say:** *"start a new project"*, *"bootstrap this project"* - typically from an empty directory.
- **What happens:** git init, `README.md` scaffold, GitHub repo via `gh`, a matching Linear project (skipped when you choose GitHub Issues as the tracker), and a hand-off to `grill` (below) or to another spec-writing skill you have installed. One approval up front covers the whole sequence.

### `bootstrap-clis` - set up a machine

- **Say:** `/bootstrap-clis` / `/nerd4rent:bootstrap-clis`, or just let a skill fail because a CLI is missing.
- **What happens:** every dependency from the table above is probed, installed, or updated (with checksum verification for downloads). Authentication is never done for you - the skill ends with the exact steps you need to run yourself.

### `project-continue` - pick up where you left off

- **Say:** *"where were we"*, *"continue"*, *"gdzie jesteśmy"*, *"na czym stanęliśmy"* - after switching to a project, on this machine or another one.
- **What happens:** the agent reads the newest checkpoint from the project's nerdbrain entity page, checks it against git and the tracker (a commit never pushed, a branch gone, rewritten history, work done after the checkpoint), and reports the state and any drift, then all open issues of the project grouped by phase (in progress, in review, todo, backlog), the Backlog included, so a full Backlog never reads as "nothing to do". A "Suggested next" line names one issue with the reason in a sentence: the one already in progress, else an issue related to the checkpointed one, unblocked, or touching the same part of the repo. The report ends with the issue ID to type to resume. A Done issue with no work on the default branch gets a warning and the offer of a bug. It records a new checkpoint only after you agree, and never starts work on an issue by itself, the suggested one included.

### `retro` - lessons from the session as issues

- **Say:** `/nerd4rent:retro`, at the end of a session; optionally with the path to a session transcript. The agent never starts it by itself.
- **What happens:** the agent goes through the session and picks out the places where it cost more than it had to or went wrong: a file searched for three times, a mistake no check caught, a long output read in full, a step that changed nothing, information it had to ask you for. Each becomes a candidate in one of six categories (navigation, automated checks, coding standards, tool economy, no-ops, information access) with its evidence from the session, the change it asks for and a recommendation. Lessons an open issue already covers are listed with that issue's link instead. You pick which candidates become issues; each one goes to `issue-writer`, which shows the draft and creates it only after you approve. Nothing is changed directly: no file in the repo, no `CLAUDE.md`, no memory file, no nerdbrain page.

### `tdd` - test first

- **Say:** *"TDD"*, *"test first"*, *"napisz najpierw test"* - or nothing: `issue-workflow` and `auto-issue-mode` use it when the plan's test approach is TDD.
- **What happens:** one cycle per behaviour: a failing test against a seam the plan names, a check that it fails for the right reason, the smallest change that makes it pass, a refactor, and a run of the suite. Not used for a plan whose test approach is `no tests` or for documentation-only changes.

### `debug` - find the cause before the fix

- **Say:** *"debug this"*, *"find the root cause"*, *"why does this fail"*, *"zdebuguj"*, *"znajdź przyczynę"* - or nothing: `tdd` hands over a red step it cannot explain, `auto-issue-mode` runs it before stopping on red tests, and an issue labelled Bug is planned around it.
- **What happens:** one command that is already red on the bug is the only truth about it; secrets in it are redacted before anything is shown. Up to three ranked hypotheses are listed without waiting for an answer, each settled with the smallest piece of evidence (a forced mutation counts only once it is proved to have run). The regression test is written through `tdd` before the fix, the fix changes only what the evidence justifies, and the confirmed cause goes into the commit and the session summary. After three fixes that did not hold, the skill stops and asks which way to go. Not for a TDD red step that fails for the reason it was written for.

### `grill` - interview in rounds

- **Say:** *"grill this"*, *"przepytaj mnie"*, *"sesja grillowania"* - or nothing: `issue-writer`, `issue-workflow` and `new-project-workflow` call it when a topic is fuzzy.
- **What happens:** the agent first says how big it reads the topic (small, medium or large) so you can correct it; a small, clear topic gets no interview at all. Then it checks facts in the repo itself and asks you only about decisions, in rounds: every question that can be answered now, numbered, each with a recommended answer, so a plain "yes" accepts the whole round. After each round it writes a `## Grill state` block - as a comment on the issue when one exists, which lets you continue the session from another machine, or in chat otherwise. For a large topic it proposes the split and names its kind: parts of one result, or stages in time. It ends by listing every decision, tagging the ones that deserve an ADR, a glossary entry or a project decision, and asking you once to confirm the shared understanding before anything acts on it.

### `nerd-documentation-write` - documentation for outside readers

- **Say:** nothing special - the agent uses it when writing or revising a tutorial, README or step-by-step guide for readers outside your own tooling, such as a client's engineers or open-source users.
- **What happens:** the text states the facts the reader needs rather than the story of how they were found, drops internal issue IDs, opens sentences with words rather than code identifiers, uses noun-phrase headings, plain hyphens and no emoji, and gives each runnable command its own code block with its description above it.

### `nerd-personal-docs` - your own guide in nerdbrain

- **Say:** *"udokumentuj dla mnie"*, *"napisz przewodnik"*, *"write a guide in nerdbrain"* - or nothing: `issue-workflow` and `auto-issue-mode` run it before every close-out, on the session model, and `issue-close` refuses to merge without it.
- **What happens:** when the work created or changed something you use, operate or have to do by hand, the agent writes or updates a guide in `5-wiki/guides/` of your nerdbrain vault, in Polish: what it is and where it runs, how to use it, the manual steps only you can do, what to do when it breaks, where the secrets and config live, and the history with links to the issues and pull requests. Unlike `nerd-documentation-write`, those links are required here, because the reader is you. The agent links the guide on the project's entity page and records it in a `## Personal guide` comment on the issue. Work that changes nothing you use gets a `Not needed:` line in that comment instead, and a machine without the vault skips the step and says so.

### `nerdbrain-wiki` / `nerdbrain-search` - personal second brain (optional)

These maintain a personal Obsidian vault with one entity page per project - the plan-phase island reads it as one of its five context sources, and decisions made during work are written back. They assume a specific vault layout under `~/obsidian/nerdbrain/` and matching rules in your user rules / `AGENTS.md` / `~/.claude/CLAUDE.md`; without that setup they simply stay inactive.

## Troubleshooting

- **`Issue with identifier "X" not found`**: wrong team prefix or workspace; check `linearis teams list`.
- **`Status "X" for team ... not found`**: Linear statuses are your team's own names, spelled exactly (`In Progress`, not `in progress`); fix the map with `/bind-statuses` if you renamed them.
- **"phase unknown"**: the issue shows a state, label or marker the status map doesn't hold; move the issue to a mapped status, or extend the map with `/bind-statuses`.
- **`linearis` errors about authentication**: set `LINEAR_API_TOKEN` or run `linearis auth login` (see [Requirements](../README.md#requirements)).
- **`/plugin update` says nothing changed**: run `/plugin marketplace update nerd4rent-claude-plugin` first; if it still reports no change, no new version has been released yet.
- **The session opens with "nerd4rent plugin X is installed, main is Y" or "stale copy of the nerd4rent skill"**: see [The plugin tells you when it is out of date](#the-plugin-tells-you-when-it-is-out-of-date); follow the fix the line ends with.
- **`nerd4rent blocked git commit` (or `git push`)**: the branch has no issue ID; see [No commit without an issue](#no-commit-without-an-issue). Create or pick the issue and work on its branch, or restart the agent with `NERD4RENT_NO_ISSUE=1` when the work really has no issue.
- **A skill doesn't trigger**: invoke it explicitly with the slash form, e.g. `/issue-workflow DEMO-123` or `/nerd4rent:issue-workflow DEMO-123`.
- **The plan or review runs sequentially and slowly**: dynamic workflows are unavailable or disabled; see [Installation](#installation). The result is the same, only slower.
