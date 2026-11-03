# nerd-orchestrate reference

Menu shapes, the worktree recipe and the Grok Bot isolation path. The
runtime skill points here; follow the SKILL.md gates.

## Native ask

Same spirit as grill and as `issue-workflow`'s host detect. First match
wins: `SendToUser` → Grok Bot widget; `AskUserQuestion` → Claude Code;
`AskQuestion` → Cursor. No native tool → numbered list in chat. "tak",
"yes" or "1" always picks option 1 (the recommendation). A synthetic skip
(`Questions skipped by the user`, no other user text) is not an answer:
re-ask as the numbered list; do not invent a choice.

## Planning-mode question

Header: **Tryb planów**. One sentence: there are N unplanned issues
(list the ids). Two options:

1. **Batch** — post a plan for every unplanned issue, ask after each
   plan, then run AIM on the approved ones (worktrees × 2 where the host
   allows). Recommended when N > 1. For: one planning pass, then
   parallel AIM. Against: waits to start implementation until every plan
   is posted.
2. **Just-in-time** — plan, ask, AIM one issue, then the next. Recommended
   when N = 1 (the two modes then coincide). For: the first approved
   issue starts immediately. Against: no parallel AIM, because the next
   plan has not been posted yet.

## Ask-before-AIM question

Header: **AIM**. One sentence: the plan for `<ID>` is on the tracker
(comment link). Two options:

1. **Run auto-issue-mode for `<ID>`** (recommended) — start, implement,
   review, merge. Same consent as `/nerd4rent:auto-issue-mode <ID>`.
2. **Skip AIM for `<ID>`** — leave `todo` with the plan; continue.

## Worktree recipe (Claude Code and Cursor)

Only when `aimDispatchForHost` returned `worktrees: true` and at least
two AIM yeses are queued. Cap: `ORCHESTRATE_PARALLEL_CAP` (2). Probe with
`git worktree list`; a failing binary is `worktreeAvailable: false`.

Default branch: `git symbolic-ref --short refs/remotes/origin/HEAD`, else
`main`. Each slot:

```
git fetch -q --prune
git worktree add --checkout <repo>-<id-slug> <default-branch>
```

`<repo>` is `basename` of the project path; `<id-slug>` is the issue id
in lowercase with `/` replaced by `-`. The path is a **sibling** of the
project directory, never inside it. The new checkout is a clean default
branch; `auto-issue-mode` entry B / `issue-start` creates the issue
branch inside that worktree. Run the AIM subagent with that path as cwd.

When a run finishes (merge, skip, or stop):

```
git worktree remove --force <repo>-<id-slug>
```

Remove only worktrees this skill created. If a slot is full, wait; do
not add a third. If `git worktree add` fails, drop to sequential in the
original checkout for the remaining ids.

Never run two AIM subagents against the same cwd.

## Grok Bot isolation

`aimDispatchForHost("grok-bot")` is `worktrees: false`, `cloudAgent:
true`, `maxParallel: 1`. Do not `git worktree add` here as a way to run
two AIM checkouts at once.

Pick one per approved id:

1. **This session, sequential** — run entry B in a subagent against the
   current cwd; wait until it reports; then the next id.
2. **CloudAgent** — launch one CloudAgent for that id with
   `auto-issue-mode` entry B, after the plan comment exists; wait until
   it is running or finished before launching the next. A CloudAgent is
   a repo change on the issue: OPS-23 still applies (the plan is already
   posted).

Option 1 is the default when the session cannot launch a CloudAgent.
