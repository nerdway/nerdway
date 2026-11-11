---
name: issue-next-step
argument-hint: <issue ID>
description: >-
  Diagnose where one tracker issue stands (phase on the tracker, branch,
  PR/MR, plan comment, commits), name its one natural next step, offer to move
  it to In Progress when that step is implementation, and on the user's choice
  hand off to issue-workflow or auto-issue-mode without retyping the ID. Use
  when the user asks what comes next for an issue: "następny krok", "co dalej z
  DEMO-123", "next step", "what's next for #123". A bare issue ID with intent to
  plan or implement belongs to issue-workflow.
---

# Issue next step

One pass for one issue: **diagnose → propose → ask once → hand off**. The
diagnosis only reads. The single write this skill makes itself is the
`in-progress` phase of the diagnosed issue, after the user agrees in chat;
branch, commits and PR/MR belong to the skill it hands off to, and a bug
report to `nerdway:issue-writer`.

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
`${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md` describes. The argument is an
issue ID in the form the tracker adapter's `## Issue ID` section gives.

## Step 1 — Diagnose

Run `issue.read`, `issue.read-status` and `issue.read-branch`, then collect
the **evidence**:

- **plan** — a comment starting with `## Implementation plan`;
- **branch** — the issue's `branchName`, checked with git locally and on
  `origin`;
- **PR/MR** — the link in the issue's comments or attachments from
  `issue.read`; when the current checkout is the issue branch, also
  `pr.view-base` for its draft state and base;
- **commits** — the newest few on the branch, when it exists;
- **trace** — only in phase `done`: the `git log` search of the default
  branch and the `## No code in this repo` comment, both as
  `${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md` describes in *A done issue
  without a trace of work*.

## Step 2 — Name the next step

Pick the first matching row. The table mirrors the dispatch table of
`issue-workflow` and entry B of `auto-issue-mode`; keep the three in step.

| Phase | Evidence | Next step |
|---|---|---|
| `backlog` | any | planning — a plan already present gets refreshed, as `issue-workflow` dispatches it |
| `todo` | no plan | planning |
| `todo` | plan present | implementation — propose `in-progress` |
| `in-progress` | no plan | planning |
| `in-progress` | no branch or PR/MR | implementation, starting with the Start step |
| `in-progress` | branch or PR/MR present | continue implementation |
| `in-review` | any | review |
| `done` | open PR/MR | close-out |
| `done` | no PR/MR, and the trace check finds no trace of work | done without a trace of work: a warning and a bug proposal through `issue-writer` (see below); the issue's phase stays as it is |
| `done` | PR/MR merged, or none | the open issues `issue.read-relations` returns (parent, siblings, links; run on the issue, then on its parent) — list them as the next step and end, no handoff; with none, report that and end |
| unknown | — | stop condition |

An `in-progress` issue with no plan is planning, never implementation:
acceptance criteria in the description and a handoff do not waive it.

Print one compact block: the phase (raw value and canonical phase), the
evidence, and the one next step.

## Step 3 — Ask once: consent and mode

Ask one question in plain chat as a numbered list with a recommended answer.

When the next step is implementation and the phase is not `in-progress`:

1. move the issue to In Progress and continue step by step with
   `issue-workflow`;
2. move it and run it autonomously with `auto-issue-mode` — choosing this is
   the same consent as typing `/nerdway:auto-issue-mode <ID>`: the run asks
   nothing more until the merge and `done`;
3. no — end here.

When the next step is done without a trace of work:

1. draft the bug with `issue-writer`: what was found and how (the phase, the
   empty `git log` search), the issue link, the expected state, a `related`
   relation to the issue (`issue.relate`) and the bug marking from the
   tracker adapter's `## Bugs`;
2. no — end here, with the warning printed.

A comment on the issue is never offered in place of the bug, nor a move of
its phase.

For every other next step: 1) step by step with `issue-workflow`,
2) autonomously with `auto-issue-mode` (same consent as above), 3) end here.

Option 1 on an implementation step writes `in-progress` with
`issue.set-status` before the handoff; option 2 leaves that write to the
run's start stage. Option 3, or any answer that is not a clear yes, ends the
skill with nothing written.

## Step 4 — Hand off

Continue in the same conversation with the ID the user already gave:

- **bug** → invoke `nerdway:issue-writer` through the `Skill` tool with the
  incident as its input; it shows the draft and creates nothing without its
  own approval, then runs `issue.relate` from the new bug to the issue;

- **step by step** → invoke `nerdway:issue-workflow` through the `Skill`
  tool with the issue ID as the argument;
- **autonomously** → `auto-issue-mode` is user-invoked only, so the `Skill`
  tool cannot start it: read
  `${CLAUDE_PLUGIN_ROOT}/skills/auto-issue-mode/SKILL.md` and run it from
  entry B with the issue ID, carrying the resolved platform block.

## Stop conditions

Report the phase read, the evidence gathered and the exact error, then stop
with nothing written, when:

- the phase is unknown — report the raw value;
- an adapter file is missing — "adapter `trackers/<tracker>` (or
  `vcs/<vcs>`) is not available yet in this plugin version";
- the strategy is `—` in the adapter — ask the user to run `/bind-statuses`;
- a tracker, VCS or git command returns an error.

## Related skills

- `nerdway:issue-workflow` — the step-by-step handoff target; its dispatch
  table is the source of the next-step table.
- `nerdway:auto-issue-mode` — the autonomous handoff target, entered at
  entry B.
- `nerdway:project-continue` — answers "where are we" for the whole
  project; this skill answers "what next" for one issue.
- `nerdway:nerd-orchestrate` — the same progress-plus-plans-plus-AIM
  loop for every unplanned issue in the project, not one id.
- `nerdway:bind-statuses` — binds the phases this skill reads and the
  `in-progress` value it writes.
