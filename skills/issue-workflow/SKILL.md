---
name: issue-workflow
description: >-
  Mandatory status-driven workflow for Linear issues when the user provides an
  issue ID (e.g. KAM-145, ENG-123) to plan or implement. Dispatches on the
  issue's Linear status: Backlog/Todo → plan; In Progress (set manually by the
  user) → implement (branch, empty commit, draft PR with magic words); In
  Review → code-review menu; Done → close-out. Never prints "confirm the plan"
  instructions — the user steers by changing the issue status in Linear.
  Invoke this skill FIRST; the tracker and VCS commands it needs come from
  the platform adapters.
---

# Linear issue workflow

## Platform and adapters

Tracker and VCS commands live in adapter files at the plugin root, never in
this skill. Read the tracker adapter when entering a phase, and run every
operation by its ID from the adapter's `## Operations` table:

```
${CLAUDE_PLUGIN_ROOT}/adapters/trackers/<tracker>.md
${CLAUDE_PLUGIN_ROOT}/adapters/vcs/<vcs>.md
```

If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
directories up from this skill's base directory.

Pick `<tracker>` and `<vcs>` from the first source that has them:

1. the `## Platform` section of the repo `CLAUDE.md`;
2. the entity page frontmatter `platform:` — a legacy `linear:` block there
   means `tracker: linear`, with `vcs` detected from `git remote get-url
   origin` by the `## Detection` rules of the VCS adapters;
3. neither → invoke `nerd4rent:determine-platform` and take the platform from
   its output.

No adapter file for the value → stop and report: "adapter
`trackers/<tracker>` (or `vcs/<vcs>`) is not available yet in this plugin
version" — never fall back to another platform. Pass the resolved platform to
`issue-start` and `issue-close` when delegating.

The workflow islands cannot read files, so pass them the platform with the
adapter paths already resolved, as `args.platform`:

```
platform: { tracker: "<tracker>", vcs: "<vcs>",
            adapters: { tracker: "<absolute path>" | null,
                        vcs: "<absolute path>" | null } }
```

Each path is the substituted `${CLAUDE_PLUGIN_ROOT}/adapters/...` file above,
checked to exist; `null` when the file is missing or `tracker` is `none`. An
island turns a `null` adapter into a `gaps` entry and runs no command of
another platform.

The tracker adapter's `## CLI` section carries the command gotchas (field
paths, multi-line bodies), `## URL` how to build an issue link, and
`## Statuses` the team's state names used below.

## When this skill applies

The user gave a **Linear issue identifier** (`TEAM-123`) — in a fresh session or
mid-conversation — with intent to plan or implement (including Polish:
*zaplanuj*, *zrealizuj*, *zrób*, *weź*, *napraw*, *wdroż*), or any message
arrives in a session already working an issue.

The **issue status in Linear is the single source of truth** for what phase to
enter. The user steers the workflow by changing the status in Linear, not by
typing approvals in chat.

## Hard gates (do not skip)

1. **Before any repo change** (edit, write, build, install, commit, PR): the
   issue status must be **In Progress** — set manually by the user in Linear.
   Never set In Progress yourself to unlock implementation; an explicit user
   instruction in chat to implement counts as approval (then set In Progress
   to reflect it).
2. **Status check every turn**: at the start of every turn that touches the
   issue, run `issue.read-status` and dispatch on the current status. The status may have changed since the
   last message.
3. **After every working session** on the issue: post a `## Session summary`
   comment (see below).

Allowed regardless of status: tracker read operations, reading code for
analysis, drafting plan text, posting Linear comments, answering questions.

**Legacy marker:** older issues may carry a `Status: approved` line in the plan
comment thread. Treat it as equivalent to In Progress (approval under the old
workflow). Never post that marker on new work.

## Dispatch by status

Fetch first — `issue.read`. That one JSON
carries the state, the full description and every comment (linked PRs appear
as GitHub-sync comments); inline images stay markdown URLs in the bodies.
Then:

| Issue status | Phase |
|--------------|-------|
| Backlog / Todo | **Planning** — draft and post a plan (or refine the existing one); set status **Todo**; end the turn with no instructions for the user |
| In Progress | **Implementation** — rebuild context from the `## Implementation plan` comment and later comments; if branch/PR missing, run the Start step first |
| In Review | **Code review** — present the code-review menu |
| Done (set manually, PR unmerged) | **Close-out** — push, merge PR, ask about switching to main/master |

