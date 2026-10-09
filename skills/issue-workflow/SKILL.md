---
name: issue-workflow
description: >-
  Mandatory status-driven workflow for tracker issues (Linear, GitHub Issues,
  GitLab Issues, Azure DevOps Boards) when the user provides an issue ID (e.g.
  KAM-145, ENG-123; #123, owner/repo#123 or group/project#123 in a GitHub or
  GitLab Issues project; #123 or AB#123 in an Azure DevOps Boards project) to
  plan or implement. Dispatches on the
  issue's workflow phase, read through the tracker's status strategy:
  backlog/todo → plan; in-progress (set manually by the user) → implement
  (branch, empty commit, draft PR with magic words); in-review → code-review
  menu; done → close-out. The user steers by changing the issue's status on
  the tracker; the agent asks for that move and prints the issue link.
  Invoke this skill FIRST; the tracker and VCS commands it needs come from
  the platform adapters.
---

# Issue workflow

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

1. the `## Platform` section of the repo `CLAUDE.md`, read from disk as
   `${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes, never from context;
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
paths, multi-line bodies), `## URL` the recipe behind `issue.url`, and
`## Status strategies` the read and write recipe per status strategy.

## Phases and status strategy

This skill dispatches on the five canonical phases — `backlog`, `todo`,
`in-progress`, `in-review`, `done` — never on a tracker's own state names.
Resolve the strategy and status map once per session, as
`${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md` describes: the `statuses` block of
the platform config, else the tracker adapter's `## Statuses` default (on
Linear: `native`, `Backlog / Todo / In Progress / In Review / Done`).
`issue.read-status` yields a phase through that strategy and
`issue.set-status` writes one. A value the map does not hold is **phase
unknown**: report the raw value and dispatch nothing. A strategy the adapter
lists as `—` → stop and ask the user to run `/bind-statuses`.

## Where the spec and the plan live

The tracker carries the spec (ADR-0008); the repository holds code only — no
spec or plan files, ever.

- **The issue description is the current spec**: WHAT and WHY, in the
  sections of `issue-writer/issue-template.md`, with a checklist of acceptance
  criteria, each naming how it is checked (`— check: <test or command>`).
- **The `## Implementation plan` comment is the plan**: HOW, including the
  files it will change.
- **`## Spec change` comments are the spec's history**: each says what changed
  in the description after work started, and why.

Read the spec from the description and its history from the `## Spec change`
comments. Every write uses existing adapter operations only:
`issue.update-description`, `issue.comment`, `issue.set-status`.

## When this skill applies

The user gave an **issue identifier** — `TEAM-123` on Linear; `#123` or
`owner/repo#123` when the platform config says `tracker: github`; `#123` or
`group/project#123` when it says `tracker: gitlab`; `#123`, `AB#123` or a
bare work item number when it says `tracker: ado` (elsewhere `#123` is only a
number, often a PR) — in a fresh session or mid-conversation — with intent to plan or implement (including Polish:
*zaplanuj*, *zrealizuj*, *zrób*, *weź*, *napraw*, *wdroż*), or any message
arrives in a session already working an issue.

The **issue's phase on the tracker is the single source of truth** for what to
do. The user steers the workflow by changing it there — a state, a label, or a
`Status:` marker comment, depending on the strategy — not by typing approvals
in chat.

## Hard gates (do not skip)

1. **Before any repo change** (edit, write, build, install, commit, PR): the
   issue's phase must be **`in-progress`** — written by the user on the
   tracker, whatever the strategy. Never write `in-progress` yourself to unlock
   implementation; an explicit user instruction in chat to implement counts as
   approval (then write `in-progress` with `issue.set-status` to reflect it).
2. **Phase check every turn**: at the start of every turn that touches the
   issue, run `issue.read-status` and dispatch on the current phase. It may
   have changed since the last message.
3. **After every working session** on the issue: post a `## Session summary`
   comment (see below).

Allowed regardless of phase: tracker read operations, reading code for
analysis, drafting plan text, posting tracker comments, answering questions.

## Dispatch by phase

Fetch first — `issue.read`. That one JSON
carries the state, the full description and every comment (linked PRs appear
as GitHub-sync comments); inline images stay markdown URLs in the bodies.
Read the phase from it with the strategy's read recipe (under `comment` the
marker is in those comments), then:

