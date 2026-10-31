# Host adapter: Cursor

Selected by host `cursor`: this session is Cursor. After posting a plan,
interactive `issue-workflow` stops and asks the human to move the phase,
as in 0.73.0. `auto-issue-mode` does not read this file.

## Detection

First match wins, same spirit as grill's ask-tool list. This file is selected
when:

1. `NERD4RENT_HOST` or `AGENT_HOST` is `cursor`; or
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