This table also governs a bare issue ID typed into a **fresh session**: check
the status and enter the matching phase — do not restart planning for an issue
already In Progress.

## Planning phase (status Backlog / Todo)

### Context fan-out (workflow island, when available)

When the `Workflow` tool is available, gather the planning context through the
island instead of reading sequentially: run `workflows/plan-context-fanout.js`
(as `/nerd4rent:plan-context-fanout`, or directly via
`Workflow({name: "nerd4rent:plan-context-fanout", args: {issueId: "<ID>", spec: <IssueSpec>, platform: <platform>}})`
— pass `args` as a real JSON object, never as a JSON-encoded string). One
script realises both contract nodes (`wiki-recall` + `plan-context-fanout`):
five gatherers run concurrently, a deterministic reducer (plain code, not an
agent) dedupes, drops empties and trims to the `nerdbrain-wiki` limits (≤ 3
related pages, ≤ 5 search results), and the island returns typed
`PlanContext` + `ProjectContext` plus a `gaps` list.

| Source | What it contributes | Schema field |
|---|---|---|
| Repo code (layout, `README.md`, `CONTEXT.md`) | directories/files the change touches; test, build and validator commands | `PlanContext.repoLayout`, `.commands` |
| ADRs (`docs/adr/*.md`) + `CONTEXT.md` terms + commit style | hard in-repo rules the plan must not break | `PlanContext.conventions` |
| Prior plans (`docs/superpowers/plans/`) and merged PRs | precedents: how similar changes were cut and committed | `PlanContext.priorArt` |
| Related tracker issues (parent, siblings, links) | parent AC, cross-issue agreements and dependencies | `PlanContext.priorArt` |
| Entity page + 1-hop graph (`nerdbrain-search` recipes) | project decisions, active context, related pages | `ProjectContext.slug`, `.decisions`, `.activeContext`, `.relatedPages` |

When the island ran, its `ProjectContext` covers steps 0 and 0b below — skip
them and draft from the returned context, reading sequentially only what the
`gaps` list flags as missing. A failed vault gatherer never kills the run:
`ProjectContext` comes back absent and flagged.

**Degradation — two explicit paths, both land on the sequential steps 0/0b/1:**

- **(a) Agent without the `Workflow` tool** (Agent Skills portability): the
  topology is readable as prose here and in `workflow-graph.json`; gather the
  same sources sequentially.
- **(b) Claude Code with dynamic workflows unavailable or off**: workflows
  need v2.1.154+ and a paid plan (on Pro additionally enabling them in
  `/config`), and they can be disabled via `disableWorkflows` in settings, the
  *Dynamic workflows* toggle in `/config`,
  `CLAUDE_CODE_DISABLE_WORKFLOWS=1`, or an organisation's managed settings.

**UX cost, so it does not surprise anyone:** in the default permission mode
every workflow run prompts for consent — the plan phase running on every issue
means a prompt on every issue. Silence it with "don't ask again" (per workflow,
per project).

### 0. Read `## Decisions` from the entity page

If the SessionStart inject for this project contains an `[omitted: ...
Decisions ...]` marker, `Read` the full entity page at the path given in that
marker and extract `## Decisions` (per `nerdbrain-wiki`'s lazy-section
contract). Skip this step silently — no error — if no entity page was
injected (stub / `tier=none`) or the section is missing/empty.

Treat any decisions found as constraints while drafting the plan: the
Technical Approach must not contradict one without flagging it.

### 0b. Graph recall (optional)

If the issue **explicitly** touches another project/concept already present
in the graph (in the current entity page's `related:`, or named directly by
the user or the issue), follow `nerdbrain-wiki`'s **Graph recall (on-demand)**
patterns before drafting the Technical Approach — same triggers and limits,
not duplicated here. Skip silently otherwise; don't read the graph
speculatively.

### 1. Draft plan

Use the bundled `plan-template.md` sections (Polish or English — match the
issue language):

- **Objective**, **Scope** (in/out), **Technical Approach**,
  **Implementation Steps**, **Acceptance Criteria**, **Risks**, **Dependencies**