| Phase | What to do |
|-------|------------|
| `backlog` / `todo` | **Planning** — draft and post a plan (or refine the existing one); write phase **`todo`**; end the turn asking for `in-progress` (step 3) |
| `in-progress` | **Implementation** — rebuild context from the description (the spec), the `## Implementation plan` comment and later comments (`## Spec change`, plan extensions); if branch/PR missing, run the Start step first |
| `in-review` | **Code review** — present the code-review menu with the issue link (`issue.url`) |
| `done` (set manually, PR unmerged) | **Close-out** — push, merge PR, ask about switching to main/master |
| unknown | report the raw value read from the tracker with the issue link (`issue.url`) and stop |

This table also governs a bare issue ID typed into a **fresh session**: check
the phase and do what it says — do not restart planning for an issue already
`in-progress`.

## Planning phase (`backlog` / `todo`)

### Context fan-out (workflow island, when available)

When the `Workflow` tool is available, gather the planning context through the
island instead of reading sequentially: run `workflows/plan-context-fanout.js`
(as `/plan-context-fanout` / `/nerd4rent:plan-context-fanout`, or directly via
`Workflow({name: "nerd4rent:plan-context-fanout", args: {issueId: "<ID>", spec: <IssueSpec>, platform: <platform>}})`
— pass `args` as a real JSON object, never as a JSON-encoded string). One
script realises both contract nodes (`wiki-recall` + `plan-context-fanout`):
five gatherers run concurrently, a deterministic reducer (plain code, not an
agent) dedupes, drops empties and trims to the `nerdbrain-wiki` limits (≤ 3
related pages, ≤ 5 search results), and the island returns typed
`PlanContext` + `ProjectContext` plus a `gaps` list.

When `Workflow` is absent but `Task` is available (Cursor), run the island
manually — the script is the single source of its prompts and shapes:

1. Read `workflows/plan-context-fanout.js` and take the five gatherer prompts
   verbatim from it (issue header, adapter instructions and shapes included —
   do not paraphrase them into this skill).
2. Spawn five `Task` calls concurrently with `subagent_type: plan-gatherer`,
   one per gatherer, in the script's fixed order: repo-layout, conventions,
   prior-plans, tracker-relations, vault. The subagent's final message must be
   strict JSON matching the script's per-gatherer shape.
3. Parse each return. On a parse failure re-ask once; still unparsable → treat
   that gatherer as failed (`null`). A dead gatherer takes the same `null` —
   never a silent skip.
4. Assemble the five outputs into one JSON object
   (`{repoFacts, conventions, priorPlans, trackerRelations, vault}`) and pipe
   it through `node scripts/island-reduce.ts plan`. A non-zero exit becomes a
   `gaps` entry, not a guess.
5. Use the runner's typed `PlanContext` + `ProjectContext` + `gaps` exactly as
   the island's return above.

Never reduce these outputs in chat — the reducer is code, so the same
gatherer output always reduces to the same context and the same stats.

| Source | What it contributes | Schema field |
|---|---|---|
| Repo code (layout, `README.md`, `CONTRIBUTING.md` at the root or in `docs/`, `CLAUDE.md`, `CONTEXT.md`) | directories/files the change touches; test, build and validator commands | `PlanContext.repoLayout`, `.commands` |
| ADRs (`docs/adr/*.md`) + `CONTEXT.md` terms + commit style | hard in-repo rules the plan must not break | `PlanContext.conventions` |
| Prior plans (`docs/plans/`) and merged PRs | precedents: how similar changes were cut and committed | `PlanContext.priorArt` |
| Related tracker issues (parent, siblings, links) | parent AC, cross-issue agreements and dependencies | `PlanContext.priorArt` |
| Entity page + 1-hop graph (`nerdbrain-search` recipes) | project decisions, active context, related pages | `ProjectContext.slug`, `.decisions`, `.activeContext`, `.relatedPages` |

When the island ran, its `ProjectContext` covers steps 0 and 0b below — skip
them and draft from the returned context, reading sequentially only what the
`gaps` list flags as missing. A failed vault gatherer never kills the run:
`ProjectContext` comes back absent and flagged.

