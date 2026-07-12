---
name: linear-issue-workflow
description: >-
  Mandatory status-driven workflow for Linear issues when the user provides an
  issue ID (e.g. KAM-145, ENG-123) to plan or implement. Dispatches on the
  issue's Linear status: Backlog/Todo → plan; In Progress (set manually by the
  user) → implement (branch, empty commit, draft PR with magic words); In
  Review → code-review menu; Done → close-out. Never prints "confirm the plan"
  instructions — the user steers by changing the issue status in Linear.
  Invoke this skill FIRST; use linear-cli for CLI syntax.
---

# Linear issue workflow

Use with the `linear-cli` skill for every `linear` command (flags, subcommands).

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
   issue, run `linear issue view <ID> -j` and dispatch on the current status.
   The status may have changed since the last message.
3. **After every working session** on the issue: post a `## Session summary`
   comment (see below).

Allowed regardless of status: `linear` read commands, reading code for
analysis, drafting plan text, posting Linear comments, answering questions.

**Legacy marker:** older issues may carry a `Status: approved` line in the plan
comment thread. Treat it as equivalent to In Progress (approval under the old
workflow). Never post that marker on new work.

## Dispatch by status

Fetch first — `linear issue view <ID> -j` — read title, description, state,
`branchName`, and **all comments**. Then:

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

### 0. Read `## Decisions` from the entity page

If the SessionStart inject for this project contains an `[omitted: ...
Decisions ...]` marker, `Read` the full entity page at the path given in that
marker and extract `## Decisions` (per `nerdbrain-wiki`'s lazy-section
contract). Skip this step silently — no error — if no entity page was
injected (stub / `tier=none`) or the section is missing/empty.

Treat any decisions found as constraints while drafting the plan: the
Technical Approach must not contradict one without flagging it.

### 1. Draft plan

Use the bundled `plan-template.md` sections (Polish or English — match the
issue language):

- **Objective**, **Scope** (in/out), **Technical Approach**,
  **Implementation Steps**, **Acceptance Criteria**, **Risks**, **Dependencies**

For ambiguous requirements, ask the user **before** posting the plan (short QA).

If a plan comment already exists, refine it (post a follow-up or update) rather
than duplicating it.

### 2. Post plan to Linear and set Todo

Save the plan to a temp file, then:

```bash
linear issue comment add <ID> --body-file <path-to-plan.md>
linear issue update <ID> -s Todo
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
   - On `main`/`master`: `git checkout -b <branchName from issue view -j>`.
   - On another issue branch: ask the user — (a) branch from current,
     (b) branch from main/master, (c) stay.
2. **Empty commit + push** (GitHub needs ≥1 commit to open a PR):

   ```bash
   git commit --allow-empty -m "<start-of-work message>"
   git push -u origin <branch>
   ```

3. **Draft PR with Linear magic words** — use `gh` (not `linear issue pr`,
   which does not put magic words in the body):

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

Do **not** offer to merge the PR or close the issue. Present the code-review
menu (same as the In Review phase below).

## Code review phase (status In Review, or right after implementation)

Offer the options actually available in the session:

1. **Superpowers code review** (e.g. `superpowers:requesting-code-review`) —
   if available.
2. **Matt Pocock review skills** — if available.
3. **Oceń ręcznie** — the user reviews the PR themselves; always offered.

Run the chosen review, address findings, push fixes to the PR branch.

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
linear issue comment add <ID> --body-file <summary.md>
```

Body **must** start with `## Session summary` and include:

- what changed (files / areas),
- scope completed vs remaining,
- current status,
- validation / test results,
- open questions / next steps.

The summary must be enough to resume from Linear alone.

## Nerdbrain entity-page integration

- When the injected entity page's frontmatter has `linear.team` or
  `linear.project`, query Linear for active work (`linear issue query
  --team <key>` / `--project <name>`) instead of re-asking the user.
- When recording a decision on the entity page (nerdbrain write trigger),
  link it to the issue ID, e.g. `2026-05-05 — chose JWT (LIN-123)`.

## Related skills

- `linear-cli` — CLI reference (always before `linear` commands).
- `nerd4rent:linear-issue-writer` — upstream: creates the issue (in Backlog)
  that this skill plans and implements.
- Superpowers / Matt Pocock skills — optional implementation and review modes;
  detect availability per session, degrade gracefully when absent.
- `gitlab-to-linear` / `simgit` — GitLab → Linear import (separate flow).
