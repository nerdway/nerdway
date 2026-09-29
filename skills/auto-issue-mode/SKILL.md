---
name: auto-issue-mode
disable-model-invocation: true
argument-hint: <task description | issue ID>
description: >-
  Run one tracker issue autonomously from a task description or an existing
  issue ID to a merged PR/MR and the done phase, one subagent per stage, with a
  single approval of the drafted issue.
---

# Auto issue mode

You are the **orchestrator** of an autonomous run: one issue, from a task
description (or an existing issue ID) to a merged PR/MR and the `done` phase.
Every stage runs on its own subagent (`Agent` tool, `general-purpose`). You
resolve the platform, dispatch stages, carry each stage's report into the next
prompt, and print progress. The code, the commits and the tracker writes of a
stage belong to its subagent; you edit no file yourself.

## Consent: the one exception to the status gate

Invoking this skill is the user's consent to the whole run. In this mode the
agent writes **every** phase itself — `in-progress` and `in-review` included —
which `issue-workflow` and `adapters/statuses.md` otherwise reserve for the
human. The exception lives only inside this run; outside it the
`issue-workflow` rule stands unchanged.

The single human stop is the drafted issue (entry A). After its approval the
run asks nothing and stops only on a **stop condition** (below).

## Platform and adapters

Tracker and VCS commands live in adapter files at the plugin root, never in
this skill. Every operation runs by its ID from the adapter's `## Operations`
table:

```
${CLAUDE_PLUGIN_ROOT}/adapters/trackers/<tracker>.md
${CLAUDE_PLUGIN_ROOT}/adapters/vcs/<vcs>.md
```

If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
directories up from this skill's base directory.

Resolve the platform exactly as `nerd4rent:issue-writer` step 1 does (repo
`CLAUDE.md` `## Platform` → entity page `platform:` / legacy `linear:` →
`nerd4rent:determine-platform`), and the status strategy and map as
`${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md` describes. A missing adapter file
is a stop condition. Hand every subagent the same resolved block:

```
platform: { tracker: "<tracker>", vcs: "<vcs>",
            adapters: { tracker: "<absolute path>", vcs: "<absolute path>" },
            statuses: { strategy: "<strategy>", map: { ... } } }
```

## Entry

The argument is either a free-text task description or an issue ID in the form
the tracker adapter's `## Issue ID` section gives.

### A. Task description — create the issue

Follow `nerd4rent:issue-writer` steps 1, 4 and 5 with these fixed choices:

- no interview and no grilling session: draft from the description, and
  resolve gaps by reading the repo yourself;
- one issue with an implementation checklist in the body, never sub-issues;
- the **full** variant of `issue-writer/issue-template.md`.

Show the draft together with the resolved container and wait for **one**
approval; it covers the container and the body. Then run `issue.create` and
continue at stage 1 with the new ID.

### B. Issue ID — resume

Run `issue.read` and `issue.read-status`, then dispatch on the phase:

| Phase | Continue at |
|---|---|
| `backlog` / `todo` | stage 1 (start) |
| `in-progress`, no comment starting with `## Implementation plan` | stage 2 (plan) — stage 1 first when the issue has no branch or PR/MR yet |
| `in-progress`, plan comment present | stage 3 (implementation) |
| `in-review` | stage 4 (review) |
| `done` | stage 5 (close-out) as verification: an open PR/MR is merged, an already merged one is only confirmed |
| unknown | stop condition |

## Stages

Each stage is one subagent. Its prompt carries: the issue ID and URL, the
platform block, the stop conditions, the repo root, the reports of earlier
stages that the stage needs, and the report shape it must return. After each
stage print a 1–3 line **progress** update — stage, outcome, the one link or
number that proves it — before dispatching the next.

1. **Start.** Write phase `in-progress` with `issue.set-status`, then run
   `nerd4rent:issue-start` with the ID and a one-paragraph summary from the
   issue's objective. Report: branch, PR/MR URL.
