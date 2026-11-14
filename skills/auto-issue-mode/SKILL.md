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
prompt, and print progress. The one thing you run yourself is the review island
of stage 4, which needs your `Workflow` or `Task` tool. The code, the commits
and the tracker writes of a stage belong to its subagent; you edit no file
yourself.

## First step: the issue, before the work

The first step after accepting a task is an issue in the tracker, and its
number in your reply, before any stage runs. With a task description, entry A
creates it and you print its ID right after `issue.create`; with an issue ID,
entry B confirms it exists. No subagent changes the repo before that ID is
known. The plugin's hooks, where they run, block `git commit` and `git push`
on a branch without an issue ID; a bot without hooks has only this rule.

## Consent: the one exception to the status gate

Invoking this skill is the user's consent to the whole run. In this mode the
agent writes **every** phase itself — `in-progress` and `in-review` included —
which `issue-workflow` and `adapters/statuses.md` otherwise reserve for the
human. The exception is data, not prose: `workflow-graph.json` registers this
skill as the `auto-issue-mode` node, exempted from the frozen rule
`no-repo-change-before-in-progress` for the one issue of the run. Its
`no-merge-without-green-verification` gate is a `chat-approval` decision taken
at invocation — the user decides to close up front — so the merge still waits
for green tests and validators. Outside the run both rules stand unchanged.

The single human stop is the drafted issue (entry A). After its approval the
run asks nothing and stops only on a **stop condition** (below).

## Hard stop: the plan comment before any Start

A comment whose **first heading line is `## Implementation plan`** must
already exist on the issue before stage 1 (Start), before any CloudAgent,
and before any edit, commit or PR. If it is missing, run stage 2 until
`issue.read` shows that comment. Then AIM writes phase `in-progress` with
`issue.set-status` and continues stage 1 → 3 → review → close **without
asking** and without waiting for a manual status flip. The only human stop
in this mode remains draft-issue approval (entry A). Acceptance criteria
already in the description, a handoff from another bot, or "do it now" /
"zrób od razu" **do not waive** the plan comment. The plan may be short
and quote the AC, but it must exist on the tracker. OPS-22 (2026-10-27)
launched a CloudAgent without a posted plan; DEMO-473 (2026-10-28) posted a
stub, set In Progress itself, and launched a CloudAgent — neither counts
as this comment.

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

