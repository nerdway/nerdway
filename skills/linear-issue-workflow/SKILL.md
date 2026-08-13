---
name: linear-issue-workflow
description: >-
  Mandatory status-driven workflow for Linear issues when the user provides an
  issue ID (e.g. KAM-145, ENG-123) to plan or implement. Dispatches on the
  issue's Linear status: Backlog/Todo → plan; In Progress (set manually by the
  user) → implement (branch, empty commit, draft PR with magic words); In
  Review → code-review menu; Done → close-out. Never prints "confirm the plan"
  instructions — the user steers by changing the issue status in Linear.
  Invoke this skill FIRST; the linearis commands it needs are in its CLI
  reference.
---

# Linear issue workflow

## CLI reference

`linearis` is the Linear CLI (npm, pure JS, JSON-only output). These are the
only commands this skill needs:

| Purpose | Command |
|---------|---------|
| Status gate (every turn) | `linearis issues read <ID> --fields identifier,title,state.name` |
| Full context (entering a phase) | `linearis issues read <ID> --with-comments` |
| Post a comment | `linearis issues discuss <ID> --body "$(cat body.md)"` |
| Set status | `linearis issues update <ID> --status 'In Progress'` |
| Branch name | `linearis issues read <ID> --fields branchName` |
| Active work in a team/project | `linearis issues list --team <KEY> --project <name> --status 'Todo,In Progress,In Review'` |

`--fields` takes comma-separated dot-paths and trims the JSON to exactly those
keys — the status gate returns only `identifier`, `title`, `state.name`, cheap
enough to run every turn. `--with-comments` inlines every comment
(`comments.nodes[].body`, markdown) into the issue JSON; linked PRs show up as
comments from the GitHub sync. Inline images stay markdown URLs inside
`description`/`body` — fetch one only when it matters.

States are the team's own **names** — `Backlog`, not `backlog`; spaces are
fine (`--status 'In Progress'`). There is no state-listing command: a wrong
name fails loudly with `Status "X" for team ... not found`, naming nothing
else — fix the name and retry.

Multi-line bodies go through the flag, not stdin: `--body "$(cat body.md)"`
preserves newlines, backticks and Polish diacritics as-is. There is no `-`
stdin sentinel and no `--body-file`.

The issue JSON carries no `url` field; when a link is needed, build it as
`https://linear.app/<workspace>/issue/<ID>` (workspace slug as in the
project's `url`).

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
   issue, run `linearis issues read <ID> --fields identifier,title,state.name`
   and dispatch on the current status. The status may have changed since the
   last message.
3. **After every working session** on the issue: post a `## Session summary`
   comment (see below).

Allowed regardless of status: `linearis` read commands, reading code for
analysis, drafting plan text, posting Linear comments, answering questions.

**Legacy marker:** older issues may carry a `Status: approved` line in the plan
comment thread. Treat it as equivalent to In Progress (approval under the old
workflow). Never post that marker on new work.

## Dispatch by status

Fetch first — `linearis issues read <ID> --with-comments`. That one JSON
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
`Workflow({scriptPath: "<plugin>/workflows/plan-context-fanout.js", args: {issueId: "<ID>", spec: <IssueSpec>}})`
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
| Related Linear issues (parent, siblings, links) | parent AC, cross-issue agreements and dependencies | `PlanContext.priorArt` |
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

```bash
linearis issues discuss <ID> --body "$(cat <path-to-plan.md>)"
linearis issues update <ID> --status Todo
```

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

1. **Branch** — existing policy unchanged:
   - On `main`/`master`: read the issue's native branch name —
     `linearis issues read <ID> --fields branchName` — then
     `git checkout -b <branchName>` with the returned value.
   - On another issue branch: ask the user — (a) branch from current,
     (b) branch from main/master, (c) stay.
2. **Empty commit + push** (GitHub needs ≥1 commit to open a PR):

   ```bash
   git commit --allow-empty -m "<start-of-work message>"
   git push -u origin <branch>
   ```

3. **Draft PR with Linear magic words** — use `gh`; the Linear CLI has no
   PR-opening command:

   ```bash
   gh pr create --draft --title "<ID>: <title>" \
     --body "Fixes <ID>

   <one-paragraph summary>"
   ```

   `Fixes <ID>` (one line per issue if the PR closes several) lets the
   Linear↔GitHub integration track the PR and auto-close the issue on merge.

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
| `spec-compliance` | the change does what the issue asked, no more, no less | the issue's acceptance criteria (`linear` CLI) | plain agent |
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
`Workflow({scriptPath: "<plugin>/workflows/review-verify.js", args: {issueId: "<ID>", request: {axes: [...], range: "..."}}})`
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
reports as `linear-comment`) — degradation is visible, never silent. Run
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
open): invoke **`nerd4rent:linear-issue-close`** with the issue ID. That skill
mechanically commits any leftover changes, pushes, merges the PR/MR (GitHub or
GitLab), switches the local checkout to the PR/MR base branch, and sets the
issue to Done in Linear. It is deliberately lightweight (Haiku-friendly).

If the merge fails (e.g. conflicts), it stops and reports — resolve, then
re-run.

## Session summary (mandatory)

After each session (including partial work), post:

```bash
linearis issues discuss <ID> --body "$(cat <summary.md>)"
```

The bundled `session-summary-template.md` has these sections ready. Body **must**
start with `## Session summary` and include:

- what changed (files / areas),
- scope completed vs remaining,
- current status,
- validation / test results,
- open questions / next steps.

The summary must be enough to resume from Linear alone.

## Nerdbrain entity-page integration

- When the injected entity page's frontmatter has `linear.team` or
  `linear.project`, query Linear for active work (`linearis issues list
  --team <key> --project <name> --status 'Todo,In Progress,In Review'`)
  instead of re-asking the user.
- When recording a decision on the entity page (nerdbrain write trigger),
  link it to the issue ID, e.g. `2026-05-05 — chose JWT (LIN-123)`.

## Related skills

- `nerd4rent:linear-issue-writer` — upstream: creates the issue (in Backlog)
  that this skill plans and implements.
- `nerd4rent:nerdbrain-search` — rg recipes underlying `nerdbrain-wiki`'s
  Graph recall step (used by 0b above).
- Superpowers / Matt Pocock skills — optional implementation and review modes;
  detect availability per session, degrade gracefully when absent.
- `gitlab-to-linear` / `simgit` — GitLab → Linear import (separate flow).