**Degradation — two explicit paths, both land on the sequential steps 0/0b/1:**

- **(a) Agent without the `Workflow` and `Task` tools** (Agent Skills
  portability): the topology is readable as prose here and in
  `workflow-graph.json`; gather the same sources sequentially. The degraded
  run is flagged in the session summary's metrics (no island stats), never
  silent.
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
contract). Cursor `sessionStart` is fire-and-forget — the inject may arrive
after the first turn. If no inject is present, infer `<slug>` from the repo
and `Read` `~/obsidian/nerdbrain/5-wiki/entities/projects/<slug>.md` when
that file exists. Skip this step silently — no error — if the vault is
unreachable (`tier=none`), the page is a stub, or the section is missing/empty.

Treat any decisions found as constraints while drafting the plan: the
Technical Approach must not contradict one without flagging it.

### 0b. Graph recall (optional)

If the issue **explicitly** touches another project/concept already present
in the graph (in the current entity page's `related:`, or named directly by
the user or the issue), follow `nerdbrain-wiki`'s **Graph recall (on-demand)**
patterns before drafting the Technical Approach — same triggers and limits,
not duplicated here. Skip silently otherwise; don't read the graph
speculatively.

### 0c. Refine the spec (complex issues only)

An issue the grilling session (1a) classifies as small skips this step. For a
medium or large issue, before the plan:

1. Compare the description with the **full** variant of
   `issue-writer/issue-template.md`.
2. Settle every missing or vague section in a grilling session (1a). A section
   nobody discussed stays empty: capture what was said, never invent a
   criterion, a constraint or a scope line.
3. End each acceptance criterion with how it is checked —
   `— check: <test or command>`. A criterion that cannot name a check is too
   vague: settle it in the session or leave it as an open question.
4. Extend the user's text, never drop it: `issue.update-description` replaces
   the whole description.
5. Show the full new description in chat and write it with
   `issue.update-description` only after the user accepts it (gate
   `no-tracker-write-before-approval` on `plan-draft`).

### 1. Draft plan

Use the bundled `plan-template.md` sections (Polish or English — match the
issue language):

- **Objective**, **Scope** (in/out), **Technical Approach**,
  **Affected Files**, **Implementation Steps**, **Test approach**,
  **Acceptance Criteria**, **Risks**, **Dependencies**

**Affected Files** lists every file or directory the implementation will
change; it is what the scope stop in step 6 checks against. Each acceptance
criterion names its check (`— check: <test or command>`), copied from the spec
or added here for a small issue.

**Test approach** is `TDD` by default, with the seams the tests will be written
against. Choose `no tests` only with a reason and the nearest runnable check
that stands in for a test — a change with no behaviour to drive, such as pure
prose. The user approves the mode together with the plan; step 5 reads it.

`plan-template.md` and `session-summary-template.md` are **generated** from the
`ImplementationPlan` and `SessionSummary` schemas in `workflow-graph.json`
(`node scripts/render-templates.ts`); change a section by editing the schema, not
the file. Filling them stays prose — no step in this skill asks anyone for JSON.

For ambiguous requirements, run the **grilling session** of 1a through
`nerd4rent:grill` before posting the plan. The skill says the size of the
issue out loud first; a small, clear issue gets no interview — go straight to
the plan.

If a plan comment already exists, refine it (post a follow-up or update) rather
than duplicating it.

### 1a. Grilling session (adaptive, before the plan is posted)

Invoke **`nerd4rent:grill`** with the two argument lines `issue: <ID>` and
`topic: the issue description`. The skill announces the size, checks facts in
the repo itself, asks the decisions in numbered rounds with a recommended
answer each, and records a `## Grill state` comment on the issue after every
round, so the session resumes from the tracker on any machine. Its confirmed
outcome feeds step 0c (the refined spec) and step 1 (the plan).

Do not post the plan before the skill has returned a confirmed outcome. The
outcome tags each decision for the docs discipline — ADR, glossary term in
`CONTEXT.md`, or `## Decisions` on the entity page; act on those tags with the
plan (the entity-page write goes through `nerdbrain-wiki`, see the integration
section below).

### 2. Post plan to the tracker and write `todo`