`plan-template.md` and `session-summary-template.md` are **generated** from the
`ImplementationPlan` and `SessionSummary` schemas in `workflow-graph.json`
(`node scripts/render-templates.ts`); change a section by editing the schema, not
the file. Filling them stays prose — no step in this skill asks anyone for JSON.

For ambiguous requirements, offer a **grilling session** before posting the
plan (see below). A small, clear task gets no grilling — go straight to the
plan.

If a plan comment already exists, refine it (post a follow-up or update) rather
than duplicating it.

### 1a. Grilling session (adaptive, before the plan is posted)

Run the session **inline** per this protocol:

1. Interrogate every aspect of the topic until shared understanding is reached.
2. Walk down the decision tree, resolving dependencies between decisions one
   branch at a time.
3. Ask **one question at a time** and wait for the answer.
4. Give a **recommended answer** with every question.
5. Verify facts yourself in the environment (code, repo, CLI) — ask the user
   only about **decisions**.
6. Do not post the plan until the user confirms shared understanding.

**Docs discipline** — apply to what the session produces:

- A decision that is **hard to reverse** AND **surprising without context**
  AND carries a **real trade-off** (all three) → record an ADR in the repo's
  `docs/adr/` (follow the repo's existing ADR pattern if one exists).
- Terms sharpened during the session → glossary entries in the repo's
  `CONTEXT.md`.
- Project-level decisions → the existing `## Decisions` write-trigger on the
  nerdbrain entity page (see the integration section below) — do not duplicate
  the `nerdbrain-wiki` procedure here.

If `mattpocock-skills:grilling` / `domain-modeling` are available in the
session, you may use them for question and CONTEXT/ADR formats — the inline
rules above always work without them (same graceful degradation as the
implementation modes). Never delegate to the `grill-me` / `grill-with-docs`
wrappers: they carry `disable-model-invocation: true` and only the user can
run them, manually, as slash commands.

### 2. Post plan to Linear and set Todo

Save the plan to a temp file, then:

Run `issue.comment` with the plan file as the body, then `issue.set-status`
with `Todo`.

The posted body **must** start with `## Implementation plan` (no status line).
If step 0 found relevant decisions, note which ones the plan is consistent
with, and mark any deviation as `Odstępstwo od decyzji YYYY-MM-DD — powód`.

### 3. End the turn

Report briefly that the plan is in Linear — and stop. Do **not** tell the user
to approve, confirm, or set any status. The user signals approval by moving the
issue to **In Progress** in Linear (or by asking you to implement in chat).

## Implementation phase (status In Progress)

### 4. Start (once per issue — skip if branch and PR already exist)

If the accepted plan flagged an `Odstępstwo od decyzji` (a deviation from a
recorded decision), that acceptance is itself a nerdbrain write-trigger:
invoke `nerdbrain-wiki` to append/update the superseding decision under
`## Decisions` on the entity page before continuing.

The mechanical part of Start — branch from the issue's native `branchName`,
empty start commit, push with upstream, draft PR/MR carrying the `Fixes <ID>`
magic word — is the **`nerd4rent:issue-start`** chain (Haiku), the mirror of
`issue-close` at the other end of the issue. The chain asks no questions and
requires a clean checkout on `main`/`master`, so settle the branch question
here first:

1. **Branch policy** — existing policy unchanged:
   - On `main`/`master`: delegate — invoke `nerd4rent:issue-start` with
     `<ID>` and a one-paragraph summary for the PR body (from the plan's
     Objective). It reads `branchName` itself, creates the branch, makes the
     start commit, pushes, opens the draft PR/MR and reports the branch and
     the PR/MR URL.
   - On another issue branch: ask the user — (a) branch from current,
     (b) branch from main/master, (c) stay. After (b), `git checkout main &&
     git pull` (or `master`), then delegate as above. After (a) or (c) the
     chain's precondition does not hold — run its steps by hand: for (a)
     `git checkout -b <branchName>` (value from `issue.read-branch`), then on
     the resulting branch:

     ```bash
     git commit --allow-empty -m "Rozpoczęcie prac nad <ID>"
     git push -u origin <branch>
     ```

     and `pr.create-draft` from the VCS adapter with the title
     `<ID>: <title>` and the body from its `## Magic words` section
     (`Fixes <ID>`, a blank line, the one-paragraph summary).

   `Fixes <ID>` (one line per issue if the PR closes several) lets the
   tracker integration track the PR and auto-close the issue on merge.
2. **If `issue-start` stopped early** (issue not In Progress, dirty tree,
   branch already exists, missing VCS CLI), fix the reported cause or
   resolve it with the user — never re-run the chain blindly.

### 5. Pick an implementation mode

Offer the modes **actually available in the session** (check the available
skills list; degrade gracefully — if a family is absent, omit it silently):

1. **Superpowers skills** (e.g. `superpowers:test-driven-development`,
   `superpowers:subagent-driven-development`) — if any are available.
2. **Matt Pocock skills** (installed via `npx skills` into `~/.agents/skills`)
   — if any are available.
3. **Plain agent** — no framework skill; always available.

If only the plain agent is available, just proceed — don't present a
one-option menu.

### 6. Implement

Follow project conventions. Prefer minimal scope. Run relevant tests/builds.
Commit and push to the PR branch as work lands.

### 7. After implementation: offer code review — never closure

Do **not** offer to merge the PR or close the issue. Enter the review phase
(same as the In Review phase below): confirm the axes and engines, then run
the review island.

## Code review phase (status In Review, or right after implementation)

The review is not a menu of one reviewer: it runs along **four fixed,
mutually independent axes**, mapped in parallel, reduced deterministically,
verified adversarially and only then synthesized. Existing review paths
(superpowers, Matt Pocock, `/code-review`) are **engines** of an axis, never
axes of their own — two engines on the same axis would duplicate findings and
break axis independence.

| Axis | What it checks | Rule source | Preferred engine (when available) |
|---|---|---|---|
| `spec-compliance` | the change does what the issue asked, no more, no less | the issue's acceptance criteria (tracker adapter `issue.read`) | plain agent |
| `repo-standards` | the diff obeys the repo coding standards | `CONTEXT.md` `## Standards` | plain agent |
| `correctness-regressions` | logic errors, broken edge cases, regressions | the diff itself | `superpowers` / `matt-pocock` / `code-review` |
| `security` | injection, secrets, unsafe access the diff introduces | the diff itself | `code-review` |

**Confirm the request (review-menu, conversational).** Only the main agent
sees the session's skill list, so engine detection happens here: check which
review skills are available, fill `engine` per axis (a missing skill degrades
that axis to `plain-agent` — it never removes the axis), default the range to
`main...HEAD`, and confirm the set with the user. The engine is a prompt hint
for the axis mapper, not a hard invocation — the subagent may lack the skill
and must still review.

**Run the island.** With the `Workflow` tool available, run
`workflows/review-verify.js` via
`Workflow({name: "nerd4rent:review-verify", args: {issueId: "<ID>", request: {axes: [...], range: "..."}, platform: <platform>}})`
— `args` as a real JSON object, never a JSON-encoded string. The island does:

1. **Map** — one mapper per axis, all four concurrent, each confined to its
   axis.
2. **Reduce** — plain code, no model: schema-invalid records dropped, dedup by
   `file:line` (the most severe finding wins the anchor), grouped by axis,
   sorted by severity, capped at 12 findings.
3. **Verify** — 3 independent sceptics per finding, each prompted to *refute*
   it (the opposite goal to the reviewer's). **Rejection rule: 2 or more
   refutations out of 3.** A finding with fewer than 2 cast votes is dropped
   as unverified — it never passes because verification failed. Sceptic pairs
   run in batches of at most 8, honouring the node's `maxWidth: 8` budget by
   construction.
4. **Synthesize** — the agent writes *only* the summary; the findings list is
   assembled verbatim by the reducer, so no model can mutate or add a finding
   after verification.

Rejected findings stay out of the result, but every drop is counted:
`stats { mapped, verified, rejected, unverifiedOverflow }` is required in
`ReviewFindings`, and the counters go into the Linear comment (the node
reports as `tracker-comment`) — degradation is visible, never silent. Run
failures (a dead mapper, missing votes) arrive in `gaps` beside the payload.

Address the verified findings, push fixes to the PR branch.

**Degradation — same two paths as the plan-phase island:**

- **(a) Agent without the `Workflow` tool**: run the axes sequentially in the
  main agent — one review pass per axis with the same prompts and rule
  sources, then dedup and present the findings; offer the engines as the old
  menu (superpowers / Matt Pocock / manual) when the user prefers a single
  reviewer.
- **(b) Claude Code with dynamic workflows unavailable or off** (below
  v2.1.154, plan without workflows, `disableWorkflows`, the */config* toggle,
  `CLAUDE_CODE_DISABLE_WORKFLOWS=1`, managed settings): same sequential
  fallback.

**UX cost:** in the default permission mode every workflow run prompts for
consent — a review on every issue means a prompt on every issue. Silence it
with "don't ask again" (per workflow, per project).

## Close-out (on user request, or status Done set manually)

Only when the user asks to close/merge (or set Done manually with the PR still
open): invoke **`nerd4rent:issue-close`** with the issue ID. That skill
mechanically commits any leftover changes, pushes, merges the PR/MR (GitHub or
GitLab), switches the local checkout to the PR/MR base branch, and sets the
issue to Done in Linear. It is deliberately lightweight (Haiku-friendly).

If the merge fails (e.g. conflicts), it stops and reports — resolve, then
re-run.

## Session summary (mandatory)

After each session (including partial work), post it with `issue.comment`.

The bundled `session-summary-template.md` has these sections ready. Body **must**
start with `## Session summary` and include:

- what changed (files / areas),
- scope completed vs remaining,
- current status,
- validation / test results,
- open questions / next steps,
- metrics, whenever an island ran this session.

The summary must be enough to resume from Linear alone. The `metrics` section is
where a run's `PlanContext.stats` and `gaps` become durable — the comment is the
only place they are stored, so a session that ran the plan island and omits them
loses the figure for good.

**Checkpoint on the entity page (same step).** Right after the comment is
posted, record the session as one `## Checkpoints` entry on the project's
nerdbrain entity page, following `nerdbrain-wiki`'s **Prepend, capped** mode
(entry format, cap of 10, `updated:` bump, `log.md` line live there):

```
- YYYY-MM-DD — <ID> · <Linear status after the session> · <branch> @ <git rev-parse --short HEAD> — next: <first item of next steps, one line, English>
```

It is the same logical wiki write as any other entity-page update from this
session, so bump `updated:` once and add one log line. Skip it silently when
the vault is unreachable (`tier=none`) or the project has no entity page —
the Linear comment already holds the full summary. This entry is what
`project-continue` reads back when the user asks "where were we" on this or
another machine, so the branch and hash must be the real values after the
session's last push.

## Nerdbrain entity-page integration

- When the platform config carries the tracker identifiers (`linear.team` /
  `linear.project`, from `## Platform` or the entity page's `platform:` or
  legacy `linear:`), query active work with `issue.list-active` instead of
  re-asking the user.
- When recording a decision on the entity page (nerdbrain write trigger),
  link it to the issue ID, e.g. `2026-05-05 — chose JWT (LIN-123)`.
- The session-summary step writes a `## Checkpoints` entry (above); it rides
  the same `session-summary` → `wiki-write` edge of the graph as any other
  entity-page update, so it needs no extra gate or node.

## Related skills

- `nerd4rent:issue-writer` — upstream: creates the issue (in Backlog)
  that this skill plans and implements.
- `nerd4rent:issue-start` — the Start chain step 4 delegates to once the
  user has set In Progress (branch, start commit, push, draft PR/MR);
  mirror of `issue-close`.
- `nerd4rent:issue-close` — the close-out chain (commit, push, merge,
  switch to base, set Done).
- `nerd4rent:nerdbrain-search` — rg recipes underlying `nerdbrain-wiki`'s
  Graph recall step (used by 0b above).
- `nerd4rent:project-continue` — reads the checkpoint this skill writes and
  answers "where were we" for the project; it hints at the issue ID to type
  here, never enters this workflow by itself.
- Superpowers / Matt Pocock skills — optional implementation and review modes;
  detect availability per session, degrade gracefully when absent.
- `gitlab-to-linear` / `simgit` — GitLab → Linear import (separate flow).