2. **Plan.** Draft the implementation plan from the issue following
   `issue-workflow/plan-template.md` (banner and guidance comments removed; the
   body starts with `## Implementation plan`). For context use
   `nerd4rent:plan-context-fanout` when the `Workflow` tool is available to the
   subagent, otherwise `issue-workflow`'s sequential steps 0 and 0b. Post the
   plan with `issue.comment`; the phase stays `in-progress`. Report: the plan's
   objective and steps in brief, the comment link.
3. **Implementation.** Read the plan comment with `issue.read` and implement
   against it on the issue branch. Run the repo's tests and validators
   **before** touching code (baseline) and after; commit atomically per the
   repo's conventions (`CLAUDE.md`, `CONTEXT.md`, the entity page); push.
   Report: commits, baseline vs final test results with pre-existing failures
   unrelated to the change named separately, and every decision, gotcha or
   command learned on the way.
4. **Review.** Write phase `in-review`. Review `main...HEAD` (or the PR/MR
   base) along `issue-workflow`'s four axes — spec compliance against the
   acceptance criteria **and** the plan comment, repo standards
   (`CONTEXT.md` `## Standards`, the no-comments rule), correctness and
   regressions, security. Fix every real defect with its own commit, re-run the
   tests, push, then run `pr.mark-ready` (skipped when the adapter lists `—`).
   Report: findings with their fixes, final test results.
5. **Close-out** and 6. **Nerdbrain** run concurrently — dispatch both
   subagents in one message:
   - Close-out runs `nerd4rent:issue-close` with the ID and platform (commit
     leftovers, push, merge, switch to the base branch, phase `done`).
     Report: merge commit, base branch.
   - Nerdbrain applies the write triggers of the user's global `CLAUDE.md` to
     the decisions, gotchas and commands the earlier reports carry, and when
     any fires writes them with `nerd4rent:nerdbrain-wiki`. It is skipped when
     the vault is unreachable (`tier=none`, directory missing). Report: what
     was written, or why nothing was.

A version bump is a stage only when the argument asks for one or the repo's
conventions (`CLAUDE.md`, the entity page) require it on every change; it then
runs inside stage 3 as its own commit.

## Audience of committed work

On a client repo, the text the subagents author for other developers — repo
docs, code, the PR/MR description beyond what `issue-start` writes — follows
the audience rule of the user's global `CLAUDE.md`: issue codes appear only in
branch names and commit messages, and nothing links to a path the repo does
not track. Put this rule in the stage 3 and 4 prompts.

## Stop conditions

Stop the run, never force it, when:

- the tracker or VCS CLI returns an error, or an adapter or operation is
  missing (`—`);
- `issue-start` or `issue-close` stops early (a dirty tree, a checkout off
  `main`/`master`, an existing branch);
- tests are red after stage 4 and its subagent could not fix them;
- the merge has a conflict or a branch policy blocks it;
- a permission or classifier denial blocks a tool a stage needs;
- the phase read back is unknown.

On a stop, report what is done, what is pending, the exact error, and how to
resume: fix the cause, then run `/nerd4rent:auto-issue-mode <ID>` — entry B
picks the run up from the issue's phase.

## Final report

Close with the run's **evidence**: issue ID and link (per the tracker
adapter's `## URL`), PR/MR number, merge commit, test results (final, with
pre-existing unrelated failures listed apart), and what went to nerdbrain.

## Related skills

- `nerd4rent:issue-writer` — the creation flow entry A runs without grilling.
- `nerd4rent:issue-workflow` — the human-steered flow whose status gate this
  mode suspends for the run; its plan template and review axes are reused here.
- `nerd4rent:issue-start` / `nerd4rent:issue-close` — the chains of stages 1
  and 5.
- `nerd4rent:plan-context-fanout` — optional context island for stage 2.
- `nerd4rent:nerdbrain-wiki` — the write path of stage 6.