Save the plan to a temp file, then:

Run `issue.comment` with the plan file as the body, then `issue.set-status`
with the phase `todo`.

The posted body **must** start with `## Implementation plan` (no status line).
If step 0 found relevant decisions, note which ones the plan is consistent
with, and mark any deviation as `Odstępstwo od decyzji YYYY-MM-DD — powód`.

### 3. End the turn

Report that the plan is on the tracker and ask for the move to `in-progress`,
in the shape *Asking the human to move a phase* in
`${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md` gives — then stop. The user
signals approval by making that move on the tracker (or by asking you to
implement in chat); the request never lets you write `in-progress` yourself.

## Implementation phase (`in-progress`)

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
     `issue.create-branch` with `<branchName>` from `issue.read-branch` and
     the current branch as `<base>`, then on the resulting branch:

     ```bash
     git commit --allow-empty -m "Rozpoczęcie prac nad <ID>"
     git push -u origin <branch>
     ```

     and `pr.create-draft` from the VCS adapter with the title
     `<ID>: <title>` and the body from its `## Magic words` section
     (`Fixes <ID>`, a blank line, the one-paragraph summary).

   `Fixes <ID>` (one line per issue if the PR closes several) lets the
   tracker integration track the PR and auto-close the issue on merge.
2. **If `issue-start` stopped early** (issue not `in-progress`, dirty tree,
   branch already exists, missing VCS CLI), fix the reported cause or
   resolve it with the user — never re-run the chain blindly.

### 5. Take the test approach from the plan

There is no menu of implementation modes: the plan's **Test approach**,
approved with the move to `in-progress`, already decided it.

- `mode: TDD` → invoke `nerd4rent:tdd` and implement against the seams the
  plan lists.
- `mode: no tests` → implement plainly and run the stand-in check the plan's
  reason names. A `no tests` plan without a reason is not approved for
  implementation: ask for the reason and the check, and extend the plan with
  an `issue.comment` before writing code.
- No test approach (a plan written before the field existed) → ask the user
  in chat which mode to use, with TDD as the recommendation, rather than
  guessing.

Leaving TDD is never silent: the mode, and under `no tests` the reason and the
stand-in check's result, go into the session summary's **Test approach**.

### 6. Implement

Follow project conventions. Prefer minimal scope. Run relevant tests/builds.
Commit and push to the PR branch as work lands.

**Stay inside the plan's Affected Files** (frozen rule
`no-change-outside-plan`). Before changing any other file, stop, name the
file and the reason, and continue only after the user's yes in chat; then
post an `issue.comment` that extends the plan with that file. A no means
finding a way inside the list, or a spec change.

**A spec change after work started** — a criterion turns out wrong, the scope
has to move — is never applied silently. Show the new description in chat;
after the user accepts it, write it with `issue.update-description` and post
an `issue.comment` that starts with `## Spec change` (never with `Status:`)
and says what changed and why. The thread then reads as the spec's history.

### 6a. Verify the criteria

Before leaving implementation, run the check of every acceptance criterion in
the spec (the plan's, when the spec has none) and fill the
**Criteria verification** table: criterion, check, result (`pass` / `fail`),
evidence. Any `fail` blocks the move to review — fix it, or settle a spec
change with the user. The table goes into the session summary.

### 7. After implementation: offer code review — never closure

Only with every criterion at `pass` (6a). Do **not** offer to merge the PR or
close the issue. Enter the review phase
(same as the `in-review` phase below): confirm the change range, then run
the review island.

## Code review phase (`in-review`, or right after implementation)

The review is not a menu of one reviewer: it runs along **four fixed,
mutually independent axes**, mapped in parallel, reduced deterministically,
verified adversarially, judged where axes collide, and only then synthesized. Each axis carries its own
instructions in `workflows/review-verify.js`; no external review skill drives
an axis, and `/code-review` stays outside this flow.

| Axis | What it checks | Rule source |
|---|---|---|
| `spec-compliance` | the change does what the issue asked, no more, no less | the issue's acceptance criteria (tracker adapter `issue.read`) |
| `repo-standards` | the diff obeys the repo coding standards | `CONTEXT.md` `## Standards`; without that section, a baseline of twelve code smells from Fowler's *Refactoring* (chapter 3, as Matt Pocock's `code-review` lists them), each a judgement call of at most `minor` severity |
| `correctness-regressions` | logic errors, broken edge cases, regressions | the diff itself |
| `security` | injection, secrets, unsafe access the diff introduces | the diff itself |

