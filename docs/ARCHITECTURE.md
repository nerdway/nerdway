# Architecture

This document is for contributors who want to understand how the plugin is put together: where the platform config lives and how skills reach a tracker or a VCS host, which agents the plugin ships, and how the skills form one workflow written down as a contract. Installing and using the plugin is covered in the [README](../README.md) and the [User Guide](USER-GUIDE.md).

Contents:

- [Platform config and adapters](#platform-config-and-adapters)
- [Plugin agents](#plugin-agents)
- [Workflow topology](#workflow-topology)

## Platform config and adapters

Every skill that talks to a tracker or a VCS host reads the project's **platform config** first. The config is one YAML object kept as a `## Platform` section in the repo's committed `CLAUDE.md`, so it travels with the repo into every worktree, and mirrored as `platform:` on the nerdbrain entity page:

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

The `tracker` key is one of `linear`, `github`, `gitlab`, `ado`, `none`; the `vcs` key one of `github`, `gitlab`, `ado`. The shape is the `PlatformConfig` schema in `workflow-graph.json`. The `determine-platform` skill writes it; an entity page with only the older `linear: {team, project}` block keeps working as an alias.

Skills read the section from disk at the moment they need it, with one shared recipe in [`adapters/platform.md`](../adapters/platform.md). The command `node scripts/validate-platform-config.ts --print "$(git rev-parse --show-toplevel)/CLAUDE.md"` prints it as JSON: exit `0` means found, `3` absent so the skill moves on to its next source, `4` broken so it stops, and any other code means Node itself failed. Without Node 24 the fallback is a manual read of the section. No skill takes the platform from a `CLAUDE.md` that happens to be in context: Claude Code never reloads it mid-session, and Cursor loads it only with Third-Party Imports on (see the [Cursor installation notes](../README.md#cursor)). The `validate-platform-references.ts` script fails when a skill, agent or adapter mentions `## Platform` without pointing at the recipe.

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

The `native` strategy maps phases to the tracker's state names, `label` to label names plus the reserved `open` (backlog only) and `closed` (always `done`), and `comment` to the value of a `Status: <value>` marker comment. Without the key, the tracker adapter's `## Statuses` default applies:

- on Linear, `native` with `Backlog / Todo / In Progress / In Review / Done`, so existing projects behave as before;
- on GitHub Issues and GitLab Issues, `label` with `open / status::todo / status::in-progress / status::in-review / closed` (create the three labels with `/bind-statuses`);
- on Azure DevOps Boards, `native` with the board columns `New / Todo / Active / In Review / Closed` (add the missing columns with `/bind-statuses`).

What each strategy means is in [`adapters/statuses.md`](../adapters/statuses.md). The command `node scripts/validate-platform-config.ts [path/to/CLAUDE.md]` checks a config (all five phases, a strategy the adapter supports, no value twice) and every tracker adapter's default. See [ADR-0006](adr/0006-canonical-phases-and-status-strategies.md).

The commands themselves live in **adapter files**, one per platform per axis:

| Axis | Adapter files | Required sections |
|---|---|---|
| tracker | `adapters/trackers/linear.md`, `adapters/trackers/github.md`, `adapters/trackers/gitlab.md`, `adapters/trackers/ado.md` | `CLI`, `Issue ID`, `Operations`, `URL`, `Statuses`, `Status strategies` |
| VCS host | `adapters/vcs/github.md`, `adapters/vcs/gitlab.md`, `adapters/vcs/ado.md` | `CLI`, `Detection`, `Operations`, `Magic words`, `URL` |

Skills never quote a command: they name an **operation ID** (`issue.set-status`, `pr.merge`, and so on) and look it up in the adapter's `## Operations` table, read through `${CLAUDE_PLUGIN_ROOT}`. The `adapters` block of `workflow-graph.json` declares each axis's sections and operation IDs. The `validate-workflow-graph.ts` script rejects an adapter that misses one, repeats one, lists an undeclared one, or is named outside the config enum, and a tracker adapter whose `## Status strategies` table does not list exactly the strategies of the config enum, or supports none. A configured platform with no adapter file yet makes the skill stop with "adapter not available yet"; it never falls back to Linear.

**GitHub Issues as the tracker** (`tracker: github`): issue IDs are `#123` (the configured repo) or `owner/repo#123`, and a PR number is rejected. The repo is the container, with no team or project. Phases default to `status::*` labels plus open/closed, so a PR merged with `Fixes #123` into the default branch lands the issue on `done`. The `comment` strategy counts only markers whose author has write access to the repo (checked per author through the collaborator permission API). Sub-issues are GitHub's native ones (`gh issue create --parent`), and branches come from `gh issue develop` with an ASCII name `<number>-<title-slug>`. The token needs the `repo` scope (fine-grained: Issues, Contents and Pull requests, read and write). See [ADR-0005](adr/0005-platform-adapters-as-reference-files.md).

**GitLab Issues as the tracker** (`tracker: gitlab`): issue IDs are `#123` (the configured project) or `group/project#123`. The project is the container, with no team or project to pick. Phases default to `status::*` labels plus opened/closed, and work on the Free tier: scoped-label exclusivity is a paid feature, so every status write removes the other status labels itself, and because GitLab silently creates a label that does not exist, a write stops unless the label is already there. An MR merged with `Fixes #123` into the default branch closes the issue and so lands it on `done`. The `comment` strategy counts only markers whose author is at least a Developer on the project (checked per author through the members API). GitLab Free has no sub-issues, so a child is an ordinary issue linked `relates_to` to its parent, with `Parent: #<n>` as the first line of its description. Branches are plain `git checkout -b <number>-<title-slug>`. The recipes pipe `glab api` output through `jq`; the token needs the `api` and `write_repository` scopes.

**Azure DevOps Boards as the tracker** (`tracker: ado`, with Azure DevOps Repos as the host): issue IDs are `#123`; `AB#123` and a bare number are accepted too. Work item IDs are unique across the organisation, so every lookup checks the item belongs to the configured project. The stock processes have too few states for five phases, so `native` binds the phases to the **columns of one team's board**: `ado.team`, `ado.board` and `ado.workItemType` in the `ado` block, all written by `/bind-statuses`, which also adds the missing columns with your consent (team admin rights). A column write sets the state the column maps and reads the column back, because Azure DevOps silently ignores a column that disagrees with the state. If you cannot add columns, `label` uses `status::*` tags plus the state's Completed category as `closed`, and `comment` uses `Status:` marker comments (only project members can comment, so no author check). Issues are created with a Markdown description; sub-issues are the same work item type with a Parent link. The draft PR is linked to the work item and its description starts with `Fixes #123`, so completing it moves the work item to Closed. A personal access token needs Work Items (Read, write & manage), Code (Read & write) and Project and Team (Read).

## Plugin agents

Five read-only agents ship in `agents/` and register as `nerd4rent:<name>` in the same registry the Agent tool uses. They exist for the islands' mechanical roles, reading a diff or a source and returning data under a schema, so those roles run with a structural tool whitelist (no Edit, Write or NotebookEdit; no ToolSearch, so no MCP) instead of the default workflow subagent with full tools, and, where the role allows it, on a cheaper model than the session's. The islands select them per `agent()` call via `agentType`. The contract in `workflow-graph.json` is unchanged by this choice, because which agent runs a role is an execution parameter, not topology.

| Agent | Model | Tools | Called by |
|---|---|---|---|
| `nerd4rent:review-mapper` | Sonnet | Read, Grep, Glob, Bash, Skill | the four axis mappers of `review-verify` |
| `nerd4rent:review-sceptic` | `inherit` (the session model) | Read, Grep, Glob, Bash, Skill | the three sceptics per finding of `review-verify` |
| `nerd4rent:review-judge` | `inherit` (the session model) | Read | one judge per axis conflict of `review-verify`, only when one occurs |
| `nerd4rent:review-synthesizer` | Haiku | Read | the summary writer of `review-verify` |
| `nerd4rent:plan-gatherer` | Sonnet | Read, Grep, Glob, Bash, Skill; preloads `nerd4rent:nerdbrain-search` | the five gatherers of `plan-context-fanout` |

The sceptics of the review island keep the **session model** on purpose (`model: inherit`): they are the only quality gate, and their "when uncertain, refute" rule on a weaker model would refute everything. What they gain from a dedicated agent is the tool whitelist alone. The default workflow subagent was observed running `git checkout` in the repo during a review, which the whitelist plus the agent's read-only rule now rule out. The agents are not meant for direct delegation, and their descriptions say so. The `plugin.json` manifest does not list them, since the `agents` manifest field would replace the auto-discovered directory rather than add to it.

None of the agents quotes a tracker or VCS command. Their read-only Bash lists name adapter **operation IDs** (`issue.read`, `issue.read-relations`, `pr.view`, `pr.diff`, `pr.list-merged`, plus `issue.list-active` for the gatherer), and every other adapter operation is forbidden to them. Since a workflow script cannot read files, `issue-workflow` resolves the adapter paths and passes them to both islands as `args.platform.adapters`. An island hands the path to its agents in the prompt, and a missing adapter (`null`) becomes a `gaps` entry instead of a command from another platform.

## Workflow topology

The plugin's skills are not a loose bag: they form the **issue lifecycle axis**, written down as a contract in [`workflow-graph.json`](../workflow-graph.json) and enforced by `node scripts/validate-workflow-graph.ts` (the full list of checks is in [CONTRIBUTING](CONTRIBUTING.md)). The contract declares, per node, which skill runs it, what schema each edge carries, which gates guard it, what happens on failure, and how wide it may fan out (`budget.maxWidth`, an integer from 1 to the runtime's cap of 16). Two nodes sharing an upstream is what "these may run at once" looks like: `wiki-recall` and `plan-context-fanout` are both plan-phase branches off `issue-write`, split into separate nodes only because a node belongs to exactly one skill. See [ADR-0003](adr/0003-workflow-graph-contract.md) for why the contract and the runtime are two different artifacts.

Gates and frozen rules are data, not prose. Every **irreversible** action on the axis is marked `irreversible: true` and must sit behind a gate: creating tracker labels (`statuses-bind`), writing the issue to Linear (`issue-write`), pushing commits (`implement`), merging and setting Done (`close`), writing the vault (`wiki-write`), running one issue end to end (`auto-issue-mode`). A gate is one of two kinds with a closed mechanism vocabulary the validator enforces. A `decision` gate is the human's call (`tracker-status` or `chat-approval`; the Linear status is the only carrier of acceptance). A `deny` gate is a hard stop that never asks (`pretooluse-hook` or `settings-deny`). The **`frozenRules`** registry makes the invariants first-class: a gate's `rule` field points into it, a deny gate exists only to enforce one, and a rule no gate points to is rejected, so a dangerous transition is unreachable, not merely "usually asked about". A rule's rare legitimate exception is data too: `exemptions` names the node, the narrow scope and the reason. Today there are four: `platform-determine` writing the `## Platform` section of `CLAUDE.md`, `statuses-bind` writing its `statuses` key, `auto-issue-mode` setting In Progress itself for the one issue it was invoked for, and `issue-next-step` setting In Progress for the one issue it diagnosed after the user agrees in chat. Human gates sit on the boundaries between workflows, never inside them.

Every registry entry carries its **schema body**, the JSON Schema the payload on that edge is checked against, and the body has two consumers, which is what keeps the shape defined once instead of twice. The `render-templates.ts` script renders it into the templates the skills ship (`plan-template.md`, `issue-template.md`, `session-summary-template.md`), and inside a workflow island the same body is what `agent({schema})` enforces at runtime, inlined verbatim. Those three files are generated artifacts: change a section by editing the schema, and a hand edit reddens the drift test. A body is also a **self-contained schema** (a `$ref` may only point into the entry's own `$defs`), because a workflow script has to inline it verbatim. None of this ever becomes a precondition: a session without the workflow runtime fills the same generated template in prose.

Two islands are real. The first, `workflows/plan-context-fanout.js`, runs the plan-phase fan-out (trigger `/plan-context-fanout` / `/nerd4rent:plan-context-fanout`, or `Workflow({name: "nerd4rent:plan-context-fanout", args})` during development). One script realises both plan-phase workflow nodes, since the contract's `script` binding on `wiki-recall` and `plan-context-fanout` points at the same file. It spawns five concurrent gatherers (repo layout, conventions, prior plans, related tracker issues, nerdbrain vault) and reduces their output deterministically into `PlanContext` + `ProjectContext`. The five gatherers run as the `nerd4rent:plan-gatherer` agent (see [Plugin agents](#plugin-agents)). The binding also arms the drift check in the omission direction: every `out` schema of a bound node must be inlined in its script (rule 17) and every inline body must be a strict-JSON literal deep-equal to the registry body (rule 18).

The second island, `workflows/review-verify.js`, runs the review phase as map → reduce → verify → judge → synthesize:

1. One mapper per review axis: spec-compliance, repo-standards, correctness-regressions, security.
2. A deterministic reducer: schema-invalid records dropped, dedup by `file:line` within one axis with the most severe finding winning the anchor, severity sort, cap 12.
3. Adversarial verification: 3 sceptics per finding, each prompted to refute it; 2 or more refutations out of 3 reject it.
4. Only when verified findings from different axes share one anchor, a judge per such conflict deciding which axis prevails. The overruled finding moves verbatim to `ReviewFindings.conflicts`.
5. A synthesizer that writes only the summary, while the reducer assembles the findings verbatim.

The mappers run as `nerd4rent:review-mapper`, the sceptics as `nerd4rent:review-sceptic` and the review judge as `nerd4rent:review-judge` on the session model, and the synthesizer as `nerd4rent:review-synthesizer` (see [Plugin agents](#plugin-agents)). Rejections and overflow are counted in the required `ReviewFindings.stats`, so degradation is visible, never silent.

Both islands have a second **island host**. On Cursor (no `Workflow` tool) the main agent runs the same topology manually: the island agents spawn through `Task` with `subagent_type`, `workflows/*.js` is read verbatim for prompts and shapes, and `node scripts/island-reduce.ts` replaces the inlined reducer, emitting the same typed payloads (`PlanContext` + `ProjectContext` + `gaps`, `ReviewFindings` with `stats` and `conflicts`). Claude Code keeps the `Workflow` scripts; the contract stays host-agnostic (ADR-0003, amended).

The axis measures itself with **passive metrics** only: a figure is collected only when it is a by-product of a run that happens anyway, and it is stored only where that run's result already lands, a Linear comment. There are three figures:

- The **verifier rejection rate** (`rejected / (verified + overruled + rejected)` from `ReviewFindings.stats`) says whether adversarial verification earns its latency. Read over the last five or so runs, below 10% the verifier is decoration and above 50% the reviewers are ill-defined. The thresholds live in [`CONTEXT.md`](../CONTEXT.md).
- The **node failure rate** comes from the `gaps` both islands report, plus `stats.unverifiedOverflow`.
- **Fan-out effectiveness** is the optional `PlanContext.stats`: per gatherer, how many items it returned and how many it was the first to contribute, so a gatherer stuck near zero across runs becomes a removal candidate. The plan island's figures reach Linear through the optional `metrics` section of the session summary.

Nothing here needs CI, a telemetry channel or a clock. The one candidate that did, critical-path length, was dropped rather than deferred.

Not every skill is a node. Like `bootstrap-clis`, the `project-continue` skill is an entry point from outside the axis: it answers "where were we" by reading the `## Checkpoints` entry that the `session-summary` → `wiki-write` edge already produces, and it asks the user before writing, which makes it conversational by nature and rules out an island. Registering it as a node would mean inventing a `dependsOn` and an edge schema for a step that consumes an existing edge's output instead of extending the axis.

The axis is an **island graph**, not one graph end to end. The Claude Code workflow runtime takes no mid-run user input, so every step that needs a human (the grilling session, the "user sets In Progress" gate, the review menu) stays in the conversational main agent, and only the wide, independent, human-free stretches become workflow islands:

```
[main agent, conversational, status-driven]
  ├─ workflow island: plan-context fanout           ← built: workflows/plan-context-fanout.js
  ├─ [GATE: the human sets In Progress in Linear]   ← outside the graph, necessarily
  ├─ start: a chain, pinned to Haiku, no workflow    ← first half of `implement`: issue-start
  ├─ implementation (sequential, conversational)
  ├─ workflow island: review map → reduce → verify → synthesize   ← built: workflows/review-verify.js
  └─ close-out: a chain, pinned to Haiku, no workflow
```

Chains sit at both ends of the axis: `issue-start` opens the branch and the draft PR, `issue-close` merges and finishes. Neither is a graph node of its own. Start is the first half of `implement`, behind the same `tracker-status` gate, and a separate node would only duplicate that gate.

| Node | Skill | Phase | Runtime | Edge in → out |
|---|---|---|---|---|
| `platform-determine` | `determine-platform` | write | conversational | none → `PlatformConfig` |
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

Degradation runs on separate tracks, and all of them end in the same place, the sequence the skills already describe in prose:

- **Cursor** has no `Workflow` tool but has `Task`. The islands run manually: the same agents via `subagent_type`, prompts and shapes taken verbatim from `workflows/*.js`, and `node scripts/island-reduce.ts` as the deterministic reducer. The payloads and stats match the `Workflow` run.
- **Other agents** (Copilot, Windsurf and others) have neither `Workflow` nor `Task`. They read the topology as documentation and run the axis sequentially.
- **Claude Code with workflows unavailable** falls back the same way: below v2.1.154, on a plan that does not include them, or switched off via `"disableWorkflows": true`, the *Dynamic workflows* toggle in `/config`, or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`. An island is always an optimization, never a precondition. A degraded run is flagged in the session summary's metrics, never silent.