Resolve the platform exactly as `nerdway:issue-writer` step 1 does (nerdway
platform config, read from disk as
`${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes → entity page
`platform:` / legacy `linear:` → `nerdway:determine-platform`), and the status strategy and map as
`${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md` describes. A missing adapter file
is a stop condition. Hand every subagent the same resolved block:

```
platform: { tracker: "<tracker>", vcs: "<vcs>",
            adapters: { tracker: "<absolute path>", vcs: "<absolute path>",
                        vault: "<absolute path>" | null },
            statuses: { strategy: "<strategy>", map: { ... } } }
```

## Entry

The argument is either a free-text task description or an issue ID in the form
the tracker adapter's `## Issue ID` section gives.

### A. Task description — create the issue

Follow `nerdway:issue-writer` steps 1, 4 and 5 with these fixed choices:

- no interview and no grilling session: draft from the description, and
  resolve gaps by reading the repo yourself;
- one issue with an implementation checklist in the body, never sub-issues;
- the **full** variant of `issue-writer/issue-template.md`, every acceptance
  criterion ending with its check (`— check: <test or command>`) — the
  description is the spec (ADR-0008).

Show the draft together with the resolved container and wait for **one**
approval; it covers the container and the body. Then run `issue.create` and
continue at stage 2 with the new ID (the issue has no plan comment yet).

### B. Issue ID — resume

Run `issue.read` and `issue.read-status`, then dispatch on the phase:

| Phase | Continue at |
|---|---|
| `backlog` / `todo`, no comment starting with `## Implementation plan` | stage 2 (plan) only — never stage 1, never stage 3, never a CloudAgent, until that comment exists; then AIM writes `in-progress` and continues stage 1 → 3 without asking |
| `backlog` / `todo`, plan comment present | AIM writes `in-progress` if the phase is not already that, then stage 1 (start), then stage 3 — no ask |
| `in-progress`, no comment starting with `## Implementation plan` | stage 2 (plan) only — never stage 1, never stage 3, never a CloudAgent, until that comment exists; then AIM writes `in-progress` (already set) and continues stage 1 → 3 without asking |
| `in-progress`, plan comment present | stage 3 (implementation) — stage 1 first when the issue has no branch or PR/MR yet; no ask |
| `in-review` | stage 4 (review) |
| `done`, no PR/MR, no trace of work | stop condition: the warning and the bug proposal of *A done issue without a trace of work* in `${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md`; the run creates no bug itself |
| `done` | stage 5 (close-out) as verification: an open PR/MR is merged, an already merged one is only confirmed |
| unknown | stop condition |

## Stages

Each stage is one subagent. Its prompt carries: the issue ID and URL, the
platform block, the stop conditions, the repo root, the reports of earlier
stages that the stage needs, and the report shape it must return. After each
stage print a 1–3 line **progress** update — stage, outcome, the one link or
number that proves it — before dispatching the next.

1. **Start.** Only after a comment starting with `## Implementation plan` is
   already on the issue. Write phase `in-progress` with `issue.set-status`
   (AIM autonomy — do not ask the user to move the status), then run
   `nerdway:issue-start` with the ID and a one-paragraph summary from the
   issue's objective. Report: branch, PR/MR URL. If the plan comment is
   missing, this stage does not run — go to stage 2.
2. **Plan.** Draft the implementation plan from the issue following
   `issue-workflow/plan-template.md` (banner and guidance comments removed; the
   body starts with `## Implementation plan`). For context use
   `nerdway:plan-context-fanout` when the `Workflow` tool is available to the
   subagent, otherwise `issue-workflow`'s sequential steps 0 and 0b. The
   description is the spec and is not refined here (that needs the user); a
   criterion without a check gets one in the plan. The plan lists its
   Affected Files and sets its **Test approach**: `TDD` with the seams, or
   `no tests` only with a reason and the stand-in check. This stage may run
   while the issue is still `backlog` / `todo` or already `in-progress`. Post
   the plan with `issue.comment`. As soon as that comment exists, write phase
   `in-progress` with `issue.set-status` (AIM autonomy after the plan). Do not
   Start, do not edit the repo, and never a CloudAgent until the comment is
   posted. Do not ask the user to move the status and do not wait for a
   manual flip. After this stage reports, continue stage 1 → 3 without
   asking. Report: the plan's objective and steps in brief, the comment
   link.
3. **Implementation.** Read the plan comment with `issue.read` and implement
   against it on the issue branch, in the mode its **Test approach** sets,
   without asking: `TDD` follows `nerdway:tdd` against the listed seams;
   `no tests` is a plain implementation that runs the stand-in check the
   reason names; a plan without a test approach is implemented with TDD and
   the assumption is reported. Run the repo's tests and validators
   **before** touching code (baseline) and after; commit atomically per the
   repo's conventions (`CLAUDE.md`, `CONTEXT.md`, the entity page); push.
   Tests or validators red after the implementation, with no cause the
   subagent can name, go through `nerdway:debug` (`issue: <ID>`) before the
   run declares its red-tests stop: the stop fires only after the skill's
   three failed fixes, and its report of hypotheses and evidence is the stop
   report.
   A file outside the plan's Affected Files may be changed without asking —
   the run's consent covers it (an exemption on `no-change-outside-plan`) —
   but first post an `issue.comment` that extends the plan with the file and
   the reason. Finally fill `issue-workflow`'s **Criteria verification** table
   (step 6a): one row per criterion of the spec, check, result, evidence.
   Report: commits, baseline vs final test results with pre-existing failures
   unrelated to the change named separately, the criteria table, the test
   approach (mode, and under `no tests` the reason and the stand-in check's
   result), and every
   decision, gotcha or command learned on the way.
4. **Review.** Write phase `in-review` with `issue.set-status`. Then run the
   review island yourself, before dispatching the stage's subagent: an island
   needs the `Workflow` or `Task` tool, which a subagent may not have. Run
   `review-verify` exactly as `issue-workflow`'s **Code review phase** does,
   on the range `<base>...<issue branch>` (the PR/MR base, else `main`),
   without the range confirmation: invoking this skill is the user's consent.
   With `Workflow`, call `nerdway:review-verify`; without it, run the `Task`
   path stage by stage with `node scripts/island-reduce.ts review`. Keep its
   `ReviewFindings` (`summary`, `findings`, `stats`, `conflicts`) and its
   `gaps` verbatim. Only with neither tool, the subagent runs
   `issue-workflow`'s degradation (a), one pass per axis, and its report
   flags the review as degraded.
   The subagent's prompt carries the `ReviewFindings` verbatim and forbids it
   to review the diff itself, to dispatch a reviewer of its own and to add a
   finding. It checks each verified finding against the code and fixes the
   ones that hold, each with its own commit; a finding that does not hold is
   not applied and is reported with the technical reason. It re-runs the
   tests and pushes. Then it answers review threads the way
   `issue-workflow`'s **Review threads on the PR/MR** section does and
   re-runs the tests after that step. A failing suite stops the stage. Only
   then it writes the readiness description exactly as `issue-workflow`
   step 6b does — the template, the layout flag, the classifier, the
   overwrite rule and the length rule all live there — from stage 3's
   criteria table, which its prompt carries, and this stage's review
   results. Then it runs
   `pr.mark-ready` (skipped when the adapter lists `—`).
   Report: each finding with its fix commit or the reason it was not applied,
   the island's `stats` and `gaps` (or the degraded flag), the threads
   answered, final test results, and whether the readiness description
   replaced the PR/MR description (`pr.edit-body`) or went out as a comment
   (`pr.comment`), with the reason.
5. **Close-out.** `personal-docs` depends on `wiki-write`: do not start
   `nerd-personal-docs` until this run has written the session's
   `## Checkpoints` entry (or recorded an explicit skip: `tier=none` or no
   entity page). If this run has not done that yet, write it first — the same
   step as `issue-workflow`'s Session summary, with the pre-merge branch and
   HEAD. A Session summary comment alone is not enough. Then run
   `nerdway:nerd-personal-docs` with the ID and
   platform: this subagent runs on the session model, so the guide is not
   written on `issue-close`'s Haiku. It writes or updates the user's guide in
   the nerdbrain vault and records a `## Personal guide` comment on the
   issue, or says the machine has no vault. Then run
   `nerdway:issue-close` with the ID and platform (its Step 0 checks the
   guide, its Step 0b that every child of the issue is `done` and its
   Step 0c that stage 4 replaced the start draft of the PR/MR description;
   then it
   commits leftovers, pushes, merges, switches to the base branch, writes
   phase `done`).
   `issue-close` does not print the merge hash, so once it finishes read it
   with `git rev-parse --short HEAD` on the base branch (its `git pull` puts
   the merge commit at HEAD). Report: the guide path (or why none was
   written), merge commit (short), base branch.
6. **Nerdbrain.** Dispatched only after stage 5's report arrives, so it knows
   the merge; its prompt carries stage 5's merge commit and base branch. It
   makes one logical wiki write with `nerdway:nerdbrain-wiki` (one
   `updated:` bump, one `log.md` line, as `issue-workflow`'s session-summary
   step does) that holds two things:
   - the write triggers of the user's global `CLAUDE.md`, applied to the
     decisions, gotchas and commands the earlier reports carry;
   - one `## Checkpoints` entry, following `nerdbrain-wiki`'s **Prepend,
     capped** mode (entry format, cap of 10, `updated:` bump and `log.md`
     line live there), with the post-merge values:

     ```
     - YYYY-MM-DD — <ID> · done · <base branch> @ <short merge commit> — next: <one line, English>
     ```

     The branch and hash are the ones stage 5 reports (when the hash is
     missing, `git rev-parse --short HEAD` on the base branch gives it), so
     `project-continue` reads this entry back without drift. `next` is the
     first follow-up the run's reports name (stage 3 and 4 decisions, gotchas,
     remaining work); else an open issue related to the run's own issue
     through `issue.read-relations` (parent, sibling, link), run on the issue
     and then on its parent; else the first issue `issue.list-open` returns
     other than the run's own issue, Backlog included (ID and title); else
     `none`.

   The whole stage, checkpoint included, is skipped when the vault is
   unreachable (`tier=none`, directory missing); the checkpoint alone is
   skipped when the project has no entity page. Report: what was written, the
   checkpoint line (or why none was written), or why nothing was.

A version bump is a stage only when the argument asks for one or the repo's
conventions (`CLAUDE.md`, the entity page) require it on every change; it then
runs inside stage 3 as its own commit.

## Audience of committed work

On a client repo, the text the subagents author for other developers — repo
docs, code, the readiness description of stage 4 — follows
the audience rule of the user's global `CLAUDE.md`: issue codes appear only in
branch names and commit messages, and nothing links to a path the repo does
not track. Put this rule in the stage 3 and 4 prompts.

## Stop conditions

Stop the run, never force it, when:

- the tracker or VCS CLI returns an error, or an adapter or operation is
  missing (`—`; a missing `pr.mark-ready` is only skipped);
- `issue-start` or `issue-close` stops early (a dirty tree, a checkout off
  `main`/`master`, an existing branch, a missing guide, a child of the issue
  that is not `done`, a PR/MR description still the start draft);
- the spec turns out wrong and would have to change — a spec change needs
  the user's acceptance, which the run cannot ask for;
- a criterion stays `fail` after stage 3 and its subagent could not fix it;
- tests are red after stage 3 or stage 4 and `nerdway:debug`, run by the
  stage's subagent, stopped after three failed fixes;
- the merge has a conflict or a branch policy blocks it;
- a permission or classifier denial blocks a tool a stage needs;
- the phase read back is unknown, or `done` with no PR/MR and no trace of
  work (entry B).

On a stop, report what is done, what is pending, the exact error, and how to
resume: fix the cause, then run `/nerdway:auto-issue-mode <ID>` — entry B
picks the run up from the issue's phase.

## Final report

Close with the run's **evidence**: issue ID and link (`issue.url`), PR/MR number, merge commit, test results (final, with
pre-existing unrelated failures listed apart), the review island's `stats` and
`gaps` from stage 4 (or that the review ran degraded), the test approach with its
reason whenever the run left TDD, and what went to nerdbrain, including the
checkpoint line stage 6 wrote (or why none was).

## Related skills

- `nerdway:issue-writer` — the creation flow entry A runs without grilling.
- `nerdway:issue-workflow` — the human-steered flow whose status gate this
  mode suspends for the run; its plan template and its review island
  (`review-verify`) are reused here.
- `nerdway:issue-start` / `nerdway:issue-close` — the chains of stages 1
  and 5.
- `nerdway:plan-context-fanout` — optional context island for stage 2.
- `nerdway:tdd` — the implementation loop of stage 3 under `mode: TDD`.
- `nerdway:debug` — the cause-finding loop stage 3 runs on red tests before
  the red-tests stop condition fires.
- `nerdway:nerdbrain-wiki` — the write path of stage 6, checkpoint included.
- `nerdway:issue-next-step` — may start a run at entry B for an issue ID
  once the user picks the autonomous mode in chat.
- `nerdway:nerd-orchestrate` — may start a run at entry B for each
  unplanned issue the user approved after its plan was posted.