**Confirm the request (review-menu, conversational).** Default the range to
`main...HEAD` and confirm it with the user, printing the issue link
(`issue.url`); all four axes always run, so there is nothing else to choose.

**Run the island.** With the `Workflow` tool available, run
`workflows/review-verify.js` via
`Workflow({name: "nerd4rent:review-verify", args: {issueId: "<ID>", request: {range: "..."}, platform: <platform>}})`
— `args` as a real JSON object, never a JSON-encoded string. The island does:

1. **Map** — one mapper per axis, all four concurrent, each confined to its
   axis.
2. **Reduce** — plain code, no model: schema-invalid records dropped, dedup by
   `file:line` within one axis (the most severe finding of that axis wins the
   anchor; findings of different axes on one anchor all go on to
   verification), sorted by severity, capped at 12 findings.
3. **Verify** — 3 independent sceptics per finding, each prompted to *refute*
   it (the opposite goal to the reviewer's). **Rejection rule: 2 or more
   refutations out of 3.** A finding with fewer than 2 cast votes is dropped
   as unverified — it never passes because verification failed. Sceptic pairs
   run in batches of at most 8, honouring the node's `maxWidth: 8` budget by
   construction.
4. **Judge** — only when verified findings from different axes share one
   `file:line` anchor (an **axis conflict**, detected by plain code). One
   `review-judge` per conflict, in batches of at most 8, answers which axis
   prevails, or `both` when the findings are compatible. The reducer applies
   the verdict: an overruled finding leaves `findings` and stays verbatim in
   `conflicts`; a missing or invalid verdict keeps every finding and adds a
   `gaps` entry. A review without conflicts runs no judge at all.
5. **Synthesize** — the agent writes *only* the summary; the findings list is
   assembled verbatim by the reducer, so no model can add a finding after
   verification, and the judge can only set one aside with a recorded reason.

**When `Workflow` is absent but `Task` is available (Cursor), run the island
manually, stage by stage** — `workflows/review-verify.js` remains the single
source of the prompts and shapes:

1. **Map** — read the four axis prompts from the script verbatim (spec source
   and diff instruction included) and spawn four `Task` calls
   concurrently with `subagent_type: review-mapper`. Parse each strict-JSON
   return; re-ask once on failure, then treat the mapper as failed (`null`).
2. **Reduce** — pipe the four mapper returns (a JSON array, axis order
   preserved) through `node scripts/island-reduce.ts review candidates`.
3. **Verify** — for each candidate, spawn three `review-sceptic` Tasks with
   the script's sceptic prompt verbatim, in batches of at most 8, collecting
   one `{refuted, justification}` vote per sceptic (same parse/re-ask/null
   rule).
4. **Reduce** — add the `mappedCount` and `overflowCount` fields from the
   candidates-stage output (an integer edit of the join payload, not a
   hand-edit of findings) and pipe `{candidates, votes, mappedCount,
   overflowCount}` through `node scripts/island-reduce.ts review verdicts`.
5. **Judge** — pipe the verdicts output through `node scripts/island-reduce.ts
   review conflicts`. For each listed conflict, in order, spawn one
   `review-judge` Task with the script's judge prompt verbatim (batches of at
   most 8), collecting one `{prevails, reason}` verdict (same
   parse/re-ask/null rule). With no conflicts, spawn nothing and pass an empty
   list. Then pipe `{verified, stats, judgments}` (`verified` and `stats` from
   the verdicts output, `judgments` in the conflicts order) through
   `node scripts/island-reduce.ts review judgments` — always, since it stamps
   `stats.overruled`.
6. **Synthesize** — one `review-synthesizer` Task with the script's summary
   prompt and the judged findings + stats. Assemble `ReviewFindings`
   (`summary`, `findings`, `stats`, `conflicts`) verbatim from the runner
   output — findings are never hand-edited after verification.

