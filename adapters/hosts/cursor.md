# Host adapter: Cursor

Selected by host `cursor`: this session is Cursor. After posting a plan,
interactive `issue-workflow` stops and asks the human to move the phase,
as in 0.73.0. `auto-issue-mode` does not read this file.

## Detection

First match wins, same spirit as grill's ask-tool list. This file is selected
when:

1. `NERDWAY_HOST` or `AGENT_HOST` is `cursor`; or
2. no earlier host matched, and the session's tool list includes
   `AskQuestion` or the ask-question tool; or
3. no earlier host matched, and `CURSOR_TRACE_ID` or `CURSOR_AGENT` is set.

`grok-bot` and `claude-code` win over this file when their signals matched
first. A session with no host signal uses `claude-code` (same after-plan
prose), not this file.

## Operations

| Operation | Recipe | Notes |
|-----------|--------|-------|
| `host.detect` | recipe 1 below | returns `cursor` when this adapter's Detection signals match |
| `post-plan.after-plan` | recipe 2 below | interactive `issue-workflow` only; AIM never runs this |
| `workstation.exec` | recipe 3 below | the session's own shell in the local editor; `—` on a cloud worker (`CURSOR_AGENT_WORKER_ID` or `CURSOR_WORKER_POOL_NAME`) |

### Recipe 1: `host.detect`

Look at this session only: the environment, then the tool list. Do not read
the platform config. The ordered probe lives in the calling skill and in
`scripts/lib/host-detect.ts`; this row is the `cursor` arm of that probe.

### Recipe 2: `post-plan.after-plan`

The `## Implementation plan` comment is already on the tracker and the
phase is `todo`. Stop here: report that the plan is on the tracker. Ask
for the move to `in-progress` in the shape *Asking the human to move a
phase* in `adapters/statuses.md`, and do **not** write `in-progress`
yourself. Do not Start, do not edit the repo. An implement command that
arrived **without** a plan does not unlock Start on this turn.

### Recipe 3: `workstation.exec`

A Cursor session in the local editor runs on the user's workstation: run the
command with the session's shell tool. A cloud worker (`CURSOR_AGENT_WORKER_ID`
or `CURSOR_WORKER_POOL_NAME` set) cannot reach a workstation, so the recipe is
`—` there and the write is queued on the issue.

Run the three steps of a guide or Checkpoints write on the same machine:
the live-wiki probe (`node <plugin dir>/scripts/resolve-vault.ts --json --host <host>`,
`live` must be `true`), the write, then
`node <plugin dir>/scripts/verify-vault-file.ts <WIKI> <path> --contains <issue URL>`.