A non-zero runner exit becomes a `gaps` entry, and the runner's `stats` +
`gaps` go into the session summary's metrics section exactly as after a
`Workflow` run. Never reduce in chat.

Rejected findings stay out of the result, but every drop is counted:
`stats { mapped, verified, rejected, unverifiedOverflow, overruled }` is
required in `ReviewFindings`, and the counters go into the tracker comment (the node
reports as `tracker-comment`) — degradation is visible, never silent. Run
failures (a dead mapper, missing votes) arrive in `gaps` beside the payload.

Address the verified findings, push fixes to the PR branch. Check each finding
against the code before fixing it: a finding that does not hold up there is
not applied, and the session summary records it with the technical reason.

**Degradation — same two paths as the plan-phase island:**

- **(a) Agent without the `Workflow` and `Task` tools**: run the axes
  sequentially in the main agent — one review pass per axis with the same
  prompts and rule sources, then dedup and present the findings. The degraded
  run is flagged in the session summary's metrics (no island stats), never
  silent.
- **(b) Claude Code with dynamic workflows unavailable or off** (below
  v2.1.154, plan without workflows, `disableWorkflows`, the */config* toggle,
  `CLAUDE_CODE_DISABLE_WORKFLOWS=1`, managed settings): same sequential
  fallback.

**UX cost:** in the default permission mode every workflow run prompts for
consent — a review on every issue means a prompt on every issue. Silence it
with "don't ask again" (per workflow, per project).

## Close-out (on user request, or phase `done` set manually)

Only when the user asks to close/merge (or set `done` manually with the PR still
open): invoke **`nerd4rent:issue-close`** with the issue ID. That skill
mechanically commits any leftover changes, pushes, merges the PR/MR (GitHub or
GitLab), switches the local checkout to the PR/MR base branch, and sets the
issue's phase to `done`. It is deliberately lightweight (Haiku-friendly).

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
- the criteria verification table, once implementation is complete,
- open questions / next steps,
- metrics, whenever an island ran this session.

The summary must be enough to resume from the tracker alone. The `metrics` section is
where a run's `PlanContext.stats` and `gaps` become durable — the comment is the
only place they are stored, so a session that ran the plan island and omits them
loses the figure for good.

**Checkpoint on the entity page (same step).** Right after the comment is
posted, record the session as one `## Checkpoints` entry on the project's
nerdbrain entity page, following `nerdbrain-wiki`'s **Prepend, capped** mode
(entry format, cap of 10, `updated:` bump, `log.md` line live there):

```
- YYYY-MM-DD — <ID> · <phase after the session> · <branch> @ <git rev-parse --short HEAD> — next: <first item of next steps, one line, English>
```

It is the same logical wiki write as any other entity-page update from this
session, so bump `updated:` once and add one log line. Skip it silently when
the vault is unreachable (`tier=none`) or the project has no entity page —
the tracker comment already holds the full summary. This entry is what
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
  user has set `in-progress` (branch, start commit, push, draft PR/MR);
  mirror of `issue-close`.
- `nerd4rent:bind-statuses` — binds the phases to the tracker (strategy and
  map) this skill reads and writes.
- `nerd4rent:issue-close` — the close-out chain (commit, push, merge,
  switch to base, write `done`).
- `nerd4rent:auto-issue-mode` — user-invoked autonomous run of the same
  lifecycle; the one place the agent writes `in-progress` itself.
- `nerd4rent:issue-next-step` — diagnoses an issue's phase, names the next
  step and hands off here (or to `auto-issue-mode`) without retyping the ID;
  it may write `in-progress` after the user agrees in chat.
- `nerd4rent:nerdbrain-search` — rg recipes underlying `nerdbrain-wiki`'s
  Graph recall step (used by 0b above).
- `nerd4rent:project-continue` — reads the checkpoint this skill writes and
  answers "where were we" for the project; it hints at the issue ID to type
  here, never enters this workflow by itself.
- `nerd4rent:tdd` — the implementation loop step 5 hands off to under
  `mode: TDD`.
- `nerd4rent:grill` — the grilling session of step 1a (`issue: <ID>`); its
  confirmed outcome feeds the spec refinement and the plan.
- `gitlab-to-linear` / `simgit` — GitLab → Linear import (separate flow).
